"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FullCalendar, { type EventDisplayInfo, type EventDropInfo, type EventInput } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import localeAr from "@fullcalendar/react/locales/ar";
import { ArrowLeft, ArrowRight, CalendarDays, CalendarRange, CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExportLanguageControl } from "@/components/export-language-control";
import { useLocale } from "@/components/locale-provider";
import { ScheduleEditor } from "@/components/schedule-editor";
import { useSession } from "@/components/session-provider";
import { useCurrentPeriod } from "@/components/use-current-period";
import { apiFetch, type Assignment, type ClinicProfile, type Nurse } from "@/lib/client-api";
import { translateText } from "@/lib/i18n";
import { saveScheduleChange } from "@/lib/schedule-actions";
import { exportSchedule as createScheduleExport, type ExportFormat } from "@/lib/office-export";

type ScheduleResult = {
  assignments: Assignment[];
  seniorFridayWarnings: { id: string; date: string; action: string; priority: "HIGH"; message: string }[];
} | null;
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
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [loadedWeekKey, setLoadedWeekKey] = useState("");
  const [loadedMonthKey, setLoadedMonthKey] = useState("");
  const [error, setError] = useState("");
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
      const result = await apiFetch<{ schedule: ScheduleResult; nurses: Nurse[] }>(`/api/schedules/week/${weekKey}`);
      setSchedule(result.schedule);
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
      const result = await apiFetch<{ schedule: ScheduleResult; nurses: Nurse[] }>(`/api/schedules/${monthStart.getUTCFullYear()}/${monthStart.getUTCMonth() + 1}`);
      setMonthlySchedule(result.schedule);
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
    apiFetch<{ schedule: ScheduleResult; nurses: Nurse[] }>(`/api/schedules/week/${weekKey}`)
      .then((result) => {
        if (!active) return;
        setSchedule(result.schedule);
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
    apiFetch<{ schedule: ScheduleResult; nurses: Nurse[] }>(`/api/schedules/${monthStart.getUTCFullYear()}/${monthStart.getUTCMonth() + 1}`)
      .then((result) => {
        if (!active) return;
        setMonthlySchedule(result.schedule);
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

  const visibleSchedule = loadedWeekKey === weekKey ? schedule : null;
  const visibleMonthSchedule = loadedMonthKey === monthKey ? monthlySchedule : null;
  const loading = Boolean(weekKey && loadedWeekKey !== weekKey);
  const editingDate = editing ? new Date(`${editing.date}T00:00:00.000Z`) : null;
  const assignmentsByDay = useMemo(() => {
    const result = new Map<string, Assignment[]>();
    for (const assignment of visibleSchedule?.assignments ?? []) {
      result.set(assignment.date, [...(result.get(assignment.date) ?? []), assignment]);
    }
    return result;
  }, [visibleSchedule]);
  const count = visibleSchedule?.assignments.filter((row) => weekDates.includes(row.date) && row.type === "WORK").length ?? 0;
  const monthTitle = monthStart ? new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthStart) : "Loading month…";
  const monthEvents = useMemo<EventInput[]>(() => (visibleMonthSchedule?.assignments ?? []).map((assignment) => {
    const nurse = assignment.nurse ?? nurses.find((entry) => entry.id === assignment.nurseId);
    const date = new Date(`${assignment.date}T00:00:00Z`);
    const friday = date.getUTCDay() === 5;
    return {
      id: `${assignment.nurseId}-${assignment.date}`,
      title: `${nurse?.name ?? "Nurse"} · ${translateText(assignment.type === "WORK" ? "Working · 10 hours" : assignment.type === "OFF" ? "Day off" : assignment.type === "SICK" ? "Sick leave" : "Emergency leave", language)}`,
      start: assignment.date,
      allDay: true,
      backgroundColor: assignment.isManual ? "#efe7f7" : assignment.type === "WORK" ? "#e2f1f8" : assignment.type === "OFF" ? "#f5f0e5" : assignment.type === "SICK" ? "#fde9e8" : "#fff1d7",
      borderColor: assignment.isManual ? "#8a65b3" : friday && assignment.type === "WORK" ? "#176b9a" : "transparent",
      textColor: assignment.type === "WORK" ? "#176b9a" : assignment.type === "OFF" ? "#796c52" : assignment.type === "SICK" ? "#a84646" : "#986516",
      classNames: [`fc-shift-${assignment.type.toLowerCase()}`, assignment.isManual ? "fc-shift-manual" : "", friday && assignment.type === "WORK" ? "fc-friday-duty" : ""],
      extendedProps: { assignment, nurse },
    };
  }), [language, nurses, visibleMonthSchedule]);

  const editCalendarDate = (date: string) => {
    if (!monthKey || !date.startsWith(`${monthKey}-`)) return;
    setEditing({ nurse: nurses.find((nurse) => nurse.isActive && !nurse.deletedAt), date });
  };
  const onMonthEventDrop = async ({ event, oldEvent, revert }: EventDropInfo) => {
    const assignment = event.extendedProps.assignment as Assignment | undefined;
    const date = event.startStr.slice(0, 10);
    const previousDate = oldEvent.startStr.slice(0, 10);
    if (!assignment || !date.startsWith(`${monthKey}-`)) {
      revert();
      return;
    }
    try {
      await saveScheduleChange(monthStart!.getUTCFullYear(), monthStart!.getUTCMonth() + 1, {
        nurseId: assignment.nurseId,
        date,
        type: assignment.type,
        overrideReason: assignment.type === "WORK" ? "FORCED_WORK" : "OTHER",
        note: assignment.note ?? "",
        moveFrom: previousDate,
      });
      await loadMonth();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not move this shift.");
      revert();
    }
  };
  const renderMonthEvent = (arg: EventDisplayInfo) => {
    const assignment = arg.event.extendedProps.assignment as Assignment | undefined;
    const nurse = arg.event.extendedProps.nurse as Nurse | undefined;
    return <span className="fc-nurse-event"><span className={`calendar-level-badge ${nurse?.level === "SENIOR" ? "level-senior" : "level-regular"}`}>{nurse?.level === "SENIOR" ? "⭐" : "R"}</span><span>{arg.event.title}</span>{assignment?.exceptionApproved && <strong>{translateText("Exception Approved", language)}</strong>}</span>;
  };
  const onDrop = async (event: React.DragEvent, date: string) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    const source = JSON.parse(raw) as Assignment;
    if (source.date === date) return;
    try {
      const target = new Date(`${date}T00:00:00.000Z`);
      const result = await saveScheduleChange(target.getUTCFullYear(), target.getUTCMonth() + 1, {
        nurseId: source.nurseId,
        date,
        type: source.type,
        overrideReason: source.type === "WORK" ? "FORCED_WORK" : "OTHER",
        note: source.note ?? "",
        moveFrom: source.date,
      });
      if (result) await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not move this shift.");
    }
  };
  const exportSchedule = async (language: "en" | "ar", format: ExportFormat, orientation: "landscape" | "portrait") => {
    const assignments = (visibleSchedule?.assignments ?? [])
      .filter((row) => weekDates.includes(row.date))
      .map((row) => {
        const nurse = row.nurse ?? nurses.find((entry) => entry.id === row.nurseId);
        return {
          date: row.date,
          nurseId: row.nurseId,
          nurseName: nurse?.name ?? "Nurse",
          nurseColor: nurse?.color ?? "#2c9c84",
          nurseLevel: nurse?.level ?? "REGULAR",
          type: row.type,
          exceptionApproved: row.exceptionApproved ?? false,
          isManual: row.isManual,
        };
      });
    const endDate = weekDates[weekDates.length - 1];
    if (!weekKey || !endDate) return;
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
        startDate: weekKey,
        endDate,
        assignments,
        warnings: visibleSchedule?.seniorFridayWarnings ?? [],
      }, format);
      if (!opened) setError(language === "ar" ? "يرجى السماح بالنوافذ المنبثقة لتصدير الجدول." : "Allow pop-ups to export the schedule.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export the schedule.");
    }
  };

  return (
    <AppShell>
      {(error || periodError) && <div className="notice notice-error"><CircleAlert size={17} />{error || periodError}</div>}
      <div className="calendar-view-toggle" role="group" aria-label={language === "ar" ? "طريقة عرض الجدول" : "Schedule view"}>
        <button type="button" className={scheduleView === "week" ? "view-toggle-active" : ""} onClick={() => setScheduleView("week")}><CalendarDays size={15} />{language === "ar" ? "أسبوعي" : "Weekly"}</button>
        <button type="button" className={scheduleView === "month" ? "view-toggle-active" : ""} onClick={() => setScheduleView("month")}><CalendarRange size={15} />{language === "ar" ? "شهري" : "Monthly"}</button>
      </div>
      <section className="panel calendar-panel">
        {scheduleView === "week" ? <>
        <div className="calendar-toolbar">
          <div className="week-controls"><button className="icon-button" aria-label="Previous week" disabled={!weekStart} onClick={() => setWeekOffset((offset) => offset - 1)}><ArrowLeft size={17} /></button><h2>{weekStart ? weekLabel(weekStart, language) : "Loading week…"}</h2><button className="icon-button" aria-label="Next week" disabled={!weekStart} onClick={() => setWeekOffset((offset) => offset + 1)}><ArrowRight size={17} /></button><button className="button button-quiet" disabled={!today} onClick={() => setWeekOffset(0)}>Today</button></div>
          <div className="calendar-actions"><span className="calendar-stat"><CalendarDays size={15} /><strong>{count}</strong> shifts this week</span><button className="button button-outline button-compact" onClick={() => void load()}><RefreshCw size={15} />Refresh</button><Link className="button button-primary button-compact" href="/generator"><Sparkles size={15} />Generate</Link></div>
        </div>
        <div className="calendar-legend"><span><i className="legend-dot legend-work" />Working · 10 hours</span><span><i className="legend-dot legend-off" />Day off</span><span><i className="legend-dot legend-sick" />Sick leave</span><span><i className="legend-dot legend-emergency" />Emergency leave</span><span className="legend-drag">Drag a shift to move it</span></div>
        {!weekStart && <div className="table-state">Preparing calendar…</div>}
        {weekStart && !visibleSchedule && !loading && <div className="calendar-empty"><span className="empty-calendar-icon"><CalendarDays size={24} /></span><h3>No schedule yet</h3><p>Generate the schedule for this week to see your team calendar.</p><Link className="button button-primary" href="/generator"><Sparkles size={16} />Generate schedule</Link></div>}
        {loading && <div className="table-state">Loading weekly schedule…</div>}
        {visibleSchedule && <div className="calendar-scroll"><div className="calendar-grid">
          {["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => <div className={`calendar-weekday ${day === "Friday" ? "weekday-friday" : ""}`} key={day}>{day}</div>)}
          {weekDates.map((date) => {
            const dateObj = new Date(`${date}T00:00:00Z`);
            const rows = assignmentsByDay.get(date) ?? [];
            const dayNumber = dateObj.getUTCDate();
            const isToday = date === today;
            return <div key={date} className={`calendar-day ${dateObj.getUTCDay() === 5 ? "calendar-day-friday" : ""} ${isToday ? "calendar-day-today" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onDrop(event, date)}>
              <div className="calendar-day-top"><span className={isToday ? "calendar-today-number" : ""}>{dayNumber}</span>{dateObj.getUTCDay() === 5 && <small>FRI COVERAGE</small>}</div>
              <div className="calendar-shifts">{rows.map((row) => {
                const nurse = row.nurse ?? nurses.find((entry) => entry.id === row.nurseId);
                const typeClass = `shift-${row.type.toLowerCase()}`;
                return <button key={row.nurseId} draggable onDragStart={(event) => { event.dataTransfer.setData("application/json", JSON.stringify(row)); event.dataTransfer.effectAllowed = "move"; }} className={`calendar-shift ${typeClass} ${row.isManual ? "shift-manual" : ""}`} title={`${nurse?.name ?? "Nurse"} · ${nurse?.level === "SENIOR" ? "Senior Nurse" : "Regular Nurse"} · ${row.type}${row.exceptionApproved ? " · Exception Approved" : ""}${row.isManual ? " · Manual override" : ""}`} onClick={() => setEditing({ assignment: row, date })}><span className="shift-dot" style={{ backgroundColor: nurse?.color }} /><span className="shift-nurse-name">{nurse?.name?.split(" ")[0] ?? "Nurse"}</span><span className={`calendar-level-badge ${nurse?.level === "SENIOR" ? "level-senior" : "level-regular"}`} aria-label={nurse?.level === "SENIOR" ? "Senior Nurse" : "Regular Nurse"}>{nurse?.level === "SENIOR" ? "⭐" : "R"}</span><span className="shift-code">{row.exceptionApproved ? "Exception Approved" : row.type === "WORK" ? "10h" : row.type === "SICK" ? "Sick" : row.type === "EMERGENCY" ? "Emerg." : "Off"}</span></button>;
              })}</div>
              <button className="day-add" title="Add a nurse to this day" onClick={() => setEditing({ nurse: nurses.find((nurse) => nurse.isActive), date })}>+ Add shift</button>
            </div>;
          })}
        </div></div>}
        </> : <>
          <div className="calendar-toolbar month-calendar-toolbar">
            <div className="week-controls"><button className="icon-button" aria-label="Previous month" onClick={() => setMonthOffset((offset) => offset - 1)}><ArrowLeft size={17} /></button><h2>{monthTitle}</h2><button className="icon-button" aria-label="Next month" onClick={() => setMonthOffset((offset) => offset + 1)}><ArrowRight size={17} /></button><button className="button button-quiet" onClick={() => setMonthOffset(0)}>{language === "ar" ? "اليوم" : "Today"}</button></div>
            <div className="calendar-actions"><span className="calendar-stat"><CalendarRange size={15} /><strong>{visibleMonthSchedule?.assignments.length ?? 0}</strong> {language === "ar" ? "مناوبة هذا الشهر" : "assignments this month"}</span><button className="button button-outline button-compact" onClick={() => void loadMonth()}><RefreshCw size={15} />Refresh</button></div>
          </div>
          {!visibleMonthSchedule && <div className="table-state">{language === "ar" ? "جارٍ تحميل الجدول الشهري…" : "Loading monthly schedule…"}</div>}
          {visibleMonthSchedule && <div className="fullcalendar-wrap">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              initialDate={monthStart ?? undefined}
              key={`${monthKey}-${language}`}
              locale={language === "ar" ? localeAr : "en"}
              firstDay={6}
              direction={language === "ar" ? "rtl" : "ltr"}
              timeZone="UTC"
              headerToolbar={false}
              height="auto"
              events={monthEvents}
              editable
              eventStartEditable
              eventDurationEditable={false}
              eventDrop={(info) => void onMonthEventDrop(info)}
              dateClick={(info) => editCalendarDate(info.dateStr)}
              eventClick={(info) => {
                const assignment = info.event.extendedProps.assignment as Assignment;
                const nurse = info.event.extendedProps.nurse as Nurse | undefined;
                setEditing({ assignment, nurse, date: assignment.date });
              }}
              eventContent={renderMonthEvent}
            />
          </div>}
        </>}
      </section>
      <div className="calendar-footnote"><span><i className="tiny-dot" />Manual overrides are preserved during rebalancing</span>{scheduleView === "week" && <ExportLanguageControl onExport={exportSchedule} />}</div>
      {editing && editingDate && <ScheduleEditor key={`${editing.assignment?.nurseId ?? editing.nurse?.id}-${editing.date}`} assignment={editing.assignment} nurse={editing.nurse} date={editing.date} year={editingDate.getUTCFullYear()} month={editingDate.getUTCMonth() + 1} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </AppShell>
  );
}
