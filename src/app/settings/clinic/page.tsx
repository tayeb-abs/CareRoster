"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import { Building2, CircleAlert, ImagePlus, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { apiFetch, type ClinicProfile } from "@/lib/client-api";

type ClinicForm = Omit<ClinicProfile, "id">;

const emptyForm: ClinicForm = {
  clinicNameEn: "Evercare Medical Center",
  clinicNameAr: "مركز إيفركير الطبي",
  logoDataUrl: null,
  address: "",
  phoneNumber: "",
  departmentName: "",
  headNurseName: "",
};

function readLogo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the logo file."));
    reader.onerror = () => reject(new Error("Could not read the logo file."));
    reader.readAsDataURL(file);
  });
}

export default function ClinicSettingsPage() {
  const { user, ready } = useSession();
  const { language } = useLocale();
  const [form, setForm] = useState<ClinicForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!ready || !user || user.role !== "ADMIN") return;
    apiFetch<{ profile: ClinicProfile }>("/api/clinic-profile")
      .then(({ profile }) => setForm({
        clinicNameEn: profile.clinicNameEn,
        clinicNameAr: profile.clinicNameAr,
        logoDataUrl: profile.logoDataUrl,
        address: profile.address ?? "",
        phoneNumber: profile.phoneNumber ?? "",
        departmentName: profile.departmentName ?? "",
        headNurseName: profile.headNurseName ?? "",
      }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load clinic details."))
      .finally(() => setLoading(false));
  }, [ready, user]);

  const chooseLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 1_000_000) {
      setError(language === "ar" ? "اختر صورة PNG أو JPEG بحجم أقل من 1 ميغابايت." : "Choose a PNG or JPEG image smaller than 1 MB.");
      return;
    }
    try {
      const logoDataUrl = await readLogo(file);
      setForm((current) => ({ ...current, logoDataUrl }));
      setError("");
      setSuccess("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read the logo file.");
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { profile } = await apiFetch<{ profile: ClinicProfile }>("/api/clinic-profile", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setForm({
        clinicNameEn: profile.clinicNameEn,
        clinicNameAr: profile.clinicNameAr,
        logoDataUrl: profile.logoDataUrl,
        address: profile.address ?? "",
        phoneNumber: profile.phoneNumber ?? "",
        departmentName: profile.departmentName ?? "",
        headNurseName: profile.headNurseName ?? "",
      });
      setSuccess(language === "ar" ? "تم حفظ بيانات المركز." : "Clinic profile saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save clinic details.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <AppShell><div className="table-state">{language === "ar" ? "جارٍ التحميل…" : "Loading…"}</div></AppShell>;
  if (user?.role !== "ADMIN") return <AppShell><div className="notice notice-error"><CircleAlert size={17} />{language === "ar" ? "هذه الصفحة متاحة للمسؤول فقط." : "Only administrators can manage clinic settings."}</div></AppShell>;

  return (
    <AppShell>
      <section className="panel clinic-settings-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">{language === "ar" ? "هوية المركز" : "CLINIC IDENTITY"}</span><h2>{language === "ar" ? "بيانات المركز" : "Clinic profile"}</h2></div>
          <span className="soft-icon"><Building2 size={18} /></span>
        </div>
        <p className="panel-intro">{language === "ar" ? "تظهر هذه البيانات تلقائيًا في التقارير والجداول المطبوعة." : "These details are automatically included in reports and printable schedules."}</p>
        {loading ? <div className="table-state">{language === "ar" ? "جارٍ تحميل الإعدادات…" : "Loading clinic settings…"}</div> : <form className="clinic-profile-form" onSubmit={save}>
          <div className="clinic-logo-field">
            <div className="clinic-logo-preview">{form.logoDataUrl ? <Image src={form.logoDataUrl} alt={language === "ar" ? "شعار المركز" : "Clinic logo"} width={62} height={54} unoptimized /> : <Building2 size={25} />}</div>
            <div><strong>{language === "ar" ? "شعار المركز" : "Clinic logo"}</strong><p>{language === "ar" ? "صورة PNG أو JPEG، بحد أقصى 1 ميغابايت." : "PNG or JPEG image, up to 1 MB."}</p></div>
            <label className="button button-outline clinic-logo-picker"><ImagePlus size={15} />{language === "ar" ? "اختيار صورة" : "Choose image"}<input type="file" accept="image/png,image/jpeg" onChange={(event) => void chooseLogo(event)} /></label>
            {form.logoDataUrl && <button className="button button-quiet" type="button" aria-label={language === "ar" ? "إزالة الشعار" : "Remove logo"} onClick={() => setForm((current) => ({ ...current, logoDataUrl: null }))}><Trash2 size={15} /></button>}
          </div>
          <div className="clinic-form-grid">
            <label className="field-label">{language === "ar" ? "اسم المركز (بالإنجليزية)" : "Clinic name (English)"}<input value={form.clinicNameEn} onChange={(event) => setForm({ ...form, clinicNameEn: event.target.value })} maxLength={160} required /></label>
            <label className="field-label" dir="rtl">{language === "ar" ? "اسم المركز (بالعربية)" : "Clinic name (Arabic)"}<input value={form.clinicNameAr} onChange={(event) => setForm({ ...form, clinicNameAr: event.target.value })} maxLength={160} required /></label>
            <label className="field-label">{language === "ar" ? "العنوان" : "Address"}<input value={form.address ?? ""} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={300} /></label>
            <label className="field-label">{language === "ar" ? "رقم الهاتف" : "Phone number"}<input value={form.phoneNumber ?? ""} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} maxLength={40} /></label>
            <label className="field-label">{language === "ar" ? "اسم القسم" : "Department name"}<input value={form.departmentName ?? ""} onChange={(event) => setForm({ ...form, departmentName: event.target.value })} maxLength={120} /></label>
            <label className="field-label">{language === "ar" ? "اسم الممرضة المسؤولة" : "Head Nurse name"}<input value={form.headNurseName ?? ""} onChange={(event) => setForm({ ...form, headNurseName: event.target.value })} maxLength={120} /></label>
          </div>
          {error && <div className="notice notice-error"><CircleAlert size={16} />{error}</div>}
          {success && <div className="form-success" role="status">{success}</div>}
          <div className="clinic-form-actions"><button className="button button-primary" disabled={saving}><Save size={15} />{saving ? (language === "ar" ? "جارٍ الحفظ…" : "Saving…") : (language === "ar" ? "حفظ بيانات المركز" : "Save clinic profile")}</button></div>
        </form>}
      </section>
    </AppShell>
  );
}
