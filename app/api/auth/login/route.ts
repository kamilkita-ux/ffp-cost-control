import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, isAccountsMode } from "@/lib/session";
import { checkLoginAttempt, recordLoginFailure, recordLoginSuccess, clientKeyForRequest } from "@/lib/rateLimit";

// POST /api/auth/login { username, password }
// Loguje przez tabelę AppUser (tryb kont) — działa tylko gdy AUTH_MODE=accounts,
// żeby nie mieszać dwóch równoległych systemów logowania w praktyce (Basic
// Auth zostaje jedynym mechanizmem, dopóki Kamil świadomie nie przełączy
// zmiennej środowiskowej). Ustawia podpisane ciasteczko sesji (patrz
// lib/session.ts) — httpOnly, więc niedostępne dla JS w przeglądarce.
export async function POST(req: Request) {
  if (!isAccountsMode()) {
    return NextResponse.json({ error: "auth_mode_disabled" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  // Ochrona przed brute-force zgadywaniem haseł — patrz lib/rateLimit.ts.
  // Sprawdzane PRZED odpytaniem bazy, więc zablokowany adres/login nie
  // obciąża jej próbami logowania.
  const limitKey = clientKeyForRequest(req, username);
  const limit = checkLoginAttempt(limitKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "too_many_attempts", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429 }
    );
  }

  const user = await prisma.appUser.findUnique({ where: { username } });
  if (!user || !user.active) {
    recordLoginFailure(limitKey);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    recordLoginFailure(limitKey);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  recordLoginSuccess(limitKey);

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await createSessionToken({ username: user.username, role: user.role, exp });
  if (!token) {
    // SESSION_SECRET nieustawiony/za krótki — patrz lib/session.ts.
    return NextResponse.json({ error: "session_unavailable" }, { status: 500 });
  }

  await prisma.appUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const res = NextResponse.json({ username: user.username, role: user.role });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
  return res;
}
