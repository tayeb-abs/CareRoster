import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";

const tokenDuration = 60 * 60 * 8;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.toLowerCase().includes("replace")) {
    throw new Error("AUTH_SECRET must contain at least 32 non-placeholder characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function issueToken(user: { id: string; role: string }) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${tokenDuration}s`)
    .sign(getSecret());
}

export async function getUserFromToken(token: string | undefined) {
  if (!token) return null;
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null;
  }
  const user = await db.user.findFirst({
    where: { id: userId, isActive: true },
    include: { role: { select: { name: true } } },
  });
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role.name };
}
