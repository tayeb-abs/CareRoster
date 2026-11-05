import assert from "node:assert/strict";
import test from "node:test";
import { generateSchedule, validateSchedule } from "./engine";
import { SeniorFridayRule } from "./rules/senior-friday-rule";

test("generates five workdays and two non-consecutive off-days per week", () => {
  const assignments = generateSchedule({ year: 2026, month: 11, nurseIds: ["a", "b", "c", "d"] });
  const weeks = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const date = new Date(`${assignment.date}T00:00:00Z`);
    const start = new Date(date);
    start.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
    const key = start.toISOString().slice(0, 10);
    weeks.set(key, [...(weeks.get(key) ?? []), assignment]);
  }
  for (const rows of weeks.values()) {
    assert.equal(new Date(`${rows[0].date}T00:00:00Z`).getUTCDay(), 6, "weeks start on Saturday");
    for (const nurseId of ["a", "b", "c", "d"]) {
      const nurseRows = rows.filter((row) => row.nurseId === nurseId);
      assert.equal(nurseRows.filter((row) => row.type === "WORK").length, 5);
      assert.equal(nurseRows.filter((row) => row.type === "OFF").length, 2);
      const offDays = nurseRows.filter((row) => row.type === "OFF").map((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay());
      assert.ok(!offDays.some((day) => offDays.includes((day + 1) % 7)));
      assert.equal(nurseRows.find((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay() === 6)?.type, "WORK");
    }
    const friday = rows.filter((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay() === 5 && row.type === "WORK");
    assert.equal(friday.length, 2);
  }
  assert.deepEqual(validateSchedule(assignments), []);
});

test("preserves manual overrides while rebalancing generated assignments", () => {
  const override = {
    nurseId: "a",
    date: "2026-11-07",
    type: "OFF" as const,
    isManual: true,
    overrideReason: "SATURDAY_OFF" as const,
  };
  const assignments = generateSchedule({
    year: 2026,
    month: 11,
    nurseIds: ["a", "b", "c", "d"],
    overrides: [override],
  });
  assert.deepEqual(assignments.find((row) => row.date === override.date && row.nurseId === "a"), override);
});

test("rotates Friday assignments and avoids consecutive Fridays", () => {
  const assignments = generateSchedule({ year: 2026, month: 11, nurseIds: ["a", "b", "c", "d", "e"] });
  const fridays = [...new Set(assignments.map((row) => row.date))]
    .filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 5)
    .sort();
  for (let index = 1; index < fridays.length; index += 1) {
    const previous = assignments.filter((row) => row.date === fridays[index - 1] && row.type === "WORK");
    const current = assignments.filter((row) => row.date === fridays[index] && row.type === "WORK");
    assert.ok(!previous.some((row) => current.some((next) => next.nurseId === row.nurseId)));
  }
});

test("satisfies weekly rules across months and team sizes", () => {
  for (let month = 1; month <= 12; month += 1) {
    for (let count = 4; count <= 6; count += 1) {
      const nurseIds = Array.from({ length: count }, (_, index) => `nurse-${index}`);
      const assignments = generateSchedule({ year: 2027, month, nurseIds });
      assert.deepEqual(validateSchedule(assignments), [], `2027-${month}, ${count} nurses`);
      const fridays = [...new Set(assignments.map((row) => row.date))]
        .filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 5);
      const perNurseFridayCount = nurseIds.map((id) =>
        fridays.filter((date) => assignments.some((row) => row.date === date && row.nurseId === id && row.type === "WORK")).length,
      );
      assert.ok(Math.max(...perNurseFridayCount) - Math.min(...perNurseFridayCount) <= 1);
    }
  }
});

test("manual Saturday and consecutive-off overrides are preserved", () => {
  const overrides = [
    { nurseId: "a", date: "2026-11-07", type: "OFF" as const, isManual: true, overrideReason: "SATURDAY_OFF" as const },
    { nurseId: "b", date: "2026-11-02", type: "OFF" as const, isManual: true, overrideReason: "CONSECUTIVE_OFF" as const },
    { nurseId: "b", date: "2026-11-03", type: "OFF" as const, isManual: true, overrideReason: "CONSECUTIVE_OFF" as const },
  ];
  const assignments = generateSchedule({ year: 2026, month: 11, nurseIds: ["a", "b", "c", "d"], overrides });
  for (const override of overrides) {
    assert.deepEqual(
      assignments.find((row) => row.nurseId === override.nurseId && row.date === override.date),
      override,
    );
  }
});

test("never automatically assigns two Senior nurses together when a Regular nurse is available", () => {
  const nurseIds = ["senior-a", "senior-b", "regular-a", "regular-b"];
  const levels = new Map([
    ["senior-a", "SENIOR"],
    ["senior-b", "SENIOR"],
    ["regular-a", "REGULAR"],
    ["regular-b", "REGULAR"],
  ]);
  const assignments = generateSchedule({ year: 2026, month: 11, nurseIds, nurseLevels: levels });
  const fridays = [...new Set(assignments.map((row) => row.date))]
    .filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 5);
  for (const date of fridays) {
    const working = assignments.filter((row) => row.date === date && row.type === "WORK");
    assert.equal(working.length, 2);
    assert.ok(working.filter((row) => levels.get(row.nurseId) === "SENIOR").length <= 1);
    assert.ok(working.every((row) => !row.exceptionApproved));
  }
  assert.deepEqual(validateSchedule(assignments, levels), []);
});

test("maintains the Senior Friday restriction across all month boundaries and supported team sizes", () => {
  for (let month = 1; month <= 12; month += 1) {
    for (let count = 4; count <= 6; count += 1) {
      const nurseIds = Array.from({ length: count }, (_, index) => `level-${index}`);
      const levels = new Map(nurseIds.map((id, index) => [id, index < 2 ? "SENIOR" : "REGULAR"]));
      const assignments = generateSchedule({ year: 2028, month, nurseIds, nurseLevels: levels });
      const fridays = [...new Set(assignments.map((row) => row.date))]
        .filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 5);
      for (const date of fridays) {
        const working = assignments.filter((row) => row.date === date && row.type === "WORK");
        assert.equal(working.length, 2, `Friday coverage ${date}`);
        assert.ok(working.filter((row) => levels.get(row.nurseId) === "SENIOR").length <= 1, `senior restriction ${date}`);
        assert.ok(working.every((row) => !row.exceptionApproved), `no exception needed ${date}`);
      }
    }
  }
});

test("marks the unavoidable all-Senior Friday as an approved operational exception", () => {
  const levels = new Map([
    ["senior-a", "SENIOR"],
    ["senior-b", "SENIOR"],
    ["regular-a", "REGULAR"],
    ["regular-b", "REGULAR"],
  ]);
  const assignments = generateSchedule({
    year: 2026,
    month: 11,
    nurseIds: [...levels.keys()],
    nurseLevels: levels,
    overrides: ["regular-a", "regular-b"].map((nurseId) => ({
      nurseId,
      date: "2026-11-06",
      type: "OFF" as const,
      isManual: true,
    })),
  });
  const friday = assignments.filter((row) => row.date === "2026-11-06" && row.type === "WORK");
  assert.deepEqual(friday.map((row) => row.nurseId).sort(), ["senior-a", "senior-b"]);
  assert.ok(friday.every((row) => row.exceptionApproved));
  assert.equal(validateSchedule(assignments, levels).some((row) => row.rule.includes("Two Senior Nurses")), false);
});

test("flags manually locked Senior-Senior Friday when a Regular nurse remains available", () => {
  const levels = new Map([
    ["senior-a", "SENIOR"],
    ["senior-b", "SENIOR"],
    ["regular-a", "REGULAR"],
    ["regular-b", "REGULAR"],
  ]);
  const assignments = generateSchedule({
    year: 2026,
    month: 11,
    nurseIds: [...levels.keys()],
    nurseLevels: levels,
    overrides: ["senior-a", "senior-b"].map((nurseId) => ({
      nurseId,
      date: "2026-11-06",
      type: "WORK" as const,
      isManual: true,
    })),
  });
  assert.equal(validateSchedule(assignments, levels).filter((row) => row.date === "2026-11-06").length, 1);
  assert.equal(
    validateSchedule(assignments, levels).find((row) => row.date === "2026-11-06")?.rule,
    "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.",
  );
});

test("SeniorFridayRule accepts Senior-Regular, Regular-Regular, and no-Senior coverage", () => {
  const levels = new Map([
    ["senior-a", "SENIOR"],
    ["senior-b", "SENIOR"],
    ["regular-a", "REGULAR"],
    ["regular-b", "REGULAR"],
  ]);
  const fridayRows = (nurseIds: string[]) => nurseIds.map((nurseId) => ({
    nurseId,
    date: "2026-11-06",
    type: "WORK" as const,
    isManual: false,
  }));
  assert.deepEqual(SeniorFridayRule(fridayRows(["senior-a", "regular-a"]), levels), []);
  assert.deepEqual(SeniorFridayRule(fridayRows(["regular-a", "regular-b"]), levels), []);
  assert.deepEqual(SeniorFridayRule([], levels), []);
});

test("accepts a confirmed manual Senior-Senior Friday override after it is marked approved", () => {
  const levels = new Map([
    ["senior-a", "SENIOR"],
    ["senior-b", "SENIOR"],
    ["regular-a", "REGULAR"],
    ["regular-b", "REGULAR"],
  ]);
  const assignments = [
    { nurseId: "senior-a", date: "2026-11-06", type: "WORK" as const, isManual: true, seniorFridayOverrideApproved: true },
    { nurseId: "senior-b", date: "2026-11-06", type: "WORK" as const, isManual: true, seniorFridayOverrideApproved: true },
    { nurseId: "regular-a", date: "2026-11-06", type: "OFF" as const, isManual: true },
    { nurseId: "regular-b", date: "2026-11-06", type: "OFF" as const, isManual: true },
  ];
  assert.deepEqual(SeniorFridayRule(assignments, levels), []);
});
