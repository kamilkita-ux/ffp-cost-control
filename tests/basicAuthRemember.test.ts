// Zapamiętane logowanie w trybie Basic (2026-09-23): lib/basicAuth.ts,
// wyprowadzony sekret w lib/session.ts i zachowanie middleware.ts
// (ciasteczko → przepuść; nagłówek Basic → przepuść i ustaw ciasteczko;
// nic → 401 dla API / przekierowanie na /login dla strony).
//
// Zmienne ustawiamy PRZED importami — lib/session.ts czyta process.env
// przy każdym wywołaniu, middleware też.
delete process.env.SESSION_SECRET;
delete process.env.AUTH_MODE;
process.env.APP_BASIC_AUTH_USER = "admin";
process.env.APP_BASIC_AUTH_PASSWORD = "tajne-haslo-admina";
process.env.APP_BASIC_AUTH_EXTRA_USERS = "jerzy:haslo-jerzego";
process.env.APP_BASIC_AUTH_RESTRICTED_USERS = "maciej:haslo-macieja, grzegorz:ha:slo:z:dwukropkami";

import test from "node:test";
import assert from "node:assert/strict";
import "./stubs/useNextStub";

import {
  parseUserPairs,
  verifyBasicCredentials,
  basicUserByName,
  decodeBasicHeader,
  deriveBasicSecret,
  basicAuthConfigured
} from "../lib/basicAuth";
import { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from "../lib/session";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

test("parseUserPairs — pary login:hasło, hasło może mieć dwukropki, białe znaki obcinane", () => {
  const m = parseUserPairs("a:1, b:x:y:z ,,bez-dwukropka, :pusty-login");
  assert.deepEqual(m, { a: "1", b: "x:y:z" });
});

test("verifyBasicCredentials — główne konto = admin/full, extra = full, restricted = restricted", () => {
  assert.deepEqual(verifyBasicCredentials("admin", "tajne-haslo-admina"), { username: "admin", role: "full", admin: true });
  assert.deepEqual(verifyBasicCredentials("jerzy", "haslo-jerzego"), { username: "jerzy", role: "full", admin: false });
  assert.deepEqual(verifyBasicCredentials("maciej", "haslo-macieja"), { username: "maciej", role: "restricted", admin: false });
  assert.deepEqual(verifyBasicCredentials("grzegorz", "ha:slo:z:dwukropkami"), { username: "grzegorz", role: "restricted", admin: false });
  assert.equal(verifyBasicCredentials("admin", "zle"), null);
  assert.equal(verifyBasicCredentials("admin", ""), null);
  assert.equal(verifyBasicCredentials("nieznany", "cokolwiek"), null);
  assert.equal(basicAuthConfigured(), true);
});

test("basicUserByName — rola z bieżącej listy; login usunięty ze zmiennych = brak konta", () => {
  assert.equal(basicUserByName("maciej")?.role, "restricted");
  assert.equal(basicUserByName("admin")?.admin, true);
  const saved = process.env.APP_BASIC_AUTH_RESTRICTED_USERS;
  process.env.APP_BASIC_AUTH_RESTRICTED_USERS = "grzegorz:x";
  try {
    assert.equal(basicUserByName("maciej"), null);
  } finally {
    process.env.APP_BASIC_AUTH_RESTRICTED_USERS = saved;
  }
});

test("decodeBasicHeader — dzieli na pierwszym dwukropku, UTF-8, odrzuca śmieci", () => {
  assert.deepEqual(decodeBasicHeader("Basic " + b64("admin:ha:slo")), { username: "admin", password: "ha:slo" });
  assert.deepEqual(decodeBasicHeader("Basic " + b64("zażółć:gęślą")), { username: "zażółć", password: "gęślą" });
  assert.equal(decodeBasicHeader("Bearer abc"), null);
  assert.equal(decodeBasicHeader("Basic " + b64("bezdwukropka")), null);
  assert.equal(decodeBasicHeader("Basic %%%"), null);
  assert.equal(decodeBasicHeader(null), null);
});

test("sekret wyprowadzony z haseł — token działa bez SESSION_SECRET, zmiana hasła unieważnia tokeny", async () => {
  assert.ok(deriveBasicSecret());
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await createSessionToken({ username: "admin", role: "full", exp, mode: "basic" });
  assert.ok(token, "token powinien powstać z sekretu wyprowadzonego z haseł");
  const ok = await verifySessionToken(token);
  assert.equal(ok?.username, "admin");
  assert.equal(ok?.mode, "basic");

  const saved = process.env.APP_BASIC_AUTH_PASSWORD;
  process.env.APP_BASIC_AUTH_PASSWORD = "nowe-haslo-po-zmianie";
  try {
    assert.equal(await verifySessionToken(token), null, "stary token po zmianie hasła musi być nieważny");
  } finally {
    process.env.APP_BASIC_AUTH_PASSWORD = saved;
  }
  assert.equal((await verifySessionToken(token))?.username, "admin");
});

test("sekret wyprowadzony — NIE w trybie kont (tam wymagany jawny SESSION_SECRET)", async () => {
  process.env.AUTH_MODE = "accounts";
  try {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    assert.equal(await createSessionToken({ username: "x", role: "full", exp }), null);
  } finally {
    delete process.env.AUTH_MODE;
  }
});

function readSetCookie(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  return raw;
}

test("middleware — bez ciasteczka i nagłówka: strona → /login?next=, API → 401 JSON", async () => {
  const page = await middleware(new NextRequest("https://app.test/?x=1"));
  assert.equal(page.status, 307);
  const loc = new URL(page.headers.get("location")!);
  assert.equal(loc.pathname, "/login");
  assert.equal(loc.searchParams.get("next"), "/?x=1");

  const api = await middleware(new NextRequest("https://app.test/api/bootstrap"));
  assert.equal(api.status, 401);
  assert.equal(api.headers.get("www-authenticate"), null, "koniec z systemowym okienkiem przeglądarki");
  const body = await api.json();
  assert.equal(body.error, "not_authenticated");
});

test("middleware — strona logowania, jej API i pliki PWA są publiczne", async () => {
  for (const path of ["/login", "/api/auth/login", "/api/auth/me", "/manifest.json", "/sw.js", "/icon-192.png"]) {
    const res = await middleware(new NextRequest("https://app.test" + path));
    assert.notEqual(res.status, 307, path + " nie powinno przekierowywać");
    assert.notEqual(res.status, 401, path + " nie powinno dawać 401");
  }
});

test("middleware — ważne ciasteczko sesji (mode basic) przepuszcza; login spoza listy nie", async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await createSessionToken({ username: "maciej", role: "restricted", exp, mode: "basic" });
  const ok = await middleware(new NextRequest("https://app.test/api/bootstrap", { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } }));
  assert.equal(ok.status, 200);

  const ghost = await createSessionToken({ username: "byly-pracownik", role: "full", exp, mode: "basic" });
  const denied = await middleware(new NextRequest("https://app.test/api/bootstrap", { headers: { cookie: `${SESSION_COOKIE_NAME}=${ghost}` } }));
  assert.equal(denied.status, 401);

  const accountsToken = await createSessionToken({ username: "admin", role: "full", exp }); // bez mode — sesja z bazy
  const wrongMode = await middleware(new NextRequest("https://app.test/api/bootstrap", { headers: { cookie: `${SESSION_COOKIE_NAME}=${accountsToken}` } }));
  assert.equal(wrongMode.status, 401, "ciasteczko trybu kont nie loguje w trybie Basic");
});

test("middleware — nagłówek Basic z dobrym hasłem przepuszcza I zapamiętuje (ustawia ciasteczko na rok)", async () => {
  const res = await middleware(new NextRequest("https://app.test/", { headers: { authorization: "Basic " + b64("admin:tajne-haslo-admina") } }));
  assert.equal(res.status, 200);
  const cookie = readSetCookie(res);
  assert.ok(cookie && cookie.startsWith(SESSION_COOKIE_NAME + "="), "powinno ustawić ciasteczko sesji");
  assert.match(cookie!, /HttpOnly/i);
  assert.match(cookie!, /Max-Age=31536000/i);
  const token = decodeURIComponent(cookie!.split(";")[0].slice(SESSION_COOKIE_NAME.length + 1));
  const payload = await verifySessionToken(token);
  assert.equal(payload?.username, "admin");
  assert.equal(payload?.mode, "basic");

  const bad = await middleware(new NextRequest("https://app.test/", { headers: { authorization: "Basic " + b64("admin:zle") } }));
  assert.equal(bad.status, 307);
});

test("middleware — bez zmiennych głównego konta nic nie blokuje (jak dotąd)", async () => {
  const savedU = process.env.APP_BASIC_AUTH_USER;
  delete process.env.APP_BASIC_AUTH_USER;
  try {
    const res = await middleware(new NextRequest("https://app.test/api/bootstrap"));
    assert.equal(res.status, 200);
  } finally {
    process.env.APP_BASIC_AUTH_USER = savedU;
  }
});
