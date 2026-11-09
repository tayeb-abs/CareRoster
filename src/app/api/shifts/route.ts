import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { shiftDurationHours } from "@/lib/shifts";

const shiftInput = z.object({
  name: z.string().trim().min(1).max(120),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  try {
    const shifts = await db.shiftTemplate.findMany({
      where: user.role === "ADMIN" ? undefined : { isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({
      shifts: shifts.map((shift) => ({
        ...shift,
        totalHours: shiftDurationHours(shift.startTime, shift.endTime),
      })),
    });
  } catch (error) {
    return apiError(error, "Read shift templates");
  }
}

export async function POST(request: Request) {
  const user = await requireUser(request, ["ADMIN"]);
  if (isResponse(user)) return user;
  const parsed = shiftInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a shift name and valid start and end times." }, { status: 400 });
  }
  try {
    shiftDurationHours(parsed.data.startTime, parsed.data.endTime);
    const created = await db.$transaction(async (transaction) => {
      if (parsed.data.isDefault) {
        await transaction.shiftTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return transaction.shiftTemplate.create({
        data: {
          ...parsed.data,
          color: parsed.data.color ?? null,
          createdById: user.id,
          updatedById: user.id,
        },
      });
    });
    return NextResponse.json({ shift: { ...created, totalHours: shiftDurationHours(created.startTime, created.endTime) } }, { status: 201 });
  } catch (error) {
    return apiError(error, "Create shift template");
  }
}
