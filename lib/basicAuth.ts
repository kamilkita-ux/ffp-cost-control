// Konta ze zmiennych środowiskowych (dzisiejszy tryb logowania na produkcji)
// — jedna, wspólna logika dla middleware.ts (środowisko Edge) i dla
// /api/auth/login (Node). Ten plik CELOWO nie importuje niczego z Node
// (Buffer, crypto, prisma) — middleware nie ma do tego dostępu.
//
// Zmienne (patrz komentarz w middleware.ts):
//   APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD — główne konto (Kamil, admin)
//   APP_BASIC_AUTH_EXTRA_USERS      — "login:haslo,login2:haslo2", pełny dostęp
//   APP_BASIC_AUTH_RESTRICTED_USERS — jak wyżej, dostęp ograniczony (bez wynagrodzeń)
//
// „Zapamiętane logowanie" (2026-09-23): po jednym poprawnym logowaniu
// (formularz /login albo stary nagłówek Basic) urządzenie dostaje podpisane
// ciasteczko sesji na 365 dni (lib/session.ts, mode: "basic") i nie pyta
// więcej o hasło. Ciasteczko przy każdym żądaniu jest sprawdzane z bieżącą
// listą kont — usunięcie loginu ze zmiennych odcina to urządzenie od razu,
// a zmiana któregokolwiek hasła unieważnia wszystkie ciasteczka (sekret
// podpisu jest z nich wyprowadzany, gdy nie ma SESSION_SECRET — patrz
// deriveBasicSecret).

export type BasicRole = "full" | "restricted";

export interface BasicUser {
  username: string;
  role: BasicRole;
  // Tylko główne konto (APP_BASIC_AUTH_USER) zarządza kontami, importami
  // i ustawieniami administracyjnymi — tak jak dotąd (lib/access.ts).
  admin: boolean;
}

type Env = Record<string, string | undefined>;

export function parseUserPairs(raw: string | undefined): Record<string, string> {
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

export function basicAuthConfigured(env: Env = process.env): boolean {
  return !!(env.APP_BASIC_AUTH_USER && env.APP_BASIC_AUTH_PASSWORD);
}

interface Found {
  user: BasicUser;
  password: string;
}

function findUser(username: string, env: Env): Found | null {
  if (!username) return null;
  const primaryUser = env.APP_BASIC_AUTH_USER;
  const primaryPass = env.APP_BASIC_AUTH_PASSWORD;
  if (!primaryUser || !primaryPass) return null;
  if (username === primaryUser) {
    return { user: { username, role: "full", admin: true }, password: primaryPass };
  }
  const extra = parseUserPairs(env.APP_BASIC_AUTH_EXTRA_USERS);
  if (extra[username]) {
    return { user: { username, role: "full", admin: false }, password: extra[username] };
  }
  const restricted = parseUserPairs(env.APP_BASIC_AUTH_RESTRICTED_USERS);
  if (restricted[username]) {
    return { user: { username, role: "restricted", admin: false }, password: restricted[username] };
  }
  return null;
}

// Porównanie w stałym czasie (długość i tak nie jest tajemnicą).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Login + hasło → konto (albo null). Używane przez formularz logowania
// i przez middleware dla starego nagłówka Authorization: Basic.
export function verifyBasicCredentials(username: string, password: string, env: Env = process.env): BasicUser | null {
  const found = findUser(username, env);
  if (!found) return null;
  if (!safeEqual(found.password, password)) return null;
  return found.user;
}

// Sam login → konto z AKTUALNEJ listy (bez hasła) — do sprawdzania
// zapamiętanego ciasteczka: rola i uprawnienia admina zawsze z bieżących
// zmiennych, nigdy z treści tokenu.
export function basicUserByName(username: string, env: Env = process.env): BasicUser | null {
  const found = findUser(username, env);
  return found ? found.user : null;
}

// "Basic base64(login:haslo)" → { username, password } (UTF-8), albo null.
// Hasło może zawierać dwukropek — dzielimy tylko na pierwszym.
export function decodeBasicHeader(header: string | null | undefined): { username: string; password: string } | null {
  if (!header || !header.startsWith("Basic ")) return null;
  let decoded = "";
  try {
    const bin = atob(header.slice(6).trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
  const idx = decoded.indexOf(":");
  if (idx === -1) return null;
  const username = decoded.slice(0, idx);
  if (!username) return null;
  return { username, password: decoded.slice(idx + 1) };
}

// Sekret do podpisywania ciasteczek w trybie Basic, gdy Kamil nie ustawił
// osobnego SESSION_SECRET: wyprowadzony z kompletu loginów i haseł. Nie
// wycieka nigdzie (HMAC), a zmiana dowolnego hasła automatycznie wylogowuje
// wszystkie zapamiętane urządzenia — dokładnie tak, jak powinno być.
export function deriveBasicSecret(env: Env = process.env): string | null {
  if (!basicAuthConfigured(env)) return null;
  return [
    "ffp-basic-session-v1",
    env.APP_BASIC_AUTH_USER,
    env.APP_BASIC_AUTH_PASSWORD,
    env.APP_BASIC_AUTH_EXTRA_USERS || "",
    env.APP_BASIC_AUTH_RESTRICTED_USERS || ""
  ].join("|");
}
