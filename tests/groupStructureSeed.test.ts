// Spójność domyślnej struktury grupy (lib/groupStructureSeed.ts): unikalne id,
// każdy udział wskazuje na istniejące spółki, udziały każdej spółki w grupie
// sumują się do 100%, jest dokładnie jedna spółka-matka.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GROUP_STRUCTURE as G } from "../lib/groupStructureSeed";

test("unikalne id spółek i dokładnie jedna spółka-matka", () => {
  const ids = G.entities.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(G.entities.filter((e) => e.kind === "parent").length, 1);
});

test("każdy udział wskazuje na istniejące spółki", () => {
  const ids = new Set(G.entities.map((e) => e.id));
  for (const sh of G.shares) {
    assert.ok(ids.has(sh.owner), `nieznany właściciel ${sh.owner}`);
    assert.ok(ids.has(sh.owned), `nieznana spółka ${sh.owned}`);
  }
});

test("udziały każdej spółki w grupie (poza matką) sumują się do 100%", () => {
  for (const e of G.entities) {
    if (e.kind !== "company") continue;
    const sum = G.shares.filter((s) => s.owned === e.id).reduce((a, s) => a + s.pct, 0);
    assert.equal(sum, 100, `${e.name}: ${sum}%`);
  }
});

test("udział efektywny FFP: Farmy 74%, F7 59,9%", () => {
  const eff: Record<string, number> = { ffp: 1 };
  const calc = (id: string): number => {
    if (eff[id] !== undefined) return eff[id];
    const owners = G.shares.filter((s) => s.owned === id);
    const v = owners.reduce((a, s) => {
      const o = G.entities.find((x) => x.id === s.owner)!;
      return o.kind === "external" ? a : a + calc(s.owner) * s.pct / 100;
    }, 0);
    eff[id] = v; return v;
  };
  assert.equal(Math.round(calc("farmy") * 1000) / 10, 74);
  assert.equal(Math.round(calc("f1") * 1000) / 10, 74);
  assert.equal(Math.round(calc("es54") * 1000) / 10, 66.6);
  assert.equal(Math.round(calc("f7") * 1000) / 10, 59.9);
});
