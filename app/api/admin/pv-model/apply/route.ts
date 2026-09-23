import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { normalizePvModel, annualRevenueYear1, monthlyRevenueAvg, opexLines, financingSpecs, stageSchedule, shortFarmName, commissioningISO, devStartISO, SALE_METHOD_LABEL, OPEX_MARKER, GRZ_MARKER_PREFIX, storageAnnualRevenue, ymd } from "@/lib/pvModel";

// POST /api/admin/pv-model/apply — body: { model: <JSON eksportu>, decisions: [{modelId, include, projectId|null, keepEndDate}] }
// Zapisuje w JEDNEJ transakcji: karty projektów, finansowania (zastępuje
// wpisy "Model budżetowy (Grzegorz)"), OPEX (zastępuje koszty z OPEX_MARKER),
// projekty BESS (zawieszone, gdy model ma wyłączony magazyn), oraz AppSetting
// farmModels (pełne parametry: profil miesięczny, eskalacje, etapy, transze,
// koszty stałe Grzegorza). Idempotentne: drugie zastosowanie tego samego pliku
// nie duplikuje niczego.
function codeFor(name: string, existing: Set<string>): string {
  const base = "PV-" + name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/gi, "l").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4);
  let c = base, i = 2; while (existing.has(c)) { c = base + i; i++; } existing.add(c); return c;
}

export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !body.model) return NextResponse.json({ error: "invalid_input", message: "Brak modelu." }, { status: 400 });
  let model;
  try { model = normalizePvModel(body.model); } catch (e: any) { return NextResponse.json({ error: "invalid_model", message: e.message }, { status: 400 }); }
  const decisions: Array<{ modelId: string; include: boolean; projectId: string | null; keepEndDate: boolean }> = Array.isArray(body.decisions) ? body.decisions : [];
  const stamp = (model.exportedAt || new Date().toISOString()).slice(0, 10);
  const MARKER = `${GRZ_MARKER_PREFIX}, ${stamp}]`;

  const result = await prisma.$transaction(async (tx: any) => {
    const projects: any[] = await tx.project.findMany({ where: { deletedAt: null } });
    const codes = new Set<string>(projects.map((p) => String(p.code || "")).filter(Boolean));
    const farmsOut: Record<string, any> = {}; const finOut: Record<string, any> = {};
    let updated = 0, created = 0, finCreated = 0, finDeleted = 0, opexCreated = 0, opexDeleted = 0, bessSuspended = 0;
    const log: string[] = [];

    for (const f of model.farms) {
      const d = decisions.find((x) => x.modelId === f.modelId);
      if (!d || !d.include) { log.push(`${f.label}: pominięto`); continue; }
      const newName = shortFarmName(f.label);
      const annual = annualRevenueYear1(f), monthly = monthlyRevenueAvg(f);
      const desc = `${MARKER} Przychód mies. ${monthly.toLocaleString("pl-PL")} zł = ${f.mwPower} MW × ${f.yieldKwhPerKwp} kWh/kWp × (${f.pricePlnMwh} + ${f.priceGoPlnMwh}) zł/MWh / 12 (rok 1; profil miesięczny, eskalacja ${f.priceEscalationPct}%/rok i degradacja ${f.degradationPct}%/rok w projekcji). Sprzedaż: ${SALE_METHOD_LABEL[f.saleMethod] || f.saleMethod || "—"}. CAPEX ${f.capexTotal.toLocaleString("pl-PL")} zł (${Math.round(f.capexPerMw).toLocaleString("pl-PL")} zł/MW). Uruchomienie ${f.commissioningMonth}/${f.commissioningYear}. Etap rozwoju: ${f.devMode || "—"}.`;
      let project: any = d.projectId ? projects.find((p) => p.id === d.projectId) : null;
      const data: any = {
        mwPower: f.mwPower, capex: f.capexTotal, revenueMonthly: monthly,
        location: f.location || (project ? project.location : null),
        assetType: "PV"
      };
      if (!(d.keepEndDate && project && project.endDate)) data.endDate = new Date(commissioningISO(f) + "T00:00:00Z");
      const ds = devStartISO(f); if (ds && !(f.devMode === "operating" || f.devMode === "own_operating")) data.startDate = new Date(ds + "T00:00:00Z");
      if (project) {
        const old = String(project.description || "");
        const rest = old.startsWith(GRZ_MARKER_PREFIX) ? old.replace(/^\[[^\]]*\][^\n]*\n?/, "") : old;
        data.description = desc + (rest.trim() ? "\n\n" + rest.trim() : "");
        if (!project.energyBuyer && f.saleMethod) data.energyBuyer = SALE_METHOD_LABEL[f.saleMethod] || f.saleMethod;
        project = await tx.project.update({ where: { id: project.id }, data }); updated++;
        log.push(`${f.label} → ${project.name}: zaktualizowano`);
      } else {
        project = await tx.project.create({ data: { isDemo: false, name: newName, code: codeFor(newName, codes), status: f.firstPendingStage >= 4 ? "BUDOWA" : "DEVELOPMENT", description: desc, energyBuyer: SALE_METHOD_LABEL[f.saleMethod] || null, ...data } });
        projects.push(project); created++; log.push(`${f.label}: utworzono „${newName}”`);
      }
      // finansowania z modelu — zastąp
      const oldFin: any[] = await tx.financing.findMany({ where: { projectId: project.id, lender: { startsWith: "Model budżetowy (Grzegorz)" } } });
      if (oldFin.length) { await tx.financing.deleteMany({ where: { id: { in: oldFin.map((x) => x.id) } } }); finDeleted += oldFin.length; }
      for (const s of financingSpecs(f, project.name)) {
        const nInst = s.termYears * 12;
        const created_ = await tx.financing.create({ data: {
          lender: s.lender, subject: s.subject, type: "KREDYT_INWESTYCYJNY", initialAmount: s.principal, remainingBalance: s.principal, monthlyPayment: s.monthlyPayment,
          numInstallments: nInst, remainingInstallments: nInst, nextPaymentDate: new Date(s.firstInstallmentISO + "T00:00:00Z"), endDate: new Date(s.endISO + "T00:00:00Z"),
          interestRate: s.ratePct, projectId: project.id, notes: `${MARKER} ${s.note}`, excludeFromSimulation: false
        } });
        finCreated++;
        finOut[created_.id] = { projectId: project.id, principal: s.principal, ratePct: s.ratePct, termYears: s.termYears, graceMonths: s.graceMonths, type: s.type, startISO: s.startISO, firstInstallmentISO: s.firstInstallmentISO, tranches: s.tranches, outstanding: s.outstanding };
      }
      // OPEX — zastąp koszty z markerem
      const oldOpex: any[] = await tx.cost.findMany({ where: { projectId: project.id, notes: { contains: OPEX_MARKER } } });
      if (oldOpex.length) { await tx.cost.deleteMany({ where: { id: { in: oldOpex.map((x) => x.id) } } }); opexDeleted += oldOpex.length; }
      for (const l of opexLines(f, project.name)) {
        await tx.cost.create({ data: {
          isDemo: false, name: l.name, description: `${l.note} Koszt wg modelu Grzegorza (${stamp}), rok 1, bez eskalacji ${f.opex.escalationPct}%/rok.`,
          netAmount: l.amount, vat: 0, grossAmount: l.amount, currency: "PLN", category: l.category, projectId: project.id,
          costDate: new Date(l.costDate + "T00:00:00Z"), paymentStatus: "PLANOWANY", recurrence: l.recurrence, necessity: "NIEZBEDNY", isFixed: false, notes: OPEX_MARKER
        } });
        opexCreated++;
      }
      // BESS: model ma magazyn wyłączony -> istniejący projekt BESS zawieszamy (nie kasujemy)
      const bessName = `${project.name} — BESS`;
      const bess = projects.find((p) => String(p.name).startsWith(bessName));
      if (bess && !f.storageEnabled && bess.status !== "ZAWIESZONY" && bess.status !== "SPRZEDANY" && bess.status !== "ZAMKNIETY") {
        await tx.project.update({ where: { id: bess.id }, data: { status: "ZAWIESZONY", description: `${MARKER} Magazyn energii WYŁĄCZONY w modelu Grzegorza z ${stamp} — projekt zawieszony (nie liczy się do przychodu docelowego ani projekcji). ${bess.description || ""}` } });
        bessSuspended++; log.push(`${bess.name}: zawieszono (magazyn wyłączony w modelu)`);
      }
      if (bess && f.storageEnabled && f.storage) {
        const st = f.storage; const stMonthly = Math.round(storageAnnualRevenue(f) / 12);
        await tx.project.update({ where: { id: bess.id }, data: { status: bess.status === "ZAWIESZONY" ? "DEVELOPMENT" : bess.status, mwPower: st.powerMw, capex: st.capexTotal, revenueMonthly: stMonthly, endDate: new Date(ymd(st.commissioningYear, st.commissioningMonth) + "T00:00:00Z") } });
      }
      farmsOut[project.id] = {
        modelId: f.modelId, label: f.label, mwPower: f.mwPower, commissioningISO: commissioningISO(f), devStartISO: devStartISO(f), devMode: f.devMode, firstPendingStage: f.firstPendingStage,
        stages: stageSchedule(f), capexTotal: f.capexTotal, capexBreakdown: f.capexBreakdown, yieldKwhPerKwp: f.yieldKwhPerKwp, degradationPct: f.degradationPct,
        pricePlnMwh: f.pricePlnMwh, priceEscalationPct: f.priceEscalationPct, priceGoPlnMwh: f.priceGoPlnMwh, annualRevenue: annual, monthlyProfilePct: f.monthlyProfilePct,
        saleMethod: f.saleMethod, saleMethodLabel: SALE_METHOD_LABEL[f.saleMethod] || f.saleMethod, horizonYears: f.horizonYears, waccPct: f.waccPct, opex: f.opex, opexEscalationPct: f.opex.escalationPct,
        financing: f.financing, storageEnabled: f.storageEnabled, storage: f.storage, updatedAt: f.updatedAt
      };
    }
    const setting = { version: stamp, exportedAt: model.exportedAt, importedAt: new Date().toISOString(), farms: farmsOut, financings: finOut, fixedCosts: model.fixedCosts, selectedIds: model.selectedIds };
    await tx.appSetting.upsert({ where: { key: "farmModels" }, create: { key: "farmModels", value: setting }, update: { value: setting } });
    return { updated, created, finCreated, finDeleted, opexCreated, opexDeleted, bessSuspended, log };
  }, { timeout: 60000 });

  await logChange(req, "project", null, "update", `Model Grzegorza (${stamp}) zastosowany: ${result.updated} farm zaktualizowanych, ${result.created} nowych, finansowania ${result.finCreated} (usunięto ${result.finDeleted}), OPEX ${result.opexCreated} (usunięto ${result.opexDeleted}), BESS zawieszone ${result.bessSuspended}.`);
  return NextResponse.json({ ok: true, ...result });
}
