import { SeniorFridayRule } from "@/lib/scheduling/rules/senior-friday-rule";

export type ShiftType = "WORK" | "OFF" | "SICK" | "EMERGENCY";
export type OverrideReason =
  | "SATURDAY_OFF"
  | "CONSECUTIVE_OFF"
  | "FRIDAY_COVERAGE"
  | "CONSECUTIVE_FRIDAY"
  | "FORCED_WORK"
  | "SICK_LEAVE"
  | "EMERGENCY_LEAVE"
  | "OTHER";

export type Assignment = {
  nurseId: string;
  date: string;
  type: ShiftType;
  isManual: boolean;
  exceptionApproved?: boolean;
  seniorFridayOverrideApproved?: boolean;
  overrideReason?: OverrideReason | null;
  note?: string | null;
};

export type FridayHistory = { date: string; nurseIds: string[] };
export type RuleViolation = { date: string; nurseIds: string[]; rule: string };
export type NurseLevels = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: Date, count: number) => new Date(value.getTime() + count * DAY_MS);
const key = (nurseId: string, date: string) => `${date}|${nurseId}`;
function getNurseLevel(levels: NurseLevels, nurseId: string) {
  if ("get" in levels && typeof levels.get === "function") return levels.get(nurseId);
  return (levels as Readonly<Record<string, string>>)[nurseId];
}
const isWorking = (type: ShiftType) => type === "WORK";
const isLeave = (type: ShiftType) => type === "SICK" || type === "EMERGENCY";
const daysSinceSaturday = (date: Date) => (date.getUTCDay() + 1) % 7;

function monthWeekRange(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const start = addDays(first, -daysSinceSaturday(first));
  const end = addDays(last, 6 - daysSinceSaturday(last));
  return { start, end };
}

function dayDates(start: Date) {
  return Array.from({ length: 7 }, (_, index) => iso(addDays(start, index)));
}

function offDayOptions(
  nurseId: string,
  dates: string[],
  fixed: Map<string, Assignment>,
  requiredOffDays: number,
) {
  const fixedOff = dates.filter(
    (date) => fixed.get(key(nurseId, date))?.type === "OFF",
  );
  const missing = requiredOffDays - fixedOff.length;
  if (missing < 0) return [];
  const choices = dates.filter((date, index) => {
    if (fixed.has(key(nurseId, date))) return false;
    return index !== 0;
  });
  const options: string[][] = [];
  const select = (start: number, selected: string[]) => {
    if (selected.length === missing) {
      const allOff = [...fixedOff, ...selected].map((date) => dates.indexOf(date)).sort((a, b) => a - b);
      if (allOff.some((day, index) => index > 0 && day - allOff[index - 1] === 1)) {
        const fixedConsecutiveOverride =
          selected.length === 0 &&
          fixedOff.every((date) => fixed.get(key(nurseId, date))?.overrideReason === "CONSECUTIVE_OFF");
        if (!fixedConsecutiveOverride) return;
      }
      options.push([...selected]);
      return;
    }
    for (let index = start; index <= choices.length - (missing - selected.length); index += 1) {
      selected.push(choices[index]);
      select(index + 1, selected);
      selected.pop();
    }
  };
  select(0, []);
  return options;
}

function pickFridayWorkers(
  dates: string[],
  nurseIds: string[],
  levels: NurseLevels,
  fixed: Map<string, Assignment>,
  previousFriday: Set<string>,
  fridayCounts: Map<string, number>,
  allowConsecutiveFriday: boolean,
) {
  const friday = dates[6];
  const lockedWorking = nurseIds.filter((id) => {
    const assignment = fixed.get(key(id, friday));
    return assignment && isWorking(assignment.type);
  });
  const available = nurseIds.filter((id) => {
    const assignment = fixed.get(key(id, friday));
    return !assignment;
  });
  const needed = Math.max(0, 2 - lockedWorking.length);
  const combinations: string[][] = [];
  const select = (start: number, chosen: string[]) => {
    if (chosen.length === needed) {
      const workers = [...lockedWorking, ...chosen];
      if (workers.length === 2 || lockedWorking.length >= 2) combinations.push(workers);
      return;
    }
    for (let index = start; index <= available.length - (needed - chosen.length); index += 1) {
      chosen.push(available[index]);
      select(index + 1, chosen);
      chosen.pop();
    }
  };
  select(0, []);

  const seniorCount = (group: string[]) => group.filter((id) => getNurseLevel(levels, id) === "SENIOR").length;
  const seniorCompliant = combinations.filter((group) => seniorCount(group) <= 1);
  const valid = seniorCompliant.filter(
    (group) => allowConsecutiveFriday || !group.some((id) => previousFriday.has(id)),
  );
  const choices = valid.length ? valid : seniorCompliant.length ? seniorCompliant : combinations;
  const onlySeniorStaffAvailable =
    choices.length > 0 &&
    new Set([...lockedWorking, ...available]).size === 2 &&
    choices.some((group) => group.length === 2 && seniorCount(group) === 2);
  if (!seniorCompliant.length && onlySeniorStaffAvailable) {
    const selected = choices[0];
    selected.forEach((id) => {
      const current = fixed.get(key(id, friday));
      fixed.set(key(id, friday), {
        nurseId: id,
        date: friday,
        type: "WORK",
        isManual: current?.isManual ?? false,
        overrideReason: current?.overrideReason,
        note: current?.note,
        exceptionApproved: true,
      });
    });
    return selected;
  }
  choices.sort((left, right) => {
    const count = (group: string[]) => group.reduce((sum, id) => sum + (fridayCounts.get(id) ?? 0), 0);
    const last = (group: string[]) => group.reduce((sum, id) => sum + (previousFriday.has(id) ? 1 : 0), 0);
    return count(left) - count(right) ||
      last(left) - last(right) ||
      seniorCount(right) - seniorCount(left) ||
      left.join().localeCompare(right.join());
  });
  return choices[0] ?? lockedWorking;
}

export function generateSchedule(input: {
  year: number;
  month: number;
  nurseIds: string[];
  nurseLevels?: NurseLevels;
  overrides?: Assignment[];
  fridayHistory?: FridayHistory[];
}): Assignment[] {
  const nurseIds = [...new Set(input.nurseIds)].sort();
  const nurseLevels = input.nurseLevels ?? new Map<string, string>();
  if (nurseIds.length < 4) {
    throw new Error("At least four active nurses are needed to satisfy Friday coverage and rotation rules.");
  }
  const { start, end } = monthWeekRange(input.year, input.month);
  const overrides = input.overrides ?? [];
  const fixed = new Map(overrides.filter((row) => row.isManual).map((row) => [key(row.nurseId, row.date), row]));
  const output: Assignment[] = [];
  const history = [...(input.fridayHistory ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const fridayCounts = new Map<string, number>();
  history.forEach(({ nurseIds: ids }) => ids.forEach((id) => fridayCounts.set(id, (fridayCounts.get(id) ?? 0) + 1)));

  for (let weekStart = start; weekStart <= end; weekStart = addDays(weekStart, 7)) {
    const dates = dayDates(weekStart);
    const friday = dates[6];
    const priorFriday = [...history].reverse().find((row) => row.date < friday);
    const previousFriday = new Set(priorFriday?.nurseIds ?? []);
    const fridayWorkers = pickFridayWorkers(
      dates,
      nurseIds,
      nurseLevels,
      fixed,
      previousFriday,
      fridayCounts,
      false,
    );
    const workingFriday = new Set(fridayWorkers);
    const weekRows = new Map<string, Assignment>();

    for (const nurseId of nurseIds) {
      const fixedFriday = fixed.get(key(nurseId, friday));
      if (fixedFriday) {
        weekRows.set(key(nurseId, friday), fixed.get(key(nurseId, friday)) ?? fixedFriday);
      } else {
        weekRows.set(key(nurseId, friday), {
          nurseId,
          date: friday,
          type: workingFriday.has(nurseId) ? "WORK" : "OFF",
          isManual: false,
          exceptionApproved: fixed.get(key(nurseId, friday))?.exceptionApproved ?? false,
        });
      }

      for (const date of dates) {
        const locked = fixed.get(key(nurseId, date));
        if (locked) weekRows.set(key(nurseId, date), locked);
        else if (date === dates[0]) {
          weekRows.set(key(nurseId, date), { nurseId, date, type: "WORK", isManual: false });
        }
      }
    }

    const offCounts = new Map(dates.map((date) => [date, 0]));
    for (const assignment of weekRows.values()) {
      if (assignment.type === "OFF") offCounts.set(assignment.date, (offCounts.get(assignment.date) ?? 0) + 1);
    }
    const nurseOrder = [...nurseIds].sort((left, right) => {
      const leftOptions = offDayOptions(left, dates, weekRows, 2).length;
      const rightOptions = offDayOptions(right, dates, weekRows, 2).length;
      return leftOptions - rightOptions || left.localeCompare(right);
    });

    for (const nurseId of nurseOrder) {
      const options = offDayOptions(nurseId, dates, weekRows, 2);
      if (!options.length) {
        for (const date of dates) {
          if (!weekRows.has(key(nurseId, date))) {
            weekRows.set(key(nurseId, date), { nurseId, date, type: "WORK", isManual: false });
          }
        }
        continue;
      }
      options.sort((left, right) => {
        const score = (days: string[]) =>
          days.reduce((sum, date) => sum + (offCounts.get(date) ?? 0) * (offCounts.get(date) ?? 0), 0);
        return score(left) - score(right) || left.join().localeCompare(right.join());
      });
      const selected = options[0];
      for (const date of selected) {
        const assignment = { nurseId, date, type: "OFF" as const, isManual: false };
        weekRows.set(key(nurseId, date), assignment);
        offCounts.set(date, (offCounts.get(date) ?? 0) + 1);
      }
      for (const date of dates) {
        const assignmentKey = key(nurseId, date);
        if (weekRows.has(assignmentKey)) continue;
        weekRows.set(assignmentKey, { nurseId, date, type: "WORK", isManual: false });
      }
    }

    const rows = [...weekRows.values()];
    output.push(...rows);
    const assignedFriday = rows.filter((row) => row.date === friday && row.type === "WORK").map((row) => row.nurseId);
    history.push({ date: friday, nurseIds: assignedFriday });
    assignedFriday.forEach((id) => fridayCounts.set(id, (fridayCounts.get(id) ?? 0) + 1));
  }

  return output.sort((left, right) => left.date.localeCompare(right.date) || left.nurseId.localeCompare(right.nurseId));
}

export function validateSchedule(assignments: Assignment[], nurseLevels: NurseLevels = new Map()): RuleViolation[] {
  const byNurseAndDate = new Map(assignments.map((row) => [key(row.nurseId, row.date), row]));
  const nurseIds = [...new Set(assignments.map((row) => row.nurseId))];
  const dates = [...new Set(assignments.map((row) => row.date))].sort();
  const violations: RuleViolation[] = [];
  violations.push(...SeniorFridayRule(assignments, nurseLevels));

  for (const date of dates) {
    const weekday = asDate(date).getUTCDay();
    const rows = assignments.filter((row) => row.date === date);
    if (weekday === 5 && rows.filter((row) => row.type === "WORK").length !== 2) {
      violations.push({ date, nurseIds: rows.filter((row) => row.type === "WORK").map((row) => row.nurseId), rule: "Friday must have exactly two nurses on duty." });
    }
    if (weekday === 6 && rows.some((row) => row.type === "OFF" && !row.isManual)) {
      violations.push({ date, nurseIds: rows.filter((row) => row.type === "OFF").map((row) => row.nurseId), rule: "Saturday off requires a manual override." });
    }
  }

  for (const nurseId of nurseIds) {
    for (const date of dates) {
      const current = byNurseAndDate.get(key(nurseId, date));
      if (!current || current.type !== "OFF") continue;
      const nextDate = iso(addDays(asDate(date), 1));
      const next = byNurseAndDate.get(key(nurseId, nextDate));
      if (next?.type === "OFF" && !(current.isManual && next.isManual)) {
        violations.push({ date, nurseIds: [nurseId], rule: "A nurse has consecutive off-days." });
      }
    }
    const fridays = dates.filter((date) => asDate(date).getUTCDay() === 5);
    for (let index = 1; index < fridays.length; index += 1) {
      const previous = byNurseAndDate.get(key(nurseId, fridays[index - 1]));
      const current = byNurseAndDate.get(key(nurseId, fridays[index]));
      if (previous?.type === "WORK" && current?.type === "WORK") {
        violations.push({ date: fridays[index], nurseIds: [nurseId], rule: "A nurse is assigned on consecutive Fridays." });
      }
    }
    const weekStarts = new Set(
      dates.map((date) => {
        const day = asDate(date);
        day.setUTCDate(day.getUTCDate() - daysSinceSaturday(day));
        return iso(day);
      }),
    );
    for (const weekStart of weekStarts) {
      const start = asDate(weekStart);
      const week = Array.from({ length: 7 }, (_, index) => iso(addDays(start, index)));
      const weeklyRows = week.map((date) => byNurseAndDate.get(key(nurseId, date))).filter(Boolean) as Assignment[];
      const leaveDays = weeklyRows.filter((row) => row.type === "SICK" || row.type === "EMERGENCY").length;
      if (weeklyRows.length === 7 && weeklyRows.filter((row) => row.type === "WORK").length !== 5 - leaveDays) {
        violations.push({ date: weekStart, nurseIds: [nurseId], rule: "A nurse should work five days per week." });
      }
      if (weeklyRows.length === 7 && weeklyRows.filter((row) => row.type === "OFF").length !== 2) {
        violations.push({ date: weekStart, nurseIds: [nurseId], rule: "A nurse should have two off-days per week." });
      }
    }
  }

  return violations;
}

export function summarizeSchedule(assignments: Assignment[], nurseIds: string[]) {
  return nurseIds.map((nurseId) => {
    const rows = assignments.filter((row) => row.nurseId === nurseId);
    return {
      nurseId,
      workingDays: rows.filter((row) => row.type === "WORK").length,
      fridayAssignments: rows.filter((row) => row.type === "WORK" && asDate(row.date).getUTCDay() === 5).length,
      offDays: rows.filter((row) => row.type === "OFF").length,
      leaveDays: rows.filter((row) => isLeave(row.type)).length,
    };
  });
}
