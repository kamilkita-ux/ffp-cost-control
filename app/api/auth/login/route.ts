import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  REMEMBER_TTL_SECONDS,
  isAccountsMode,
  type SessionPayload
} from "@/lib/session";
import { checkLoginAttempt, recordLoginFailure, recordLoginSuccess, clientKeyForRequest } from "@/lib/rateLimit";
import { basicAuthConfigured, verifyBasicCredentials } from "@/lib/basicAuth";

// POST /api/auth/login { username, password, remember? }
// Dwa tryby, jeden formularz (/login):
//  - Basic (produkcja dziś): login i hasło ze zmiennych środowiskowych
//    (lib/basicAuth.ts); sesja z mode "basic";
//  - AUTH_MODE=accounts: tabela AppUser.
// „remember" (domyślnie TAK): ciasteczko na 365 dni — urządzenie nie pyta
// więcej o hasło. Bez „remember": ciasteczko sesyjne (znika po zamknięciu
// przeglądarki), token ważny 14 dni. Ciasteczko jest httpOnly (niedostępne
// dla JS) i przy każdym żądaniu weryfikowane z aktualną listą kont.
function setSessionCookie(res: ReturnType<typeof NextResponse.json>, token: string, remember: boolean) {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_TTL_SECONDS } : {})
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const remember = body?.remember !== false;
  if (!username || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  if (!isAccountsMode()) {
    if (!basicAuthConfigured()) {
      return NextResponse.json({ error: "auth_mode_disabled" }, { status: 404 });
    }
    const limitKey = clientKeyForRequest(req, username);
    const limit = checkLoginAttempt(limitKey);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "too_many_attempts", retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      );
    }
    const user = verifyBasicCredentials(username, password);
    if (!user) {
      recordLoginFailure(limitKey);
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    recordLoginSuccess(limitKey);
    const ttl = remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS;
    const payload: SessionPayload = {
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + ttl,
      mode: "basic"
    };
    const token = await createSessionToken(payload);
    if (!token) {
      return NextResponse.json({ error: "session_unavailable" }, { status: 500 });
    }
    const res = NextResponse.json({ username: user.username, role: user.role, remembered: remember });
    setSessionCookie(res, token, remember);
    return res;
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

  const exp = Math.floor(Date.now() / 1000) + (remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS);
  const token = await createSessionToken({ username: user.username, role: user.role, exp });
  if (!token) {
    // SESSION_SECRET nieustawiony/za krótki — patrz lib/session.ts.
    return NextResponse.json({ error: "session_unavailable" }, { status: 500 });
  }

  await prisma.appUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const res = NextResponse.json({ username: user.username, role: user.role, remembered: remember });
  setSessionCookie(res, token, remember);
  return res;
}
