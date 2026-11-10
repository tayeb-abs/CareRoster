"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, CircleAlert, History, ShieldAlert, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { apiFetch, monthLabel } from "@/lib/client-api";
import { translateText } from "@/lib/i18n";

type CleanupHistoryRow = {
  id: string;
  action: string;
  affectedMonth: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};
type SchedulePeriod = { year: number; month: number; generatedAt: string; archivedAt: string | null };
type ManagementData = { history: CleanupHistoryRow[]; periods?: SchedulePeriod[] };

function monthParts(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

function historyAction(action: string) {
  const labels: Record<string, string> = {
    CLEAR_MONTH: "Clear month",
    CLEAR_RANGE: "Clear date range",
    CLEAR_ALL: "Clear all schedule history",
    ARCHIVE_MONTH: "Archive month",
  };
  return labels[action] ?? action;
}

export default function ScheduleManagementPage() {
  const router = useRouter();
  const { language } = useLocale();
  const { user, ready } = useSession();
  const [month, setMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [password, setPassword] = useState("");
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [data, setData] = useState<ManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [monthCleared, setMonthCleared] = useState(false);
  const isAdmin = user?.role === "ADMIN";

  const loadData = useCallback(async () => {
    try {
      const result = await apiFetch<ManagementData>("/api/schedule-management");
      setData(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load schedule history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    Promise.all([
      apiFetch<ManagementData>("/api/schedule-management"),
      apiFetch<{ year: number; month: number }>("/api/period"),
    ])
      .then(([result, period]) => {
        if (active) {
          setData(result);
          setMonth(`${period.year}-${String(period.month).padStart(2, "0")}`);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load schedule history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [ready, user]);

  const submitAction = async (body: Record<string, unknown>, clearedMonth = false) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch("/api/schedule-management", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMonthCleared(clearedMonth);
      setMessage(translateText("Schedule maintenance completed.", language));
      setPassword("");
      setWarningAcknowledged(false);
      await loadData();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete schedule maintenance.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const clearMonth = async () => {
    const { year, month: monthNumber } = monthParts(month);
    const monthName = monthLabel(year, monthNumber, language);
    const question = `${translateText("Are you sure you want to clear all schedules for", language)} ${monthName}${language === "ar" ? "؟" : "?"}`;
    if (!window.confirm(question)) return;
    await submitAction({ action: "CLEAR_MONTH", year, month: monthNumber }, true);
  };

  const clearRange = async () => {
    if (!startDate || !endDate || startDate > endDate) {
      setError(translateText("Choose a valid date range.", language));
      return;
    }
    const question = `${translateText("Are you sure you want to clear schedule data from", language)} ${startDate} ${translateText("to", language)} ${endDate}?`;
    if (!window.confirm(question)) return;
    await submitAction({ action: "CLEAR_RANGE", startDate, endDate });
  };

  const archiveMonth = async () => {
    const { year, month: monthNumber } = monthParts(month);
    const monthName = monthLabel(year, monthNumber, language);
    if (!window.confirm(`${translateText("Archive schedule for", language)} ${monthName}?`)) return;
    await submitAction({ action: "ARCHIVE_MONTH", year, month: monthNumber });
  };

  const clearAll = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAction({
      action: "CLEAR_ALL",
      password,
      confirmed: true,
      warningAcknowledged,
    });
  };

  const { year: selectedYear, month: selectedMonth } = monthParts(month);
  const selectedPeriod = data?.periods?.find((period) => period.year === selectedYear && period.month === selectedMonth);
  const archivedPeriods = data?.periods?.filter((period) => period.archivedAt) ?? [];

  return (
    <AppShell>
      {isAdmin && <div className="schedule-management-grid">
        <section className="panel cleanup-panel">
          <div className="panel-heading"><div><span className="eyebrow">MONTHLY MAINTENANCE</span><h2>{translateText("Clear specific month", language)}</h2></div><span className="soft-icon"><CalendarDays size={17} /></span></div>
          <p className="panel-intro">{translateText("Remove a month's schedule and its generated entries, Friday history, and schedule statistics. Nurses, users, shifts, and master data are preserved.", language)}</p>
          <label className="field-label">{translateText("Schedule month", language)}<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setMonthCleared(false); }} /></label>
          {selectedPeriod?.archivedAt && <p className="archive-note">{translateText("This month is archived.", language)}</p>}
          <div className="cleanup-actions">
            <button type="button" className="button button-danger" onClick={() => void clearMonth()} disabled={saving || !month}><Trash2 size={15} />{translateText("Clear month schedule", language)}</button>
            <button type="button" className="button button-outline" onClick={() => void archiveMonth()} disabled={saving || !selectedPeriod || Boolean(selectedPeriod.archivedAt)}><Archive size={15} />{translateText("Archive month", language)}</button>
          </div>
          {monthCleared && <button type="button" className="button button-primary" onClick={() => router.push(`/generator?month=${month}`)}>{translateText("Generate new schedule", language)}</button>}
        </section>

        <section className="panel cleanup-panel">
          <div className="panel-heading"><div><span className="eyebrow">TARGETED CLEANUP</span><h2>{translateText("Clear date range", language)}</h2></div><span className="soft-icon"><CalendarDays size={17} /></span></div>
          <p className="panel-intro">{translateText("Delete schedule data only between the selected dates. Existing schedules outside the range remain unchanged.", language)}</p>
          <div className="cleanup-date-fields">
            <label className="field-label">{translateText("From", language)}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="field-label">{translateText("To", language)}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
          <button type="button" className="button button-danger" onClick={() => void clearRange()} disabled={saving}><Trash2 size={15} />{translateText("Clear date range", language)}</button>
        </section>

        <section className="panel cleanup-panel cleanup-danger-panel">
          <div className="panel-heading"><div><span className="eyebrow">PERMANENT ACTION</span><h2>{translateText("Clear entire schedule history", language)}</h2></div><span className="cleanup-warning-icon"><ShieldAlert size={18} /></span></div>
          <p className="cleanup-warning-copy">{translateText("This permanently removes all schedules, Friday history, generated schedule records, and schedule statistics. Users, nurses, shifts, system settings, translations, and cleanup history are preserved.", language)}</p>
          <form className="cleanup-all-form" onSubmit={(event) => void clearAll(event)}>
            <label className="field-label">{translateText("Confirm your password", language)}<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label className="cleanup-confirm-check"><input type="checkbox" checked={warningAcknowledged} onChange={(event) => setWarningAcknowledged(event.target.checked)} required /><span>{translateText("I understand this permanently deletes all schedule history.", language)}</span></label>
            <button className="button button-danger" disabled={saving || !warningAcknowledged || !password}><Trash2 size={15} />{translateText("Permanently clear all schedules", language)}</button>
          </form>
        </section>

        <section className="panel cleanup-panel">
          <div className="panel-heading"><div><span className="eyebrow">YEARLY RECORD KEEPING</span><h2>{translateText("Archived schedules", language)}</h2></div><span className="soft-icon"><Archive size={17} /></span></div>
          <p className="panel-intro">{translateText("Archived months are hidden from active schedules and remain available in reports and exports.", language)}</p>
          {archivedPeriods.length === 0
            ? <p className="cleanup-empty">{translateText("No archived months.", language)}</p>
            : <ul className="archive-list">{archivedPeriods.map((period) => <li key={`${period.year}-${period.month}`}><Archive size={15} /><strong>{monthLabel(period.year, period.month, language)}</strong><span>{translateText("Available in reports and exports", language)}</span></li>)}</ul>}
        </section>
      </div>}

      {(error || message) && <div className={`notice ${error ? "notice-error" : "notice-success"}`}>{error ? <CircleAlert size={17} /> : null}{error || message}</div>}

      <section className="panel cleanup-history-panel">
        <div className="panel-heading"><div><span className="eyebrow">AUDIT LOG</span><h2><History size={17} />{translateText("Schedule cleanup history", language)}</h2></div></div>
        <p className="panel-intro">{translateText("Maintenance actions are recorded with the user, date, time, action, and affected month.", language)}</p>
        {loading ? <p className="cleanup-empty">{translateText("Loading history…", language)}</p> : !data?.history.length
          ? <p className="cleanup-empty">{translateText("No schedule cleanup history yet.", language)}</p>
          : <div className="cleanup-history-table-wrap"><table className="cleanup-history-table"><thead><tr><th>{translateText("Date and time", language)}</th><th>{translateText("User", language)}</th><th>{translateText("Action", language)}</th><th>{translateText("Affected month", language)}</th></tr></thead><tbody>{data.history.map((row) => <tr key={row.id}><td>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td><td>{row.actor?.name ?? translateText("User unavailable", language)}</td><td>{translateText(historyAction(row.action), language)}</td><td>{row.affectedMonth === "ALL" ? translateText("All schedule history", language) : row.affectedMonth}</td></tr>)}</tbody></table></div>}
      </section>
    </AppShell>
  );
}
