"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, CalendarRange, CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExportLanguageControl } from "@/components/export-language-control";
import { useLocale } from "@/components/locale-provider";
import { ScheduleRoster } from "@/components/schedule-roster";
import { ScheduleEditor } from "@/components/schedule-editor";
import { useSession } from "@/components/session-provider";
import { useCurrentPeriod } from "@/components/use-current-period";
import { apiFetch, type Assignment, type ClinicProfile, type Nurse, type ShiftTemplate } from "@/lib/client-api";
import { translateText } from "@/lib/i18n";
import { saveScheduleChange } from "@/lib/schedule-actions";
import { exportSchedule as createScheduleExport, type ExportFormat } from "@/lib/office-export";
import { formatShiftTime } from "@/lib/shifts";

type ScheduleResult = {
  assignments: Assignment[];
  seniorFridayWarnings: { id: string; date: string; action: string; priority: "HIGH"; message: string }[];
} | null;
type ScheduleResponse = {
  schedule: ScheduleResult;
  nurses: Nurse[];
  seniorFridayWarnings: NonNullable<ScheduleResult>["seniorFridayWarnings"];
};
const addDays = (date: Date, count: number) => new Date(date.getTime() + count * 24 * 60 * 60 * 1000);
const saturdayOf = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
  return date;
};
const weekLabel = (start: Date, language: string) => {
  const end = addDays(start, 6);
  const format = new Intl.DateTimeFormat(language, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(start)} – ${format.format(end)}`;
};

export default function SchedulePage() {
  const { today, error: periodError } = useCurrentPeriod();
  const { language } = useLocale();
  const { user } = useSession();
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [scheduleView, setScheduleView] = useState<"week" | "month">("week");
  const [schedule, setSchedule] = useState<ScheduleResult>(null);
  const [monthlySchedule, setMonthlySchedule] = useState<ScheduleResult>(null);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [loadedWeekKey, setLoadedWeekKey] = useState("");
  const [loadedMonthKey, setLoadedMonthKey] = useState("");
  const [error, setError] = useState("");
  const [selectedNurseId, setSelectedNurseId] = useState("ALL");
  const [seniorNursesOnly, setSeniorNursesOnly] = useState(false);
  const [shiftTypeFilter, setShiftTypeFilter] = useState<Assignment["type"] | "ALL">("ALL");
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [editing, setEditing] = useState<{ assignment?: Assignment; nurse?: Nurse; date: string } | null>(null);
  const weekStart = useMemo(
    () => today ? addDays(saturdayOf(today), weekOffset * 7) : null,
    [today, weekOffset],
  );
  const weekDates = useMemo(
    () => weekStart ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index).toISOString().slice(0, 10)) : [],
    [weekStart],
  );
  const weekKey = weekStart?.toISOString().slice(0, 10) ?? "";
  const monthStart = useMemo(() => {
    if (!today) return null;
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + monthOffset);
    return date;
  }, [today, monthOffset]);
  const monthKey = monthStart?.toISOString().slice(0, 7) ?? "";

  const load = useCallback(async () => {
    if (!weekKey) return;
    try {
      const result = await apiFetch<ScheduleResponse>(`/api/schedules/week/${weekKey}`);
      setSchedule(result.schedule ? { ...result.schedule, seniorFridayWarnings: result.seniorFridayWarnings } : null);
      setNurses(result.nurses);
      setLoadedWeekKey(weekKey);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this schedule.");
    }
  }, [weekKey]);

  const loadMonth = useCallback(async () => {
    if (!monthStart || !monthKey) return;
    try {
      const result = await apiFetch<ScheduleResponse>(`/api/schedules/${monthStart.getUTCFullYear()}/${monthStart.getUTCMonth() + 1}`);
      setMonthlySchedule(result.schedule ? { ...result.schedule, seniorFridayWarnings: result.seniorFridayWarnings } : null);
      setNurses(result.nurses);
      setLoadedMonthKey(monthKey);
      setError("");
    } catch (reason) {
      setMonthlySchedule(null);
      setLoadedMonthKey(monthKey);
      setError(reason instanceof Error ? reason.message : "Could not load this schedule.");
    }
  }, [monthKey, monthStart]);

  useEffect(() => {
    if (!weekKey) return;
    let active = true;
    apiFetch<ScheduleResponse>(`/api/schedules/week/${weekKey}`)
      .then((result) => {
        if (!active) return;
        setSchedule(result.schedule ? { ...result.schedule, seniorFridayWarnings: result.seniorFridayWarnings } : null);
        setNurses(result.nurses);
        setLoadedWeekKey(weekKey);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSchedule(null);
        setLoadedWeekKey(weekKey);
        setError(reason instanceof Error ? reason.message : "Could not load this schedule.");
      });
    return () => { active = false; };
  }, [weekKey]);

  useEffect(() => {
    if (scheduleView !== "month" || !monthStart) return;
    let active = true;
    apiFetch<ScheduleResponse>(`/api/schedules/${monthStart.getUTCFullYear()}/${monthStart.getUTCMonth() + 1}`)
      .then((result) => {
        if (!active) return;
        setMonthlySchedule(result.schedule ? { ...result.schedule, seniorFridayWarnings: result.seniorFridayWarnings } : null);
        setNurses(result.nurses);
        setLoadedMonthKey(monthKey);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setMonthlySchedule(null);
        setLoadedMonthKey(monthKey);
        setError(reason instanceof Error ? reason.message : "Could not load this schedule.");
      });
    return () => { active = false; };
  }, [monthKey, monthStart, scheduleView]);

  useEffect(() => {
    apiFetch<{ profile: ClinicProfile }>("/api/clinic-profile")
      .then(({ profile }) => setClinic(profile))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load clinic profile for export."));
  }, []);

  useEffect(() => {
    apiFetch<{ shifts: ShiftTemplate[] }>("/api/shifts")
      .then(({ shifts: rows }) => setShifts(rows.filter((shift) => shift.isActive)))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load active shifts."));
  }, []);

  const visibleSchedule = loadedWeekKey === weekKey ? schedule : null;
  const visibleMonthSchedule = loadedMonthKey === monthKey ? monthlySchedule : null;
  const loading = Boolean(weekKey && loadedWeekKey !== weekKey);
  const monthLoading = Boolean(monthKey && loadedMonthKey !== monthKey);
  const editingDate = editing ? new Date(`${editing.date}T00:00:00.000Z`) : null;
  const count = visibleSchedule?.assignments.filter((row) => weekDates.includes(row.date) && row.type === "WORK").length ?? 0;
  const monthTitle = monthStart ? new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthStart) : "Loading month…";
  const monthDates = useMemo(() => {
    if (!monthStart) return [];
    const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    return Array.from({ length: daysInMonth }, (_, index) =>
      new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), index + 1)).toISOString().slice(0, 10),
    );
  }, [monthStart]);
  const onDrop = async (event: React.DragEvent<HTMLTableCellElement>, date: string, nurse: Nurse) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    const source = JSON.parse(raw) as Assignment;
    if (source.nurseId !== nurse.id || source.date === date) return;
    try {
      const target = new Date(`${date}T00:00:00.000Z`);
      const result = await saveScheduleChange(target.getUTCFullYear(), target.getUTCMonth() + 1, {
        nurseId: source.nurseId,
        date,
        type: source.type,
        ...(source.type === "WORK" && source.shiftAssignments?.[0]
          ? { shiftId: source.shiftAssignments[0].shiftTemplateId }
          : {}),
        overrideReason: source.type === "WORK" ? "FORCED_WORK" : "OTHER",
        note: source.note ?? "",
        moveFrom: source.date,
      });
      if (result) {
        await load();
        await loadMonth();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not move this shift.");
    }
  };
  const exportSchedule = async (
    language: "en" | "ar",
    format: ExportFormat,
    orientation: "landscape" | "portrait",
    period: "weekly" | "monthly" = "weekly",
  ) => {
    const isMonthly = period === "monthly";
    const dates = isMonthly ? monthDates : weekDates;
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    if (!startDate || !endDate) return;
    const sourceNurses = nurses.filter((nurse) =>
      (!isMonthly || selectedNurseId === "ALL" || nurse.id === selectedNurseId) &&
      (!isMonthly || !seniorNursesOnly || nurse.level === "SENIOR"),
    );
    const visibleNurseIds = new Set(sourceNurses.map(({ id }) => id));
    const sourceAssignments = (isMonthly ? visibleMonthSchedule?.assignments : visibleSchedule?.assignments) ?? [];
    const assignments = sourceAssignments
      .filter((row) => dates.includes(row.date) && visibleNurseIds.has(row.nurseId))
      .filter((row) => !isMonthly || shiftTypeFilter === "ALL" || row.type === shiftTypeFilter)
      .filter((row) => !isMonthly || !exceptionsOnly || row.type === "SICK" || row.type === "EMERGENCY" || row.isManual)
      .map((row) => {
        const nurse = row.nurse ?? nurses.find((entry) => entry.id === row.nurseId);
        return {
          date: row.date,
          nurseId: row.nurseId,
          nurseOrder: nurse?.sortOrder,
          nurseName: nurse?.name ?? "Nurse",
          nurseColor: nurse?.color ?? "#2c9c84",
          nurseLevel: nurse?.level ?? "REGULAR",
          type: row.type,
          exceptionApproved: row.exceptionApproved ?? false,
          isManual: row.isManual,
          shiftAssignments: row.shiftAssignments ?? [],
        };
      });
    if (!clinic) {
      setError(language === "ar" ? "تعذر تحميل بيانات المركز للتصدير." : "Clinic profile is not ready for export.");
      return;
    }
    try {
      const opened = await createScheduleExport({
        language,
        clinic,
        generatedBy: user?.name,
        generatedAt: new Date().toISOString(),
        orientation,
        startDate,
        endDate,
        assignments,
        nurses: sourceNurses.map(({ id, sortOrder, name, level, color }) => ({ id, sortOrder, name, level, color })),
        period,
        warnings: (isMonthly ? visibleMonthSchedule : visibleSchedule)?.seniorFridayWarnings ?? [],
      }, format);
      if (!opened) setError(language === "ar" ? "يرجى السماح بالنوافذ المنبثقة لتصدير الجدول." : "Allow pop-ups to export the schedule.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export the schedule.");
    }
  };

  return (
    <AppShell>
      {(error || periodError) && <div className="notice notice-error"><CircleAlert size={17} />{error || periodError}</div>}
      <div className="calendar-view-toggle" role="group" aria-label={translateText("Schedule view", language)}>
        <button type="button" className={scheduleView === "week" ? "view-toggle-active" : ""} onClick={() => setScheduleView("week")}><CalendarDays size={15} />{translateText("Weekly Roster View", language)}</button>
        <button type="button" className={scheduleView === "month" ? "view-toggle-active" : ""} onClick={() => setScheduleView("month")}><CalendarRange size={15} />{translateText("Monthly Roster View", language)}</button>
      </div>
      <section className="panel calendar-panel">
        {scheduleView === "week" ? <>
        <div className="calendar-toolbar">
          <div className="week-controls"><button className="icon-button" aria-label={translateText("Previous week", language)} disabled={!weekStart} onClick={() => setWeekOffset((offset) => offset - 1)}><ArrowLeft size={17} /></button><h2>{weekStart ? weekLabel(weekStart, language) : "Loading week…"}</h2><button className="icon-button" aria-label={translateText("Next week", language)} disabled={!weekStart} onClick={() => setWeekOffset((offset) => offset + 1)}><ArrowRight size={17} /></button><button className="button button-quiet" disabled={!today} onClick={() => setWeekOffset(0)}>{translateText("Today", language)}</button></div>
          <div className="calendar-actions"><span className="calendar-stat"><CalendarDays size={15} /><strong>{count}</strong> {translateText(`${count} shifts this week`, language)}</span><button className="button button-outline button-compact" onClick={() => void load()}><RefreshCw size={15} />{translateText("Refresh", language)}</button><Link className="button button-primary button-compact" href="/generator"><Sparkles size={15} />{translateText("Generate", language)}</Link></div>
        </div>
        <div className="calendar-legend">
          {shifts.map((shift) => <span key={shift.id}><i className="legend-dot legend-work" style={{ backgroundColor: shift.color ?? undefined }} />{shift.name} · {formatShiftTime(shift.startTime, language)}–{formatShiftTime(shift.endTime, language)}</span>)}
          {!shifts.length && <span><i className="legend-dot legend-work" />{translateText("Work shift", language)} · {translateText("No active shifts configured", language)}</span>}
          <span><i className="legend-dot legend-off" />{translateText("OFF", language)}</span><span><i className="legend-dot legend-sick" />{translateText("SICK", language)}</span><span><i className="legend-dot legend-emergency" />{translateText("EMERGENCY", language)}</span>
        </div>
        {loading && <div className="table-state">{translateText("Loading weekly schedule…", language)}</div>}
        {!loading && weekStart && nurses.length === 0 && <div className="calendar-empty"><span className="empty-calendar-icon"><CalendarDays size={24} /></span><h3>{translateText("No nurses yet", language)}</h3><p>{translateText("Add nurses to start building your roster.", language)}</p><Link className="button button-primary" href="/nurses"><Sparkles size={16} />{translateText("Add nurse", language)}</Link></div>}
        {!loading && weekStart && nurses.length > 0 && <ScheduleRoster
          dates={weekDates}
          nurses={nurses}
          assignments={visibleSchedule?.assignments ?? []}
          language={language}
          today={today ?? ""}
          warnings={visibleSchedule?.seniorFridayWarnings ?? []}
          onEdit={(assignment, nurse, date) => setEditing({ assignment, nurse, date })}
          onDrop={(event, date, nurse) => void onDrop(event, date, nurse)}
        />}
        </> : <>
          <div className="calendar-toolbar month-calendar-toolbar">
            <div className="week-controls"><button className="icon-button" aria-label={translateText("Previous month", language)} onClick={() => setMonthOffset((offset) => offset - 1)}><ArrowLeft size={17} /></button><h2>{monthTitle}</h2><button className="icon-button" aria-label={translateText("Next month", language)} onClick={() => setMonthOffset((offset) => offset + 1)}><ArrowRight size={17} /></button><button className="button button-quiet" onClick={() => setMonthOffset(0)}>{translateText("Today", language)}</button></div>
            <div className="calendar-actions"><span className="calendar-stat"><CalendarRange size={15} /><strong>{visibleMonthSchedule?.assignments.length ?? 0}</strong> {translateText("assignments this month", language)}</span><button className="button button-outline button-compact" onClick={() => void loadMonth()}><RefreshCw size={15} />{translateText("Refresh", language)}</button><ExportLanguageControl onExport={(exportLanguage, format, orientation) => exportSchedule(exportLanguage, format, orientation, "monthly")} /></div>
          </div>
          <div className="roster-filters" aria-label={translateText("Schedule filters", language)}>
            <label>{translateText("Nurse filter", language)}<select value={selectedNurseId} onChange={(event) => setSelectedNurseId(event.target.value)}><option value="ALL">{translateText("All nurses", language)}</option>{nurses.map((nurse) => <option key={nurse.id} value={nurse.id}>{nurse.name}</option>)}</select></label>
            <label className="roster-filter-check"><input type="checkbox" checked={seniorNursesOnly} onChange={(event) => setSeniorNursesOnly(event.target.checked)} />{translateText("Senior Nurses Only", language)}</label>
            <label>{translateText("Shift Type", language)}<select value={shiftTypeFilter} onChange={(event) => setShiftTypeFilter(event.target.value as Assignment["type"] | "ALL")}><option value="ALL">{translateText("All shift types", language)}</option><option value="WORK">{translateText("WORK", language)}</option><option value="OFF">{translateText("OFF", language)}</option><option value="SICK">{translateText("SICK", language)}</option><option value="EMERGENCY">{translateText("EMERGENCY", language)}</option></select></label>
            <label className="roster-filter-check"><input type="checkbox" checked={exceptionsOnly} onChange={(event) => setExceptionsOnly(event.target.checked)} />{translateText("Exceptions Only", language)}</label>
          </div>
          <div className="calendar-legend">
            {shifts.map((shift) => <span key={shift.id}><i className="legend-dot legend-work" style={{ backgroundColor: shift.color ?? undefined }} />{shift.name} · {formatShiftTime(shift.startTime, language)}–{formatShiftTime(shift.endTime, language)}</span>)}
            {!shifts.length && <span><i className="legend-dot legend-work" />{translateText("Work shift", language)} · {translateText("No active shifts configured", language)}</span>}
            <span><i className="legend-dot legend-off" />{translateText("OFF", language)}</span><span><i className="legend-dot legend-sick" />{translateText("SICK", language)}</span><span><i className="legend-dot legend-emergency" />{translateText("EMERGENCY", language)}</span>
          </div>
          {monthLoading && <div className="table-state">{translateText("Loading monthly schedule…", language)}</div>}
          {!monthLoading && nurses.length === 0 && <div className="calendar-empty"><span className="empty-calendar-icon"><CalendarDays size={24} /></span><h3>{translateText("No nurses yet", language)}</h3><p>{translateText("Add nurses to start building your roster.", language)}</p><Link className="button button-primary" href="/nurses"><Sparkles size={16} />{translateText("Add nurse", language)}</Link></div>}
          {!monthLoading && nurses.length > 0 && <ScheduleRoster
            dates={monthDates}
            nurses={nurses.filter((nurse) => (selectedNurseId === "ALL" || nurse.id === selectedNurseId) && (!seniorNursesOnly || nurse.level === "SENIOR"))}
            assignments={visibleMonthSchedule?.assignments ?? []}
            language={language}
            today={today ?? ""}
            warnings={visibleMonthSchedule?.seniorFridayWarnings ?? []}
            shiftTypeFilter={shiftTypeFilter}
            exceptionsOnly={exceptionsOnly}
            onEdit={(assignment, nurse, date) => setEditing({ assignment, nurse, date })}
            onDrop={(event, date, nurse) => void onDrop(event, date, nurse)}
          />}
        </>}
      </section>
      <div className="calendar-footnote"><span><i className="tiny-dot" />{translateText("Manual overrides are preserved during rebalancing", language)}</span>{scheduleView === "week" && <ExportLanguageControl onExport={exportSchedule} />}</div>
      {editing && editingDate && <ScheduleEditor key={`${editing.assignment?.nurseId ?? editing.nurse?.id}-${editing.date}`} assignment={editing.assignment} nurse={editing.nurse} shifts={shifts} date={editing.date} year={editingDate.getUTCFullYear()} month={editingDate.getUTCMonth() + 1} onClose={() => setEditing(null)} onSaved={() => { void load(); void loadMonth(); }} />}
    </AppShell>
  );
}
