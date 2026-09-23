import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, createSessionToken, SESSION_COOKIE_NAME, REMEMBER_TTL_SECONDS, isAccountsMode } from "@/lib/session";
import { basicAuthConfigured, basicUserByName, decodeBasicHeader, verifyBasicCredentials } from "@/lib/basicAuth";

// Proste zabezpieczenie dostępu — konta to pary login/hasło ustawiane
// przez zmienne środowiskowe w Railway (bez tabeli użytkowników; logika
// kont w lib/basicAuth.ts). Od 2026-09-23 logowanie odbywa się przez
// własny formularz /login i zapamiętane ciasteczko (365 dni na urządzeniu),
// a nagłówek HTTP Basic jest dalej honorowany dla zgodności:
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

function readSessionCookie(req: NextRequest): string | undefined {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

// Tryb Basic (produkcja dziś) z zapamiętanym logowaniem (2026-09-23):
//  1. ważne ciasteczko sesji (mode "basic") i login wciąż na liście → przepuść;
//  2. nagłówek Authorization: Basic z poprawnym hasłem (curl, stare
//     zakładki, przeglądarka, która jeszcze pamięta dawny monit) → przepuść
//     i przy okazji ustaw ciasteczko, żeby to urządzenie już nie pytało;
//  3. brak jednego i drugiego → API dostaje 401 JSON, strona trafia na
//     własny formularz /login (zamiast systemowego okienka przeglądarki,
//     które na telefonie/iPadzie w trybie „dodaj do ekranu głównego" nie
//     pamiętało hasła i pytało za każdym razem).
async function handleBasicMode(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS_IN_ACCOUNTS_MODE.includes(pathname)) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(readSessionCookie(req));
  if (session && session.mode === "basic" && basicUserByName(session.username)) {
    return NextResponse.next();
  }

  const creds = decodeBasicHeader(req.headers.get("authorization"));
  if (creds) {
    const user = verifyBasicCredentials(creds.username, creds.password);
    if (user) {
      const res = NextResponse.next();
      const exp = Math.floor(Date.now() / 1000) + REMEMBER_TTL_SECONDS;
      const token = await createSessionToken({ username: user.username, role: user.role, exp, mode: "basic" });
      if (token) {
        res.cookies.set(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: REMEMBER_TTL_SECONDS
        });
      }
      return res;
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  return NextResponse.redirect(loginUrl);
}

export async function middleware(req: NextRequest) {
  // Tryb kont (AUTH_MODE=accounts) — patrz lib/session.ts. Domyślnie
  // (zmienna nieustawiona) ta gałąź w ogóle się nie wykonuje.
  if (isAccountsMode()) {
    return handleAccountsMode(req);
  }

  // Tryb Basic: bez ustawionych zmiennych głównego konta middleware nic
  // nie blokuje (włączenie/wyłączenie ochrony = zmienne w Railway).
  if (!basicAuthConfigured()) {
    return NextResponse.next();
  }
  return handleBasicMode(req);
}

export const config = {
  // Chroni wszystko poza zasobami statycznymi Next.js (nie ma tam żadnych
  // danych — blokowanie ich tylko psułoby wygląd strony logowania/błędu).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
