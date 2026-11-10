import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { shiftDurationHours, shiftSnapshot } from "@/lib/shifts";

const shiftChange = z.object({
  nurseId: z.uuid(),
  date: z.iso.date(),
  shiftIds: z.array(z.uuid()).min(1).max(6).refine((ids) => new Set(ids).size === ids.length),
});

export async function PATCH(request: Request) {
  const user = await requireUser(request, ["ADMIN", "HEAD_NURSE"]);
  if (isResponse(user)) return user;
  const parsed = shiftChange.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select at least one valid shift." }, { status: 400 });
  try {
    const { nurseId, date: dateValue, shiftIds } = parsed.data;
    const date = new Date(`${dateValue}T00:00:00.000Z`);
    const [schedule, templates] = await Promise.all([
      db.schedule.findUnique({
        where: { nurseId_date: { nurseId, date } },
        include: { shiftAssignments: true, monthlySchedule: { select: { archivedAt: true } } },
      }),
      db.shiftTemplate.findMany({ where: { id: { in: shiftIds }, isActive: true } }),
    ]);
    if (!schedule) return NextResponse.json({ error: "Generate or add this nurse's working assignment before changing its shift." }, { status: 404 });
    if (schedule.monthlySchedule.archivedAt) return NextResponse.json({ error: "Archived schedules cannot be changed." }, { status: 409 });
    if (schedule.shiftType !== "WORK") return NextResponse.json({ error: "Only working assignments can have shifts." }, { status: 400 });
    if (templates.length !== shiftIds.length) return NextResponse.json({ error: "One or more selected shifts are inactive or unavailable." }, { status: 400 });
    const selected = shiftIds.map((id) => templates.find((template) => template.id === id)!);
    const totalHours = selected.reduce((total, shift) => total + shiftDurationHours(shift.startTime, shift.endTime), 0);
    if (totalHours > 24) return NextResponse.json({ error: "Combined split-shift hours cannot exceed 24 hours per day." }, { status: 400 });
    const oldValue = schedule.shiftAssignments.map((shift) => ({
      name: shift.shiftName, startTime: shift.startTime, endTime: shift.endTime, totalHours: Number(shift.totalHours),
    }));
    const newValue = selected.map((shift) => ({
      name: shift.name, startTime: shift.startTime, endTime: shift.endTime, totalHours: shiftDurationHours(shift.startTime, shift.endTime),
    }));

    await db.$transaction(async (transaction) => {
      await transaction.scheduleShift.deleteMany({ where: { scheduleId: schedule.id } });
      await transaction.scheduleShift.createMany({
        data: selected.map((shift) => ({
          scheduleId: schedule.id,
          ...shiftSnapshot(shift),
          createdById: user.id,
        })),
      });
      await transaction.schedule.update({
        where: { id: schedule.id },
        data: { isShiftManual: true, updatedById: user.id },
      });
      await transaction.scheduleAuditLog.create({
        data: {
          monthlyScheduleId: schedule.monthlyScheduleId,
          scheduleId: schedule.id,
          nurseId,
          date,
          actorId: user.id,
          action: "SHIFT_ASSIGNMENT_CHANGED",
          oldValue,
          newValue,
        },
      });
    });
    return NextResponse.json({ success: true, shiftAssignments: newValue });
  } catch (error) {
    return apiError(error, "Change schedule assignment shift");
  }
}
