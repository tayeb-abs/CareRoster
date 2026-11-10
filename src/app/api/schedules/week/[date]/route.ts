import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { dateString } from "@/lib/scheduling/persistence";

type RouteContext = { params: Promise<{ date: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const parsed = z.iso.date().safeParse((await context.params).date);
  if (!parsed.success) return NextResponse.json({ error: "Invalid week start date." }, { status: 400 });

  const start = new Date(`${parsed.data}T00:00:00.000Z`);
  if (start.getUTCDay() !== 6) {
    return NextResponse.json({ error: "The week must start on Saturday." }, { status: 400 });
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  try {
    const [assignments, nurses, seniorFridayWarnings] = await Promise.all([
      db.schedule.findMany({
        where: { date: { gte: start, lte: end }, monthlySchedule: { archivedAt: null } },
        include: {
          nurse: { select: { id: true, name: true, color: true, isActive: true, level: true, sortOrder: true } },
          shiftAssignments: true,
        },
        orderBy: [{ date: "asc" }, { nurse: { sortOrder: "asc" } }],
      }),
      db.nurse.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      db.scheduleAuditLog.findMany({
        where: {
          date: { gte: start, lte: end },
          action: { in: ["SENIOR_FRIDAY_EXCEPTION", "SENIOR_FRIDAY_POLICY_OVERRIDE"] },
          monthlySchedule: { archivedAt: null },
        },
        select: { id: true, date: true, action: true },
        orderBy: { date: "asc" },
      }),
    ]);

    return NextResponse.json({
      schedule: assignments.length
        ? {
            assignments: assignments.map((row) => ({
              ...row,
              date: dateString(row.date),
              type: row.shiftType,
              shiftAssignments: row.shiftAssignments.map((shift) => ({
                ...shift,
                totalHours: Number(shift.totalHours),
              })),
            })),
          }
        : null,
      nurses,
      seniorFridayWarnings: seniorFridayWarnings.map((warning) => ({
        id: warning.id,
        date: warning.date?.toISOString().slice(0, 10) ?? "",
        action: warning.action,
        priority: "HIGH",
        message: warning.action === "SENIOR_FRIDAY_EXCEPTION"
          ? "Only Senior Nurses were available for Friday coverage. The assignment was created as an operational exception."
          : "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.",
      })),
    });
  } catch (error) {
    return apiError(error, "Read weekly schedule");
  }
}
