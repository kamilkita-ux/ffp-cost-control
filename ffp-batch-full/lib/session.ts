// Podpisywane tokeny sesji (do ciasteczka) — alternatywa dla Basic Auth,
// aktywna tylko gdy AUTH_MODE=accounts (patrz middleware.ts). Token to
// base64url(JSON payloadu) + "." + base64url(podpis HMAC-SHA256) — bez
// żadnej zewnętrznej biblioteki JWT.
//
// CELOWO używa Web Crypto (globalne "crypto.subtle"), a NIE modułu Node
// "crypto" — ten plik jest importowany też przez middleware.ts, które w
// Next.js domyślnie działa w środowisku Edge (ograniczony zestaw API, bez
// modułu "crypto" z Node). Web Crypto działa identycznie w Edge i w
// zwykłych route handlerach Node — jeden kod, wszędzie działa tak samo.
export interface SessionPayload {
  username: string;
  role: string; // "full" | "restricted"
  exp: number; // unix seconds
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(sig));
}

// Bez SESSION_SECRET świadomie NIE generujemy ani nie akceptujemy żadnych
// tokenów — lepiej, żeby tryb kont po prostu nie działał (i middleware
// spadnie z powrotem na "brak dostępu"), niż podpisywać sesje sekretem
// domyślnym/pustym, który każdy mógłby odgadnąć.
function getSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

export async function createSessionToken(payload: SessionPayload): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await sign(body, secret);
  return `${body}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = await sign(body, secret);
  // Porównanie w stałym czasie (długość jest tu stała — base64url HMAC-SHA256
  // zawsze ma tę samą długość — więc zwykłe porównanie znak-po-znaku
  // poprzez zbudowanie dwóch takiej samej długości bufforów jest bezpieczne).
  if (sig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.username || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "ffp_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 dni

export function isAccountsMode(): boolean {
  return process.env.AUTH_MODE === "accounts";
}
