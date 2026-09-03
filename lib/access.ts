// Rozpoznawanie, czy zalogowany użytkownik ma dostęp OGRANICZONY (bez
// wglądu w wynagrodzenia pracowników) — na podstawie loginu z nagłówka
// Basic Auth, porównanego z listą w zmiennej środowiskowej
// APP_BASIC_AUTH_RESTRICTED_USERS (format "login1:haslo1,login2:haslo2",
// ten sam format co APP_BASIC_AUTH_EXTRA_USERS w middleware.ts).
//
// UWAGA — zakres tego ograniczenia: to jest ukrycie na poziomie interfejsu
// (frontend nie renderuje kwot wynagrodzeń, API bootstrap i tak zwraca
// pełne dane, bo reszta wyliczeń — koszty projektów, zysk, cash burn —
// musi je uwzględniać, żeby były poprawne). Ktoś, kto celowo zajrzy w
// narzędzia deweloperskie przeglądarki i podejrzy surową odpowiedź API,
// nadal mógłby zobaczyć liczby. To rozwiązanie wystarcza do zwykłego
// korzystania z aplikacji, ale nie jest twardą barierą bezpieczeństwa —
// jeśli to ma znaczenie, potrzebna byłaby osobna, większa zmiana
// (przeniesienie wyliczeń na serwer).
function parseUserList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.split(":")[0]?.trim())
    .filter((u): u is string => !!u);
}

export function currentLogin(req: Request): string {
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
  return "";
}

export function isRestrictedUser(req: Request): boolean {
  const login = currentLogin(req);
  if (!login) return false;
  const restrictedLogins = parseUserList(process.env.APP_BASIC_AUTH_RESTRICTED_USERS);
  return restrictedLogins.includes(login);
}
