import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { PV_BUDGET_ENTRIES } from "@/lib/pvBudgetSeed";

// POST /api/admin/import-pv-budget — wczytuje model budżetowy z narzędzia
// "Budżet Farm PV" (Grzegorz) — patrz lib/pvBudgetSeed.ts.
//
// WAŻNE rozróżnienie (patrz komentarz w lib/pvBudgetSeed.ts): to są ZAŁOŻENIA
// modelu opłacalności (IRR/WACC), NIE rzeczywiste podpisane umowy finansowania.
// Dlatego:
//  - dla projektów już istniejących w portfelu (dopasowanie po nazwie) NIE
//    nadpisujemy mwPower/capex/status/dat — tylko DOPISUJEMY opis modelu do
//    description (jeśli jeszcze nie był dopisany) i tworzymy/aktualizujemy
//    Financing z excludeFromSimulation=true.
//  - dla nowych projektów (Lubelskie 4x1 MW, Opole 5x1 MW) tworzymy pełny
//    rekord Project (też excludeFromSimulation=true na Financing).
// Idempotentne: bezpieczne do wielokrotnego uruchomienia.
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
  const skipped: string[] = [];

  for (const e of PV_BUDGET_ENTRIES) {
    let projectId: string | null = null;

    if (e.matchExistingProjectName) {
      const existing = await prisma.project.findFirst({
        where: { name: e.matchExistingProjectName, isDemo: false }
      });
      if (!existing) {
        skipped.push(`${e.label}: nie znaleziono istniejącego projektu "${e.matchExistingProjectName}" — pomiń.`);
        continue;
      }
      projectId = existing.id;
      const marker = "[Budżet Farm PV — Grzegorz]";
      if (!(existing.description || "").includes(marker)) {
        const newDescription = `${existing.description ? existing.description + "\n\n" : ""}${marker} ${e.description}`;
        await prisma.project.update({ where: { id: existing.id }, data: { description: newDescription } });
        projectsUpdated++;
      }
    } else {
      const existingByLabel = await prisma.project.findFirst({
        where: { name: e.label, isDemo: false }
      });
      if (existingByLabel) {
        projectId = existingByLabel.id;
      } else {
        const created = await prisma.project.create({
          data: {
            isDemo: false,
            name: e.label,
            location: e.location,
            mwPower: e.mwPower,
            capex: e.totalCapex,
            status: "DEVELOPMENT",
            endDate: addMonths(e.commissioningYear, e.commissioningMonth, 0),
            description: `[Budżet Farm PV — Grzegorz] ${e.description}`
          }
        });
        projectId = created.id;
        projectsCreated++;
      }
    }

    if (!projectId) continue;

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
        notes: `Założenie modelu opłacalności (Budżet Farm PV — Grzegorz), NIE rzeczywista umowa: ${f.fin.debtSharePct}% udziału długu, start ${monthName(f.fin.startMonth)} ${f.fin.startYear}, karencja ${f.fin.graceMonths} mc, rata malejąca. Nie liczone do bieżącego zadłużenia (excludeFromSimulation).`,
        excludeFromSimulation: true
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
    `Import modelu "Budżet Farm PV" (Grzegorz): ${projectsCreated} nowych, ${projectsUpdated} zaktualizowanych opisów projektów; ${financingsCreated} nowych, ${financingsUpdated} zaktualizowanych finansowań (modelowych, excludeFromSimulation).`
  );

  return NextResponse.json({
    ok: true,
    projectsCreated,
    projectsUpdated,
    financingsCreated,
    financingsUpdated,
    skipped
  });
}
