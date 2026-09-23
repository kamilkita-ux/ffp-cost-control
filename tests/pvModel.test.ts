// Test odczytu pliku eksportu Grzegorza (pv-budget-dane_2026-09-23.json) —
// prawdziwy plik jako fixture: normalizacja, przeliczenia, dopasowanie nazw,
// wykrywanie wariantów/kopii, harmonogram etapów, raty (malejąca / stała).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePvModel, annualRevenueYear1, monthlyRevenueAvg, opexLines, financingSpecs, stageSchedule, suggestProjectMatch, shortFarmName, looksLikeVariant, firstInstallment } from "../lib/pvModel";

const HERE = dirname(fileURLToPath(import.meta.url));
const model = normalizePvModel(JSON.parse(readFileSync(join(HERE, "fixtures/pv-budget-dane_2026-09-23.json"), "utf-8")));
const byLabel = (re: RegExp) => model.farms.find((f) => re.test(f.label))!;

test("plik Grzegorza: 11 farm, koszty stałe, zaznaczenie", () => {
  assert.equal(model.farms.length, 11);
  assert.equal(model.exportedAt, "2026-09-23T07:15:54.256Z");
  assert.ok(model.fixedCosts && model.fixedCosts.monthlyCurrent === 138638 && model.fixedCosts.monthlyFuture === 214638);
  assert.ok(model.selectedIds.length >= 5);
});

test("Wylewa 15 MW: przychód rok 1, CAPEX, transze 4×25%, oprocentowanie WIBOR+marża, pierwsza rata po karencji", () => {
  const w = byLabel(/Wylewa/);
  assert.equal(w.mwPower, 15);
  assert.equal(annualRevenueYear1(w), Math.round(15 * 1050 * (390 + 2.5)));
  assert.equal(w.capexTotal, 24990001);
  const [fin] = financingSpecs(w, "Wylewa");
  assert.equal(fin.principal, Math.round(24990001 * 0.83));
  assert.equal(fin.ratePct, 5.01);
  assert.equal(fin.graceMonths, 9);
  assert.equal(fin.startISO, "2027-03-01");
  assert.equal(fin.firstInstallmentISO, "2027-12-01");
  assert.equal(fin.endISO, "2037-11-01");
  assert.deepEqual(fin.tranches!.map((t) => t.pct), [25, 50, 75, 100]);
  assert.equal(fin.monthlyPayment, Math.round(fin.principal / 120 + fin.principal * 0.0501 / 12));
});

test("Miejsce Piastowe: istniejący dług 4 211 560 zł, rata stała (annuitetowa) 6,724%, dzierżawa rocznie w lutym", () => {
  const mp = byLabel(/Miejsce Piastowe/);
  const [fin] = financingSpecs(mp, "Miejsce Piastowe");
  assert.equal(fin.outstanding, true);
  assert.equal(fin.principal, 4211560);
  assert.equal(fin.type, "stala");
  assert.equal(fin.ratePct, 6.724);
  assert.equal(fin.monthlyPayment, firstInstallment(4211560, 6.724, 10, "stala"));
  assert.ok(fin.monthlyPayment > 47000 && fin.monthlyPayment < 49500);
  const lines = opexLines(mp, "Miejsce Piastowe");
  const lease = lines.find((l) => /Dzierżawa/.test(l.name))!;
  assert.equal(lease.recurrence, "ROCZNY");
  assert.equal(lease.amount, 26000);
  assert.equal(lease.costDate, "2027-02-01");
  assert.equal(lines.find((l) => /O&M/.test(l.name))!.amount, 5000);
});

test("dopasowanie nazw i warianty: Podkarpackie 5x1 -> Lubelskie 4x1, Opole 4x1 -> Opole 5x1, kopie i warianty oznaczone, Zaleszany nowa", () => {
  const projects = [{ id: "1", name: "Dębowiec" }, { id: "6", name: "Lubelskie 4x1 MW" }, { id: "7", name: "Opole 5x1 MW" }, { id: "8", name: "Skrzypaczowice" }, { id: "14", name: "Miejsce Piastowe — BESS 2 MW" }];
  assert.equal(suggestProjectMatch("1 ETAP PV Podkarpackie 5x1 MW", projects)!.id, "6");
  assert.equal(suggestProjectMatch("1 ETAP Opole 4x1 MW", projects)!.id, "7");
  assert.equal(suggestProjectMatch("2 ETAP Szkrzypaczowice 3 MW  (kopia)", projects)!.id, "8");
  assert.equal(suggestProjectMatch("1 ETAP PV Zaleszany 1MW", projects), null);
  assert.equal(shortFarmName("1 ETAP PV Dębowiec 1 MW"), "Dębowiec");
  assert.equal(shortFarmName("2 ETAP Szkrzypaczowice 3 MW  (kopia)".replace(/\s+/g, " ")), "Szkrzypaczowice");
  assert.equal(looksLikeVariant(byLabel(/Opole 15x1/), model.farms)?.startsWith("wariant"), true);
  assert.equal(looksLikeVariant(byLabel(/Opole 1 MW/), model.farms)?.startsWith("wariant"), true);
  assert.equal(looksLikeVariant(byLabel(/Opole 4x1/), model.farms), null);
  assert.equal(looksLikeVariant(byLabel(/kopia/), model.farms), "kopia");
});

test("etapy rozwoju: Wylewa — projekt 4 mies. od 2026-10, budowa 6, odbiór 2 -> koniec 2027-10 = uruchomienie", () => {
  const w = byLabel(/Wylewa/);
  const st = stageSchedule(w);
  const build = st.find((s) => s.label === "Budowa")!;
  assert.equal(build.startISO, "2027-02-01");
  assert.equal(build.endISO, "2027-08-01");
  assert.equal(st[st.length - 1].endISO, "2027-10-01");
});

test("przychód miesięczny = rok 1 / 12; profil sumuje się do ~100%", () => {
  const d = byLabel(/Dębowiec/);
  assert.equal(monthlyRevenueAvg(d), Math.round(annualRevenueYear1(d) / 12));
  const sum = d.monthlyProfilePct.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 100) < 0.5, "profil " + sum);
});
