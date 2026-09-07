import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/authSession";

// GET /api/auth/me — kim jestem zalogowany (tryb AUTH_MODE=accounts).
// Zwraca 200 z null, jeśli nie ma ważnej sesji (nie 401 — to nie jest
// endpoint chroniony, tylko informacyjny, wołany np. do pokazania
// "zalogowano jako..." w interfejsie).
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, username: session.username, role: session.role });
}
