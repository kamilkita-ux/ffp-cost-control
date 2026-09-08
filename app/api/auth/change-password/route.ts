import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/authSession";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { logChange } from "@/lib/audit";
import { checkLoginAttempt, recordLoginFailure, recordLoginSuccess, clientKeyForRequest } from "@/lib/rateLimit";

// POST /api/auth/change-password { currentPassword, newPassword }
// Pozwala zalogowanej osobie (tryb AUTH_MODE=accounts) samodzielnie
// zmienić hasło startowe nadane przez Kamila na własne.
//
// UWAGA — dodane 2026-09-08 (kontynuacja audytu bezpieczeństwa): ten
// endpoint wymaga ważnej sesji, ale NIE miał żadnego limitu prób
// zgadywania "currentPassword" — ktoś z przechwyconym/skradzionym, wciąż
// ważnym tokenem sesji (np. przez XSS albo pozostawiony otwarty na
// współdzielonym komputerze) mógłby bez ograniczeń zgadywać hasło i,
// zgadując, przejąć konto na stałe (zmieniając hasło). Ten sam licznik
// prób co przy logowaniu (lib/rateLimit.ts), osobna przestrzeń kluczy
// (prefiks "changepw:"), żeby nie mieszać się z limitem logowania.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const limitKey = `changepw:${clientKeyForRequest(req, session.username)}`;
  const attempt = checkLoginAttempt(limitKey);
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: "too_many_attempts", retryAfterSeconds: attempt.retryAfterSeconds },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  const user = await prisma.appUser.findUnique({ where: { username: session.username } });
  if (!user || !user.active) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    recordLoginFailure(limitKey);
    return NextResponse.json({ error: "invalid_current_password" }, { status: 401 });
  }
  recordLoginSuccess(limitKey);

  const passwordHash = await hashPassword(newPassword);
  await prisma.appUser.update({ where: { id: user.id }, data: { passwordHash } });
  await logChange(req, "appUser", user.id, "update", `Zmieniono własne hasło: ${user.username}`);
  return NextResponse.json({ ok: true });
}
