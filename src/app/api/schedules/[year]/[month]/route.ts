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
import { getNurseDefaultShift, shiftSnapshot } from "@/lib/shifts";

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
  shiftId: z.uuid().optional(),
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
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
    const [schedule, nurses, seniorFridayWarnings] = await Promise.all([
      getMonthlySchedule(params.year, params.month, includeArchived),
      db.nurse.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      db.scheduleAuditLog.findMany({
        where: {
          date: { gte: start, lte: end },
          action: { in: ["SENIOR_FRIDAY_EXCEPTION", "SENIOR_FRIDAY_POLICY_OVERRIDE"] },
          ...(!includeArchived ? { monthlySchedule: { archivedAt: null } } : {}),
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
    const body = await request.json().catch(() => ({}));
    const generationInput = z.object({ shiftId: z.uuid().optional() }).safeParse(body);
    if (!generationInput.success) return NextResponse.json({ error: "Select a valid shift for schedule generation." }, { status: 400 });
    const period = await db.monthlySchedule.findUnique({ where: { year_month: params } });
    if (period?.archivedAt) return NextResponse.json({ error: "Archived schedules cannot be regenerated." }, { status: 409 });
    const current = await getMonthlySchedule(params.year, params.month);
    const overrides = toEngineAssignments(current?.assignments.filter((row) => row.isManual || row.isShiftManual) ?? []);
    const assignments = await buildMonthlySchedule(params.year, params.month, overrides);
    const nurses = await db.nurse.findMany({
      where: { id: { in: [...new Set(assignments.map((assignment) => assignment.nurseId))] } },
      select: { id: true, name: true, level: true, defaultShiftId: true },
    });
    const activeShifts = await db.shiftTemplate.findMany({ where: { isActive: true } });
    const shiftsById = new Map(activeShifts.map((shift) => [shift.id, shift]));
    if (generationInput.data.shiftId && !shiftsById.has(generationInput.data.shiftId)) {
      return NextResponse.json({ error: "The selected fallback shift is inactive or unavailable." }, { status: 400 });
    }
    const fallbackShift = generationInput.data.shiftId
      ? shiftsById.get(generationInput.data.shiftId)
      : activeShifts.find((shift) => shift.isDefault);
    const nursesById = new Map(nurses.map((nurse) => [nurse.id, nurse]));
    const previousByKey = new Map((current?.assignments ?? []).map((row) => [`${row.nurseId}|${row.date}`, row]));
    const scheduledAssignments = assignments.map((assignment) => {
      if (assignment.type !== "WORK") return assignment;
      const previous = previousByKey.get(`${assignment.nurseId}|${assignment.date}`);
      const retained = previous?.isShiftManual ? previous.shiftAssignments : null;
      const nurse = nursesById.get(assignment.nurseId);
      const shift = getNurseDefaultShift(nurse?.defaultShiftId, activeShifts, fallbackShift);
      return {
        ...assignment,
        isShiftManual: Boolean(retained?.length),
        shiftAssignments: retained?.length
          ? retained.map((item) => ({
              shiftTemplateId: item.shiftTemplateId,
              shiftName: item.shiftName,
              startTime: item.startTime,
              endTime: item.endTime,
              color: item.color,
              totalHours: Number(item.totalHours),
            }))
          : shift ? [shiftSnapshot(shift)] : [],
      };
    });
    const unconfigured = new Set(scheduledAssignments.filter(
      (assignment) => assignment.type === "WORK" && !assignment.shiftAssignments?.length,
    ).map((assignment) => nursesById.get(assignment.nurseId)?.name ?? assignment.nurseId));
    if (unconfigured.size) {
      return NextResponse.json({
        error: `Set an active default shift for every nurse before generating: ${[...unconfigured].join(", ")}.`,
      }, { status: 400 });
    }
    const nurseLevels = new Map((await db.nurse.findMany({
      where: { id: { in: [...new Set(scheduledAssignments.map((assignment) => assignment.nurseId))] } },
      select: { id: true, level: true },
    })).map((nurse) => [nurse.id, nurse.level]));
    const violations = validateSchedule(scheduledAssignments, nurseLevels);
    const saved = await saveMonthlySchedule(params.year, params.month, scheduledAssignments, user.id);
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
    const period = await db.monthlySchedule.findUnique({ where: { year_month: params } });
    if (period?.archivedAt) return NextResponse.json({ error: "Archived schedules cannot be changed." }, { status: 409 });
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
      if (!row.isManual && !row.isShiftManual) return false;
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
    const activeShifts = await db.shiftTemplate.findMany({ where: { isActive: true } });
    const shiftsById = new Map(activeShifts.map((item) => [item.id, item]));
    const shift = input.type === "WORK"
      ? input.shiftId
        ? shiftsById.get(input.shiftId) ?? null
        : getNurseDefaultShift(nurse.defaultShiftId, activeShifts, activeShifts.find((item) => item.isDefault))
      : null;
    if (input.type === "WORK" && !shift) {
      return NextResponse.json({
        error: input.shiftId
          ? "The selected shift is inactive or unavailable."
          : "Choose an active shift before assigning this nurse to work.",
      }, { status: 400 });
    }
    const fallbackShift = activeShifts.find((item) => item.isDefault);
    const nurseDefaults = new Map((await db.nurse.findMany({
      where: { id: { in: [...new Set(assignments.map((assignment) => assignment.nurseId))] } },
      select: { id: true, defaultShiftId: true },
    })).map((entry) => [entry.id, entry.defaultShiftId]));
    const priorByKey = new Map((current?.assignments ?? []).map((row) => [`${row.nurseId}|${row.date}`, row]));
    const scheduledAssignments = assignments.map((assignment) => {
      if (assignment.type !== "WORK") return assignment;
      const isTarget = assignment.nurseId === input.nurseId && assignment.date === input.date;
      const previous = priorByKey.get(`${assignment.nurseId}|${assignment.date}`);
      if (isTarget && shift) {
        return { ...assignment, isShiftManual: true, shiftAssignments: [shiftSnapshot(shift)] };
      }
      if (previous?.shiftAssignments.length && (previous.isShiftManual || previous.type === "WORK")) {
        return {
          ...assignment,
          isShiftManual: previous.isShiftManual,
          shiftAssignments: previous.shiftAssignments.map((item) => ({
            shiftTemplateId: item.shiftTemplateId,
            shiftName: item.shiftName,
            startTime: item.startTime,
            endTime: item.endTime,
            color: item.color,
            totalHours: Number(item.totalHours),
          })),
        };
      }
      const defaultShift = getNurseDefaultShift(nurseDefaults.get(assignment.nurseId), activeShifts, fallbackShift);
      return defaultShift
        ? { ...assignment, isShiftManual: false, shiftAssignments: [shiftSnapshot(defaultShift)] }
        : assignment;
    });
    if (scheduledAssignments.some((assignment) => assignment.type === "WORK" && !assignment.shiftAssignments?.length)) {
      return NextResponse.json({ error: "Set an active default shift before changing this schedule." }, { status: 400 });
    }
    const nurseLevels = new Map((await db.nurse.findMany({
      where: { id: { in: [...new Set(scheduledAssignments.map((assignment) => assignment.nurseId))] } },
      select: { id: true, level: true },
    })).map((entry) => [entry.id, entry.level]));
    const violations = validateSchedule(scheduledAssignments, nurseLevels);
    if (violations.length && !input.confirmed) {
      return NextResponse.json({ requiresConfirmation: true, violations }, { status: 409 });
    }
    const seniorPolicyRule = "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.";
    const acceptedSeniorDates = new Set(violations
      .filter((violation) => violation.rule === seniorPolicyRule)
      .map((violation) => violation.date));
    const assignmentsToSave = input.confirmed && acceptedSeniorDates.size
      ? scheduledAssignments.map((assignment) =>
        acceptedSeniorDates.has(assignment.date) &&
        assignment.type === "WORK" &&
        nurseLevels.get(assignment.nurseId) === "SENIOR"
          ? { ...assignment, isManual: true, seniorFridayOverrideApproved: true }
          : assignment,
      )
      : scheduledAssignments;
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
