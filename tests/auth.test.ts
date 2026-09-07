// Testy dla warstwy bezpieczeństwa nowego (na razie wyłączonego) systemu
// kont: lib/passwords.ts, lib/session.ts, lib/rateLimit.ts — patrz komentarz
// w tests/serverMetrics.test.ts po wyjaśnienie ogólnej konwencji testów w
// tym projekcie (node:test + node:assert, bez zewnętrznego frameworka).
//
// SESSION_SECRET musi być ustawiony PRZED importem lib/session.ts, bo
// getSecret() czyta process.env przy każdym wywołaniu (nie tylko raz przy
// starcie) — ustawiamy go od razu na górze pliku.
process.env.SESSION_SECRET = "test-only-secret-do-not-use-in-prod!!";

import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, generateTempPassword } from "../lib/passwords";
import { createSessionToken, verifySessionToken } from "../lib/session";
import { checkLoginAttempt, recordLoginFailure, recordLoginSuccess, clientKeyForRequest } from "../lib/rateLimit";

test("hashPassword/verifyPassword — poprawne hasło przechodzi, złe nie", async () => {
  const hash = await hashPassword("bardzo-tajne-haslo-123");
  assert.equal(await verifyPassword("bardzo-tajne-haslo-123", hash), true);
  assert.equal(await verifyPassword("zle-haslo", hash), false);
});

test("hashPassword — to samo hasło daje inny hash za każdym razem (losowa sól)", async () => {
  const h1 = await hashPassword("takie-samo-haslo");
  const h2 = await hashPassword("takie-samo-haslo");
  assert.notEqual(h1, h2);
  // ale oba dalej poprawnie weryfikują to samo hasło
  assert.equal(await verifyPassword("takie-samo-haslo", h1), true);
  assert.equal(await verifyPassword("takie-samo-haslo", h2), true);
});

test("generateTempPassword — bez znaków mylących (0/O/1/l/I), poprawna długość", () => {
  for (let i = 0; i < 20; i++) {
    const pw = generateTempPassword();
    assert.equal(pw.length, 12);
    assert.equal(/[0O1lI]/.test(pw), false);
  }
});

test("createSessionToken/verifySessionToken — poprawny token wraca z tym samym payloadem", async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await createSessionToken({ username: "maciek", role: "restricted", exp });
  assert.ok(token, "token powinien powstać, gdy SESSION_SECRET jest ustawiony");
  const verified = await verifySessionToken(token);
  assert.deepEqual(verified, { username: "maciek", role: "restricted", exp });
});

test("verifySessionToken — odrzuca token po zmodyfikowaniu jednego znaku (naruszony podpis)", async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await createSessionToken({ username: "kamil", role: "full", exp });
  assert.ok(token);
  // Zamieniamy jeden znak w części z podpisem (po kropce) — token musi
  // zostać odrzucony, inaczej ktoś mógłby dowolnie zmieniać rolę/login.
  const tampered = token!.slice(0, -1) + (token!.slice(-1) === "a" ? "b" : "a");
  const verified = await verifySessionToken(tampered);
  assert.equal(verified, null);
});

test("verifySessionToken — odrzuca wygasły token", async () => {
  const expiredExp = Math.floor(Date.now() / 1000) - 10; // 10 sekund temu
  const token = await createSessionToken({ username: "kamil", role: "full", exp: expiredExp });
  const verified = await verifySessionToken(token);
  assert.equal(verified, null);
});

test("createSessionToken — bez SESSION_SECRET (lub za krótki) nie tworzy tokenu", async () => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "za-krotki"; // < 16 znaków
  try {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await createSessionToken({ username: "x", role: "full", exp });
    assert.equal(token, null);
  } finally {
    process.env.SESSION_SECRET = original;
  }
});

test("rateLimit — blokuje po 5 nieudanych próbach, resetuje po sukcesie", () => {
  const key = "203.0.113.5:testowyuser";
  for (let i = 0; i < 4; i++) {
    assert.equal(checkLoginAttempt(key).allowed, true, "próba " + (i + 1) + " powinna być dozwolona");
    recordLoginFailure(key);
  }
  // 5. nieudana próba — dopiero teraz przekracza limit i blokuje kolejne
  recordLoginFailure(key);
  const blocked = checkLoginAttempt(key);
  assert.equal(blocked.allowed, false);
  assert.ok((blocked.retryAfterSeconds || 0) > 0);

  // inny klucz (inny login/IP) nie jest objęty tą blokadą
  assert.equal(checkLoginAttempt("203.0.113.5:inny-login").allowed, true);

  recordLoginSuccess(key);
  assert.equal(checkLoginAttempt(key).allowed, true, "sukces powinien zresetować licznik");
});

test("clientKeyForRequest — łączy IP (z x-forwarded-for) i login (małe litery)", () => {
  const req = new Request("https://example.com/api/auth/login", {
    headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" }
  });
  assert.equal(clientKeyForRequest(req, "Kamil"), "198.51.100.7:kamil");
});
