import ExcelJS from "exceljs";
import {
  printReportsExport,
  printScheduleExport,
  renderReportsExportDocument,
  renderScheduleExportDocument,
  type ExportAssignment,
  type ExportFairnessRow,
  type ExportWarning,
  type ExportScheduleDetail,
  type PaperOrientation,
} from "@/lib/print-export";
import {
  buildWeeklyRoster,
  clinicName,
  defaultClinicBrand,
  generatedDate,
  type ClinicBrand,
  type RosterNurseInput,
} from "@/lib/roster-export";
import { formatShiftTime } from "@/lib/shifts";
import { monthName, translateText, type AppLanguage } from "@/lib/i18n";
import type { ScheduleReportPeriod } from "@/lib/print-export";

export type ExportFormat = "pdf" | "excel" | "word" | "powerpoint";
export type ExportOptions = {
  clinic?: ClinicBrand;
  generatedBy?: string;
  generatedAt?: string;
  orientation?: PaperOrientation;
};
type BrandSlide = Pick<ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>, "addText" | "addShape" | "addImage">;

type ScheduleExportInput = ExportOptions & {
  language: AppLanguage;
  startDate: string;
  endDate: string;
  assignments: ExportAssignment[];
  nurses?: RosterNurseInput[];
  period?: ScheduleReportPeriod;
  warnings: ExportWarning[];
};

type ReportsExportInput = ExportOptions & {
  language: AppLanguage;
  year: number;
  month: number;
  rows: ExportFairnessRow[];
  warnings: ExportWarning[];
  assignments?: ExportAssignment[];
};

function downloadFile(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function scheduleRows(input: ScheduleExportInput) {
  const { language, assignments } = input;
  const roster = buildWeeklyRoster(assignments, input.startDate, language, input.endDate, input.nurses);
  const rows: (string | number)[][] = [
    [language === "ar" ? "الاسم" : "Nurse", ...roster.days.map((day) => day.label)],
    ...roster.nurses.map((nurse) => [
      `${nurse.level === "SENIOR" ? "⭐ " : ""}${nurse.name}`,
      ...roster.days.map((day) => nurse.shifts.get(day.date)?.label ?? "—"),
    ]),
  ];
  return { roster, rows };
}

function scheduleTitle(input: ScheduleExportInput) {
  return translateText(input.period === "monthly" ? "Monthly schedule" : "Weekly schedule", input.language);
}

function excelColumnName(column: number) {
  let name = "";
  let current = column;
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + current % 26) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

function reportRows(input: ReportsExportInput) {
  const { language, rows } = input;
  return [
    ["Name", "Working days", "Total hours", "Friday assignments", "Senior Friday Assignments", "Regular Friday Assignments", "Off-days", "Leave"]
      .map((item) => translateText(item, language)),
    ...rows.map((row) => [
      `${row.nurseLevel === "SENIOR" ? "⭐ " : ""}${row.nurseName}`,
      row.workingDays,
      row.totalHours ?? 0,
      row.fridayAssignments,
      row.seniorFridayAssignments,
      row.regularFridayAssignments,
      row.offDays,
      row.leaveDays,
    ]),
  ];
}

function reportAssignmentRows(input: ReportsExportInput): ExportScheduleDetail[] {
  const { language } = input;
  return (input.assignments ?? [])
    .filter((assignment) => assignment.type === "WORK")
    .flatMap((assignment) => assignment.shiftAssignments?.length
      ? assignment.shiftAssignments.map((shift) => ({
          date: assignment.date,
          nurseName: assignment.nurseName,
          shiftName: shift.shiftName,
          startTime: shift.startTime,
          endTime: shift.endTime,
          totalHours: Number(shift.totalHours),
        }))
      : [{
          date: assignment.date,
          nurseName: assignment.nurseName,
          shiftName: translateText("Shift not assigned", language),
          totalHours: 0,
        }],
    );
}

function shiftDetailRows(rows: ExportScheduleDetail[], language: AppLanguage) {
  return rows.map((row) => [
    new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${row.date}T00:00:00Z`)),
    row.nurseName,
    row.shiftName,
    row.startTime ? formatShiftTime(row.startTime, language) : "—",
    row.endTime ? formatShiftTime(row.endTime, language) : "—",
    row.totalHours,
  ]);
}

function dateRange(start: string, end: string, language: AppLanguage) {
  const format = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "long", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00.000Z`));
  return `${format(start)} – ${format(end)}`;
}

function excelFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
}

function addWorkbookHeader(
  worksheet: ExcelJS.Worksheet,
  input: { language: AppLanguage; clinic: ClinicBrand; title: string; range: string; generatedBy?: string; generatedAt?: string; orientation?: PaperOrientation },
) {
  const columnCount = worksheet.columnCount;
  const dataColumnCount = Math.max(1, columnCount - 1);
  worksheet.mergeCells(1, 1, 1, dataColumnCount);
  worksheet.mergeCells(2, 1, 2, dataColumnCount);
  worksheet.mergeCells(3, 1, 3, dataColumnCount);
  worksheet.getCell(1, 1).value = `${clinicName(input.clinic, input.language)}${input.clinic.departmentName ? ` · ${input.clinic.departmentName}` : ""}`;
  worksheet.getCell(2, 1).value = input.title;
  const clinicDetails = [input.clinic.address, input.clinic.phoneNumber, input.clinic.headNurseName].filter(Boolean).join(" · ");
  worksheet.getCell(3, 1).value = `${input.range}${clinicDetails ? `  ·  ${clinicDetails}` : ""}  ·  ${translateText("Generated", input.language)}: ${generatedDate(input.language, new Date(input.generatedAt ?? Date.now()))}  ·  ${translateText("Generated by", input.language)}: ${input.generatedBy || "—"}`;
  worksheet.getRow(1).height = 30;
  worksheet.getRow(2).height = 25;
  worksheet.getRow(3).height = 24;
  worksheet.getCell(1, 1).font = { name: input.language === "ar" ? "Cairo" : "Arial", size: 18, bold: true, color: { argb: "FF174E70" } };
  worksheet.getCell(2, 1).font = { name: input.language === "ar" ? "Cairo" : "Arial", size: 14, bold: true, color: { argb: "FF176B9A" } };
  worksheet.getCell(3, 1).font = { name: input.language === "ar" ? "Cairo" : "Arial", size: 9, color: { argb: "FF617582" } };
  for (const rowNumber of [1, 2, 3]) {
    worksheet.getCell(rowNumber, 1).alignment = { horizontal: input.language === "ar" ? "right" : "left", vertical: "middle", readingOrder: input.language === "ar" ? "rtl" : "ltr" };
  }
  if (input.clinic.logoDataUrl) {
    const extension = input.clinic.logoDataUrl.startsWith("data:image/png;") ? "png" : "jpeg";
    const imageId = worksheet.workbook.addImage({ base64: input.clinic.logoDataUrl, extension });
    worksheet.addImage(imageId, `${excelColumnName(dataColumnCount + 1)}1:${excelColumnName(columnCount)}4`);
  }
  worksheet.views = [{ rightToLeft: input.language === "ar", state: "frozen", ySplit: 4, xSplit: 2 }];
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: input.orientation ?? "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "4:4",
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
  };
  worksheet.headerFooter.oddFooter = `&LCareRoster&R${translateText("Page", input.language)} &P / &N`;
}

function applyRosterFormatting(worksheet: ExcelJS.Worksheet, input: ScheduleExportInput, startRow: number) {
  const { roster } = scheduleRows(input);
  const header = worksheet.getRow(startRow);
  header.height = 30;
  header.eachCell((cell, column) => {
    cell.fill = excelFill("176B9A");
    cell.font = { name: input.language === "ar" ? "Cairo" : "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true, readingOrder: input.language === "ar" ? "rtl" : "ltr" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF14577D" } } };
    const day = column > 1 ? roster.days[column - 2] : undefined;
    if (day?.isFriday) cell.border = { ...cell.border, left: { style: "medium", color: { argb: "FF176B9A" } }, right: { style: "medium", color: { argb: "FF176B9A" } } };
  });
  roster.nurses.forEach((nurse, index) => {
    const row = worksheet.getRow(startRow + index + 1);
    row.height = 32;
    row.eachCell((cell, column) => {
      cell.font = { name: input.language === "ar" ? "Cairo" : "Arial", size: 9, color: { argb: "FF263A49" } };
      cell.alignment = { vertical: "middle", horizontal: column === 1 ? (input.language === "ar" ? "right" : "left") : "center", wrapText: true, readingOrder: input.language === "ar" ? "rtl" : "ltr" };
      cell.border = {
        top: { style: "hair", color: { argb: "FFD5E0E7" } },
        bottom: { style: "hair", color: { argb: "FFD5E0E7" } },
        left: { style: "hair", color: { argb: "FFD5E0E7" } },
        right: { style: "hair", color: { argb: "FFD5E0E7" } },
      };
      if (column === 1) {
        cell.font = { ...cell.font, bold: true };
        cell.fill = excelFill(nurse.level === "SENIOR" ? "FFF2C9" : "E7F2F8");
      } else if (column > 1) {
        const day = roster.days[column - 2];
        const shift = day ? nurse.shifts.get(day.date) : undefined;
        if (shift) {
          cell.fill = excelFill(shift.type === "WORK" ? "E2F1F8" : shift.type === "OFF" ? "F5F0E5" : shift.type === "SICK" ? "FDE9E8" : "FFF1D7");
          if (shift.exceptionApproved) cell.font = { ...cell.font, bold: true, color: { argb: "FF815C16" } };
        }
        if (day?.isFriday) cell.border = { ...cell.border, left: { style: "medium", color: { argb: "FF176B9A" } }, right: { style: "medium", color: { argb: "FF176B9A" } } };
      }
    });
  });
}

async function downloadExcelSchedule(input: ScheduleExportInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.generatedBy ?? "CareRoster";
  workbook.created = new Date(input.generatedAt ?? Date.now());
  const title = scheduleTitle(input);
  workbook.subject = title;
  const worksheet = workbook.addWorksheet(title.slice(0, 31));
  const { roster, rows } = scheduleRows(input);
  worksheet.columns = [
    { width: 25 },
    ...roster.days.map(() => ({ width: input.orientation === "portrait" ? 13 : 18 })),
    { width: 14 },
  ];
  const range = dateRange(input.startDate, input.endDate, input.language);
  addWorkbookHeader(worksheet, {
    language: input.language,
    clinic: input.clinic ?? defaultClinicBrand,
    title,
    range,
    generatedBy: input.generatedBy,
    generatedAt: input.generatedAt,
    orientation: input.orientation,
  });
  rows.forEach((values) => worksheet.addRow(values));
  applyRosterFormatting(worksheet, input, 4);
  const warnings = input.warnings;
  if (warnings.length) {
    const startRow = worksheet.rowCount + 2;
    worksheet.getCell(startRow, 1).value = translateText("Schedule warnings", input.language);
    worksheet.getCell(startRow, 1).font = { bold: true, color: { argb: "FF815C16" } };
    for (const [index, warning] of warnings.entries()) {
      worksheet.getCell(startRow + index + 1, 1).value = `${translateText("HIGH PRIORITY", input.language)} · ${warning.date}`;
      worksheet.getCell(startRow + index + 1, 2).value = translateText(warning.message, input.language);
      worksheet.getCell(startRow + index + 1, 1).fill = excelFill("FFF2C9");
      worksheet.getCell(startRow + index + 1, 2).fill = excelFill("FFF9E8");
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(`${input.period ?? "weekly"}-schedule.xlsx`, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

async function downloadExcelReport(input: ReportsExportInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.generatedBy ?? "CareRoster";
  const worksheet = workbook.addWorksheet(translateText("Reports & statistics", input.language).slice(0, 31));
  worksheet.columns = [{ width: 24 }, ...Array.from({ length: 6 }, () => ({ width: 18 })), { width: 14 }, { width: 16 }];
  const start = new Date(Date.UTC(input.year, input.month - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(input.year, input.month, 0)).toISOString().slice(0, 10);
  addWorkbookHeader(worksheet, {
    language: input.language,
    clinic: input.clinic ?? defaultClinicBrand,
    title: translateText("Reports & statistics", input.language),
    range: `${start} – ${end}`,
    generatedBy: input.generatedBy,
    generatedAt: input.generatedAt,
    orientation: input.orientation,
  });
  const rows = reportRows(input);
  rows.forEach((values) => worksheet.addRow(values));
  const header = worksheet.getRow(4);
  header.height = 32;
  header.eachCell((cell) => {
    cell.fill = excelFill("176B9A");
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  for (let rowIndex = 5; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    worksheet.getRow(rowIndex).eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFD5E0E7" } } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  }
  const details = workbook.addWorksheet(translateText("Shift details", input.language).slice(0, 31));
  details.columns = [{ width: 18 }, { width: 24 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 14 }];
  addWorkbookHeader(details, {
    language: input.language,
    clinic: input.clinic ?? defaultClinicBrand,
    title: translateText("Assigned shifts and actual hours", input.language),
    range: `${start} – ${end}`,
    generatedBy: input.generatedBy,
    generatedAt: input.generatedAt,
    orientation: input.orientation,
  });
  const detailHeaders = ["Date", "Nurse", "Shift name", "Start time", "End time", "Total hours"].map((item) => translateText(item, input.language));
  details.addRow(detailHeaders);
  shiftDetailRows(reportAssignmentRows(input), input.language).forEach((row) => details.addRow(row));
  const detailHeader = details.getRow(4);
  detailHeader.height = 32;
  detailHeader.eachCell((cell) => {
    cell.fill = excelFill("176B9A");
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  for (let rowIndex = 5; rowIndex <= details.rowCount; rowIndex += 1) {
    details.getRow(rowIndex).eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFD5E0E7" } } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile("nurse-scheduling-report.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function addPowerPointBrand(slide: BrandSlide, input: ExportOptions & { language: AppLanguage; title: string; range: string; orientation?: PaperOrientation }) {
  const clinic = input.clinic ?? defaultClinicBrand;
  const portrait = input.orientation === "portrait";
  const pageWidth = portrait ? 7.5 : 13.33;
  const margin = portrait ? 0.3 : 0.42;
  const logoWidth = portrait ? 0.42 : 0.5;
  if (clinic.logoDataUrl) {
    slide.addImage({ data: clinic.logoDataUrl, x: margin, y: 0.2, w: logoWidth, h: 0.42, sizing: { type: "contain", w: logoWidth, h: 0.42 } });
  } else {
    slide.addShape("rect", { x: margin, y: 0.2, w: logoWidth, h: 0.42, rectRadius: 0.06, line: { color: "176B9A", transparency: 100 }, fill: { color: "176B9A" } });
    slide.addText("E", { x: margin, y: 0.2, w: logoWidth, h: 0.42, fontFace: "Arial", fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
  }
  slide.addText(`${clinicName(clinic, input.language)}${clinic.departmentName ? ` · ${clinic.departmentName}` : ""}`, { x: margin + logoWidth + 0.12, y: 0.22, w: pageWidth - margin * 2 - logoWidth - 0.12, h: 0.25, fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: portrait ? 9 : 12, bold: true, color: "174E70", rtlMode: input.language === "ar" });
  slide.addText(input.title, { x: margin, y: 0.72, w: pageWidth - margin * 2, h: 0.38, fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: portrait ? 15 : 20, bold: true, color: "176B9A", rtlMode: input.language === "ar" });
  const clinicDetails = [clinic.address, clinic.phoneNumber, clinic.headNurseName].filter(Boolean).join(" · ");
  slide.addText(`${input.range}  ·  ${translateText("Generated", input.language)}: ${generatedDate(input.language, new Date(input.generatedAt ?? Date.now()))}  ·  ${translateText("Generated by", input.language)}: ${input.generatedBy || "—"}${clinicDetails ? `  ·  ${clinicDetails}` : ""}`, {
    x: margin, y: 1.1, w: pageWidth - margin * 2, h: 0.48, fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: portrait ? 6 : 7, color: "617582", rtlMode: input.language === "ar",
  });
}

async function downloadPowerPointSchedule(input: ScheduleExportInput) {
  const pptxgen = (await import("pptxgenjs")).default;
  const pptx = new pptxgen();
  const orientation = input.orientation ?? "landscape";
  const title = scheduleTitle(input);
  pptx.layout = orientation === "landscape" ? "LAYOUT_WIDE" : "LAYOUT_STANDARD";
  pptx.author = input.generatedBy ?? "CareRoster";
  pptx.subject = title;
  pptx.title = title;
  pptx.theme = { headFontFace: input.language === "ar" ? "Cairo" : "Arial", bodyFontFace: input.language === "ar" ? "Cairo" : "Arial" };
  pptx.rtlMode = input.language === "ar";
  const { roster } = scheduleRows(input);
  const clinic = input.clinic ?? defaultClinicBrand;
  const range = dateRange(input.startDate, input.endDate, input.language);
  const dateGroups = Array.from({ length: Math.ceil(roster.days.length / 7) }, (_, index) => roster.days.slice(index * 7, index * 7 + 7));
  const nurseGroups = Array.from({ length: Math.max(1, Math.ceil(roster.nurses.length / 9)) }, (_, index) => roster.nurses.slice(index * 9, index * 9 + 9));
  const tableWidth = orientation === "landscape" ? 12.48 : 6.62;
  for (const days of dateGroups) for (const nurses of nurseGroups) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    const pageStart = days[0]?.date ?? input.startDate;
    const pageEnd = days[days.length - 1]?.date ?? input.endDate;
    addPowerPointBrand(slide, { ...input, clinic, title, range: dateRange(pageStart, pageEnd, input.language), orientation });
    const tableHeaders = [input.language === "ar" ? "الاسم" : "Nurse", ...days.map(({ label }) => label)];
    const rows = nurses.map((nurse) => [
      `${nurse.level === "SENIOR" ? "⭐ " : ""}${nurse.name}`,
      ...days.map((day) => nurse.shifts.get(day.date)?.label ?? "—"),
    ]);
    const cells = [tableHeaders, ...rows].map((row, rowIndex) => row.map((value, columnIndex) => {
      const nurse = rowIndex > 0 ? nurses[rowIndex - 1] : undefined;
      const day = columnIndex >= 1 ? days[columnIndex - 1] : undefined;
      const shift = nurse && day ? nurse.shifts.get(day.date) : undefined;
      const fill = rowIndex === 0
        ? day?.isFriday ? "14577D" : "176B9A"
        : columnIndex === 0 && nurse?.level === "SENIOR" ? "FFF2C9"
          : shift?.type === "WORK" ? "E2F1F8"
              : shift?.type === "OFF" ? "F5F0E5"
                : shift?.type === "SICK" ? "FDE9E8"
                  : shift?.type === "EMERGENCY" ? "FFF1D7"
                    : "F8FAFB";
      const border: [{ color: string; pt: number }, { color: string; pt: number }, { color: string; pt: number }, { color: string; pt: number }] | undefined = day?.isFriday
        ? [{ color: "176B9A", pt: 1 }, { color: "176B9A", pt: 1 }, { color: "176B9A", pt: 1 }, { color: "176B9A", pt: 1 }]
        : undefined;
      return {
        text: String(value),
        options: {
          fill: { color: fill },
          color: rowIndex === 0 ? "FFFFFF" : "263A49",
          bold: rowIndex === 0 || columnIndex === 0 || Boolean(shift?.exceptionApproved),
          align: input.language === "ar" ? "right" as const : "center" as const,
          border,
          breakLine: false,
          margin: 0.06,
        },
      };
    }));
    slide.addTable(cells, {
      x: orientation === "landscape" ? 0.42 : 0.3, y: 1.68, w: tableWidth, h: orientation === "landscape" ? 5.2 : 5.7,
      fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: orientation === "landscape" ? 9 : 7,
      border: { type: "solid", color: "D5E0E7", pt: 0.5 },
      fill: { color: "FFFFFF" }, color: "263A49", margin: 0.06, rowH: 0.46, valign: "middle",
      colW: [orientation === "landscape" ? 1.65 : 0.95, ...Array.from({ length: days.length }, () => (tableWidth - (orientation === "landscape" ? 1.65 : 0.95)) / Math.max(days.length, 1))],
    });
  }
  if (input.warnings.length) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addPowerPointBrand(slide, { ...input, clinic, title: translateText("Schedule warnings", input.language), range, orientation });
    const warningWidth = orientation === "landscape" ? 12 : 6.7;
    slide.addText(input.warnings.map((warning) => {
      const date = new Intl.DateTimeFormat(input.language, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${warning.date}T00:00:00Z`));
      return `${translateText("HIGH PRIORITY", input.language)} · ${date}: ${translateText(warning.message, input.language)}`;
    }).join("\n\n"), { x: 0.4, y: 1.75, w: warningWidth, h: 5, fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: orientation === "landscape" ? 16 : 10, color: "815C16", fill: { color: "FFF9E8" }, margin: 0.2, valign: "top", rtlMode: input.language === "ar" });
  }
  await pptx.writeFile({ fileName: `${input.period ?? "weekly"}-schedule.pptx` });
}

async function downloadPowerPointReport(input: ReportsExportInput) {
  const pptxgen = (await import("pptxgenjs")).default;
  const pptx = new pptxgen();
  pptx.layout = input.orientation === "portrait" ? "LAYOUT_STANDARD" : "LAYOUT_WIDE";
  pptx.author = input.generatedBy ?? "CareRoster";
  pptx.title = translateText("Reports & statistics", input.language);
  pptx.rtlMode = input.language === "ar";
  const title = translateText("Reports & statistics", input.language);
  const range = monthName(input.year, input.month, input.language);
  const allRows = reportRows(input);
  const clinic = input.clinic ?? defaultClinicBrand;
  const data = allRows.slice(1);
  for (let offset = 0; offset < Math.max(data.length, 1); offset += 14) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addPowerPointBrand(slide, { ...input, clinic, title, range, orientation: input.orientation });
    const rows = [allRows[0], ...data.slice(offset, offset + 14)].map((row, rowIndex) => row.map((value) => ({
      text: String(value),
      options: { fill: { color: rowIndex === 0 ? "176B9A" : "FFFFFF" }, color: rowIndex === 0 ? "FFFFFF" : "263A49", bold: rowIndex === 0, align: input.language === "ar" ? "right" as const : "center" as const, margin: 0.06 },
    })));
    const portrait = input.orientation === "portrait";
    slide.addTable(rows, { x: portrait ? 0.3 : 0.42, y: 1.68, w: portrait ? 6.62 : 12.48, h: portrait ? 7.65 : 5.2, fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: portrait ? 6 : 8, border: { type: "solid", color: "D5E0E7", pt: 0.5 }, rowH: portrait ? 0.42 : 0.32, valign: "middle" });
  }
  if (input.warnings.length) {
    const slide = pptx.addSlide();
    addPowerPointBrand(slide, { ...input, clinic, title: translateText("Schedule warnings", input.language), range, orientation: input.orientation });
    const portrait = input.orientation === "portrait";
    slide.addText(input.warnings.map((warning) => `${translateText("HIGH PRIORITY", input.language)} · ${warning.date}: ${translateText(warning.message, input.language)}`).join("\n\n"), { x: 0.4, y: 1.75, w: portrait ? 6.7 : 12, h: 5, fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: portrait ? 10 : 16, color: "815C16", fill: { color: "FFF9E8" }, margin: 0.2, valign: "top", rtlMode: input.language === "ar" });
  }
  const details = shiftDetailRows(reportAssignmentRows(input), input.language);
  for (let offset = 0; offset < details.length; offset += 14) {
    const slide = pptx.addSlide();
    addPowerPointBrand(slide, { ...input, clinic, title: translateText("Assigned shifts and actual hours", input.language), range, orientation: input.orientation });
    const header = ["Date", "Nurse", "Shift name", "Start time", "End time", "Total hours"].map((item) => translateText(item, input.language));
    const detailRows = [header, ...details.slice(offset, offset + 14)].map((row, rowIndex) => row.map((value) => ({
      text: String(value),
      options: { fill: { color: rowIndex === 0 ? "176B9A" : "FFFFFF" }, color: rowIndex === 0 ? "FFFFFF" : "263A49", bold: rowIndex === 0, align: input.language === "ar" ? "right" as const : "center" as const, margin: 0.06 },
    })));
    const portrait = input.orientation === "portrait";
    slide.addTable(detailRows, {
      x: portrait ? 0.3 : 0.42, y: 1.68, w: portrait ? 6.62 : 12.48, h: portrait ? 7.65 : 5.2,
      fontFace: input.language === "ar" ? "Cairo" : "Arial", fontSize: portrait ? 7 : 9,
      border: { type: "solid", color: "D5E0E7", pt: 0.5 }, rowH: portrait ? 0.42 : 0.32, valign: "middle",
    });
  }
  await pptx.writeFile({ fileName: "nurse-scheduling-report.pptx" });
}

export async function exportSchedule(input: ScheduleExportInput, format: ExportFormat) {
  if (format === "pdf") return printScheduleExport(input);
  if (format === "excel") {
    await downloadExcelSchedule(input);
    return true;
  }
  if (format === "word") {
    downloadFile(`${input.period ?? "weekly"}-schedule.doc`, renderScheduleExportDocument(input), "application/msword;charset=utf-8");
    return true;
  }
  await downloadPowerPointSchedule(input);
  return true;
}

export async function exportReports(input: ReportsExportInput, format: ExportFormat) {
  if (format === "pdf") return printReportsExport(input);
  if (format === "excel") {
    await downloadExcelReport(input);
    return true;
  }
  if (format === "word") {
    downloadFile("nurse-scheduling-report.doc", renderReportsExportDocument(input), "application/msword;charset=utf-8");
    return true;
  }
  await downloadPowerPointReport(input);
  return true;
}
