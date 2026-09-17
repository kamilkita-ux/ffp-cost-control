import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { DUPLICATE_PROJECT_MERGES } from "@/lib/duplicateProjectMerges";

// POST /api/admin/merge-duplicate-projects — jednorazowe (ale bezpieczne do
// wielokrotnego uruchomienia) scalenie duplikatów farm powstałych przez
// import-cf-portfolio: dopasowanie po dokładnej nazwie nie rozpoznało
// starszych rekordów o innej pisowni (np. "wylewa" vs "Wylewa") jako tej
// samej farmy, więc zamiast zaktualizować — stworzyło nowy rekord.
//
// Dla każdej pary z lib/duplicateProjectMerges.ts: wszystkie Koszty, Umowy,
// Finansowania i przypisania pracowników (EmployeeProjectAllocation)
// wskazujące na STARY (bez kodu) projekt zostają przepięte na ZACHOWYWANY
// (z kodem) projekt, opis starego dopisywany jest do opisu zachowywanego
// (jeśli nie był już dopisany), WYBRANE POLA SKALARNE projektu (patrz
// CARRY_OVER_FIELDS) są przenoszone ze starego na zachowywany (tylko gdy
// zachowywany ma puste pole — nie nadpisujemy istniejących danych), a
// dopiero potem stary rekord Projektu jest usuwany.
//
// POPRAWKA 2026-09-17: pierwsza wersja tego endpointu NIE przenosiła pól
// skalarnych (m.in. revenueMonthly, location) — co spowodowało realną utratę
// wpisanego przychodu dla 5 farm przy pierwszym uruchomieniu (Kamil to
// wychwycił po zmianach na Dashboardzie). Naprawione tutaj; utracone dane
// trzeba było uzupełnić ręcznie tym razem (stare rekordy już usunięte).
//
// Idempotentne: jeśli stary projekt nie istnieje (już scalony wcześniej —
// np. przy drugim kliknięciu), para jest pomijana bez błędu.
const CARRY_OVER_FIELDS = [
  "revenueMonthly", "location", "gridOperator", "energyBuyer", "budgetTotal",
  "requestedPowerMW", "grantedPowerMW", "connectionConditionsStatus",
  "connectionAgreementStatus", "permitsStatus", "environmentalDecisionStatus",
  "zoningStatus", "owner", "startDate"
] as const;
export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let merged = 0;
  let reassignedCosts = 0;
  let reassignedContracts = 0;
  let reassignedFinancings = 0;
  let reassignedAllocations = 0;
  const skipped: string[] = [];

  for (const pair of DUPLICATE_PROJECT_MERGES) {
    const oldProject = await prisma.project.findFirst({
      where: { name: pair.oldName, isDemo: false }
    });
    if (!oldProject) {
      skipped.push(`${pair.oldName} → ${pair.keepName}: stary rekord już nie istnieje (prawdopodobnie już scalony wcześniej) — pomiń.`);
      continue;
    }
    const keepProject = await prisma.project.findFirst({
      where: { name: pair.keepName, isDemo: false }
    });
    if (!keepProject) {
      skipped.push(`${pair.oldName} → ${pair.keepName}: nie znaleziono docelowego projektu "${pair.keepName}" — pomiń, nic nie usunięto.`);
      continue;
    }
    if (oldProject.id === keepProject.id) {
      skipped.push(`${pair.oldName} → ${pair.keepName}: to już ten sam rekord — pomiń.`);
      continue;
    }

    const costsRes = await prisma.cost.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
    reassignedCosts += costsRes.count;
    const contractsRes = await prisma.contract.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
    reassignedContracts += contractsRes.count;
    const financingsRes = await prisma.financing.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
    reassignedFinancings += financingsRes.count;
    const allocationsRes = await prisma.employeeProjectAllocation.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
    reassignedAllocations += allocationsRes.count;

    const marker = `[Scalono duplikat "${pair.oldName}"]`;
    const updateData: Record<string, unknown> = {};
    for (const field of CARRY_OVER_FIELDS) {
      const oldVal = (oldProject as Record<string, unknown>)[field];
      const keepVal = (keepProject as Record<string, unknown>)[field];
      const keepIsEmpty = keepVal === null || keepVal === undefined || keepVal === "";
      const oldHasValue = oldVal !== null && oldVal !== undefined && oldVal !== "";
      if (keepIsEmpty && oldHasValue) {
        updateData[field] = oldVal;
      }
    }
    if (oldProject.description && !(keepProject.description || "").includes(marker)) {
      updateData.description = `${keepProject.description ? keepProject.description + "\n\n" : ""}${marker} ${oldProject.description}`;
    }
    if (Object.keys(updateData).length) {
      await prisma.project.update({ where: { id: keepProject.id }, data: updateData });
    }

    await prisma.project.delete({ where: { id: oldProject.id } });
    merged++;
  }

  await logChange(
    req,
    "project",
    null,
    "update",
    `Scalenie duplikatów farm (powstałych z importu CF Farmy.xlsx): ${merged} par scalonych. Przepięto: ${reassignedCosts} kosztów, ${reassignedContracts} umów, ${reassignedFinancings} finansowań, ${reassignedAllocations} przypisań pracowników.`
  );

  return NextResponse.json({
    ok: true,
    merged,
    reassignedCosts,
    reassignedContracts,
    reassignedFinancings,
    reassignedAllocations,
    skipped
  });
}
