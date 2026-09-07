import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME, isAccountsMode } from "@/lib/session";

// Proste zabezpieczenie dostępu (HTTP Basic Auth) — celowo NIE jest to
// pełny system logowania z kontami użytkowników i rolami w bazie danych,
// tylko zestaw niezależnych par login/hasło ustawiany przez zmienne
// środowiskowe w Railway:
//   APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD — główne konto (Kamil)
//   APP_BASIC_AUTH_EXTRA_USERS — dodatkowe konta z PEŁNYM dostępem, format:
//     "login1:haslo1,login2:haslo2" (np. dla Jerzego)
//   APP_BASIC_AUTH_RESTRICTED_USERS — konta z dostępem OGRANICZONYM (bez
//     wglądu w wynagrodzenia pracowników — patrz lib/access.ts), ten sam
//     format co wyżej (np. dla Grzegorza, Macieja, Michała, Magdaleny)
//
// Na poziomie samego middleware wszystkie trzy grupy kont przechodzą
// identycznie (middleware tylko sprawdza, czy login+hasło się zgadzają) —
// faktyczne ukrywanie wynagrodzeń dla kont z listy "restricted" dzieje się
// w warstwie aplikacji (app/api/bootstrap i frontend), bo middleware nie
// ma dostępu do bazy danych, a tylko tam wiadomo, co jest "wynagrodzeniem".
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

// Ścieżki, które muszą być dostępne BEZ zalogowania w trybie
// AUTH_MODE=accounts — inaczej nikt nigdy by się nie zalogował (strona
// logowania i jej API) albo popsułyby się rzeczy niekrytyczne (manifest/
// service worker/ikony PWA — ich zablokowanie nie ujawnia żadnych danych,
// tylko psułoby "dodaj do ekranu głównego" dla niezalogowanych).
const PUBLIC_PATHS_IN_ACCOUNTS_MODE = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/manifest.json",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png"
];

async function handleAccountsMode(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS_IN_ACCOUNTS_MODE.includes(pathname)) {
    return NextResponse.next();
  }

  const cookieHeader = req.headers.get("cookie");
  let token: string | undefined;
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      if (k === SESSION_COOKIE_NAME) {
        token = decodeURIComponent(part.slice(idx + 1).trim());
        break;
      }
    }
  }

  const session = await verifySessionToken(token);
  if (session) {
    return NextResponse.next();
  }

  // Zasoby API bez ważnej sesji — czysta odpowiedź JSON 401 (tak jak
  // reszta API tej aplikacji), a nie przekierowanie (przekierowanie
  // fetch-a na stronę HTML tylko psułoby wywołania z frontendu).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(req: NextRequest) {
  // Tryb kont (AUTH_MODE=accounts) — patrz lib/session.ts. Domyślnie
  // (zmienna nieustawiona) ta gałąź w ogóle się nie wykonuje i cała reszta
  // tego pliku (Basic Auth) działa dokładnie tak jak dotychczas.
  if (isAccountsMode()) {
    return handleAccountsMode(req);
  }

  const primaryUser = process.env.APP_BASIC_AUTH_USER;
  const primaryPass = process.env.APP_BASIC_AUTH_PASSWORD;

  if (!primaryUser || !primaryPass) {
    return NextResponse.next();
  }

  const extraUsers = parseExtraUsers(process.env.APP_BASIC_AUTH_EXTRA_USERS);
  const restrictedUsers = parseExtraUsers(process.env.APP_BASIC_AUTH_RESTRICTED_USERS);

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
      if (restrictedUsers[suppliedUser] && restrictedUsers[suppliedUser] === suppliedPass) {
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
