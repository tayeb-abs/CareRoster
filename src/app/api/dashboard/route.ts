import { NextResponse } from "next/server";
import { isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { dateRange, getMonthlySchedule, toEngineAssignments } from "@/lib/scheduling/persistence";
import { summarizeSchedule } from "@/lib/scheduling/engine";

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { start, end } = dateRange(year, month);
    const [schedule, nurses, seniorFridayWarnings] = await Promise.all([
      getMonthlySchedule(year, month),
      db.nurse.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      db.scheduleAuditLog.findMany({
        where: {
          date: { gte: start, lte: end },
          action: { in: ["SENIOR_FRIDAY_EXCEPTION", "SENIOR_FRIDAY_POLICY_OVERRIDE"] },
          monthlySchedule: { archivedAt: null },
        },
        select: { id: true, date: true, action: true, newValue: true },
        orderBy: { date: "asc" },
      }),
    ]);
    const assignments = schedule?.assignments ?? [];
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;
    const monthRows = assignments.filter((row) => row.date.startsWith(monthPrefix));
    const today = now.toISOString().slice(0, 10);
    const workingToday = assignments.filter((row) => row.date === today && row.type === "WORK");
    const leaveRows = monthRows.filter((row) => row.type === "SICK" || row.type === "EMERGENCY");
    const activeNurses = nurses.filter((nurse) => nurse.isActive);
    const fairness = summarizeSchedule(
      toEngineAssignments(monthRows),
      nurses.map((nurse) => nurse.id),
    );
    const hoursByNurse = new Map<string, number>();
    for (const assignment of monthRows) {
      const hours = (assignment.shiftAssignments ?? []).reduce((total, shift) => total + Number(shift.totalHours), 0);
      hoursByNurse.set(assignment.nurseId, (hoursByNurse.get(assignment.nurseId) ?? 0) + hours);
    }
    return NextResponse.json({
      month: { year, month },
      today,
      scheduleGenerated: Boolean(schedule),
      activeNurseCount: activeNurses.length,
      seniorNurseCount: activeNurses.filter((nurse) => nurse.level === "SENIOR").length,
      regularNurseCount: activeNurses.filter((nurse) => nurse.level === "REGULAR").length,
      fridaySeniorCoverage: monthRows.filter(
        (row) => row.type === "WORK" && new Date(`${row.date}T00:00:00Z`).getUTCDay() === 5 && row.nurse.level === "SENIOR",
      ).length,
      totalNurseCount: nurses.length,
      workingToday: workingToday.length,
      leaveDays: leaveRows.length,
      totalScheduledHours: [...hoursByNurse.values()].reduce((total, hours) => total + hours, 0),
      scheduleDays: new Set(monthRows.map((row) => row.date)).size,
      assignments: monthRows,
      nurses: activeNurses,
      fairness: fairness.map((row) => ({ ...row, scheduledHours: row.workingHours })),
      seniorFridayWarnings: seniorFridayWarnings.map((warning) => ({
        id: warning.id,
        date: warning.date ? warning.date.toISOString().slice(0, 10) : "",
        action: warning.action,
        priority: "HIGH",
        message: warning.action === "SENIOR_FRIDAY_EXCEPTION"
          ? "Only Senior Nurses were available for Friday coverage. The assignment was created as an operational exception."
          : "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.",
      })),
    });
  } catch (error) {
    console.error("[api] Dashboard overview", error);
    return NextResponse.json({ error: "Could not load the dashboard." }, { status: 500 });
  }
}
