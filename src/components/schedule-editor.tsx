"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import type { Assignment, Nurse } from "@/lib/client-api";
import { saveScheduleChange } from "@/lib/schedule-actions";
import { LocalizedContent, useLocale } from "@/components/locale-provider";

const reasons = [
  ["FORCED_WORK", "Required to work"],
  ["SATURDAY_OFF", "Saturday off"],
  ["CONSECUTIVE_OFF", "Consecutive off-days"],
  ["FRIDAY_COVERAGE", "Friday coverage change"],
  ["CONSECUTIVE_FRIDAY", "Consecutive Friday assignment"],
  ["SICK_LEAVE", "Sick leave"],
  ["EMERGENCY_LEAVE", "Emergency leave"],
  ["OTHER", "Other"],
];

export function ScheduleEditor({
  assignment,
  nurse,
  date,
  year,
  month,
  onClose,
  onSaved,
}: {
  assignment?: Assignment;
  nurse?: Nurse;
  date: string;
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useLocale();
  const [type, setType] = useState<Assignment["type"]>(assignment?.type ?? "WORK");
  const [reason, setReason] = useState(assignment?.overrideReason ?? "OTHER");
  const [note, setNote] = useState(assignment?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (clearOverride = false) => {
    if (!assignment && !nurse) return;
    const nurseId = assignment?.nurseId ?? nurse!.id;
    setSaving(true);
    setError("");
    try {
      const result = await saveScheduleChange(year, month, {
        nurseId,
        date,
        type,
        overrideReason: reason,
        note,
        clearOverride,
      });
      if (result) {
        onSaved();
        onClose();
      }
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Could not save this change.");
    } finally {
      setSaving(false);
    }
  };

  const label = nurse?.name ?? assignment?.nurse?.name ?? "Nurse";
  return (
    <LocalizedContent><div className="dialog-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog-card schedule-dialog">
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="dialog-kicker"><CalendarClock size={14} /> SCHEDULE OVERRIDE</span>
        <h2>{label}</h2>
        <p>{new Intl.DateTimeFormat(language, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</p>
        <label className="field-label">Shift assignment<select value={type} onChange={(event) => setType(event.target.value as Assignment["type"])}><option value="WORK">Working · 10 hours</option><option value="OFF">Day off</option><option value="SICK">Sick leave</option><option value="EMERGENCY">Emergency leave</option></select></label>
        <label className="field-label">Reason for override<select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}</select></label>
        <label className="field-label">Note <span className="field-optional">OPTIONAL</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Add context for the team…" /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions dialog-actions-spread">
          {assignment?.isManual ? <button className="button button-text-danger" disabled={saving} onClick={() => void submit(true)}>Reset to automatic</button> : <span />}
          <div className="dialog-action-group"><button className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving} onClick={() => void submit()}>{saving ? "Rebalancing…" : "Save override"}</button></div>
        </div>
      </section>
    </div></LocalizedContent>
  );
}
