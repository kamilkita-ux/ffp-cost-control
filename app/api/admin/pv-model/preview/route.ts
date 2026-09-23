import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { normalizePvModel, annualRevenueYear1, monthlyRevenueAvg, monthlyOpexTotal, financingSpecs, suggestProjectMatch, shortFarmName, looksLikeVariant, commissioningISO, devStartISO, SALE_METHOD_LABEL } from "@/lib/pvModel";

// POST /api/admin/pv-model/preview — body: pełny JSON eksportu z Budżet Farm PV.
// Nic nie zapisuje: zwraca listę farm z modelu, propozycję dopasowania do
// projektów w aplikacji, różnice (aplikacja → model) i flagi (wariant, kopia,
// zaznaczenie Grzegorza). Kamil decyduje w Ustawieniach, co zastosować.
export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let json: any;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "invalid_json", message: "Plik nie jest poprawnym JSON." }, { status: 400 }); }
  let model;
  try { model = normalizePvModel(json); } catch (e: any) { return NextResponse.json({ error: "invalid_model", message: e.message }, { status: 400 }); }

  const projects: any[] = await prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const financings: any[] = await prisma.financing.findMany({ where: { deletedAt: null } });
  const costs: any[] = await prisma.cost.findMany({ where: { deletedAt: null, notes: { contains: "[OPEX wg modelu Grzegorza]" } } });
  const fmt = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");

  const farms = model.farms.map((f) => {
    const variant = looksLikeVariant(f, model.farms);
    const match = suggestProjectMatch(f.label, projects.map((p) => ({ id: p.id, name: p.name, isDemo: p.isDemo, status: p.status })));
    const cur = match ? projects.find((p) => p.id === match.id) : null;
    const newName = shortFarmName(f.label);
    const specs = financingSpecs(f, newName);
    const curFin = cur ? financings.filter((x) => x.projectId === cur.id && String(x.lender).startsWith("Model budżetowy (Grzegorz)")) : [];
    const curOpex = cur ? costs.filter((x) => x.projectId === cur.id) : [];
    const diffs: Array<{ field: string; current: string; next: string }> = [];
    const push = (field: string, current: any, next: any) => { const a = current === null || current === undefined ? "" : String(current); const b = next === null || next === undefined ? "" : String(next); if (a !== b) diffs.push({ field, current: a || "—", next: b || "—" }); };
    if (cur) {
      push("Moc MW", Number(cur.mwPower ?? 0), f.mwPower);
      push("CAPEX", Math.round(Number(cur.capex ?? 0)), f.capexTotal);
      push("Przychód / mies. (rok 1)", Math.round(Number(cur.revenueMonthly ?? 0)), monthlyRevenueAvg(f));
      push("Uruchomienie", fmt(cur.endDate), commissioningISO(f));
      push("Start rozwoju / prac", fmt(cur.startDate), devStartISO(f) || "");
      push("Lokalizacja", cur.location || "", f.location || "");
      push("Finansowanie (kredyty z modelu)", curFin.map((x) => `${Math.round(Number(x.initialAmount ?? 0)).toLocaleString("pl-PL")} zł @${x.interestRate}%`).join("; "), specs.map((s) => `${s.principal.toLocaleString("pl-PL")} zł @${s.ratePct}%`).join("; "));
      push("OPEX / mies. (z modelu)", Math.round(curOpex.reduce((s, c) => s + (c.recurrence === "ROCZNY" ? Number(c.grossAmount) / 12 : Number(c.grossAmount)), 0)), Math.round(monthlyOpexTotal(f)));
    }
    const appLater = cur && cur.endDate && fmt(cur.endDate) > commissioningISO(f);
    return {
      modelId: f.modelId, label: f.label, newName, location: f.location, mwPower: f.mwPower, commissioning: commissioningISO(f), devStart: devStartISO(f), devMode: f.devMode,
      capexTotal: f.capexTotal, annualRevenue: annualRevenueYear1(f), monthlyRevenue: monthlyRevenueAvg(f), monthlyOpex: Math.round(monthlyOpexTotal(f)),
      saleMethod: SALE_METHOD_LABEL[f.saleMethod] || f.saleMethod, financing: specs.map((s) => ({ lender: s.lender, principal: s.principal, ratePct: s.ratePct, termYears: s.termYears, graceMonths: s.graceMonths, type: s.type, start: s.startISO, first: s.firstInstallmentISO, monthlyPayment: s.monthlyPayment, tranches: s.tranches, outstanding: s.outstanding })),
      storageEnabled: f.storageEnabled, selected: model.selectedIds.includes(f.modelId), variant,
      match: match ? { projectId: match.id, name: match.name } : null, isNew: !match, diffs,
      keepEndDateDefault: !!appLater, includeDefault: !variant,
      updatedAt: f.updatedAt
    };
  });
  const bessProjects = projects.filter((p) => /— BESS/.test(p.name) && !p.isDemo).map((p) => ({ id: p.id, name: p.name, status: p.status }));
  return NextResponse.json({
    exportedAt: model.exportedAt, farms, fixedCosts: model.fixedCosts, bessProjects,
    projects: projects.filter((p) => !p.isDemo).map((p) => ({ id: p.id, name: p.name, status: p.status }))
  });
}
