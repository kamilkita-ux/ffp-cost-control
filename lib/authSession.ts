// Odczyt bieżącej sesji (tryb AUTH_MODE=accounts) z nagłówka Cookie —
// ręczne parsowanie, tak samo jak currentLogin() w lib/access.ts parsuje
// nagłówek Authorization, żeby nie dokładać zależności tylko do jednej,
// prostej rzeczy.
import { verifySessionToken, SESSION_COOKIE_NAME, type SessionPayload } from "./session";

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const cookies = parseCookies(req.headers.get("cookie"));
  return verifySessionToken(cookies[SESSION_COOKIE_NAME]);
}
