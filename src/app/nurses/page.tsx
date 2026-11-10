"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LocalizedContent } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { apiFetch, initials, type Nurse, type ShiftTemplate } from "@/lib/client-api";
import { formatShiftTime } from "@/lib/shifts";
import { useLocale } from "@/components/locale-provider";
import { translateText } from "@/lib/i18n";

type NurseFormValue = { name: string; email: string; title: string; level: Nurse["level"]; color: string; defaultShiftId: string };
const emptyForm: NurseFormValue = { name: "", email: "", title: "Registered Nurse", level: "REGULAR", color: "#2c9c84", defaultShiftId: "" };
const colors = ["#2c9c84", "#6584dc", "#ca8d54", "#bc6d81", "#7d71ba", "#4b8da4"];

function NurseDialog({
  nurse,
  onClose,
  onSaved,
}: {
  nurse: Nurse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useLocale();
  const [form, setForm] = useState<NurseFormValue>(
    nurse ? { name: nurse.name, email: nurse.email ?? "", title: nurse.title, level: nurse.level, color: nurse.color, defaultShiftId: nurse.defaultShiftId ?? "" } : emptyForm,
  );
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ shifts: ShiftTemplate[] }>("/api/shifts")
      .then(({ shifts: rows }) => {
        const active = rows.filter((shift) => shift.isActive);
        setShifts(active);
        if (!nurse?.defaultShiftId || !active.some((shift) => shift.id === nurse.defaultShiftId)) {
          setForm((current) => ({
            ...current,
            defaultShiftId: active.find((shift) => shift.isDefault)?.id ?? active[0]?.id ?? "",
          }));
        }
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load active shifts."));
  }, [nurse]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(nurse ? `/api/nurses/${nurse.id}` : "/api/nurses", {
        method: nurse ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, email: form.email || "", defaultShiftId: form.defaultShiftId || null }),
      });
      onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this nurse.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <LocalizedContent><div className="dialog-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="dialog-card" onSubmit={submit}>
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="dialog-kicker">{nurse ? "TEAM PROFILE" : "NEW TEAM MEMBER"}</span>
        <h2>{nurse ? "Edit nurse profile" : "Add a nurse"}</h2>
        <p>Keep your team details up to date for clear, balanced schedules.</p>
        <label className="field-label">Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Maya Bennett" required minLength={2} maxLength={120} /></label>
        <label className="field-label">Work email <span className="field-optional">OPTIONAL</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="maya@medicalcenter.com" /></label>
        <label className="field-label">Role / title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={80} required /></label>
        <label className="field-label">Nurse Level<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as Nurse["level"] })}><option value="SENIOR">Senior Nurse</option><option value="REGULAR">Regular Nurse</option></select></label>
        <label className="field-label">{translateText("Default shift", language)}<select value={form.defaultShiftId} onChange={(event) => setForm({ ...form, defaultShiftId: event.target.value })} required={shifts.length > 0} disabled={!shifts.length}><option value="">{translateText("Select a default shift", language)}</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {formatShiftTime(shift.startTime, language)}–{formatShiftTime(shift.endTime, language)}</option>)}</select></label>
        <div className="field-label">Profile color<div className="color-options">{colors.map((color) => <button key={color} type="button" aria-label={`Choose ${color}`} className={`color-option ${form.color === color ? "color-selected" : ""}`} style={{ backgroundColor: color }} onClick={() => setForm({ ...form, color })}>{form.color === color && <Check size={14} />}</button>)}</div></div>
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : nurse ? "Save changes" : "Add nurse"}</button></div>
      </form>
    </div></LocalizedContent>
  );
}

function AccountForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ ...form, role: "HEAD_NURSE" }),
      });
      setMessage(`Head Nurse account created for ${form.email}.`);
      setForm({ name: "", email: "", password: "" });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <LocalizedContent><article className="panel account-panel">
      <div className="panel-heading"><div><span className="eyebrow">ADMIN ACCESS</span><h2>Invite a Head Nurse</h2></div><span className="soft-icon"><ShieldCheck size={17} /></span></div>
      <p className="panel-intro">Create a secure login for a scheduling lead. Accounts are stored in PostgreSQL.</p>
      <form className="account-form" onSubmit={submit}>
        <label className="field-label">Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
        <label className="field-label">Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
        <label className="field-label">Temporary password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} required placeholder="At least 12 characters" /></label>
        {error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}
        <button className="button button-outline" disabled={saving}><UserRoundPlus size={16} />{saving ? "Creating…" : "Create Head Nurse account"}</button>
      </form>
    </article></LocalizedContent>
  );
}

export default function NursesPage() {
  const { user, ready } = useSession();
  const { language } = useLocale();
  const userId = user?.id;
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Nurse | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);

  const loadNurses = useCallback(async () => {
    try {
      const result = await apiFetch<{ nurses: Nurse[] }>("/api/nurses");
      setNurses(result.nurses);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load nurses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    let active = true;
    apiFetch<{ nurses: Nurse[] }>("/api/nurses")
      .then((result) => { if (active) setNurses(result.nurses); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load nurses."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId]);

  const updateNurse = async (nurse: Nurse, patch: Partial<Nurse>) => {
    try {
      await apiFetch(`/api/nurses/${nurse.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await loadNurses();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this nurse.");
    }
  };

  const deleteNurse = async (nurse: Nurse) => {
    if (!window.confirm(`Remove ${nurse.name} from the active team? Historical schedule records will be retained.`)) return;
    try {
      await apiFetch(`/api/nurses/${nurse.id}`, { method: "DELETE" });
      await loadNurses();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this nurse.");
    }
  };

  const moveNurse = async (nurse: Nurse, offset: -1 | 1) => {
    const currentIndex = nurses.findIndex((entry) => entry.id === nurse.id);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= nurses.length || savingOrder) return;
    const reordered = [...nurses];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    setSavingOrder(true);
    try {
      const result = await apiFetch<{ nurses: Nurse[] }>("/api/nurses/reorder", {
        method: "PUT",
        body: JSON.stringify({ nurseIds: reordered.map(({ id }) => id) }),
      });
      setNurses(result.nurses);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the team order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const visible = nurses.filter((nurse) => `${nurse.name} ${nurse.email ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const activeCount = nurses.filter((nurse) => nurse.isActive).length;

  return (
    <AppShell>
      <section className="team-summary">
        <div className="summary-icon"><UsersRound size={20} /></div>
        <div><strong>{activeCount} active nurses</strong><span>Your scheduling team at a glance</span></div>
        <div className="summary-count"><strong>{nurses.length}</strong><span>team profiles</span></div>
      </section>
      <section className="panel nurse-panel">
        <div className="list-toolbar">
          <div><span className="eyebrow">CARE TEAM</span><h2>All nurses <span className="count-badge">{nurses.length}</span></h2></div>
          <div className="toolbar-actions"><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nurses…" /></label><button className="button button-primary" onClick={() => setDialog(null)}><Plus size={16} />Add nurse</button></div>
        </div>
        {error && <div className="notice notice-error"><CircleAlert size={17} />{error}</div>}
        <div className="nurse-list">
          <div className="nurse-list-head"><span>TEAM MEMBER</span><span>ROLE</span><span>NURSE LEVEL</span><span>CONTACT</span><span>STATUS</span><span>ACTIONS</span></div>
          {loading && <div className="table-state">Loading your care team…</div>}
          {!loading && visible.map((nurse) => {
            const nurseIndex = nurses.findIndex((entry) => entry.id === nurse.id);
            return <div className={`nurse-list-row ${!nurse.isActive ? "nurse-inactive" : ""}`} key={nurse.id}>
            <div className="nurse-identity"><span className="avatar" style={{ backgroundColor: nurse.color }}>{initials(nurse.name)}</span><span><strong>{nurse.name}</strong><small>{nurse.isActive ? "Available for scheduling" : "Not assigned to new schedules"}</small><small>{translateText("Default shift", language)}: {nurse.defaultShift ? `${nurse.defaultShift.name} · ${formatShiftTime(nurse.defaultShift.startTime, language)}–${formatShiftTime(nurse.defaultShift.endTime, language)}` : translateText("Not configured", language)}</small></span></div>
            <span className="nurse-role">{nurse.title}</span><span className={`nurse-level-badge ${nurse.level === "SENIOR" ? "level-senior" : "level-regular"}`}>{nurse.level === "SENIOR" ? "⭐ Senior Nurse" : "Regular Nurse"}</span><span className="nurse-email">{nurse.email || <span className="muted">No email added</span>}</span>
            <span><span className={`status-pill ${nurse.isActive ? "status-active" : "status-inactive"}`}><i />{nurse.isActive ? "Active" : "Inactive"}</span></span>
            <div className="nurse-actions">
              <button type="button" title={`Move ${nurse.name} up`} aria-label={`Move ${nurse.name} up`} disabled={savingOrder || query.length > 0 || nurseIndex === 0} onClick={() => void moveNurse(nurse, -1)}><ArrowUp size={15} /></button>
              <button type="button" title={`Move ${nurse.name} down`} aria-label={`Move ${nurse.name} down`} disabled={savingOrder || query.length > 0 || nurseIndex === nurses.length - 1} onClick={() => void moveNurse(nurse, 1)}><ArrowDown size={15} /></button>
              <button title="Edit nurse" onClick={() => setDialog(nurse)}><Pencil size={15} /></button>
              <button title={nurse.isActive ? "Deactivate nurse" : "Activate nurse"} onClick={() => void updateNurse(nurse, { isActive: !nurse.isActive })}>{nurse.isActive ? <MoreHorizontal size={17} /> : <Check size={16} />}</button>
              <button title="Remove nurse" className="action-danger" onClick={() => void deleteNurse(nurse)}><Trash2 size={15} /></button>
            </div>
          </div>;
          })}
          {!loading && visible.length === 0 && <div className="table-state">No nurses match this search.</div>}
        </div>
        <div className="list-footnote"><span><i className="tiny-dot" /> Active nurses are included in new schedules</span><span>Move nurses up or down to set the order used in schedules and exports.</span></div>
      </section>
      {user?.role === "ADMIN" && <AccountForm onCreated={() => {}} />}
      {dialog !== undefined && <NurseDialog nurse={dialog} onClose={() => setDialog(undefined)} onSaved={() => void loadNurses()} />}
    </AppShell>
  );
}
