import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const nurseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().max(255), z.literal("")]).optional(),
  title: z.string().trim().min(2).max(80).default("Registered Nurse"),
  level: z.enum(["SENIOR", "REGULAR"]).default("REGULAR"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2c9c84"),
  defaultShiftId: z.uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  try {
    const nurses = await db.nurse.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { defaultShift: true },
    });
    return NextResponse.json({ nurses });
  } catch (error) {
    return apiError(error, "List nurses");
  }
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const parsed = nurseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a nurse name and valid profile details." }, { status: 400 });
  }
  try {
    const defaultShift = parsed.data.defaultShiftId
      ? await db.shiftTemplate.findFirst({ where: { id: parsed.data.defaultShiftId, isActive: true } })
      : await db.shiftTemplate.findFirst({ where: { isDefault: true, isActive: true } });
    if (parsed.data.defaultShiftId && !defaultShift) {
      return NextResponse.json({ error: "Select an active default shift." }, { status: 400 });
    }
    const nurse = await db.$transaction(async (transaction) => {
      const lastNurse = await transaction.nurse.findFirst({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
        select: { sortOrder: true },
      });
      return transaction.nurse.create({
        data: {
          ...parsed.data,
          defaultShiftId: defaultShift?.id ?? null,
          sortOrder: (lastNurse?.sortOrder ?? -1) + 1,
          email: parsed.data.email?.trim().toLowerCase() || null,
          createdById: user.id,
        },
      });
    });
    return NextResponse.json({ nurse }, { status: 201 });
  } catch (error) {
    return apiError(error, "Create nurse");
  }
}
