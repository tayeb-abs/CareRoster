import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyRoster } from "@/lib/roster-export";
import { formatShiftTime, shiftDurationHours } from "@/lib/shifts";

test("calculates administrator-defined daytime and overnight shift durations", () => {
  assert.equal(shiftDurationHours("08:00", "16:00"), 8);
  assert.equal(shiftDurationHours("11:00", "21:00"), 10);
  assert.equal(shiftDurationHours("14:00", "00:00"), 10);
  assert.equal(shiftDurationHours("20:00", "08:00"), 12);
});

test("rejects malformed administrator-entered shift times", () => {
  assert.throws(() => shiftDurationHours("25:00", "08:00"), /24-hour HH:mm/);
  assert.throws(() => shiftDurationHours("08:00", "8pm"), /24-hour HH:mm/);
});

test("roster labels use saved shift templates rather than generated shift names or times", () => {
  const roster = buildWeeklyRoster([{
    date: "2026-11-07",
    nurseName: "Hanadi",
    nurseColor: "#176b9a",
    nurseLevel: "REGULAR",
    type: "WORK",
    shiftAssignments: [{
      shiftTemplateId: "shift-a",
      shiftName: "Late Clinic Shift",
      startTime: "11:00",
      endTime: "21:00",
      color: "#176b9a",
      totalHours: 10,
    }],
  }], "2026-11-07", "en");
  const label = roster.nurses[0].shifts.get("2026-11-07")?.label;
  assert.match(label ?? "", /Late Clinic Shift/);
  assert.match(label ?? "", /11:00 AM → 9:00 PM/);
  assert.match(label ?? "", /10 hours/);

  const unassigned = buildWeeklyRoster([{
    date: "2026-11-07",
    nurseName: "Hanadi",
    nurseColor: "#176b9a",
    nurseLevel: "REGULAR",
    type: "WORK",
  }], "2026-11-07", "en");
  assert.equal(unassigned.nurses[0].shifts.get("2026-11-07")?.label, "Shift not assigned");
});

test("formats midnight-crossing shift times without assuming a standard shift", () => {
  assert.equal(formatShiftTime("20:00", "en"), "8:00 PM");
  assert.equal(formatShiftTime("08:00", "en"), "8:00 AM");
});
