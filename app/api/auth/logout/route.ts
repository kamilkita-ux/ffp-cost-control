import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// POST /api/auth/logout — czyści ciasteczko sesji (oba tryby: zapamiętane
// logowanie Basic i AUTH_MODE=accounts). Urządzenie zapyta o hasło ponownie.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
