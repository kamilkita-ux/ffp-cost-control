// Test regresyjny na "pusty/uszkodzony plik czyści całą bazę" (znalezione
// 2026-09-08) — patrz lib/backupShape.ts. Sprawdza, że looksLikeRealBackup
// poprawnie odróżnia prawdziwy kształt eksportu bazy od przypadkowego JSON.
import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeRealBackup } from "../lib/backupShape";

test("looksLikeRealBackup — odrzuca pusty obiekt (nie czyści bazy bez pokrycia)", () => {
  assert.equal(looksLikeRealBackup({}), false);
});

test("looksLikeRealBackup — odrzuca obiekt z niepowiązanymi/błędnymi kluczami (np. literówka)", () => {
  assert.equal(looksLikeRealBackup({ employes: [], foo: 1 }), false);
});

test("looksLikeRealBackup — odrzuca null, undefined, tablicę, string, liczbę", () => {
  assert.equal(looksLikeRealBackup(null), false);
  assert.equal(looksLikeRealBackup(undefined), false);
  assert.equal(looksLikeRealBackup([]), false);
  assert.equal(looksLikeRealBackup("backup.json"), false);
  assert.equal(looksLikeRealBackup(42), false);
});

test("looksLikeRealBackup — akceptuje prawdziwy kształt eksportu, nawet z pustymi tablicami", () => {
  assert.equal(
    looksLikeRealBackup({
      departments: [], projects: [], vendors: [], employees: [],
      costs: [], contracts: [], financings: [], documents: []
    }),
    true
  );
});

test("looksLikeRealBackup — akceptuje, gdy PRZYNAJMNIEJ JEDEN oczekiwany klucz jest tablicą", () => {
  assert.equal(looksLikeRealBackup({ employees: [{ firstName: "Jan" }] }), true);
});
