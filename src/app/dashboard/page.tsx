"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CircleAlert,
  Clock3,
  HeartPulse,
  Plus,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { translateText } from "@/lib/i18n";
import { useSession } from "@/components/session-provider";
import { useLocale } from "@/components/locale-provider";
import { apiFetch, initials, shortDate, type Assignment, type Nurse } from "@/lib/client-api";

type Overview = {
  month: { year: number; month: number };
  today: string;
  scheduleGenerated: boolean;
  activeNurseCount: number;
  seniorNurseCount: number;
  regularNurseCount: number;
  fridaySeniorCoverage: number;
  totalNurseCount: number;
  workingToday: number;
  leaveDays: number;
  assignments: Assignment[];
  nurses: Nurse[];
  fairness: { nurseId: string; workingDays: number; fridayAssignments: number; offDays: number; leaveDays: number }[];
  seniorFridayWarnings: { id: string; date: string; priority: "HIGH"; message: string }[];
};

export default function DashboardPage() {
  const { user, ready } = useSession();
  const { language } = useLocale();
  const userId = user?.id;
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !userId) return;
    let active = true;
    apiFetch<Overview>("/api/dashboard")
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load the dashboard.");
      });
    return () => { active = false; };
  }, [ready, userId]);

  const today = data?.today ?? "";
  const todayAssignments = useMemo(
    () => data?.assignments.filter((row) => row.date === today) ?? [],
    [data, today],
  );
  const upcoming = useMemo(
    () => data?.assignments.filter((row) => row.date >= today && (row.type === "SICK" || row.type === "EMERGENCY")).slice(0, 4) ?? [],
    [data, today],
  );

  return (
    <AppShell>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <div className="welcome-eyebrow"><span className="live-dot" /> YOUR TEAM, IN RHYTHM</div>
          <h2>{data?.scheduleGenerated ? "A well-covered day starts here." : "Make room for better care."}</h2>
          <p>{data?.scheduleGenerated ? "Your schedule is ready. Here’s a quick look at the team." : "Generate a balanced schedule for your nursing team in just a few clicks."}</p>
          <Link className="button button-light" href={data?.scheduleGenerated ? "/schedule" : "/generator"}>
            {data?.scheduleGenerated ? "View weekly schedule" : "Build this month’s schedule"} <ArrowRight size={16} />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" />
          <div className="art-card"><HeartPulse size={32} /><span>CARE<br />IN BALANCE</span></div>
          <span className="art-spark art-spark-one">✳</span><span className="art-spark art-spark-two">✦</span>
        </div>
      </section>

      {error && <div className="notice notice-error"><CircleAlert size={18} /><span>{error}</span></div>}
      {data?.seniorFridayWarnings.map((warning) => (
        <div className="senior-friday-indicator" role="alert" key={warning.id}>
          <CircleAlert size={16} />
          <strong>{translateText("HIGH PRIORITY", language)}</strong>
          <time>{shortDate(warning.date, language)}</time>
          <span>{translateText(warning.message, language)}</span>
        </div>
      ))}

      <section className="metric-grid">
        <MetricCard label="Active nurses" value={data?.activeNurseCount ?? "—"} detail={`${data?.totalNurseCount ?? 0} team profiles`} icon={UsersRound} tone="mint" />
        <MetricCard label="On duty today" value={data?.workingToday ?? "—"} detail={`${todayAssignments.length} shift entries today`} icon={CalendarCheck2} tone="blue" />
        <MetricCard label="Leave this month" value={data?.leaveDays ?? "—"} detail="Sick & emergency leave" icon={CalendarClock} tone="amber" />
        <MetricCard label="Shift length" value="10 hrs" detail="Standard daily shift" icon={Clock3} tone="rose" />
        <MetricCard label="Total Senior Nurses" value={data?.seniorNurseCount ?? "—"} detail="Senior Nurse" icon={UsersRound} tone="amber" />
        <MetricCard label="Total Regular Nurses" value={data?.regularNurseCount ?? "—"} detail="Regular Nurse" icon={UsersRound} tone="blue" />
        <MetricCard label="Friday Senior Coverage" value={data?.fridaySeniorCoverage ?? "—"} detail="Senior Friday Assignments" icon={CalendarCheck2} tone="mint" />
      </section>

      <section className="dashboard-grid">
        <article className="panel today-panel">
          <div className="panel-heading"><div><span className="eyebrow">ON THE FLOOR</span><h2>Today’s team</h2></div><Link href="/schedule" className="text-link">Full schedule <ArrowRight size={14} /></Link></div>
          <div className="today-date"><span className="today-date-mark"><CalendarCheck2 size={17} /></span><strong>{today ? new Intl.DateTimeFormat(language, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`)) : "Today"}</strong><span>{todayAssignments.filter((row) => row.type === "WORK").length} nurses scheduled</span></div>
          {todayAssignments.filter((row) => row.type === "WORK").slice(0, 5).map((row) => {
            const nurse = data?.nurses.find((entry) => entry.id === row.nurseId);
            return <div key={row.nurseId} className="team-row"><span className="avatar" style={{ backgroundColor: nurse?.color }}>{initials(nurse?.name ?? "?")}</span><span className="team-name"><strong>{nurse?.name ?? "Nurse"}</strong><small>{nurse?.title ?? "Registered Nurse"}</small></span><span className="shift-time">07:00 — 17:00</span><span className="shift-pill shift-work">On duty</span></div>;
          })}
          {data?.scheduleGenerated && todayAssignments.length === 0 && <div className="empty-inline">No shift entries for today.</div>}
          {!data?.scheduleGenerated && <div className="empty-inline">Generate this month’s schedule to see today’s team.</div>}
          <Link href="/schedule" className="panel-footer-link">Open weekly schedule <ArrowRight size={14} /></Link>
        </article>

        <article className="panel balance-panel">
          <div className="panel-heading"><div><span className="eyebrow">TEAM PULSE</span><h2>Workload at a glance</h2></div><span className="soft-icon"><Sparkles size={16} /></span></div>
          <p className="panel-intro">Scheduled working days this month by nurse.</p>
          {data?.fairness.filter((row) => data.nurses.some((nurse) => nurse.id === row.nurseId)).slice(0, 5).map((stat) => {
            const nurse = data.nurses.find((entry) => entry.id === stat.nurseId)!;
            const maxDays = Math.max(1, ...data.fairness.map((entry) => entry.workingDays));
            return <div className="balance-row" key={stat.nurseId}><span className="avatar avatar-small" style={{ backgroundColor: nurse.color }}>{initials(nurse.name)}</span><span className="balance-name">{nurse.name.split(" ")[0]}</span><div className="progress-track"><span style={{ width: `${Math.min(100, (stat.workingDays / maxDays) * 100)}%`, backgroundColor: nurse.color }} /></div><strong>{stat.workingDays}<small> days</small></strong></div>;
          })}
          {!data?.scheduleGenerated && <div className="empty-inline">Your fairness snapshot appears after schedule generation.</div>}
          <Link href="/reports" className="panel-footer-link">See fairness report <ArrowRight size={14} /></Link>
        </article>

        <article className="panel quick-panel">
          <div className="panel-heading"><div><span className="eyebrow">QUICK ACTIONS</span><h2>Make a change</h2></div></div>
          <Link className="quick-action-row" href="/nurses"><span className="quick-action-icon icon-teal"><Plus size={17} /></span><span><strong>Add a nurse</strong><small>Grow your care team</small></span><ArrowRight size={15} /></Link>
          <Link className="quick-action-row" href="/generator"><span className="quick-action-icon icon-blue"><Sparkles size={17} /></span><span><strong>Generate schedule</strong><small>Balance the month automatically</small></span><ArrowRight size={15} /></Link>
          <Link className="quick-action-row" href="/exceptions"><span className="quick-action-icon icon-amber"><CalendarClock size={17} /></span><span><strong>Record an exception</strong><small>Log leave or an emergency</small></span><ArrowRight size={15} /></Link>
        </article>

        <article className="panel exception-panel">
          <div className="panel-heading"><div><span className="eyebrow">COMING UP</span><h2>Exceptions & leave</h2></div><Link href="/exceptions" className="text-link">See all <ArrowRight size={14} /></Link></div>
          {upcoming.map((row, index) => {
            const nurse = data?.nurses.find((entry) => entry.id === row.nurseId);
            return <div key={`${row.nurseId}-${row.date}-${index}`} className="exception-row"><span className={`exception-mark ${row.type === "SICK" ? "mark-rose" : "mark-amber"}`}>{row.type === "SICK" ? "S" : "E"}</span><span className="exception-copy"><strong>{nurse?.name ?? "Nurse"}</strong><small>{row.type === "SICK" ? "Sick leave" : "Emergency leave"}</small></span><time>{shortDate(row.date, language)}</time></div>;
          })}
          {upcoming.length === 0 && <div className="empty-inline">No upcoming leave or exceptions.</div>}
          <Link href="/exceptions" className="panel-footer-link">Manage exceptions <ArrowRight size={14} /></Link>
        </article>
      </section>
    </AppShell>
  );
}
