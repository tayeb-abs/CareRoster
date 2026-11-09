"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Pencil, Plus, RotateCcw, Save, Star, ToggleLeft, ToggleRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { apiFetch, type ShiftTemplate } from "@/lib/client-api";
import { formatShiftTime } from "@/lib/shifts";
import { translateText } from "@/lib/i18n";

type ShiftForm = {
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  isActive: boolean;
  isDefault: boolean;
};

const emptyForm: ShiftForm = {
  name: "",
  startTime: "",
  endTime: "",
  color: "",
  isActive: true,
  isDefault: false,
};

export default function ShiftSettingsPage() {
  const { language } = useLocale();
  const { user } = useSession();
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [form, setForm] = useState<ShiftForm>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ shifts: ShiftTemplate[] }>("/api/shifts");
      setShifts(result.shifts);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translateText("Could not load shift templates.", language));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ shifts: ShiftTemplate[] }>("/api/shifts")
      .then(({ shifts: rows }) => {
        if (!active) return;
        setShifts(rows);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : translateText("Could not load shift templates.", language));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language]);

  const reset = () => {
    setEditingId("");
    setForm(emptyForm);
    setSuccess("");
  };

  const edit = (shift: ShiftTemplate) => {
    setEditingId(shift.id);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      color: shift.color ?? "",
      isActive: shift.isActive,
      isDefault: shift.isDefault,
    });
    setSuccess("");
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...form,
        color: form.color || null,
        isDefault: form.isActive && form.isDefault,
      };
      await apiFetch(editingId ? `/api/shifts/${editingId}` : "/api/shifts", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await load();
      reset();
      setSuccess(translateText("Shift template saved.", language));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translateText("Could not save this shift.", language));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (shift: ShiftTemplate) => {
    setError("");
    setSuccess("");
    try {
      await apiFetch(`/api/shifts/${shift.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !shift.isActive }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translateText("Could not update this shift.", language));
    }
  };

  if (user?.role !== "ADMIN") {
    return <AppShell><section className="panel shift-empty"><h2>{translateText("Administrator access required", language)}</h2></section></AppShell>;
  }

  return (
    <AppShell>
      {(error || success) && <div className={`notice ${error ? "notice-error" : "notice-success"}`}>{error || success}</div>}
      <div className="shift-settings-layout">
        <section className="panel shift-form-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">{translateText("SHIFT TEMPLATES", language)}</span><h2>{translateText(editingId ? "Edit shift" : "Create a shift", language)}</h2></div>
            <span className="soft-icon"><Clock3 size={17} /></span>
          </div>
          <p className="panel-intro">{translateText("Set every shift name and time yourself. Overnight shifts are supported.", language)}</p>
          <form className="shift-form" onSubmit={(event) => void save(event)}>
            <label className="field-label">{translateText("Shift name", language)}<input required maxLength={120} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder={translateText("e.g. Late Clinic Shift", language)} /></label>
            <div className="shift-time-fields">
              <label className="field-label">{translateText("Start time", language)}<input type="time" required value={form.startTime} onChange={(event) => setForm((value) => ({ ...value, startTime: event.target.value }))} /></label>
              <label className="field-label">{translateText("End time", language)}<input type="time" required value={form.endTime} onChange={(event) => setForm((value) => ({ ...value, endTime: event.target.value }))} /></label>
            </div>
            <label className="field-label">{translateText("Optional color", language)}<input type="color" value={form.color || "#176b9a"} onChange={(event) => setForm((value) => ({ ...value, color: event.target.value }))} /></label>
            <label className="shift-checkbox"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((value) => ({ ...value, isActive: event.target.checked, isDefault: event.target.checked && value.isDefault }))} />{translateText("Active shift", language)}</label>
            <label className="shift-checkbox"><input type="checkbox" checked={form.isDefault} disabled={!form.isActive} onChange={(event) => setForm((value) => ({ ...value, isDefault: event.target.checked }))} />{translateText("Use as default for schedule generation", language)}</label>
            <div className="dialog-action-group">
              {editingId && <button type="button" className="button button-outline" onClick={reset}><RotateCcw size={15} />{translateText("Cancel edit", language)}</button>}
              <button type="submit" className="button button-primary" disabled={saving}><Save size={15} />{saving ? translateText("Saving…", language) : translateText(editingId ? "Save changes" : "Create shift", language)}</button>
            </div>
          </form>
        </section>
        <section className="panel shift-list-panel">
          <div className="panel-heading"><div><span className="eyebrow">{translateText("AVAILABLE SHIFTS", language)}</span><h2>{translateText("Shift templates", language)}</h2></div><span className="shift-count">{shifts.length}</span></div>
          <p className="panel-intro">{translateText("Inactive templates remain in previous schedules but cannot be newly assigned.", language)}</p>
          {loading ? <div className="table-state">{translateText("Loading shifts…", language)}</div> : shifts.length ? (
            <div className="shift-template-list">
              {shifts.map((shift) => (
                <article className={`shift-template-card${shift.isActive ? "" : " shift-template-inactive"}`} key={shift.id}>
                  <span className="shift-color-mark" style={{ backgroundColor: shift.color ?? "#176b9a" }} />
                  <div className="shift-template-copy">
                    <strong>{shift.name}{shift.isDefault && <span className="shift-default-badge"><Star size={12} fill="currentColor" />{translateText("Default", language)}</span>}</strong>
                    <span>{formatShiftTime(shift.startTime, language)} → {formatShiftTime(shift.endTime, language)}</span>
                    <small>{new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(shift.totalHours)} {translateText("hours", language)} · {shift.isActive ? translateText("Active", language) : translateText("Inactive", language)}</small>
                  </div>
                  <div className="shift-card-actions">
                    <button className="icon-button" type="button" title={translateText("Edit shift", language)} onClick={() => edit(shift)}><Pencil size={15} /></button>
                    <button className="icon-button" type="button" title={translateText(shift.isActive ? "Deactivate shift" : "Activate shift", language)} onClick={() => void toggleActive(shift)}>{shift.isActive ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button>
                    {shift.isDefault && <Check size={16} className="shift-default-check" />}
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="shift-empty"><Plus size={20} /><span>{translateText("No shifts yet. Create your first administrator-defined shift.", language)}</span></div>}
        </section>
      </div>
    </AppShell>
  );
}
