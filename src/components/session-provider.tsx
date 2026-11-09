"use client";

import { useMemo } from "react";
import { SessionProvider as AuthSessionProvider, useSession as useAuthSession } from "next-auth/react";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "HEAD_NURSE";
};

export function useSession() {
  const { data, status, update } = useAuthSession();
  const id = data?.user?.id;
  const email = data?.user?.email ?? "";
  const name = data?.user?.name ?? data?.user?.email ?? "Clinic user";
  const role = (data?.user?.role ?? "HEAD_NURSE") as UserProfile["role"];
  const user = useMemo(
    () => id ? { id, name, email, role } : null,
    [email, id, name, role],
  );

  return {
    user,
    ready: status !== "loading",
    error: null as string | null,
    refresh: async () => { await update(); },
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <AuthSessionProvider refetchOnWindowFocus>{children}</AuthSessionProvider>;
}
