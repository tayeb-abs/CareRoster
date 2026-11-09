import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const reorderSchema = z.object({
  nurseIds: z.array(z.uuid()).max(500),
}).superRefine(({ nurseIds }, context) => {
  if (new Set(nurseIds).size !== nurseIds.length) {
    context.addIssue({ code: "custom", path: ["nurseIds"], message: "Nurse IDs must be unique." });
  }
});

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (isResponse(user)) return user;
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a unique ordered list of nurse IDs." }, { status: 400 });
  }

  try {
    const nurseIds = parsed.data.nurseIds;
    const updated = await db.$transaction(async (transaction) => {
      const existing = await transaction.nurse.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      const existingIds = new Set(existing.map(({ id }) => id));
      if (existingIds.size !== nurseIds.length || nurseIds.some((id) => !existingIds.has(id))) {
        return false;
      }
      await Promise.all(nurseIds.map((id, sortOrder) => transaction.nurse.update({
        where: { id },
        data: { sortOrder, updatedById: user.id },
      })));
      return true;
    });
    if (!updated) {
      return NextResponse.json({ error: "Nurse order is stale. Refresh the team list and try again." }, { status: 409 });
    }
    const nurses = await db.nurse.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ nurses });
  } catch (error) {
    return apiError(error, "Reorder nurses");
  }
}
