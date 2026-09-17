import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { CF_PORTFOLIO_PROJECTS, CF_PORTFOLIO_FINANCINGS } from "@/lib/cfPortfolioSeed";

// POST /api/admin/import-cf-portfolio — wczytuje/odświeża portfel 11 farm PV
// z arkusza kontrolera "CF Farmy.xlsx" (zakładki: CF ROCZNY, Harmonogram,
// Koszty Finansowe — patrz lib/cfPortfolioSeed.ts) jako prawdziwe rekordy
// Projekt/Financing.
//
// Zgłoszenie Kamila (2026-09-16/17): moduł Projekty nie miał kompletu
// prawdziwych danych farm (moc, status, daty z harmonogramu, finansowanie),
// co powodowało błędne sumowania/daty na Dashboardzie i w Projektach.
//
// BEZPIECZNE DO WIELOKROTNEGO URUCHOMIENIA (idempotentne): dopasowanie po
// Project.name (isDemo=false) — jeśli farma już istnieje, jej dane są
// AKTUALIZOWANE (nie duplikowane); jeśli nie istnieje, jest tworzona.
// Financing dopasowywany po (projectId, lender) tą samą zasadą. Admin-only —
// ten import nadpisuje dane finansowe/status realnych projektów.
export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const projectIdByName: Record<string, string> = {};
  let projectsCreated = 0;
  let projectsUpdated = 0;

  for (const p of CF_PORTFOLIO_PROJECTS) {
    const existing = await prisma.project.findFirst({
      where: { name: p.name, isDemo: false }
    });
    const data = {
      name: p.name,
      code: p.code,
      mwPower: p.mwPower,
      energyBuyer: p.energyBuyer,
      capex: p.capex,
      status: p.status as any,
      startDate: p.startDate ? new Date(p.startDate) : null,
      endDate: p.endDate ? new Date(p.endDate) : null,
      description: p.description
    };
    if (existing) {
      const updated = await prisma.project.update({ where: { id: existing.id }, data });
      projectIdByName[p.name] = updated.id;
      projectsUpdated++;
    } else {
      const created = await prisma.project.create({ data: { ...data, isDemo: false } });
      projectIdByName[p.name] = created.id;
      projectsCreated++;
    }
  }

  let financingsCreated = 0;
  let financingsUpdated = 0;

  for (const f of CF_PORTFOLIO_FINANCINGS) {
    const projectId = projectIdByName[f.projectName];
    if (!projectId) continue; // projekt nie znaleziony/nie utworzony — pomiń
    const existing = await prisma.financing.findFirst({
      where: { projectId, lender: f.lender }
    });
    const data = {
      lender: f.lender,
      subject: f.subject ?? null,
      type: f.type as any,
      initialAmount: f.initialAmount,
      remainingBalance: f.remainingBalance,
      monthlyPayment: f.monthlyPayment,
      numInstallments: f.numInstallments,
      interestRate: f.interestRate,
      nextPaymentDate: f.nextPaymentDate ? new Date(f.nextPaymentDate) : null,
      projectId,
      notes: f.notes
    };
    if (existing) {
      await prisma.financing.update({ where: { id: existing.id }, data });
      financingsUpdated++;
    } else {
      await prisma.financing.create({ data });
      financingsCreated++;
    }
  }

  await logChange(
    req,
    "project",
    null,
    "update",
    `Import portfela farm z arkusza kontrolera (CF Farmy.xlsx): ${projectsCreated} nowych, ${projectsUpdated} zaktualizowanych projektów; ${financingsCreated} nowych, ${financingsUpdated} zaktualizowanych finansowań.`
  );

  return NextResponse.json({
    ok: true,
    projectsCreated,
    projectsUpdated,
    financingsCreated,
    financingsUpdated
  });
}
