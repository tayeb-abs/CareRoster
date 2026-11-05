"use client";

import { SessionProvider as AuthSessionProvider, useSession as useAuthSession } from "next-auth/react";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "HEAD_NURSE";
};

export function useSession() {
  const { data, status, update } = useAuthSession();
  return {
    user: data?.user
      ? {
          id: data.user.id,
          name: data.user.name ?? data.user.email ?? "Clinic user",
          email: data.user.email ?? "",
          role: (data.user.role ?? "HEAD_NURSE") as UserProfile["role"],
        }
      : null,
    ready: status !== "loading",
    error: null as string | null,
    refresh: async () => { await update(); },
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <AuthSessionProvider refetchOnWindowFocus>{children}</AuthSessionProvider>;
}
