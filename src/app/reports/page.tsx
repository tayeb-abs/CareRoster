"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarCheck2, ChartNoAxesCombined, CircleAlert, HeartPulse, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExportLanguageControl } from "@/components/export-language-control";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { useCurrentPeriod } from "@/components/use-current-period";
import { apiFetch, initials, monthLabel, type Assignment, type ClinicProfile, type Nurse } from "@/lib/client-api";
import { exportReports as createReportsExport, type ExportFormat } from "@/lib/office-export";
import { translateText } from "@/lib/i18n";

type ScheduleSummary = {
  schedule: { assignments: Assignment[] } | null;
  nurses: Nurse[];
  seniorFridayWarnings: { id: string; date: string; action: string; priority: "HIGH"; message: string }[];
};
type FairnessRow = {
  nurse: Nurse;
  work: number;
  friday: number;
  seniorFriday: number;
  regularFriday: number;
  off: number;
  leave: number;
};

export default function ReportsPage() {
  const { month, setMonth, error: periodError } = useCurrentPeriod();
  const { language } = useLocale();
  const { user } = useSession();
  const [data, setData] = useState<ScheduleSummary | null>(null);
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [error, setError] = useState("");
  const year = month?.getUTCFullYear() ?? 0;
  const monthNumber = month ? month.getUTCMonth() + 1 : 0;

  useEffect(() => {
    if (!month) return;
    apiFetch<ScheduleSummary>(`/api/schedules/${year}/${monthNumber}`)
      .then(setData)
      .catch((reason) => setError(reason.message));
  }, [year, monthNumber, month]);

  useEffect(() => {
    apiFetch<{ profile: ClinicProfile }>("/api/clinic-profile")
      .then(({ profile }) => setClinic(profile))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load clinic profile for export."));
  }, []);

  const rows = useMemo<FairnessRow[]>(() => (data?.nurses ?? []).filter((nurse) => nurse.isActive && !nurse.deletedAt).map((nurse) => {
    const shifts = (data?.schedule?.assignments ?? []).filter((assignment) => assignment.nurseId === nurse.id && assignment.date.startsWith(`${year}-${String(monthNumber).padStart(2, "0")}-`));
    return {
      nurse,
      work: shifts.filter((row) => row.type === "WORK").length,
      friday: shifts.filter((row) => row.type === "WORK" && new Date(`${row.date}T00:00:00Z`).getUTCDay() === 5).length,
      seniorFriday: nurse.level === "SENIOR" ? shifts.filter((row) => row.type === "WORK" && new Date(`${row.date}T00:00:00Z`).getUTCDay() === 5).length : 0,
      regularFriday: nurse.level === "REGULAR" ? shifts.filter((row) => row.type === "WORK" && new Date(`${row.date}T00:00:00Z`).getUTCDay() === 5).length : 0,
      off: shifts.filter((row) => row.type === "OFF").length,
      leave: shifts.filter((row) => row.type === "SICK" || row.type === "EMERGENCY").length,
    };
  }), [data, year, monthNumber]);

  const totals = rows.reduce((acc, row) => ({ work: acc.work + row.work, friday: acc.friday + row.friday, seniorFriday: acc.seniorFriday + row.seniorFriday, regularFriday: acc.regularFriday + row.regularFriday, off: acc.off + row.off, leave: acc.leave + row.leave }), { work: 0, friday: 0, seniorFriday: 0, regularFriday: 0, off: 0, leave: 0 });
  const maxWork = Math.max(1, ...rows.map((row) => row.work));
  const maxFriday = Math.max(1, ...rows.map((row) => row.friday));
  const fairnessScore = rows.length > 1 ? Math.max(...rows.map((row) => row.work)) - Math.min(...rows.map((row) => row.work)) : 0;
  const exportReport = async (exportLanguage: "en" | "ar", format: ExportFormat, orientation: "landscape" | "portrait") => {
    if (!month) return;
    if (!clinic) {
      setError(exportLanguage === "ar" ? "تعذر تحميل بيانات المركز للتصدير." : "Clinic profile is not ready for export.");
      return;
    }
    try {
      const opened = await createReportsExport({
      language: exportLanguage,
      clinic,
      generatedBy: user?.name,
      generatedAt: new Date().toISOString(),
      orientation,
      year,
      month: monthNumber,
      rows: rows.map((row) => ({
        nurseName: row.nurse.name,
        nurseLevel: row.nurse.level,
        workingDays: row.work,
        fridayAssignments: row.friday,
        seniorFridayAssignments: row.seniorFriday,
        regularFridayAssignments: row.regularFriday,
        offDays: row.off,
        leaveDays: row.leave,
      })),
      warnings: data?.seniorFridayWarnings ?? [],
    }, format);
    if (!opened) setError(exportLanguage === "ar" ? "يرجى السماح بالنوافذ المنبثقة لتصدير التقرير." : "Allow pop-ups to export the report.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export the report.");
    }
  };

  return (
    <AppShell>
      <div className="reports-toolbar"><div><span className="eyebrow">MONTHLY OVERVIEW</span><h2>{month ? monthLabel(year, monthNumber, language) : "Loading month…"}</h2></div><input className="month-input-small" type="month" value={month ? `${year}-${String(monthNumber).padStart(2, "0")}` : ""} onChange={(event) => { const [nextYear, nextMonth] = event.target.value.split("-").map(Number); setMonth(new Date(Date.UTC(nextYear, nextMonth - 1, 1))); }} /></div>
      {(error || periodError) && <div className="notice notice-error"><CircleAlert size={16} />{error || periodError}</div>}
      {data?.seniorFridayWarnings.map((warning) => <div className="senior-friday-indicator" role="alert" key={warning.id}><CircleAlert size={16} /><strong>{translateText("HIGH PRIORITY", language)}</strong><time>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${warning.date}T00:00:00Z`))}</time><span>{translateText(warning.message, language)}</span></div>)}
      {!data?.schedule && !error && <div className="panel report-empty"><span className="empty-calendar-icon"><ChartNoAxesCombined size={25} /></span><h2>No report data yet</h2><p>Generate this month’s schedule to see workload and fairness statistics.</p><Link className="button button-primary" href="/generator">Generate schedule <ArrowRight size={15} /></Link></div>}
      {data?.schedule && <>
        <section className="report-metrics">
          <article className="report-metric"><span className="report-metric-icon report-mint"><CalendarCheck2 size={18} /></span><span>Total working days</span><strong>{totals.work}</strong><small>Across {rows.length} nurses</small></article>
          <article className="report-metric"><span className="report-metric-icon report-blue"><UsersRound size={18} /></span><span>Friday assignments</span><strong>{totals.friday}</strong><small>Two nurses per Friday</small></article>
          <article className="report-metric"><span className="report-metric-icon report-amber"><UsersRound size={18} /></span><span>Senior Friday Assignments</span><strong>{totals.seniorFriday}</strong><small>Senior Nurse</small></article>
          <article className="report-metric"><span className="report-metric-icon report-blue"><UsersRound size={18} /></span><span>Regular Friday Assignments</span><strong>{totals.regularFriday}</strong><small>Regular Nurse</small></article>
          <article className="report-metric"><span className="report-metric-icon report-amber"><HeartPulse size={18} /></span><span>Off-days</span><strong>{totals.off}</strong><small>Manual & generated off-days</small></article>
          <article className="report-metric"><span className="report-metric-icon report-rose"><BarChart3 size={18} /></span><span>Workload spread</span><strong>{fairnessScore} <small>days</small></strong><small>{fairnessScore <= 2 ? "Strong monthly balance" : "Consider a fairness review"}</small></article>
        </section>
        <div className="reports-grid">
          <section className="panel report-chart-panel">
            <div className="panel-heading"><div><span className="eyebrow">WORKLOAD BALANCE</span><h2>Working days per nurse</h2></div><span className="soft-icon"><ChartNoAxesCombined size={17} /></span></div>
            <p className="panel-intro">Total scheduled workdays for {monthLabel(year, monthNumber, language)}.</p>
            <div className="bar-chart">{rows.map((row) => <div className="bar-column" key={row.nurse.id}><strong>{row.work}</strong><div className="bar-track"><span style={{ height: `${Math.max(4, (row.work / maxWork) * 100)}%`, background: row.nurse.color }} /></div><span className="avatar avatar-tiny" style={{ backgroundColor: row.nurse.color }}>{initials(row.nurse.name)}</span><small>{row.nurse.name.split(" ")[0]}</small></div>)}</div>
            <div className="chart-caption"><span><i className="tiny-dot" />Higher bars indicate more scheduled workdays</span><ExportLanguageControl onExport={exportReport} /></div>
          </section>
          <section className="panel report-chart-panel">
            <div className="panel-heading"><div><span className="eyebrow">FRIDAY ROTATION</span><h2>Friday assignments</h2></div><span className="soft-icon"><UsersRound size={17} /></span></div>
            <p className="panel-intro">Fair distribution of the weekly Friday coverage.</p>
            {rows.map((row) => <div className="friday-row" key={row.nurse.id}><span className="avatar avatar-small" style={{ backgroundColor: row.nurse.color }}>{initials(row.nurse.name)}</span><span className="friday-name">{row.nurse.name}</span><div className="progress-track"><span style={{ width: `${Math.min(100, (row.friday / maxFriday) * 100)}%`, background: row.nurse.color }} /></div><strong>{row.friday}</strong></div>)}
            <div className="chart-caption"><span>Friday duty rotates between active nurses.</span></div>
          </section>
        </div>
        <section className="panel fairness-table-panel">
          <div className="panel-heading"><div><span className="eyebrow">PER-NURSE BREAKDOWN</span><h2>Fairness details</h2></div><span className={`fairness-tag ${fairnessScore <= 2 ? "fairness-good" : "fairness-review"}`}>{fairnessScore <= 2 ? "Balanced" : "Review balance"}</span></div>
          <div className="fairness-table-wrap"><table className="fairness-table"><thead><tr><th>NURSE</th><th>LEVEL</th><th>WORKING DAYS</th><th>FRIDAY DUTY</th><th>SENIOR FRIDAY</th><th>REGULAR FRIDAY</th><th>OFF-DAYS</th><th>LEAVE</th></tr></thead><tbody>{rows.map((row) => <tr key={row.nurse.id}><td><span className="table-nurse"><span className="avatar avatar-small" style={{ backgroundColor: row.nurse.color }}>{initials(row.nurse.name)}</span><span><strong>{row.nurse.name}</strong><small>{row.nurse.title}</small></span></span></td><td><span className={`nurse-level-badge ${row.nurse.level === "SENIOR" ? "level-senior" : "level-regular"}`}>{row.nurse.level === "SENIOR" ? "⭐ Senior Nurse" : "Regular Nurse"}</span></td><td><strong>{row.work}</strong><span className="table-bar" style={{ width: `${Math.max(2, (row.work / maxWork) * 56)}px`, background: row.nurse.color }} /></td><td><strong>{row.friday}</strong><span className="friday-mini-bar">{Array.from({ length: Math.max(1, maxFriday) }, (_, index) => <i key={index} className={index < row.friday ? "friday-mini-active" : ""} />)}</span></td><td>{row.seniorFriday}</td><td>{row.regularFriday}</td><td>{row.off}</td><td>{row.leave}</td></tr>)}</tbody></table></div>
          <div className="fairness-note"><span className="fairness-note-icon"><HeartPulse size={15} /></span><p><strong>Fairness is a conversation.</strong> Use these numbers as a guide, then consider leave and individual preferences when adjusting next month’s plan.</p></div>
        </section>
      </>}
    </AppShell>
  );
}
