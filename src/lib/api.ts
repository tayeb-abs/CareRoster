import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export async function requireUser(
  request: Request,
  roles?: string[],
): Promise<AuthenticatedUser | NextResponse> {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (roles && !roles.includes(user.role)) {
      return NextResponse.json({ error: "You do not have permission to perform this action." }, { status: 403 });
    }
    return user;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_")
    ) {
      throw error;
    }
    console.error("[api] Authenticate request", error);
    return NextResponse.json({ error: "Authentication service is unavailable." }, { status: 503 });
  }
}

export function isResponse(value: AuthenticatedUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function apiError(error: unknown, context: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "That value is already in use." }, { status: 409 });
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "The requested record was not found." }, { status: 404 });
    }
  }
  console.error(`[api] ${context}`, error);
  return NextResponse.json(
    { error: "The request could not be completed. Check the server configuration and try again." },
    { status: 500 },
  );
}
