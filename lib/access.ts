// Rozpoznawanie, czy zalogowany użytkownik ma dostęp OGRANICZONY (bez
// wglądu w wynagrodzenia pracowników) — na podstawie loginu z nagłówka
// Basic Auth, porównanego z listą w zmiennej środowiskowej
// APP_BASIC_AUTH_RESTRICTED_USERS (format "login1:haslo1,login2:haslo2",
// ten sam format co APP_BASIC_AUTH_EXTRA_USERS w middleware.ts).
//
// UWAGA — zakres tego ograniczenia (zaktualizowane 2026-09-07): od tej
// zmiany API /api/bootstrap NIE zwraca już kontom ograniczonym surowych
// kwot wynagrodzeń — są usuwane po stronie serwera (patrz
// lib/serverMetrics.ts: redactEmployeeSalary, redactFixedCostLineItem).
// Sumy zbiorcze (koszt projektu, wynik firmy, koszty działów), których
// te konta i tak używają, liczone są od razu na serwerze z pełnych
// danych (pole "serverMetrics" w odpowiedzi bootstrap) — więc dalej są
// poprawne, mimo że surowe kwoty per-pracownik już nie docierają do
// przeglądarki. To już jest realna bariera (nie tylko ukrycie w
// interfejsie) — ktoś zaglądający w devtools nie zobaczy tych kwot,
// bo ich po prostu nie ma w odpowiedzi API.
// WAŻNE: to działa w OBU trybach logowania (Basic Auth i, po przełączeniu,
// AUTH_MODE=accounts), żeby zabezpieczenie wynagrodzeń (isRestrictedUser)
// nigdy nie "wyłączyło się przypadkiem" tylko dlatego, że Kamil zmienił
// sposób logowania — patrz lib/session.ts / lib/authSession.ts.
import { getSessionFromRequest } from "./authSession";
import { prisma } from "./prisma";
import type { SessionPayload } from "./session";

// Token sesji jest samodzielnie podpisany (HMAC) i middleware.ts weryfikuje
// go BEZ odpytywania bazy (celowo — middleware biega w środowisku Edge,
// gdzie Prisma w ogóle nie działa, patrz middleware.ts). To oznacza, że
// sama poprawna sygnatura tokenu NIE jest wystarczającym dowodem, że konto
// wciąż powinno mieć dostęp — jeśli Kamil dezaktywuje albo usunie czyjeś
// konto, jego dotychczasowy podpisany token pozostałby ważny kryptograficznie
// jeszcze do 14 dni (SESSION_TTL_SECONDS), mimo że konto już nie istnieje.
// Dlatego na poziomie API (tu, gdzie Prisma już działa — Node.js runtime)
// każde użycie sesji dodatkowo sprawdza w bazie, czy konto nadal istnieje
// i jest aktywne — jeśli nie, sesja jest traktowana tak, jakby jej wcale
// nie było (użytkownik "wylogowany" najpóźniej przy pierwszym wywołaniu API
// po dezaktywacji, nie dopiero po wygaśnięciu tokenu).
export async function getVerifiedSession(req: Request): Promise<SessionPayload | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return null;
  try {
    const user = await prisma.appUser.findUnique({ where: { username: session.username } });
    if (!user || !user.active) return null;
    return session;
  } catch {
    // Baza chwilowo niedostępna — bezpieczniej potraktować sesję jako
    // nieważną (odmówić dostępu) niż zaufać samemu podpisowi tokenu.
    return null;
  }
}

function parseUserList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.split(":")[0]?.trim())
    .filter((u): u is string => !!u);
}

export async function currentLogin(req: Request): Promise<string> {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
      const idx = decoded.indexOf(":");
      if (idx !== -1) {
        const user = decoded.slice(0, idx);
        if (user) return user;
      }
    } catch {
      // ignoruj błędne nagłówki
    }
  }
  const session = await getVerifiedSession(req);
  if (session) return session.username;
  return "";
}

export async function isRestrictedUser(req: Request): Promise<boolean> {
  const session = await getVerifiedSession(req);
  if (session) return session.role === "restricted";
  const login = await currentLogin(req);
  if (!login) return false;
  const restrictedLogins = parseUserList(process.env.APP_BASIC_AUTH_RESTRICTED_USERS);
  return restrictedLogins.includes(login);
}

// Kto może zarządzać kontami w /api/admin/users (tworzyć/usuwać osoby,
// resetować hasła)? Główne konto Kamila (to samo, którym loguje się dziś
// przez Basic Auth — APP_BASIC_AUTH_USER) ALBO — po przełączeniu na
// AUTH_MODE=accounts — sesja z rolą "full". Dzięki temu nie ma problemu
// "z czego utworzyć pierwsze konto": Kamil zarządza kontami swoim
// dotychczasowym loginem, zanim jeszcze sam przejdzie na nowy system.
export async function isAdminCaller(req: Request): Promise<boolean> {
  const session = await getVerifiedSession(req);
  if (session) return session.role === "full";
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
      const idx = decoded.indexOf(":");
      const login = idx !== -1 ? decoded.slice(0, idx) : "";
      const primary = process.env.APP_BASIC_AUTH_USER;
      if (login && primary && login === primary) return true;
    } catch {
      // ignoruj błędne nagłówki
    }
  }
  return false;
}
