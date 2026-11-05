import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import {
  buildMonthlySchedule,
  dateRange,
  getMonthlySchedule,
  saveMonthlySchedule,
  toEngineAssignments,
} from "@/lib/scheduling/persistence";
import { validateSchedule } from "@/lib/scheduling/engine";

const paramsSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const overrideSchema = z.object({
  nurseId: z.string().uuid(),
  date: z.iso.date(),
  type: z.enum(["WORK", "OFF", "SICK", "EMERGENCY"]).optional(),
  overrideReason: z.enum([
    "SATURDAY_OFF",
    "CONSECUTIVE_OFF",
    "FRIDAY_COVERAGE",
    "CONSECUTIVE_FRIDAY",
    "FORCED_WORK",
    "SICK_LEAVE",
    "EMERGENCY_LEAVE",
    "OTHER",
  ]).default("OTHER"),
  note: z.string().max(500).optional().nullable(),
  moveFrom: z.iso.date().optional(),
  clearOverride: z.boolean().default(false),
  confirmed: z.boolean().default(false),
});

type RouteContext = { params: Promise<{ year: string; month: string }> };

async function getPeriodParams(context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request, context: RouteContext) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const params = await getPeriodParams(context);
  if (!params) return NextResponse.json({ error: "Invalid schedule month." }, { status: 400 });
  try {
    const { start, end } = dateRange(params.year, params.month);
    const [schedule, nurses, seniorFridayWarnings] = await Promise.all([
      getMonthlySchedule(params.year, params.month),
      db.nurse.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
      db.scheduleAuditLog.findMany({
        where: {
          date: { gte: start, lte: end },
          action: { in: ["SENIOR_FRIDAY_EXCEPTION", "SENIOR_FRIDAY_POLICY_OVERRIDE"] },
        },
        select: { id: true, date: true, action: true },
        orderBy: { date: "asc" },
      }),
    ]);
    return NextResponse.json({
      schedule,
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
    return apiError(error, "Read monthly schedule");
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const params = await getPeriodParams(context);
  if (!params) return NextResponse.json({ error: "Invalid schedule month." }, { status: 400 });
  try {
    const current = await getMonthlySchedule(params.year, params.month);
    const overrides = toEngineAssignments(current?.assignments.filter((row) => row.isManual) ?? []);
    const assignments = await buildMonthlySchedule(params.year, params.month, overrides);
    const nurseLevels = new Map((await db.nurse.findMany({
      where: { id: { in: [...new Set(assignments.map((assignment) => assignment.nurseId))] } },
      select: { id: true, level: true },
    })).map((nurse) => [nurse.id, nurse.level]));
    const violations = validateSchedule(assignments, nurseLevels);
    const saved = await saveMonthlySchedule(params.year, params.month, assignments, user.id);
    return NextResponse.json({ schedule: saved, violations });
  } catch (error) {
    return apiError(error, "Generate monthly schedule");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const params = await getPeriodParams(context);
  if (!params) return NextResponse.json({ error: "Invalid schedule month." }, { status: 400 });
  const parsed = overrideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a valid nurse, date, and schedule change." }, { status: 400 });
  }
  const input = parsed.data;
  if (!input.type && !input.clearOverride) {
    return NextResponse.json({ error: "Select a shift type." }, { status: 400 });
  }
  const { start, end } = dateRange(params.year, params.month);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (date < start || date > end) {
    return NextResponse.json({ error: "The date is outside this schedule period." }, { status: 400 });
  }
  if (input.moveFrom) {
    const sourceDate = new Date(`${input.moveFrom}T00:00:00.000Z`);
    if (sourceDate < start || sourceDate > end) {
      return NextResponse.json({ error: "The source date is outside this schedule period." }, { status: 400 });
    }
  }
  try {
    const [current, nurse] = await Promise.all([
      getMonthlySchedule(params.year, params.month),
      db.nurse.findFirst({ where: { id: input.nurseId, deletedAt: null } }),
    ]);
    if (!nurse) return NextResponse.json({ error: "Nurse not found." }, { status: 404 });
    const existing = toEngineAssignments(current?.assignments ?? []);
    const sourceAssignment = input.moveFrom
      ? existing.find((row) => row.nurseId === input.nurseId && row.date === input.moveFrom)
      : undefined;
    const retained = existing.filter((row) => {
      if (!row.isManual) return false;
      if (row.nurseId !== input.nurseId) return true;
      return row.date !== input.date && row.date !== input.moveFrom;
    });
    const overrides = input.clearOverride ? retained : [...retained];
    if (!input.clearOverride) {
      if (sourceAssignment && input.moveFrom) {
        const sourceType = sourceAssignment.type === "WORK" ? "OFF" : "WORK";
        overrides.push({
          nurseId: input.nurseId,
          date: input.moveFrom,
          type: sourceType,
          isManual: true,
          overrideReason: sourceType === "WORK" ? "FORCED_WORK" : "OTHER",
          note: sourceAssignment.note ?? null,
        });
      }
      overrides.push({
        nurseId: input.nurseId,
        date: input.date,
        type: input.type!,
        isManual: true,
        overrideReason: input.overrideReason,
        note: input.note ?? null,
      });
    }
    const assignments = await buildMonthlySchedule(params.year, params.month, overrides);
    const nurseLevels = new Map((await db.nurse.findMany({
      where: { id: { in: [...new Set(assignments.map((assignment) => assignment.nurseId))] } },
      select: { id: true, level: true },
    })).map((entry) => [entry.id, entry.level]));
    const violations = validateSchedule(assignments, nurseLevels);
    if (violations.length && !input.confirmed) {
      return NextResponse.json({ requiresConfirmation: true, violations }, { status: 409 });
    }
    const seniorPolicyRule = "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.";
    const acceptedSeniorDates = new Set(violations
      .filter((violation) => violation.rule === seniorPolicyRule)
      .map((violation) => violation.date));
    const assignmentsToSave = input.confirmed && acceptedSeniorDates.size
      ? assignments.map((assignment) =>
        acceptedSeniorDates.has(assignment.date) &&
        assignment.type === "WORK" &&
        nurseLevels.get(assignment.nurseId) === "SENIOR"
          ? { ...assignment, isManual: true, seniorFridayOverrideApproved: true }
          : assignment,
      )
      : assignments;
    const saved = await saveMonthlySchedule(params.year, params.month, assignmentsToSave, user.id);
    return NextResponse.json({
      schedule: saved,
      violations: violations.filter((violation) =>
        violation.rule !== seniorPolicyRule || !acceptedSeniorDates.has(violation.date),
      ),
    });
  } catch (error) {
    return apiError(error, "Update schedule assignment");
  }
}
