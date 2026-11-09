"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, CircleAlert, Clock3, HeartHandshake, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { useCurrentPeriod } from "@/components/use-current-period";
import { apiFetch, monthLabel, type ShiftTemplate } from "@/lib/client-api";
import { formatShiftTime } from "@/lib/shifts";
import { translateText } from "@/lib/i18n";

export default function GeneratorPage() {
  const { month, setMonth, error: periodError } = useCurrentPeriod();
  const { language } = useLocale();
  const { user } = useSession();
  const [state, setState] = useState<"idle" | "generating" | "done">("idle");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ assignments: number; violations: number } | null>(null);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [shiftId, setShiftId] = useState("");

  useEffect(() => {
    apiFetch<{ shifts: ShiftTemplate[] }>("/api/shifts")
      .then(({ shifts: rows }) => {
        const active = rows.filter((shift) => shift.isActive);
        setShifts(active);
        setShiftId(active.find((shift) => shift.isDefault)?.id ?? active[0]?.id ?? "");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load active shifts."));
  }, []);

  const generate = async () => {
    if (!month) return;
    setState("generating");
    setError("");
    try {
      const result = await apiFetch<{ schedule: { length?: number } | unknown[]; violations: unknown[] }>(
        `/api/schedules/${month.getFullYear()}/${month.getMonth() + 1}`,
        { method: "PUT", body: JSON.stringify({ shiftId }) },
      );
      const scheduleRows = Array.isArray(result.schedule) ? result.schedule : [];
      setSummary({ assignments: scheduleRows.length, violations: result.violations.length });
      setState("done");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate the schedule.");
      setState("idle");
    }
  };

  return (
    <AppShell>
      <div className="generator-layout">
        <section className="generator-main">
          <article className="generator-hero">
            <div className="generator-orb"><Sparkles size={29} /></div>
            <span className="eyebrow">SMART SCHEDULING</span>
            <h2>Better balance.<br /><span>Less busywork.</span></h2>
            <p>Build a fair, ready-to-share schedule for your whole care team. Your manual overrides stay exactly where you put them.</p>
            <label className="field-label generator-month-label">Schedule month<input type="month" value={month ? `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}` : ""} onChange={(event) => { const [year, monthNumber] = event.target.value.split("-").map(Number); setMonth(new Date(Date.UTC(year, monthNumber - 1, 1))); setState("idle"); }} /></label>
            <label className="field-label generator-month-label">{translateText("Default shift for generated workdays", language)}<select value={shiftId} onChange={(event) => setShiftId(event.target.value)} disabled={!shifts.length}><option value="">{translateText("Select a shift", language)}</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {formatShiftTime(shift.startTime, language)}–{formatShiftTime(shift.endTime, language)} · {shift.totalHours} {translateText("hours", language)}</option>)}</select></label>
            {!shifts.length && <div className="notice notice-error"><CircleAlert size={17} />{translateText("Create an active shift before generating a schedule.", language)} {user?.role === "ADMIN" && <Link href="/settings/shifts">{translateText("Manage shifts", language)}</Link>}</div>}
            <button className="button button-primary button-generate" onClick={() => void generate()} disabled={state === "generating" || !month || !shiftId}><Sparkles size={17} />{state === "generating" ? translateText("Balancing your schedule…", language) : state === "done" ? translateText("Regenerate schedule", language) : translateText("Generate monthly schedule", language)}{state !== "generating" && <ArrowRight size={16} />}</button>
            {(error || periodError) && <div className="notice notice-error"><CircleAlert size={17} />{error || periodError}</div>}
            {state === "done" && <div className="notice notice-success"><Check size={17} />Schedule ready — {summary?.assignments} shift entries generated{summary?.violations ? ` with ${summary.violations} rule warning(s)` : " with all scheduling rules met"}.</div>}
          </article>
          {state === "done" && month && <section className="panel generated-result"><span className="success-check"><Check size={18} /></span><div><strong>{monthLabel(month.getUTCFullYear(), month.getUTCMonth() + 1, language)} is ready</strong><p>{translateText("Review the roster and make any team-approved changes.", language)}</p></div><Link href="/schedule" className="button button-outline">{translateText("View roster", language)} <ArrowRight size={15} /></Link></section>}
          <section className="panel rules-panel">
            <div className="panel-heading"><div><span className="eyebrow">YOUR RULES</span><h2>Built around your team</h2></div><span className="rules-badge"><ShieldCheck size={15} />Active</span></div>
            <div className="rules-list">
              <div className="rule-row"><span className="rule-icon rule-mint"><Clock3 size={17} /></span><span><strong>{translateText("Administrator-defined shifts", language)}</strong><small>{translateText("Work hours follow the selected shift template.", language)}</small></span><i><Check size={13} /></i></div>
              <div className="rule-row"><span className="rule-icon rule-blue"><CalendarDays size={17} /></span><span><strong>5 working days a week</strong><small>Two days off for every nurse, each week.</small></span><i><Check size={13} /></i></div>
              <div className="rule-row"><span className="rule-icon rule-amber"><UsersRound size={17} /></span><span><strong>Fair Friday rotation</strong><small>Exactly two nurses on Friday, with no back-to-back assignments.</small></span><i><Check size={13} /></i></div>
              <div className="rule-row"><span className="rule-icon rule-rose"><HeartHandshake size={17} /></span><span><strong>Saturday coverage</strong><small>Saturday off-days are avoided unless a manager overrides the rule.</small></span><i><Check size={13} /></i></div>
            </div>
          </section>
        </section>
        <aside className="generator-aside">
          <article className="panel how-panel"><span className="eyebrow">HOW IT WORKS</span><h2>From blank page to balanced plan.</h2><div className="step-list"><div className="step"><span>01</span><div><strong>Team first</strong><p>Only active nurses are included.</p></div></div><div className="step"><span>02</span><div><strong>Fair by design</strong><p>Workload and Friday shifts rotate fairly.</p></div></div><div className="step"><span>03</span><div><strong>Your call, always</strong><p>Saved manual changes survive every regeneration.</p></div></div></div></article>
          <div className="generator-tip"><span><ShieldCheck size={17} /></span><div><strong>Overrides are protected</strong><p>Existing manual shifts, leave and exceptions are kept when schedules are regenerated.</p></div></div>
          <Link className="text-link generator-report-link" href="/reports">See fairness statistics <ArrowRight size={14} /></Link>
        </aside>
      </div>
    </AppShell>
  );
}
