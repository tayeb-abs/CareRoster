import { apiFetch } from "@/lib/client-api";

export type ScheduleChange = {
  nurseId: string;
  date: string;
  type: "WORK" | "OFF" | "SICK" | "EMERGENCY";
  overrideReason: string;
  note?: string;
  moveFrom?: string;
  clearOverride?: boolean;
  confirmed?: boolean;
};

type ViolationResponse = {
  requiresConfirmation?: boolean;
  violations?: { date: string; nurseIds: string[]; rule: string }[];
};

export async function saveScheduleChange(
  year: number,
  month: number,
  change: ScheduleChange,
) {
  const url = `/api/schedules/${year}/${month}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  });
  if (response.status !== 409) {
    const payload = (await response.json()) as { error?: string; schedule: unknown; violations: unknown[] };
    if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
    return payload;
  }
  const warning = (await response.json()) as ViolationResponse;
  const details = warning.violations?.map((row) => `• ${row.date}: ${row.rule}`).join("\n");
  const seniorRule = warning.violations?.some((row) =>
    row.rule === "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.",
  );
  const arabic = document.documentElement.lang === "ar";
  const confirmed = window.confirm(
    seniorRule
      ? `${arabic
          ? "تم تعيين ممرضتين أولى في يوم الجمعة، وهذا يخالف سياسة الجدولة المعتمدة."
          : "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy."}\n\n${arabic ? "إلغاء للرفض أو متابعة على أي حال للتطبيق." : "Cancel to reject or Continue Anyway to apply."}\n\n${details ?? ""}`
      : `This change conflicts with scheduling rules:\n\n${details ?? "Rule violation"}\n\nApply the override and rebalance the remaining schedule?`,
  );
  if (!confirmed) return null;
  return apiFetch<{ schedule: unknown; violations: unknown[] }>(url, {
    method: "PATCH",
    body: JSON.stringify({ ...change, confirmed: true }),
  });
}
