import type { Assignment, NurseLevels } from "@/lib/scheduling/engine";

function levelOf(nurseId: string, levels: NurseLevels) {
  if ("get" in levels && typeof levels.get === "function") return levels.get(nurseId);
  return (levels as Readonly<Record<string, string>>)[nurseId];
}

export function SeniorFridayRule(assignments: Assignment[], levels: NurseLevels) {
  const fridays = new Map<string, Assignment[]>();
  assignments.forEach((assignment) => {
    if (new Date(`${assignment.date}T00:00:00.000Z`).getUTCDay() !== 5) return;
    fridays.set(assignment.date, [...(fridays.get(assignment.date) ?? []), assignment]);
  });

  return [...fridays].flatMap(([date, rows]) => {
    const working = rows.filter((row) => row.type === "WORK");
    const seniors = working.filter((row) => levelOf(row.nurseId, levels) === "SENIOR");
    if (seniors.length <= 1) return [];

    const regularsUnavailable = rows
      .filter((row) => levelOf(row.nurseId, levels) === "REGULAR")
      .every((row) => row.type === "SICK" || row.type === "EMERGENCY" || (row.type === "OFF" && row.isManual));
    const approvedOperationalException =
      working.length === 2 &&
      seniors.length === 2 &&
      working.every((row) => row.exceptionApproved) &&
      regularsUnavailable;
    const approvedManualOverride =
      seniors.every((row) => row.isManual && row.seniorFridayOverrideApproved);
    if (approvedOperationalException || approvedManualOverride) return [];

    return [{
      date,
      nurseIds: seniors.map((row) => row.nurseId),
      rule: "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.",
    }];
  });
}
