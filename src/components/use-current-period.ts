"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client-api";

export function useCurrentPeriod() {
  const { user, ready } = useSession();
  const userId = user?.id;
  const [month, setMonth] = useState<Date | null>(null);
  const [today, setToday] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !userId) return;
    let active = true;
    apiFetch<{ year: number; month: number; today: string }>("/api/period")
      .then((period) => {
        if (!active) return;
        setMonth(new Date(Date.UTC(period.year, period.month - 1, 1)));
        setToday(period.today);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load the current month.");
      });
    return () => { active = false; };
  }, [ready, userId]);

  return { month, setMonth, today, error };
}
