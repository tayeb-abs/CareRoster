import { auth } from "@/auth";
import { getUserFromToken } from "@/lib/tokens";

export async function getRequestUser(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return getUserFromToken(authorization.slice(7));
  }
  const session = await auth();
  if (!session?.user?.id || !session.user.role || !session.user.email) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email,
    email: session.user.email,
    role: session.user.role,
  };
}

export async function getPageUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.role || !session.user.email) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email,
    email: session.user.email,
    role: session.user.role,
  };
}
