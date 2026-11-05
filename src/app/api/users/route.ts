import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/password";
import { apiError, isResponse, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const userSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(255).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
});

export async function GET(request: Request) {
  const user = await requireUser(request, ["ADMIN"]);
  if (isResponse(user)) return user;
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: { select: { name: true } },
        isActive: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      users: users.map(({ role, ...account }) => ({ ...account, role: role.name })),
    });
  } catch (error) {
    console.error("[api] List accounts", error);
    return NextResponse.json({ error: "Could not load accounts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireUser(request, ["ADMIN"]);
  if (isResponse(user)) return user;
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a name, valid email, password with at least 12 characters, and Head Nurse role." }, { status: 400 });
  }
  try {
    const role = await db.role.findUnique({ where: { name: "HEAD_NURSE" } });
    if (!role) {
      return NextResponse.json({ error: "Head Nurse role has not been seeded." }, { status: 503 });
    }
    const account = parsed.data;
    const newUser = await db.user.create({
      data: {
        ...account,
        username: account.email.split("@")[0],
        roleId: role.id,
        passwordHash: await hashPassword(account.password),
        createdById: user.id,
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: { select: { name: true } },
        isActive: true,
      },
    });
    const { role: createdRole, ...createdAccount } = newUser;
    return NextResponse.json({ user: { ...createdAccount, role: createdRole.name } }, { status: 201 });
  } catch (error) {
    return apiError(error, "Create account");
  }
}
