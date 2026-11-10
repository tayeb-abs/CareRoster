import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const monthSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

const actionSchema = z.discriminatedUnion("action", [
  monthSchema.extend({ action: z.literal("CLEAR_MONTH") }),
  z.object({
    action: z.literal("CLEAR_RANGE"),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  }).refine((value) => value.startDate <= value.endDate, {
    message: "The range start must not be after the range end.",
  }),
  z.object({
    action: z.literal("CLEAR_ALL"),
    password: z.string().min(1).max(256),
    confirmed: z.literal(true),
    warningAcknowledged: z.literal(true),
  }),
  monthSchema.extend({ action: z.literal("ARCHIVE_MONTH") }),
]);

function monthDates(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month, 1)),
  };
}

function affectedMonthLabel(startDate: string, endDate: string) {
  const startMonth = startDate.slice(0, 7);
  const endMonth = endDate.slice(0, 7);
  return startMonth === endMonth ? startMonth : `${startDate} to ${endDate}`;
}

export async function GET(request: Request) {
  const user = await requireUser(request, ["ADMIN", "HEAD_NURSE"]);
  if (isResponse(user)) return user;
  try {
    const history = await db.scheduleCleanupAudit.findMany({
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const periods = user.role === "ADMIN"
      ? await db.monthlySchedule.findMany({
          select: { year: true, month: true, generatedAt: true, archivedAt: true },
          orderBy: [{ year: "desc" }, { month: "desc" }],
        })
      : undefined;
    return NextResponse.json({ history, periods });
  } catch (error) {
    return apiError(error, "Read schedule management history");
  }
}

export async function POST(request: Request) {
  const user = await requireUser(request, ["ADMIN"]);
  if (isResponse(user)) return user;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a valid schedule maintenance action and confirmation." }, { status: 400 });
  }

  if (parsed.data.action === "CLEAR_ALL") {
    try {
      const account = await db.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, isActive: true },
      });
      if (!account?.isActive || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
        return NextResponse.json({ error: "The password confirmation was not accepted." }, { status: 403 });
      }

      const result = await db.$transaction(async (transaction) => {
        const [scheduleCount, fridayCount, periodCount] = await Promise.all([
          transaction.schedule.count(),
          transaction.fridayAssignmentHistory.count(),
          transaction.monthlySchedule.count(),
        ]);
        await transaction.scheduleAuditLog.deleteMany();
        await transaction.fridayAssignmentHistory.deleteMany();
        await transaction.schedule.deleteMany();
        await transaction.monthlySchedule.deleteMany();
        await transaction.scheduleCleanupAudit.create({
          data: {
            actorId: user.id,
            action: "CLEAR_ALL",
            affectedMonth: "ALL",
            details: { scheduleCount, fridayCount, periodCount },
          },
        });
        return { scheduleCount, fridayCount, periodCount };
      });
      return NextResponse.json({ success: true, result });
    } catch (error) {
      return apiError(error, "Clear all schedule history");
    }
  }

  try {
    if (parsed.data.action === "ARCHIVE_MONTH") {
      const { year, month } = parsed.data;
      const result = await db.$transaction(async (transaction) => {
        const period = await transaction.monthlySchedule.findUnique({
          where: { year_month: { year, month } },
        });
        if (!period) return null;
        if (period.archivedAt) return { alreadyArchived: true };
        const archivedAt = new Date();
        await transaction.monthlySchedule.update({
          where: { id: period.id },
          data: { archivedAt, archivedById: user.id },
        });
        await transaction.scheduleCleanupAudit.create({
          data: {
            actorId: user.id,
            action: "ARCHIVE_MONTH",
            affectedMonth: `${year}-${String(month).padStart(2, "0")}`,
            startDate: monthDates(year, month).start,
            endDate: new Date(monthDates(year, month).endExclusive.getTime() - 86400000),
            details: { archivedAt: archivedAt.toISOString() },
          },
        });
        return { archivedAt };
      });
      if (!result) return NextResponse.json({ error: "No generated schedule exists for that month." }, { status: 404 });
      if ("alreadyArchived" in result) return NextResponse.json({ error: "That month is already archived." }, { status: 409 });
      return NextResponse.json({ success: true, result });
    }

    if (parsed.data.action === "CLEAR_MONTH") {
      const { year, month } = parsed.data;
      const { start, endExclusive } = monthDates(year, month);
      const result = await db.$transaction(async (transaction) => {
        const period = await transaction.monthlySchedule.findUnique({
          where: { year_month: { year, month } },
        });
        const periodFilter = period ? [{ monthlyScheduleId: period.id }] : [];
        const where = {
          OR: [
            ...periodFilter,
            { date: { gte: start, lt: endExclusive } },
          ],
        };
        const [scheduleCount, fridayCount] = await Promise.all([
          transaction.schedule.count({ where }),
          transaction.fridayAssignmentHistory.count({
            where: {
              OR: [
                ...(period ? [{ monthlyScheduleId: period.id }] : []),
                { date: { gte: start, lt: endExclusive } },
              ],
            },
          }),
        ]);
        await transaction.scheduleAuditLog.deleteMany({
          where: {
            OR: [
              ...(period ? [{ monthlyScheduleId: period.id }] : []),
              { date: { gte: start, lt: endExclusive } },
            ],
          },
        });
        await transaction.fridayAssignmentHistory.deleteMany({
          where: {
            OR: [
              ...(period ? [{ monthlyScheduleId: period.id }] : []),
              { date: { gte: start, lt: endExclusive } },
            ],
          },
        });
        await transaction.schedule.deleteMany({ where });
        if (period) await transaction.monthlySchedule.delete({ where: { id: period.id } });
        await transaction.scheduleCleanupAudit.create({
          data: {
            actorId: user.id,
            action: "CLEAR_MONTH",
            affectedMonth: `${year}-${String(month).padStart(2, "0")}`,
            startDate: start,
            endDate: new Date(endExclusive.getTime() - 86400000),
            details: { scheduleCount, fridayCount },
          },
        });
        return { scheduleCount, fridayCount };
      });
      return NextResponse.json({ success: true, result });
    }

    if (parsed.data.action !== "CLEAR_RANGE") {
      return NextResponse.json({ error: "Unsupported schedule maintenance action." }, { status: 400 });
    }
    const rangeData = parsed.data;
    const start = new Date(`${rangeData.startDate}T00:00:00.000Z`);
    const endExclusive = new Date(`${rangeData.endDate}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const result = await db.$transaction(async (transaction) => {
      const periods = await transaction.monthlySchedule.findMany({
        select: { id: true, year: true, month: true },
      });
      const fullyCoveredPeriodIds = periods.filter(({ year, month }) => {
        const dates = monthDates(year, month);
        return dates.start >= start && dates.endExclusive <= endExclusive;
      }).map(({ id }) => id);
      const [scheduleCount, fridayCount] = await Promise.all([
        transaction.schedule.count({ where: { date: { gte: start, lt: endExclusive } } }),
        transaction.fridayAssignmentHistory.count({ where: { date: { gte: start, lt: endExclusive } } }),
      ]);
      await transaction.scheduleAuditLog.deleteMany({
        where: {
          OR: [
            { date: { gte: start, lt: endExclusive } },
            ...(fullyCoveredPeriodIds.length ? [{ monthlyScheduleId: { in: fullyCoveredPeriodIds } }] : []),
          ],
        },
      });
      await transaction.fridayAssignmentHistory.deleteMany({ where: { date: { gte: start, lt: endExclusive } } });
      await transaction.schedule.deleteMany({ where: { date: { gte: start, lt: endExclusive } } });
      if (fullyCoveredPeriodIds.length) {
        await transaction.monthlySchedule.deleteMany({
          where: { id: { in: fullyCoveredPeriodIds }, schedules: { none: {} } },
        });
      }
      await transaction.scheduleCleanupAudit.create({
        data: {
          actorId: user.id,
          action: "CLEAR_RANGE",
          affectedMonth: affectedMonthLabel(rangeData.startDate, rangeData.endDate),
          startDate: start,
          endDate: new Date(endExclusive.getTime() - 86400000),
          details: { scheduleCount, fridayCount },
        },
      });
      return { scheduleCount, fridayCount };
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return apiError(error, "Maintain schedule history");
  }
}
