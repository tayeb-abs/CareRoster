import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScheduleRoster } from "@/components/schedule-roster";
import { renderReportsExportDocument, renderScheduleExportDocument } from "./print-export";

test("renders Arabic schedule exports with RTL metadata, translated labels, and escaped names", () => {
  const html = renderScheduleExportDocument({
    language: "ar",
    startDate: "2026-11-07",
    endDate: "2026-11-13",
    assignments: [{
      date: "2026-11-07",
      nurseName: "<script>alert(1)</script>",
      nurseColor: "#2c9c84",
      nurseLevel: "SENIOR",
      type: "WORK",
      exceptionApproved: true,
      isManual: true,
    }],
    warnings: [{
      date: "2026-11-07",
      action: "SENIOR_FRIDAY_EXCEPTION",
      priority: "HIGH",
      message: "Only Senior Nurses were available for Friday coverage. The assignment was created as an operational exception.",
    }],
    clinic: {
      clinicNameEn: "Evercare Medical Center",
      clinicNameAr: "مركز إيفركير الطبي",
      logoDataUrl: "data:image/png;base64,AA==",
      address: "Main Street",
      phoneNumber: "+1 555 0100",
      departmentName: "Nursing",
      headNurseName: "Avery Brooks",
    },
    generatedBy: "Clinic Administrator",
    generatedAt: "2026-11-04T10:00:00.000Z",
    orientation: "portrait",
  });
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /الجدول الأسبوعي/);
  assert.match(html, /السبت/);
  assert.match(html, /الاسم/);
  assert.doesNotMatch(html, /المستوى/);
  assert.match(html, /الجدول/);
  assert.match(html, /class="roster-table"/);
  assert.match(html, /مركز إيفركير الطبي/);
  assert.match(html, /data:image\/png;base64,AA==/);
  assert.match(html, /class="system-name">CareRoster/);
  assert.match(html, /فترة الجدول/);
  assert.match(html, /صفحة/);
  assert.match(html, /Clinic Administrator/);
  assert.match(html, /Main Street/);
  assert.match(html, /@page \{ size: A4 portrait/);
  assert.match(html, /shift-work/);
  assert.doesNotMatch(html, /shift-manual|roster-manual|Manual override/);
  assert.match(html, /position: fixed/);
  assert.match(html, /counter\(page\)/);
  assert.match(html, /display: table-header-group/);
  assert.match(html, /⭐/);
  assert.match(html, /استثناء معتمد/);
  assert.match(html, /تعذر توفير ممرضة عادية/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test("keeps administrator nurse order and renders all monthly dates in the export", () => {
  const nurses = [
    { id: "n1", sortOrder: 0, name: "Nurse A", level: "REGULAR" as const, color: "#176b9a" },
    { id: "n3", sortOrder: 1, name: "Nurse C", level: "SENIOR" as const, color: "#176b9a" },
    { id: "n2", sortOrder: 2, name: "Nurse B", level: "REGULAR" as const, color: "#176b9a" },
    { id: "n4", sortOrder: 3, name: "Nurse D", level: "REGULAR" as const, color: "#176b9a" },
  ];
  const assignments = [...nurses].reverse().map((nurse) => ({
    nurseId: nurse.id,
    nurseOrder: nurse.sortOrder,
    date: "2026-11-01",
    nurseName: nurse.name,
    nurseColor: nurse.color,
    nurseLevel: nurse.level,
    type: "OFF" as const,
  }));
  const html = renderScheduleExportDocument({
    language: "en",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    period: "monthly",
    assignments,
    nurses,
    clinic: { clinicNameEn: "Evercare Clinic", clinicNameAr: "عيادة إيفركير", departmentName: "Nursing" },
    generatedBy: "Planner",
  });
  assert.match(html, /Monthly schedule/);
  assert.match(html, /CareRoster/);
  assert.match(html, /A3 landscape/);
  assert.match(html, /monthly-roster/);
  assert.match(html, /From November 1, 2026 · To November 30, 2026/);
  assert.ok(html.indexOf("Nurse A") < html.indexOf("Nurse C"));
  assert.ok(html.indexOf("Nurse C") < html.indexOf("Nurse B"));
  assert.ok(html.indexOf("Nurse B") < html.indexOf("Nurse D"));
  assert.equal((html.match(/<th class="/g) ?? []).length, 30);
});

test("saved manual schedule edits render without edit-mode highlights or labels", () => {
  const html = renderToStaticMarkup(createElement(ScheduleRoster, {
    dates: ["2026-11-07"],
    nurses: [{ id: "n1", name: "Nurse One", email: null, title: "RN", level: "REGULAR", color: "#176b9a", isActive: true, sortOrder: 0 }],
    assignments: [{
      nurseId: "n1",
      date: "2026-11-07",
      type: "OFF",
      isManual: true,
      isShiftManual: true,
      nurse: { id: "n1", name: "Nurse One", color: "#176b9a", isActive: true, level: "REGULAR", sortOrder: 0 },
    }],
    language: "en",
    today: "",
    warnings: [],
    onEdit: () => {},
    onDrop: () => {},
  }));
  assert.match(html, /Nurse One/);
  assert.doesNotMatch(html, /roster-manual|Manual override/);
});

test("renders an export-only weekly matrix with seven Saturday-to-Friday columns", () => {
  const html = renderScheduleExportDocument({
    language: "en",
    startDate: "2026-11-07",
    endDate: "2026-11-13",
    assignments: [
      { nurseId: "n1", date: "2026-11-07", nurseName: "Nurse One", nurseColor: "#176b9a", nurseLevel: "REGULAR", type: "OFF" },
      { nurseId: "n1", date: "2026-11-13", nurseName: "Nurse One", nurseColor: "#176b9a", nurseLevel: "REGULAR", type: "WORK" },
      { nurseId: "n2", date: "2026-11-07", nurseName: "Nurse Two", nurseColor: "#176b9a", nurseLevel: "SENIOR", type: "SICK" },
    ],
    clinic: { clinicNameEn: "Evercare Clinic", clinicNameAr: "عيادة إيفركير" },
    generatedBy: "Head Nurse",
  });
  assert.match(html, /Evercare Clinic/);
  assert.match(html, /Weekly schedule/);
  assert.match(html, /2026/);
  assert.match(html, /Generated by/);
  assert.match(html, /Nurse Two/);
  assert.match(html, /⭐ Nurse Two/);
  assert.doesNotMatch(html, />Level</);
  assert.match(html, /shift-off/);
  assert.match(html, /shift-sick/);
  assert.match(html, /shift-work/);
  assert.match(html, /friday-cell/);
  assert.equal((html.match(/<th class="/g) ?? []).length, 7);
});

test("renders report export labels in the selected language", () => {
  const html = renderReportsExportDocument({
    language: "en",
    year: 2026,
    month: 11,
    rows: [{ nurseName: "Avery Brooks", nurseLevel: "SENIOR", workingDays: 20, fridayAssignments: 2, seniorFridayAssignments: 2, regularFridayAssignments: 0, offDays: 8, leaveDays: 1 }],
    warnings: [],
  });

  test("report exports include actual administrator-defined shift details", () => {
    const html = renderReportsExportDocument({
      language: "en",
      year: 2026,
      month: 11,
      rows: [{
        nurseName: "Hanadi",
        nurseLevel: "REGULAR",
        workingDays: 1,
        totalHours: 10,
        fridayAssignments: 0,
        seniorFridayAssignments: 0,
        regularFridayAssignments: 0,
        offDays: 0,
        leaveDays: 0,
      }],
      assignments: [{
        date: "2026-11-02",
        nurseName: "Hanadi",
        nurseColor: "#176b9a",
        nurseLevel: "REGULAR",
        type: "WORK",
        shiftAssignments: [{
          shiftTemplateId: "late-clinic",
          shiftName: "Late Clinic Shift",
          startTime: "11:00",
          endTime: "21:00",
          color: "#176b9a",
          totalHours: 10,
        }],
      }],
      warnings: [],
    });
    assert.match(html, /TOTAL HOURS/);
    assert.match(html, /Assigned shifts and actual hours/);
    assert.match(html, /Late Clinic Shift/);
    assert.match(html, /11:00 AM/);
    assert.match(html, /9:00 PM/);
  });
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.match(html, /Reports &amp; statistics/);
  assert.match(html, /WORKING DAYS/);
  assert.match(html, /Avery Brooks/);
  const arabicHtml = renderReportsExportDocument({
    language: "ar",
    year: 2026,
    month: 11,
    rows: [{ nurseName: "Avery Brooks", nurseLevel: "SENIOR", workingDays: 20, fridayAssignments: 2, seniorFridayAssignments: 2, regularFridayAssignments: 0, offDays: 8, leaveDays: 1 }],
    warnings: [],
  });
  assert.match(arabicHtml, /<html lang="ar" dir="rtl">/);
  assert.match(arabicHtml, /التقارير والإحصاءات/);
  assert.match(arabicHtml, /أيام العمل/);
  assert.match(arabicHtml, /الاسم/);
  assert.doesNotMatch(arabicHtml, /المستوى/);
  assert.match(arabicHtml, /⭐ Avery Brooks/);
});
