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
  const session = await getSessionFromRequest(req);
  if (session) return session.username;
  return "";
}

export async function isRestrictedUser(req: Request): Promise<boolean> {
  const session = await getSessionFromRequest(req);
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
  const session = await getSessionFromRequest(req);
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
