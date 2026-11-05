"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, HeartPulse, LockKeyhole } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { LocalizedContent, useLocale } from "@/components/locale-provider";

export default function LoginPage() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const { language, toggleLanguage } = useLocale();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        identifier,
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Username or password is incorrect.");
        return;
      }
      await refresh();
      router.replace("/dashboard");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LocalizedContent><main className="login-page">
      <div className="login-card">
        <button type="button" className="language-toggle login-language-toggle" onClick={toggleLanguage}>{language === "en" ? "العربية" : "English"}</button>
        <Link className="brand login-brand" href="/"><span className="brand-mark"><HeartPulse size={23} /></span><span className="brand-copy"><strong>Care<span>Roster</span></strong><small>MEDICAL CENTER</small></span></Link>
        <div className="login-intro"><span className="eyebrow">WELCOME BACK</span><h1>Good care starts with a good schedule.</h1><p>Sign in to manage your team and keep every shift covered.</p></div>
        <form className="login-form" onSubmit={submit}>
          <label>Username or email<input type="text" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="admin or you@clinic.local" required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary button-wide" disabled={loading}>{loading ? "Signing in…" : "Sign in"} {!loading && <ArrowRight size={17} />}</button>
        </form>
        <div className="login-note"><LockKeyhole size={15} /><span>Secure access for Admin and Head Nurse accounts</span></div>
      </div>
      <div className="login-aside"><div className="login-aside-glow" /><div className="aside-copy"><span className="eyebrow">CARE, IN HARMONY</span><h2>Every shift, thoughtfully covered.</h2><p>One clear view of your schedule, your team, and the care that matters.</p><div className="aside-stats"><div><strong>10<span>h</span></strong><small>Per shift</small></div><i /><div><strong>5<span>days</span></strong><small>Weekly rhythm</small></div><i /><div><strong>1</strong><small>Team, together</small></div></div></div><div className="aside-footer">CA ROSTER · NURSE SCHEDULING</div></div>
    </main></LocalizedContent>
  );
}
