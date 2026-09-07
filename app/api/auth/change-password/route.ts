import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/authSession";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { logChange } from "@/lib/audit";

// POST /api/auth/change-password { currentPassword, newPassword }
// Pozwala zalogowanej osobie (tryb AUTH_MODE=accounts) samodzielnie
// zmienić hasło startowe nadane przez Kamila na własne.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  const user = await prisma.appUser.findUnique({ where: { username: session.username } });
  if (!user || !user.active) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "invalid_current_password" }, { status: 401 });

  const passwordHash = await hashPassword(newPassword);
  await prisma.appUser.update({ where: { id: user.id }, data: { passwordHash } });
  await logChange(req, "appUser", user.id, "update", `Zmieniono własne hasło: ${user.username}`);
  return NextResponse.json({ ok: true });
}
