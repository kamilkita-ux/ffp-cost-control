import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Proste zabezpieczenie dostępu (HTTP Basic Auth) — celowo NIE jest to
// pełny system logowania z kontami użytkowników i rolami, tylko zestaw
// niezależnych par login/hasło (każda osoba ma swoje własne, ale wszystkie
// dają ten sam, pełny dostęp do aplikacji), ustawiany przez zmienne
// środowiskowe w Railway:
//   APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD — główne konto (Kamil)
//   APP_BASIC_AUTH_EXTRA_USERS — dodatkowe konta, format:
//     "login1:haslo1,login2:haslo2" (np. dla Jerzego i Grzegorza)
//
// Jeśli główne zmienne nie są ustawione, middleware nic nie blokuje —
// dzięki temu włączenie/wyłączenie ochrony to tylko dodanie/usunięcie
// zmiennych w Railway, bez zmiany kodu i bez ryzyka zablokowania się na
// starcie.
function parseExtraUsers(raw: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw) return map;
  raw.split(",").forEach((pair) => {
    const idx = pair.indexOf(":");
    if (idx === -1) return;
    const u = pair.slice(0, idx).trim();
    const p = pair.slice(idx + 1).trim();
    if (u && p) map[u] = p;
  });
  return map;
}

export function middleware(req: NextRequest) {
  const primaryUser = process.env.APP_BASIC_AUTH_USER;
  const primaryPass = process.env.APP_BASIC_AUTH_PASSWORD;

  if (!primaryUser || !primaryPass) {
    return NextResponse.next();
  }

  const extraUsers = parseExtraUsers(process.env.APP_BASIC_AUTH_EXTRA_USERS);

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6);
    let decoded = "";
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf-8");
    } catch {
      decoded = "";
    }
    const sepIdx = decoded.indexOf(":");
    if (sepIdx !== -1) {
      const suppliedUser = decoded.slice(0, sepIdx);
      const suppliedPass = decoded.slice(sepIdx + 1);
      if (suppliedUser === primaryUser && suppliedPass === primaryPass) {
        return NextResponse.next();
      }
      if (extraUsers[suppliedUser] && extraUsers[suppliedUser] === suppliedPass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Autoryzacja wymagana — FFP Cost Control.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="FFP Cost Control", charset="UTF-8"'
    }
  });
}

export const config = {
  // Chroni wszystko poza zasobami statycznymi Next.js (nie ma tam żadnych
  // danych — blokowanie ich tylko psułoby wygląd strony logowania/błędu).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
