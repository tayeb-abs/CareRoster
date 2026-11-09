import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { shiftDurationHours } from "@/lib/shifts";

const shiftPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request, ["ADMIN"]);
  if (isResponse(user)) return user;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid shift template." }, { status: 400 });
  const parsed = shiftPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Provide valid shift details to update." }, { status: 400 });
  }
  try {
    const current = await db.shiftTemplate.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Shift template not found." }, { status: 404 });
    const next = { ...current, ...parsed.data };
    if (!next.isActive && next.isDefault) {
      return NextResponse.json({ error: "Choose another default shift before deactivating this one." }, { status: 400 });
    }
    shiftDurationHours(next.startTime, next.endTime);
    const updated = await db.$transaction(async (transaction) => {
      if (parsed.data.isDefault) {
        await transaction.shiftTemplate.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      }
      return transaction.shiftTemplate.update({
        where: { id },
        data: { ...parsed.data, ...(parsed.data.isActive === false ? { isDefault: false } : {}), updatedById: user.id },
      });
    });
    return NextResponse.json({ shift: { ...updated, totalHours: shiftDurationHours(updated.startTime, updated.endTime) } });
  } catch (error) {
    return apiError(error, "Update shift template");
  }
}
