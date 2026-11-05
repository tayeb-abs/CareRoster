import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { issueToken } from "@/lib/tokens";

const credentialsSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a username or email and password." }, { status: 400 });
  }

  try {
    const identifier = parsed.data.identifier.toLowerCase();
    const user = await db.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
        isActive: true,
      },
      include: { role: { select: { name: true } } },
    });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json({ error: "Username or password is incorrect." }, { status: 401 });
    }
    const accessToken = await issueToken({ id: user.id, role: user.role.name });
    return NextResponse.json({
      accessToken,
      expiresIn: 60 * 60 * 8,
      user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role.name },
    });
  } catch (error) {
    console.error("[auth] Mobile sign-in failed", error);
    return NextResponse.json({ error: "Sign-in is unavailable. Check the database and authentication configuration." }, { status: 503 });
  }
}
