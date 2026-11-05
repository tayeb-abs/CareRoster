"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, CircleAlert, HeartPulse, Siren } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useLocale } from "@/components/locale-provider";
import { ScheduleEditor } from "@/components/schedule-editor";
import { useCurrentPeriod } from "@/components/use-current-period";
import { apiFetch, initials, monthLabel, shortDate, type Assignment, type Nurse } from "@/lib/client-api";
import { saveScheduleChange } from "@/lib/schedule-actions";

type ScheduleResult = { assignments: Assignment[] } | null;

export default function ExceptionsPage() {
  const { month, setMonth, today, error: periodError } = useCurrentPeriod();
  const { language } = useLocale();
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [schedule, setSchedule] = useState<ScheduleResult>(null);
  const [nurseId, setNurseId] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"SICK" | "EMERGENCY">("SICK");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ assignment: Assignment; date: string } | null>(null);
  const year = month?.getUTCFullYear() ?? 0;
  const monthNumber = month ? month.getUTCMonth() + 1 : 0;

  const load = () => {
    if (!month) return Promise.resolve();
    return apiFetch<{ schedule: ScheduleResult; nurses: Nurse[] }>(`/api/schedules/${year}/${monthNumber}`)
      .then((result) => { setSchedule(result.schedule); setNurses(result.nurses); setError(""); })
      .catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : "Could not load schedule exceptions."); });
  };

  useEffect(() => {
    if (!month) return;
    let active = true;
    apiFetch<{ schedule: ScheduleResult; nurses: Nurse[] }>(`/api/schedules/${year}/${monthNumber}`)
      .then((result) => {
        if (!active) return;
        setSchedule(result.schedule);
        setNurses(result.nurses);
        setError("");
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load schedule exceptions."); });
    return () => { active = false; };
  }, [year, monthNumber, month]);

  const exceptions = useMemo(
    () => (schedule?.assignments ?? [])
      .filter((row) =>
        row.date.startsWith(`${year}-${String(monthNumber).padStart(2, "0")}-`) &&
        (row.type === "SICK" || row.type === "EMERGENCY"),
      )
      .sort((left, right) => left.date.localeCompare(right.date)),
    [schedule, year, monthNumber],
  );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const selectedNurseId = nurseId || nurses.find((nurse) => nurse.isActive)?.id || "";
      const result = await saveScheduleChange(year, monthNumber, {
        nurseId: selectedNurseId,
        date: date || today,
        type,
        overrideReason: type === "SICK" ? "SICK_LEAVE" : "EMERGENCY_LEAVE",
        note,
      });
      if (result) {
        setMessage("Exception recorded. The rest of the schedule has been rebalanced.");
        setNote("");
        await load();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record this exception.");
    } finally {
      setLoading(false);
    }
  };

  const chosenNurse = nurseId || nurses.find((nurse) => nurse.isActive)?.id || "";

  return (
    <AppShell>
      {(error || periodError) && <div className="notice notice-error"><CircleAlert size={16} />{error || periodError}</div>}
      <div className="exceptions-layout">
        <section className="panel exception-form-panel">
          <div className="panel-heading"><div><span className="eyebrow">LEAVE & COVERAGE</span><h2>Record an exception</h2></div><span className="soft-icon"><CalendarPlus size={17} /></span></div>
          <p className="panel-intro">Log a leave day or emergency. We’ll rebalance the remaining schedule and preserve this exception.</p>
          <form className="exception-form" onSubmit={submit}>
            <label className="field-label">Nurse<select value={chosenNurse} onChange={(event) => setNurseId(event.target.value)} required><option value="" disabled>Select a nurse</option>{nurses.filter((nurse) => nurse.isActive).map((nurse) => <option value={nurse.id} key={nurse.id}>{nurse.name}</option>)}</select></label>
            <label className="field-label">Date<input type="date" value={date || today} onChange={(event) => setDate(event.target.value)} required /></label>
            <fieldset className="exception-type-field"><legend>Exception type</legend><label className={`exception-type-card ${type === "SICK" ? "exception-type-selected" : ""}`}><input type="radio" name="type" checked={type === "SICK"} onChange={() => setType("SICK")} /><span className="exception-type-icon sick-type"><HeartPulse size={17} /></span><span><strong>Sick leave</strong><small>Health-related absence</small></span></label><label className={`exception-type-card ${type === "EMERGENCY" ? "exception-type-selected" : ""}`}><input type="radio" name="type" checked={type === "EMERGENCY"} onChange={() => setType("EMERGENCY")} /><span className="exception-type-icon emergency-type"><Siren size={17} /></span><span><strong>Emergency leave</strong><small>Urgent personal situation</small></span></label></fieldset>
            <label className="field-label">Note <span className="field-optional">OPTIONAL</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add helpful context for the scheduling team…" maxLength={500} /></label>
            {message && <div className="notice notice-success">{message}</div>}
            <button className="button button-primary button-wide" disabled={loading || !month || !chosenNurse}>{loading ? "Rebalancing…" : "Save exception"}</button>
          </form>
        </section>
        <section className="panel exception-log-panel">
          <div className="panel-heading"><div><span className="eyebrow">SCHEDULE LOG</span><h2>Exceptions this month</h2></div><input className="month-input-small" type="month" value={month ? `${year}-${String(monthNumber).padStart(2, "0")}` : ""} onChange={(event) => { const [nextYear, nextMonth] = event.target.value.split("-").map(Number); setMonth(new Date(Date.UTC(nextYear, nextMonth - 1, 1))); setDate(`${event.target.value}-01`); }} /></div>
          <p className="panel-intro">{month ? monthLabel(year, monthNumber, language) : "Loading month…"} · {exceptions.length} exception{exceptions.length === 1 ? "" : "s"} recorded</p>
          <div className="exception-log">
            {exceptions.map((row) => {
              const nurse = row.nurse ?? nurses.find((entry) => entry.id === row.nurseId);
              return <button className="exception-log-row" key={`${row.nurseId}-${row.date}`} onClick={() => setEditing({ assignment: row, date: row.date })}><span className={`exception-mark ${row.type === "SICK" ? "mark-rose" : "mark-amber"}`}>{row.type === "SICK" ? "S" : "E"}</span><span className="avatar avatar-small" style={{ backgroundColor: nurse?.color }}>{initials(nurse?.name ?? "?")}</span><span className="exception-copy"><strong>{nurse?.name ?? "Nurse"}</strong><small>{row.type === "SICK" ? "Sick leave" : "Emergency leave"}{row.note ? ` · ${row.note}` : ""}</small></span><time>{shortDate(row.date, language)}</time></button>;
            })}
            {exceptions.length === 0 && <div className="calendar-empty empty-small"><span className="empty-calendar-icon"><CalendarClock size={23} /></span><h3>No exceptions this month</h3><p>Recorded leave and emergencies will appear here.</p></div>}
          </div>
          <div className="exception-log-footer"><span>Overrides are kept when the schedule is regenerated.</span></div>
        </section>
      </div>
      {editing && <ScheduleEditor key={`${editing.assignment.nurseId}-${editing.date}`} assignment={editing.assignment} date={editing.date} year={year} month={monthNumber} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </AppShell>
  );
}
