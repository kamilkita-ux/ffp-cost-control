import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Proste zabezpieczenie dostępu (HTTP Basic Auth) — celowo NIE jest to
// pełny system logowania z kontami użytkowników, tylko jedna wspólna
// nazwa/hasło dla całej aplikacji, ustawiane przez zmienne środowiskowe
// APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD w Railway.
//
// Jeśli te zmienne nie są ustawione, middleware nic nie blokuje — dzięki
// temu włączenie/wyłączenie ochrony to tylko dodanie/usunięcie zmiennych
// w Railway, bez zmiany kodu i bez ryzyka zablokowania się na starcie.
export function middleware(req: NextRequest) {
  const user = process.env.APP_BASIC_AUTH_USER;
  const pass = process.env.APP_BASIC_AUTH_PASSWORD;

  if (!user || !pass) {
    return NextResponse.next();
  }

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
      if (suppliedUser === user && suppliedPass === pass) {
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
