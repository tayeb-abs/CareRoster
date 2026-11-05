"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings2,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { apiFetch, initials, type ClinicProfile } from "@/lib/client-api";
import { useSession } from "@/components/session-provider";
import { LocalizedContent, useLocale } from "@/components/locale-provider";
import { translateText } from "@/lib/i18n";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/nurses", label: "Nurses", icon: UsersRound },
  { href: "/schedule", label: "Weekly schedule", icon: CalendarDays },
  { href: "/generator", label: "Schedule generator", icon: Settings2 },
  { href: "/exceptions", label: "Schedule exceptions", icon: ClipboardList },
  { href: "/reports", label: "Reports & statistics", icon: ChartNoAxesCombined },
  { href: "/settings/clinic", label: "Clinic profile", icon: Building2 },
];

const titleByPath: Record<string, { heading: string; caption: string }> = {
  "/dashboard": { heading: "Dashboard", caption: "Here’s what’s happening at your medical center." },
  "/nurses": { heading: "Nurses", caption: "Manage your team and their availability." },
  "/schedule": { heading: "Weekly schedule", caption: "View and adjust your team’s shifts, week by week." },
  "/generator": { heading: "Schedule generator", caption: "Build a balanced schedule in seconds." },
  "/exceptions": { heading: "Schedule exceptions", caption: "Record leave and one-off schedule changes." },
  "/reports": { heading: "Reports & statistics", caption: "Understand workload and fairness across your team." },
  "/settings/clinic": { heading: "Clinic profile", caption: "Manage the clinic identity used in official reports and exports." },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, error } = useSession();
  const { language, toggleLanguage } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [clinicError, setClinicError] = useState("");
  const page = titleByPath[pathname] ?? titleByPath["/dashboard"];

  useEffect(() => {
    if (!user) return;
    apiFetch<{ profile: ClinicProfile }>("/api/clinic-profile")
      .then(({ profile }) => setClinic(profile))
      .catch((reason: unknown) => {
        console.error("[clinic] Load profile", reason);
        setClinicError(reason instanceof Error ? reason.message : "Could not load clinic profile.");
      });
  }, [user]);

  useEffect(() => {
    if (pathname !== "/login" && ready && !user) {
      router.replace("/login");
    }
  }, [pathname, ready, router, user]);

  if (pathname === "/login") return <>{children}</>;
  if (!ready || !user) {
    return (
      <main className="screen-state">
        <span className="state-spinner" />
        <p>{translateText(ready ? "Redirecting to sign in…" : "Loading your workspace…", language)}</p>
        {error && <span className="muted">{error}</span>}
      </main>
    );
  }

  return (
    <div className="app-frame">
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <Link className="brand" href="/dashboard" onClick={() => setMobileOpen(false)}>
          <span className="brand-mark"><HeartPulse size={22} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>Care<span>Roster</span></strong><small>MEDICAL CENTER</small></span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-icon"><Activity size={17} /></span>
          <span className="workspace-copy"><strong>{clinic ? (language === "ar" ? clinic.clinicNameAr : clinic.clinicNameEn) : translateText("Medical center", language)}</strong><small>{translateText("Medical center", language)}</small></span>
          <ChevronDown size={15} className="workspace-chevron" />
        </div>
        <p className="nav-label">{translateText("WORKSPACE", language)}</p>
        <nav className="side-nav">
          {navigation.filter(({ href }) => href !== "/settings/clinic" || user.role === "ADMIN").map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`nav-link ${pathname === href ? "nav-link-active" : ""}`}
            >
              <Icon size={18} strokeWidth={1.8} /><span>{translateText(label, language)}</span>
              {href === "/exceptions" && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon"><Activity size={15} /></span>
            <strong>{translateText("Team first, always.", language)}</strong>
            <p>{translateText("Balanced schedules make better care.", language)}</p>
          </div>
          <button className="profile-button" onClick={() => void signOut({ redirectTo: "/login" })}>
            <span className="avatar avatar-sidebar">{initials(user.name)}</span>
            <span className="profile-copy"><strong>{user.name}</strong><small>{translateText(user.role === "ADMIN" ? "Administrator" : "Head nurse", language)}</small></span>
            <LogOut size={15} className="profile-signout" />
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label={translateText("Open menu", language)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>{translateText("Workspace", language)}</span><span className="crumb-slash">/</span><strong>{translateText(page.heading, language)}</strong></div>
          <div className="topbar-actions">
            <button type="button" className="language-toggle" onClick={toggleLanguage} aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}>{language === "en" ? "العربية" : "English"}</button>
            <span className="today-label">{translateText("Care team workspace", language)}</span>
            <span className="avatar avatar-top">{initials(user.name)}</span>
          </div>
        </header>
        <main className="page-content">
          <div className="page-heading-row">
            <div><h1>{translateText(page.heading, language)}</h1><p>{translateText(page.caption, language)}</p></div>
            <Link className="button button-primary quick-action" href="/generator"><Plus size={16} /> {translateText("Generate schedule", language)}</Link>
          </div>
          {clinicError && <p className="notice notice-error">{clinicError}</p>}
          <LocalizedContent>{children}</LocalizedContent>
        </main>
      </div>
      {mobileOpen && <button className="mobile-close" aria-label={translateText("Close menu", language)} onClick={() => setMobileOpen(false)}><X size={20} /></button>}
    </div>
  );
}
