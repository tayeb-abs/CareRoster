import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.union([z.email().max(255), z.literal("")]).nullable().optional(),
  title: z.string().trim().min(2).max(80).optional(),
  level: z.enum(["SENIOR", "REGULAR"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive: z.boolean().optional(),
  defaultShiftId: z.uuid().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "Provide at least one valid field to update." }, { status: 400 });
  }
  try {
    const { id } = await context.params;
    if (parsed.data.defaultShiftId) {
      const shift = await db.shiftTemplate.findFirst({
        where: { id: parsed.data.defaultShiftId, isActive: true },
        select: { id: true },
      });
      if (!shift) return NextResponse.json({ error: "Select an active default shift." }, { status: 400 });
    }
    const nurse = await db.nurse.update({
      where: { id },
      data: {
        ...parsed.data,
        updatedById: user.id,
        ...(parsed.data.email !== undefined
          ? { email: parsed.data.email?.trim().toLowerCase() || null }
          : {}),
      },
    });
    return NextResponse.json({ nurse });
  } catch (error) {
    return apiError(error, "Update nurse");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  try {
    const { id } = await context.params;
    await db.nurse.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "Delete nurse");
  }
}
