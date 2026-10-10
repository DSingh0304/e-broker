// Shared NextAuth session helpers: derive marketplace identity + role.
// Replaces the per-page identityOf variants.
import type { DemoIdentity } from "@/lib/api";

export type Role = "KABADIWALA" | "VENDOR" | "ADMIN" | "RECYCLER" | null;

interface SessionLike {
  user?: { phone?: string; role?: string } | null;
}

/** Signed-in user's marketplace identity, or null when logged out. */
export function getIdentity(session: unknown): DemoIdentity | null {
  const user = (session as SessionLike | null)?.user;
  if (!user?.phone) return null;
  return { phone: user.phone, role: (user.role as DemoIdentity["role"]) || "KABADIWALA" };
}

/** Signed-in user's role, or null. Unknown roles collapse to null. */
export function getRole(session: unknown): Role {
  const role = (session as SessionLike | null)?.user?.role;
  if (role === "KABADIWALA" || role === "VENDOR" || role === "ADMIN" || role === "RECYCLER") {
    return role;
  }
  return null;
}
