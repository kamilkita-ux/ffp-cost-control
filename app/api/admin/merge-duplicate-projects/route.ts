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
// POPRAWKA 2026-09-17 (1): pierwsza wersja NIE przenosiła pól skalarnych
// (m.in. revenueMonthly, location) — realna utrata wpisanego przychodu dla
// 3 farm przy pierwszym uruchomieniu (Wylewa, Poręba, F9 Chludowo).
// Naprawione (CARRY_OVER_FIELDS); utracone dane przywraca osobno
// /api/admin/repair-lost-revenue.
//
// POPRAWKA 2026-09-18 (2): dwie pary ("Miejsce piastowe", "Wysoka
// Strzyżowska") NIE zostały scalone, bo szukaliśmy starego rekordu po
// DOKŁADNEJ nazwie, a w bazie nazwa różni się niewidocznie (spacja na
// końcu / podwójna spacja / inna forma Unicode "ż"). Teraz stary rekord
// dopasowujemy po ZNORMALIZOWANEJ nazwie (NFC, małe litery, pojedyncze
// spacje, trim), a zachowywany — po dokładnej (trim+NFC) nazwie z kodem.
// Wszystkie pasujące stare warianty (może być >1) są scalane do jednego.
//
// Idempotentne: jeśli stary projekt nie istnieje (już scalony wcześniej —
// np. przy drugim kliknięciu), para jest pomijana bez błędu.
const CARRY_OVER_FIELDS = [
  "revenueMonthly", "location", "gridOperator", "energyBuyer", "budgetTotal",
  "requestedPowerMW", "grantedPowerMW", "connectionConditionsStatus",
  "connectionAgreementStatus", "permitsStatus", "environmentalDecisionStatus",
  "zoningStatus", "owner", "startDate"
] as const;
const NUMERIC_FIELDS = new Set(["revenueMonthly", "budgetTotal", "requestedPowerMW", "grantedPowerMW"]);

function normName(s: string | null | undefined): string {
  return (s || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}
function exactName(s: string | null | undefined): string {
  return (s || "").normalize("NFC").replace(/\s+/g, " ").trim();
}
function isEmptyVal(v: unknown, numeric: boolean): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (numeric && !(v instanceof Date) && Number(v as any) === 0) return true;
  return false;
}

export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let merged = 0;
  let reassignedCosts = 0;
  let reassignedContracts = 0;
  let reassignedFinancings = 0;
  let reassignedAllocations = 0;
  const carried: string[] = [];
  const skipped: string[] = [];

  const allProjects: Array<Record<string, any>> = await prisma.project.findMany({ where: { isDemo: false } });
  const deletedIds = new Set<string>();

  for (const pair of DUPLICATE_PROJECT_MERGES) {
    const live = allProjects.filter((p) => !deletedIds.has(p.id));
    // Zachowywany: dokładna nazwa (po trim/NFC) — w razie kilku, ten z kodem.
    const keepCandidates = live.filter((p) => exactName(p.name) === exactName(pair.keepName));
    const keepProject = keepCandidates.find((p) => p.code) || keepCandidates[0];
    if (!keepProject) {
      skipped.push(`${pair.oldName} → ${pair.keepName}: nie znaleziono docelowego projektu "${pair.keepName}" — pomiń, nic nie usunięto.`);
      continue;
    }
    // Stare warianty: znormalizowana nazwa == znormalizowana oldName, bez zachowywanego.
    const oldVariants = live.filter((p) => p.id !== keepProject.id && normName(p.name) === normName(pair.oldName));
    if (!oldVariants.length) {
      skipped.push(`${pair.oldName} → ${pair.keepName}: stary rekord już nie istnieje (już scalony) — pomiń.`);
      continue;
    }

    for (const oldProject of oldVariants) {
      const costsRes = await prisma.cost.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
      reassignedCosts += costsRes.count;
      const contractsRes = await prisma.contract.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
      reassignedContracts += contractsRes.count;
      const financingsRes = await prisma.financing.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
      reassignedFinancings += financingsRes.count;
      const allocationsRes = await prisma.employeeProjectAllocation.updateMany({ where: { projectId: oldProject.id }, data: { projectId: keepProject.id } });
      reassignedAllocations += allocationsRes.count;

      const marker = `[Scalono duplikat "${exactName(oldProject.name)}"]`;
      const updateData: Record<string, unknown> = {};
      for (const field of CARRY_OVER_FIELDS) {
        const oldVal = oldProject[field];
        const keepVal = keepProject[field];
        const numeric = NUMERIC_FIELDS.has(field);
        if (isEmptyVal(keepVal, numeric) && !isEmptyVal(oldVal, numeric)) {
          updateData[field] = oldVal;
          keepProject[field] = oldVal; // żeby kolejny wariant nie nadpisał
          carried.push(`${exactName(pair.keepName)}.${field} ← ${String(oldVal)}`);
        }
      }
      if (oldProject.description && !(keepProject.description || "").includes(marker)) {
        updateData.description = `${keepProject.description ? keepProject.description + "\n\n" : ""}${marker} ${oldProject.description}`;
        keepProject.description = updateData.description;
      }
      if (Object.keys(updateData).length) {
        await prisma.project.update({ where: { id: keepProject.id }, data: updateData });
      }

      await prisma.project.delete({ where: { id: oldProject.id } });
      deletedIds.add(oldProject.id);
      merged++;
    }
  }

  await logChange(
    req,
    "project",
    null,
    "update",
    `Scalenie duplikatów farm: ${merged} rekordów scalonych. Przepięto: ${reassignedCosts} kosztów, ${reassignedContracts} umów, ${reassignedFinancings} finansowań, ${reassignedAllocations} przypisań pracowników. Przeniesione pola: ${carried.length ? carried.join("; ") : "brak"}.`
  );

  return NextResponse.json({
    ok: true,
    merged,
    reassignedCosts,
    reassignedContracts,
    reassignedFinancings,
    reassignedAllocations,
    carried,
    skipped
  });
}
