import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { PV_BUDGET_ENTRIES } from "@/lib/pvBudgetSeed";

// POST /api/admin/import-pv-budget — wczytuje model budżetowy z narzędzia
// "Budżet Farm PV" (Grzegorz) — patrz lib/pvBudgetSeed.ts.
//
// ZMIANA DECYZJI Kamila (2026-09-17, po wdrożeniu wersji "tylko referencyjnej"):
// dane Grzegorza są BIEŻĄCE — mają być GŁÓWNYMI/aktualnymi danymi tych 7 farm,
// NIE tylko dopiskiem obok prawdziwego portfela. Zakres ograniczony wyłącznie
// do tego, co faktycznie zawierają dane Grzegorza — reszta modułów (Pracownicy,
// Koszty stałe spółki, pozostałe 4 farmy spoza jego zestawu: Skrzypaczowice,
// Ziempniów, Kamyk, Pieczyska) NIE jest ruszana.
//
// Dla każdej z 7 pozycji:
//  - dopasowanie po nazwie (matchExistingProjectName) lub tworzenie nowego
//    projektu (Lubelskie 4x1 MW, Opole 5x1 MW);
//  - NADPISUJEMY mwPower, location, capex (=totalCapex), endDate (data
//    uruchomienia) i description danymi Grzegorza (stają się bieżącym stanem
//    projektu) — status NIE jest ruszany (Grzegorz go nie modeluje);
//  - USUWAMY istniejące finansowanie tej samej pozycji ze starego importu CF
//    Farmy.xlsx (rozpoznawane po tym, że lender NIE zaczyna się od "Model
//    budżetowy (Grzegorz)") — Kamil potwierdził: to ta sama pozycja
//    (finansowanie budowy PV danej farmy), świeższe dane Grzegorza ją
//    zastępują, żeby uniknąć podwójnego liczenia zadłużenia;
//  - tworzymy/aktualizujemy Financing Grzegorza jako BIEŻĄCE realne założenie
//    (excludeFromSimulation=false — liczy się do zadłużenia/cash-flow, bo to
//    już nie tylko model referencyjny, tylko aktualny stan wg Kamila).
//
// Zalecana kolejność: najpierw kliknąć "Scal duplikaty farm"
// (/api/admin/merge-duplicate-projects), potem ten import — ale ten
// endpoint sam jest idempotentny niezależnie od kolejności.
function monthName(m: number): string {
  const names = ["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
  return names[m - 1] || String(m);
}

function addMonths(year: number, month: number, add: number): Date {
  const d = new Date(Date.UTC(year, month - 1 + add, 1));
  return d;
}

export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let projectsCreated = 0;
  let projectsUpdated = 0;
  let financingsCreated = 0;
  let financingsUpdated = 0;
  let oldFinancingsReplaced = 0;
  const skipped: string[] = [];

  for (const e of PV_BUDGET_ENTRIES) {
    let projectId: string | null = null;
    const projectData = {
      location: e.location,
      mwPower: e.mwPower,
      capex: e.totalCapex,
      endDate: addMonths(e.commissioningYear, e.commissioningMonth, 0),
      description: `[Budżet Farm PV — Grzegorz, dane bieżące 2026-09-17] ${e.description}`
    };

    if (e.matchExistingProjectName) {
      const existing = await prisma.project.findFirst({
        where: { name: e.matchExistingProjectName, isDemo: false }
      });
      if (!existing) {
        skipped.push(`${e.label}: nie znaleziono istniejącego projektu "${e.matchExistingProjectName}" — pomiń.`);
        continue;
      }
      projectId = existing.id;
      await prisma.project.update({ where: { id: existing.id }, data: projectData });
      projectsUpdated++;
    } else {
      const existingByLabel = await prisma.project.findFirst({
        where: { name: e.label, isDemo: false }
      });
      if (existingByLabel) {
        projectId = existingByLabel.id;
        await prisma.project.update({ where: { id: existingByLabel.id }, data: projectData });
        projectsUpdated++;
      } else {
        const created = await prisma.project.create({
          data: { isDemo: false, name: e.label, status: "DEVELOPMENT", ...projectData }
        });
        projectId = created.id;
        projectsCreated++;
      }
    }

    if (!projectId) continue;

    // Usuń stare, realne finansowanie tej samej pozycji (z importu CF Farmy.xlsx)
    // — rozpoznawane po tym, że NIE pochodzi z modelu Grzegorza.
    const oldFinancings = await prisma.financing.findMany({
      where: { projectId, NOT: { lender: { startsWith: "Model budżetowy (Grzegorz)" } } }
    });
    if (oldFinancings.length) {
      await prisma.financing.deleteMany({
        where: { id: { in: oldFinancings.map((f: { id: string }) => f.id) } }
      });
      oldFinancingsReplaced += oldFinancings.length;
    }

    const financingsToUpsert: Array<{ lender: string; subject: string; fin: typeof e.financingPv; capexBase: number }> = [
      { lender: "Model budżetowy (Grzegorz) — PV", subject: `${e.label}: instalacja PV`, fin: e.financingPv, capexBase: e.pvCapex }
    ];
    if (e.financingStorage) {
      financingsToUpsert.push({
        lender: "Model budżetowy (Grzegorz) — BESS",
        subject: `${e.label}: magazyn energii (BESS)`,
        fin: e.financingStorage,
        capexBase: e.storageCapex
      });
    }

    for (const f of financingsToUpsert) {
      const existing = await prisma.financing.findFirst({ where: { projectId, lender: f.lender } });
      const nextPaymentDate = addMonths(f.fin.startYear, f.fin.startMonth, f.fin.graceMonths);
      const initialAmount = Math.round(f.capexBase * (f.fin.debtSharePct / 100));
      const data = {
        lender: f.lender,
        subject: f.subject,
        type: "KREDYT_INWESTYCYJNY" as any,
        initialAmount,
        remainingBalance: initialAmount,
        monthlyPayment: 0,
        numInstallments: f.fin.termYears * 12,
        interestRate: f.fin.interestRate,
        nextPaymentDate,
        projectId,
        notes: `Model budżetowy (Grzegorz), dane bieżące wg Kamila (2026-09-17): ${f.fin.debtSharePct}% udziału długu, start ${monthName(f.fin.startMonth)} ${f.fin.startYear}, karencja ${f.fin.graceMonths} mc, rata malejąca.`,
        excludeFromSimulation: false
      };
      if (existing) {
        await prisma.financing.update({ where: { id: existing.id }, data });
        financingsUpdated++;
      } else {
        await prisma.financing.create({ data });
        financingsCreated++;
      }
    }
  }

  await logChange(
    req,
    "project",
    null,
    "update",
    `Import modelu "Budżet Farm PV" (Grzegorz) jako danych BIEŻĄCYCH: ${projectsCreated} nowych, ${projectsUpdated} zaktualizowanych (nadpisanych) projektów; ${financingsCreated} nowych, ${financingsUpdated} zaktualizowanych finansowań; ${oldFinancingsReplaced} starych finansowań (CF Farmy.xlsx) zastąpionych.`
  );

  return NextResponse.json({
    ok: true,
    projectsCreated,
    projectsUpdated,
    financingsCreated,
    financingsUpdated,
    oldFinancingsReplaced,
    skipped
  });
}
