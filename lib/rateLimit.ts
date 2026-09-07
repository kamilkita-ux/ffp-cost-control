// Prosty licznik nieudanych prób logowania (tryb AUTH_MODE=accounts) —
// obrona przed brute-force zgadywaniem haseł. Celowo w pamięci procesu
// (bez nowej tabeli w bazie): to wewnętrzne narzędzie dla kilku osób, nie
// publiczny serwis — nawet prosty limit "kilka prób na kilkanaście minut"
// realnie odstrasza automatyczne zgadywanie, a restart serwera zerujący
// licznik nie jest tu praktycznym ryzykiem.
//
// Klucz to zwykle "adres IP + podany login", żeby jedna pomyłkowa próba
// właściciela konta nie blokowała innych, i żeby atakujący zgadujący wiele
// loginów z jednego adresu też trafiał na limit.
interface Entry {
  count: number;
  windowStartedAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, Entry>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minut
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000; // 5 minut blokady po przekroczeniu limitu

// Sprzątanie starych wpisów, żeby Map nie rosła bez końca (wystarczy przy
// każdym wywołaniu sprawdzić garść losowych/najstarszych — tu prościej:
// przy każdym zapisie usuwamy wpisy, których okno dawno wygasło).
function sweep(now: number) {
  for (const [key, entry] of attempts) {
    if (now - entry.windowStartedAt > WINDOW_MS && now > entry.lockedUntil) {
      attempts.delete(key);
    }
  }
}

export function checkLoginAttempt(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStartedAt > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStartedAt: now, lockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_MS;
  }
}

export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}

export function clientKeyForRequest(req: Request, username: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${ip}:${username.toLowerCase()}`;
}
