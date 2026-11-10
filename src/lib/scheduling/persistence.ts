import { ExceptionType, OverrideReason, ShiftType } from "@prisma/client";
import { db } from "@/lib/db";
import { generateSchedule, type Assignment, type FridayHistory } from "@/lib/scheduling/engine";

export function dateRange(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const firstDaysSinceSaturday = (first.getUTCDay() + 1) % 7;
  const lastDaysSinceSaturday = (last.getUTCDay() + 1) % 7;
  first.setUTCDate(first.getUTCDate() - firstDaysSinceSaturday);
  last.setUTCDate(last.getUTCDate() + (6 - lastDaysSinceSaturday));
  return { start: first, end: last };
}

export function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function buildMonthlySchedule(
  year: number,
  month: number,
  overrides: Assignment[],
) {
  const { start } = dateRange(year, month);
  const historyStart = new Date(start);
  historyStart.setUTCDate(historyStart.getUTCDate() - 84);
  const [nurses, previous] = await Promise.all([
    db.nurse.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, level: true } }),
    db.fridayAssignmentHistory.findMany({
      where: { date: { gte: historyStart, lt: start }, assigned: true },
      select: { date: true, nurseId: true },
      orderBy: { date: "asc" },
    }),
  ]);
  const previousFridays = new Map<string, Set<string>>();
  for (const assignment of previous) {
    if (assignment.date.getUTCDay() !== 5) continue;
    const date = dateString(assignment.date);
    const ids = previousFridays.get(date) ?? new Set<string>();
    ids.add(assignment.nurseId);
    previousFridays.set(date, ids);
  }
  const fridayHistory: FridayHistory[] = [...previousFridays]
    .map(([date, nurseIds]) => ({ date, nurseIds: [...nurseIds] }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const activeNurseIds = new Set(nurses.map((nurse) => nurse.id));
  const generated = generateSchedule({
    year,
    month,
    nurseIds: nurses.map((nurse) => nurse.id),
    nurseLevels: new Map(nurses.map((nurse) => [nurse.id, nurse.level])),
    overrides,
    fridayHistory,
  });
  const inactiveOverrides = overrides.filter(
    (assignment) => assignment.isManual && !activeNurseIds.has(assignment.nurseId),
  );
  return [...generated, ...inactiveOverrides].sort(
    (left, right) => left.date.localeCompare(right.date) || left.nurseId.localeCompare(right.nurseId),
  );
}

export async function saveMonthlySchedule(
  year: number,
  month: number,
  assignments: Assignment[],
  actorId?: string,
) {
  const { start, end } = dateRange(year, month);
  return db.$transaction(async (transaction) => {
    const period = await transaction.monthlySchedule.upsert({
      where: { year_month: { year, month } },
      create: { year, month, createdById: actorId },
      update: { generatedAt: new Date() },
    });
    const nurseIds = [...new Set(assignments.map((assignment) => assignment.nurseId))];
    const existing = nurseIds.length
      ? await transaction.schedule.findMany({
          where: { nurseId: { in: nurseIds }, date: { gte: start, lte: end } },
        })
      : [];
    const existingByKey = new Map(
      existing.map((row) => [`${dateString(row.date)}|${row.nurseId}`, row]),
    );
    const saved = [];

    for (const assignment of assignments) {
      const date = new Date(`${assignment.date}T00:00:00.000Z`);
      const previous = existingByKey.get(`${assignment.date}|${assignment.nurseId}`);
      const row = await transaction.schedule.upsert({
        where: { nurseId_date: { nurseId: assignment.nurseId, date } },
        create: {
          monthlyScheduleId: period.id,
          nurseId: assignment.nurseId,
          date,
          shiftType: assignment.type as ShiftType,
          isManual: assignment.isManual,
          isShiftManual: assignment.isShiftManual ?? false,
          exceptionApproved: assignment.exceptionApproved ?? false,
          seniorFridayOverrideApproved: assignment.seniorFridayOverrideApproved ?? false,
          overrideReason: (assignment.overrideReason ?? null) as OverrideReason | null,
          note: assignment.note ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
        update: {
          monthlyScheduleId: period.id,
          shiftType: assignment.type as ShiftType,
          isManual: assignment.isManual,
          isShiftManual: assignment.isShiftManual ?? false,
          exceptionApproved: assignment.exceptionApproved ?? false,
          seniorFridayOverrideApproved: assignment.seniorFridayOverrideApproved ?? false,
          overrideReason: (assignment.overrideReason ?? null) as OverrideReason | null,
          note: assignment.note ?? null,
          updatedById: actorId,
        },
      });
      saved.push(row);

      await transaction.scheduleShift.deleteMany({ where: { scheduleId: row.id } });
      if (assignment.type === "WORK" && assignment.shiftAssignments?.length) {
        await transaction.scheduleShift.createMany({
          data: assignment.shiftAssignments.map((shift) => ({
            scheduleId: row.id,
            shiftTemplateId: shift.shiftTemplateId,
            shiftName: shift.shiftName,
            startTime: shift.startTime,
            endTime: shift.endTime,
            color: shift.color,
            totalHours: shift.totalHours,
            createdById: actorId,
          })),
        });
      }

      const changed =
        !previous ||
        previous.shiftType !== assignment.type ||
        previous.isManual !== assignment.isManual ||
        previous.exceptionApproved !== (assignment.exceptionApproved ?? false) ||
        previous.seniorFridayOverrideApproved !== (assignment.seniorFridayOverrideApproved ?? false) ||
        previous.overrideReason !== (assignment.overrideReason ?? null) ||
        previous.note !== (assignment.note ?? null);
      if (assignment.isManual && changed) {
        await transaction.manualOverride.updateMany({
          where: { scheduleId: row.id, isActive: true },
          data: { isActive: false },
        });
        await transaction.manualOverride.create({
          data: {
            scheduleId: row.id,
            monthlyScheduleId: period.id,
            nurseId: assignment.nurseId,
            date,
            previousShiftType: previous?.shiftType ?? null,
            shiftType: assignment.type as ShiftType,
            reason: (assignment.overrideReason ?? "OTHER") as OverrideReason,
            note: assignment.note ?? null,
            createdById: actorId,
          },
        });
        await transaction.scheduleAuditLog.create({
          data: {
            monthlyScheduleId: period.id,
            scheduleId: row.id,
            nurseId: assignment.nurseId,
            date,
            actorId,
            action: "MANUAL_OVERRIDE",
            oldValue: previous ? { shiftType: previous.shiftType, isManual: previous.isManual } : undefined,
            newValue: { shiftType: assignment.type, reason: assignment.overrideReason ?? "OTHER" },
          },
        });
      } else if (previous?.isManual && !assignment.isManual) {
        await transaction.manualOverride.updateMany({
          where: { scheduleId: row.id, isActive: true },
          data: { isActive: false },
        });
        await transaction.scheduleAuditLog.create({
          data: {
            monthlyScheduleId: period.id,
            scheduleId: row.id,
            nurseId: assignment.nurseId,
            date,
            actorId,
            action: "MANUAL_OVERRIDE_CLEARED",
            oldValue: { shiftType: previous.shiftType, isManual: true },
            newValue: { shiftType: assignment.type, isManual: false },
          },
        });
      }

      if (assignment.type === "SICK" || assignment.type === "EMERGENCY") {
        await transaction.scheduleException.upsert({
          where: { scheduleId: row.id },
          create: {
            scheduleId: row.id,
            monthlyScheduleId: period.id,
            nurseId: assignment.nurseId,
            date,
            type: assignment.type as ExceptionType,
            note: assignment.note ?? null,
            createdById: actorId,
          },
          update: {
            monthlyScheduleId: period.id,
            nurseId: assignment.nurseId,
            date,
            type: assignment.type as ExceptionType,
            note: assignment.note ?? null,
          },
        });
      } else {
        await transaction.scheduleException.deleteMany({ where: { scheduleId: row.id } });
      }
    }

    const activeIds = saved.map((row) => row.id);
    await transaction.schedule.deleteMany({
      where: {
        monthlyScheduleId: period.id,
        date: { gte: start, lte: end },
        isManual: false,
        ...(activeIds.length ? { id: { notIn: activeIds } } : {}),
      },
    });

    const fridayDates = [...new Set(assignments.map((row) => row.date))]
      .filter((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5);
    if (fridayDates.length) {
      const levels = await transaction.nurse.findMany({
        where: { id: { in: nurseIds } },
        select: { id: true, level: true },
      });
      const seniorIds = new Set(levels.filter((nurse) => nurse.level === "SENIOR").map((nurse) => nurse.id));
      for (const date of fridayDates) {
        const workingSeniors = assignments.filter(
          (row) => row.date === date && row.type === "WORK" && seniorIds.has(row.nurseId),
        );
        if (workingSeniors.length < 2) continue;
        const operationalException = workingSeniors.every((row) => row.exceptionApproved);
        const previousSeniorIds = existing
          .filter((row) => dateString(row.date) === date && row.shiftType === "WORK" && seniorIds.has(row.nurseId))
          .map((row) => row.nurseId)
          .sort();
        const nextSeniorIds = workingSeniors.map((row) => row.nurseId).sort();
        if (operationalException && !workingSeniors.every((row) => existingByKey.get(`${date}|${row.nurseId}`)?.exceptionApproved)) {
          await transaction.scheduleAuditLog.create({
            data: {
              monthlyScheduleId: period.id,
              date: new Date(`${date}T00:00:00.000Z`),
              actorId,
              action: "SENIOR_FRIDAY_EXCEPTION",
              newValue: {
                priority: "HIGH",
                warning: "Only Senior Nurses were available for Friday coverage. The assignment was created as an operational exception.",
                nurseIds: nextSeniorIds,
              },
            },
          });
        } else if (
          !operationalException &&
          workingSeniors.some((row) => row.isManual) &&
          (previousSeniorIds.length !== nextSeniorIds.length ||
            previousSeniorIds.some((id, index) => id !== nextSeniorIds[index]))
        ) {
          await transaction.scheduleAuditLog.create({
            data: {
              monthlyScheduleId: period.id,
              date: new Date(`${date}T00:00:00.000Z`),
              actorId,
              action: "SENIOR_FRIDAY_POLICY_OVERRIDE",
              newValue: {
                priority: "HIGH",
                warning: "Two Senior Nurses are assigned on Friday. This violates the standard scheduling policy.",
                nurseIds: nextSeniorIds,
              },
            },
          });
        }
      }
    }
    if (fridayDates.length) {
      await transaction.fridayAssignmentHistory.deleteMany({
        where: { date: { in: fridayDates.map((date) => new Date(`${date}T00:00:00.000Z`)) } },
      });
      await transaction.fridayAssignmentHistory.createMany({
        data: assignments
          .filter((row) => fridayDates.includes(row.date))
          .map((row) => ({
            monthlyScheduleId: period.id,
            nurseId: row.nurseId,
            date: new Date(`${row.date}T00:00:00.000Z`),
            assigned: row.type === "WORK",
            createdById: actorId,
          })),
      });
    }

    await transaction.scheduleAuditLog.create({
      data: {
        monthlyScheduleId: period.id,
        actorId,
        action: "SCHEDULE_GENERATED",
        newValue: { year, month, assignmentCount: assignments.length },
      },
    });

    return transaction.schedule.findMany({
      where: { date: { gte: start, lte: end } },
      include: {
        nurse: { select: { id: true, name: true, color: true, isActive: true, level: true, sortOrder: true } },
        shiftAssignments: true,
      },
      orderBy: [{ date: "asc" }, { nurse: { sortOrder: "asc" } }],
    });
  });
}

export async function getMonthlySchedule(year: number, month: number, includeArchived = false) {
  const period = await db.monthlySchedule.findUnique({ where: { year_month: { year, month } } });
  if (!period || (period.archivedAt && !includeArchived)) return null;
  const { start, end } = dateRange(year, month);
  const assignments = await db.schedule.findMany({
    where: { monthlyScheduleId: period.id, date: { gte: start, lte: end } },
    include: {
      nurse: { select: { id: true, name: true, color: true, isActive: true, level: true, sortOrder: true } },
      shiftAssignments: true,
    },
    orderBy: [{ date: "asc" }, { nurse: { sortOrder: "asc" } }],
  });
  return {
    id: period.id,
    year: period.year,
    month: period.month,
    generatedAt: period.generatedAt,
    archivedAt: period.archivedAt,
    assignments: assignments.map((row) => ({
      ...row,
      date: dateString(row.date),
      type: row.shiftType,
    })),
  };
}

export function toEngineAssignments(
  rows: {
    nurseId: string;
    date: Date | string;
    type: string;
    isManual: boolean;
    isShiftManual?: boolean;
    shiftAssignments?: {
      shiftTemplateId: string;
      shiftName: string;
      startTime: string;
      endTime: string;
      color: string | null;
      totalHours: { toNumber(): number } | number | string;
    }[];
    exceptionApproved?: boolean;
    seniorFridayOverrideApproved?: boolean;
    overrideReason?: string | null;
    note?: string | null;
  }[],
): Assignment[] {
  return rows.map((row) => ({
    nurseId: row.nurseId,
    date: typeof row.date === "string" ? row.date : dateString(row.date),
    type: row.type as Assignment["type"],
    isManual: row.isManual,
    isShiftManual: row.isShiftManual ?? false,
    shiftAssignments: (row.shiftAssignments ?? []).map((shift) => ({
      shiftTemplateId: shift.shiftTemplateId,
      shiftName: shift.shiftName,
      startTime: shift.startTime,
      endTime: shift.endTime,
      color: shift.color,
      totalHours: typeof shift.totalHours === "object" ? shift.totalHours.toNumber() : Number(shift.totalHours),
    })),
    exceptionApproved: row.exceptionApproved ?? false,
    seniorFridayOverrideApproved: row.seniorFridayOverrideApproved ?? false,
    overrideReason: (row.overrideReason ?? null) as Assignment["overrideReason"],
    note: row.note ?? null,
  }));
}
