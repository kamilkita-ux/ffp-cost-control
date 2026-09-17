import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import {
  PV_BUDGET_ENTRIES, pvMonthlyRevenue, storageMonthlyRevenue, defaultMonthlyRevenue,
  monthlyOpexFor, decliningFirstInstallment, DEFAULT_YIELD_KWH_PER_KWP, DEFAULT_PRICE_PLN_MWH, DEFAULT_GO_PLN_MWH,
  type PvBudgetFinancing
} from "@/lib/pvBudgetSeed";
import { CF_PORTFOLIO_PROJECTS, CF_PORTFOLIO_FINANCINGS } from "@/lib/cfPortfolioSeed";

// POST /api/admin/reset-farm-portfolio — RESET I ODBUDOWA PORTFELA FARM.
//
// Decyzja Kamila (2026-09-18): "portfel farm i ich finansowanie wyzeruj i
// zbuduj pod dane Grzegorza; reszta jest ok". Czyli:
//
// KASUJEMY (tylko to):
//  - wszystkie Projekty (isDemo=false) — dane DEMO zostają, do usunięcia
//    osobnym przyciskiem;
//  - wszystkie Finansowania przypięte do tych projektów (finansowania
//    spółki bez projektu — np. leasingi aut — ZOSTAJĄ);
//  - koszty OPEX farm utworzone wcześniej przez ten endpoint (notes ma
//    znacznik OPEX_MARKER) — żeby drugi klik nie duplikował;
//  - przypisania pracowników do projektów (EmployeeProjectAllocation).
// NIE RUSZAMY: Pracownicy, Koszty (poza OPEX z markerem — pozostałe koszty
// przypięte do farm są PRZEPINANE po nazwie farmy na nowe rekordy, a jeśli
// nazwa nie pasuje — odpinane, nie kasowane), Umowy (j.w. przepinane),
// Dostawcy, Płatności, Działy, Akcjonariat, Dokumenty, Założenia,
// użytkownicy, kopie zapasowe, dziennik zmian.
//
// BUDUJEMY:
//  - 7 farm z modelu Grzegorza (lib/pvBudgetSeed.ts) jako ŹRÓDŁO PRAWDY:
//    moc, CAPEX (=budżet), lokalizacja, data uruchomienia (endDate), opis,
//    PRZYCHÓD MIES. = moc × uzysk × (cena + GO) / 12, status z CF Farmy.xlsx
//    dla farm tam obecnych (Grzegorz nie modeluje statusu), DEVELOPMENT dla
//    nowych (Lubelskie, Opole);
//  - magazyn energii (BESS) jako OSOBNY Projekt (assetType BESS, własna data
//    uruchomienia, CAPEX, przychód = moc × przepustowość × cena / 12,
//    finansowanie) — bo ma inną datę i finansowanie niż część PV;
//  - finansowanie wg modelu (kredyt inwestycyjny, rata malejąca — wpisujemy
//    PIERWSZĄ ratę jako monthlyPayment, nextPaymentDate = start + karencja,
//    endDate = koniec spłaty). Dashboard liczy ratę dopiero od
//    nextPaymentDate (patrz metrics()/periodMetrics w app-shell.html);
//  - 4 linie OPEX/mies. na każdy składnik (dzierżawa, O&M, podatki,
//    ubezpieczenie) jako koszty cykliczne z costDate = data uruchomienia
//    (Dashboard liczy je dopiero od tej daty);
//  - 6 farm spoza modelu Grzegorza (Skrzypaczowice, F8 Wysoka Strzyżowska,
//    F9 Chludowo, Ziempniów, Kamyk, Pieczyska) z CF Farmy.xlsx, oznaczone
//    "do uzupełnienia wg modelu Grzegorza", z przychodem wg tych samych
//    domyślnych założeń (1050 kWh/kWp, 350 + 2.5 zł/MWh) i ich finansowaniem
//    z arkusza kontrolera — bez OPEX (brak danych).
//
// Całość w jednej transakcji: albo wszystko, albo nic. Idempotentne:
// drugi klik daje ten sam stan końcowy.
const OPEX_MARKER = "[OPEX wg modelu Grzegorza]";
const GRZ_MARKER = "[Źródło: model Grzegorza, Budżet Farm PV, 2026-09-17]";
const CF_MARKER = "[Źródło: CF Farmy.xlsx — do uzupełnienia wg modelu Grzegorza]";

function ymd(y: number, m: number, addMonths = 0): Date {
  return new Date(Date.UTC(y, m - 1 + addMonths, 1));
}
function exactName(s: string | null | undefined): string {
  return (s || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

type FinPlan = { lender: string; subject: string; principal: number; fin: PvBudgetFinancing; note: string };

function modelFinancing(projectId: string, f: FinPlan) {
  const n = f.fin.termYears * 12;
  const first = ymd(f.fin.startYear, f.fin.startMonth, f.fin.graceMonths);
  const end = ymd(f.fin.startYear, f.fin.startMonth, f.fin.graceMonths + n - 1);
  const installment = decliningFirstInstallment(f.principal, f.fin.interestRate, f.fin.termYears);
  return {
    lender: f.lender,
    subject: f.subject,
    type: "KREDYT_INWESTYCYJNY" as any,
    initialAmount: f.principal,
    remainingBalance: f.principal,
    monthlyPayment: installment,
    numInstallments: n,
    remainingInstallments: n,
    nextPaymentDate: first,
    endDate: end,
    interestRate: f.fin.interestRate,
    projectId,
    notes: `${GRZ_MARKER} ${f.note} ${f.fin.debtSharePct}% długu, ${f.fin.interestRate}% rocznie, ${f.fin.termYears} lat, karencja ${f.fin.graceMonths} mc, rata malejąca — wpisana PIERWSZA (najwyższa) rata; kolejne maleją.`,
    excludeFromSimulation: false
  };
}

function opexCosts(projectId: string, farmLabel: string, opex: { lease: number; service: number; taxes: number; insurance: number; other: number }, startDate: Date) {
  const lines: Array<{ name: string; amount: number; category: string }> = [
    { name: `Dzierżawa gruntu — ${farmLabel}`, amount: opex.lease, category: "OPEX farmy — dzierżawa" },
    { name: `Obsługa techniczna (O&M) — ${farmLabel}`, amount: opex.service, category: "OPEX farmy — serwis" },
    { name: `Podatki (nieruchomości + od budowli) — ${farmLabel}`, amount: opex.taxes, category: "OPEX farmy — podatki" },
    { name: `Ubezpieczenie (majątkowe + OC) — ${farmLabel}`, amount: opex.insurance, category: "OPEX farmy — ubezpieczenie" }
  ];
  if (opex.other > 0) lines.push({ name: `Pozostałe koszty — ${farmLabel}`, amount: opex.other, category: "OPEX farmy — inne" });
  return lines.filter((l) => l.amount > 0).map((l) => ({
    isDemo: false,
    name: l.name,
    description: `Koszt cykliczny wg modelu Grzegorza (rok 1, bez eskalacji 3%/rok). Liczony na Dashboardzie od daty uruchomienia (${startDate.toISOString().slice(0, 10)}).`,
    netAmount: l.amount,
    vat: 0,
    grossAmount: l.amount,
    currency: "PLN",
    category: l.category,
    projectId,
    costDate: startDate,
    paymentStatus: "PLANOWANY" as any,
    recurrence: "MIESIECZNY" as any,
    necessity: "NIEZBEDNY" as any,
    isFixed: false,
    notes: OPEX_MARKER
  }));
}

export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx: any) => {
    // ---- 1. Stan wyjściowy ----
    const oldProjects: Array<{ id: string; name: string }> = await tx.project.findMany({ where: { isDemo: false }, select: { id: true, name: true } });
    const oldIds = oldProjects.map((p) => p.id);
    const oldNameById: Record<string, string> = {};
    oldProjects.forEach((p) => { oldNameById[p.id] = exactName(p.name); });

    // Koszty/umowy przypięte do starych projektów — zapamiętaj, do przepięcia po nazwie.
    const linkedCosts: Array<{ id: string; projectId: string; notes: string | null }> = oldIds.length
      ? await tx.cost.findMany({ where: { projectId: { in: oldIds } }, select: { id: true, projectId: true, notes: true } }) : [];
    const linkedContracts: Array<{ id: string; projectId: string }> = oldIds.length
      ? await tx.contract.findMany({ where: { projectId: { in: oldIds } }, select: { id: true, projectId: true } }) : [];

    // ---- 2. Kasowanie ----
    const opexToDelete = linkedCosts.filter((c) => (c.notes || "").includes(OPEX_MARKER)).map((c) => c.id);
    if (opexToDelete.length) await tx.cost.deleteMany({ where: { id: { in: opexToDelete } } });
    if (oldIds.length) {
      await tx.cost.updateMany({ where: { projectId: { in: oldIds } }, data: { projectId: null } });
      await tx.contract.updateMany({ where: { projectId: { in: oldIds } }, data: { projectId: null } });
      await tx.employeeProjectAllocation.deleteMany({ where: { projectId: { in: oldIds } } });
      await tx.financing.deleteMany({ where: { projectId: { in: oldIds } } });
      await tx.project.deleteMany({ where: { id: { in: oldIds } } });
    }

    // ---- 3. Budowa: 7 farm Grzegorza (+ BESS jako osobne projekty) ----
    const cfByName: Record<string, (typeof CF_PORTFOLIO_PROJECTS)[number]> = {};
    CF_PORTFOLIO_PROJECTS.forEach((p) => { cfByName[exactName(p.name)] = p; });
    const newIdByName: Record<string, string> = {};
    let projectsCreated = 0, financingsCreated = 0, costsCreated = 0;

    for (const e of PV_BUDGET_ENTRIES) {
      const cf = e.matchExistingProjectName ? cfByName[exactName(e.matchExistingProjectName)] : undefined;
      const pvStart = ymd(e.commissioningYear, e.commissioningMonth);
      const pvRevenue = pvMonthlyRevenue(e);
      const pv = await tx.project.create({
        data: {
          isDemo: false,
          name: e.name,
          code: e.code,
          location: e.location,
          mwPower: e.mwPower,
          revenueMonthly: pvRevenue,
          energyBuyer: cf?.energyBuyer ?? null,
          assetType: "PV",
          capex: e.pvCapex,
          budgetTotal: e.pvCapex,
          status: (cf?.status ?? "DEVELOPMENT") as any,
          startDate: ymd(e.financingPv.startYear, e.financingPv.startMonth),
          endDate: pvStart,
          description: `${GRZ_MARKER} Przychód mies. ${pvRevenue.toLocaleString("pl-PL")} zł = ${e.mwPower} MW × ${e.pv.yieldKwhPerKwp} kWh/kWp × (${e.pv.pricePlnMwh} + ${e.pv.priceGoPlnMwh}) zł/MWh / 12 (rok 1). ${e.description}`
        }
      });
      projectsCreated++;
      newIdByName[exactName(e.name)] = pv.id;
      await tx.financing.create({ data: modelFinancing(pv.id, {
        lender: "Model budżetowy (Grzegorz) — PV", subject: `${e.name}: instalacja PV ${e.mwPower} MW`,
        principal: Math.round(e.pvCapex * e.financingPv.debtSharePct / 100), fin: e.financingPv, note: "Kredyt na część PV:"
      }) });
      financingsCreated++;
      for (const c of opexCosts(pv.id, `${e.name} (PV)`, monthlyOpexFor(e.pv.opex, e.mwPower), pvStart)) { await tx.cost.create({ data: c }); costsCreated++; }

      if (e.storage && e.financingStorage) {
        const st = e.storage;
        const stStart = ymd(st.commissioningYear, st.commissioningMonth);
        const stRevenue = storageMonthlyRevenue(e);
        const bessName = `${e.name} — BESS ${st.powerMw} MW`;
        const bess = await tx.project.create({
          data: {
            isDemo: false,
            name: bessName,
            code: `${e.code}-BESS`,
            location: e.location,
            mwPower: st.powerMw,
            revenueMonthly: stRevenue,
            assetType: "BESS",
            capex: e.storageCapex,
            budgetTotal: e.storageCapex,
            status: "DEVELOPMENT" as any,
            startDate: ymd(e.financingStorage.startYear, e.financingStorage.startMonth),
            endDate: stStart,
            description: `${GRZ_MARKER} Magazyn energii przy farmie ${e.name}. Przychód mies. ${stRevenue.toLocaleString("pl-PL")} zł = ${st.powerMw} MW × ${st.throughputMwhPerMw} MWh/MW/rok × ${st.pricePlnMwh} zł/MWh / 12 (rok 1, degradacja ${st.degradationPct}%/rok). CAPEX ${e.storageCapex.toLocaleString("pl-PL")} zł. Uruchomienie ${st.commissioningMonth}/${st.commissioningYear}.`
          }
        });
        projectsCreated++;
        newIdByName[exactName(bessName)] = bess.id;
        await tx.financing.create({ data: modelFinancing(bess.id, {
          lender: "Model budżetowy (Grzegorz) — BESS", subject: `${e.name}: magazyn energii ${st.powerMw} MW`,
          principal: Math.round(e.storageCapex * e.financingStorage.debtSharePct / 100), fin: e.financingStorage, note: "Kredyt na magazyn energii:"
        }) });
        financingsCreated++;
        for (const c of opexCosts(bess.id, `${e.name} (BESS)`, monthlyOpexFor(st.opex, st.powerMw), stStart)) { await tx.cost.create({ data: c }); costsCreated++; }
      }
    }

    // ---- 4. Budowa: 6 farm spoza modelu Grzegorza (CF Farmy.xlsx) ----
    const grzNames = new Set(PV_BUDGET_ENTRIES.map((e) => exactName(e.name)));
    for (const p of CF_PORTFOLIO_PROJECTS) {
      if (grzNames.has(exactName(p.name))) continue;
      const rev = defaultMonthlyRevenue(p.mwPower);
      const created = await tx.project.create({
        data: {
          isDemo: false,
          name: p.name,
          code: p.code,
          mwPower: p.mwPower,
          revenueMonthly: rev,
          energyBuyer: p.energyBuyer,
          assetType: "PV",
          capex: p.capex,
          status: p.status as any,
          startDate: p.startDate ? new Date(p.startDate) : null,
          endDate: p.endDate ? new Date(p.endDate) : null,
          description: `${CF_MARKER} Przychód mies. ${rev.toLocaleString("pl-PL")} zł = ${p.mwPower} MW × ${DEFAULT_YIELD_KWH_PER_KWP} kWh/kWp × (${DEFAULT_PRICE_PLN_MWH} + ${DEFAULT_GO_PLN_MWH}) zł/MWh / 12 — domyślne założenia z narzędzia Grzegorza, do potwierdzenia. Brak danych OPEX i CAPEX wg modelu. ${p.description}`
        }
      });
      projectsCreated++;
      newIdByName[exactName(p.name)] = created.id;
    }
    for (const f of CF_PORTFOLIO_FINANCINGS) {
      if (grzNames.has(exactName(f.projectName))) continue; // dla farm Grzegorza finansowanie jest z jego modelu
      const projectId = newIdByName[exactName(f.projectName)];
      if (!projectId) continue;
      await tx.financing.create({ data: {
        lender: f.lender, subject: f.subject ?? null, type: f.type as any,
        initialAmount: f.initialAmount, remainingBalance: f.remainingBalance, monthlyPayment: f.monthlyPayment,
        numInstallments: f.numInstallments, interestRate: f.interestRate,
        nextPaymentDate: f.nextPaymentDate ? new Date(f.nextPaymentDate) : null, projectId, notes: f.notes
      } });
      financingsCreated++;
    }

    // ---- 5. Przepięcie kosztów/umów po nazwie farmy ----
    let relinkedCosts = 0, relinkedContracts = 0;
    for (const c of linkedCosts) {
      if (opexToDelete.includes(c.id)) continue;
      const nid = newIdByName[oldNameById[c.projectId]];
      if (nid) { await tx.cost.update({ where: { id: c.id }, data: { projectId: nid } }); relinkedCosts++; }
    }
    for (const c of linkedContracts) {
      const nid = newIdByName[oldNameById[c.projectId]];
      if (nid) { await tx.contract.update({ where: { id: c.id }, data: { projectId: nid } }); relinkedContracts++; }
    }

    return { projectsDeleted: oldIds.length, projectsCreated, financingsCreated, costsCreated, opexDeleted: opexToDelete.length, relinkedCosts, relinkedContracts, detachedCosts: linkedCosts.length - opexToDelete.length - relinkedCosts, detachedContracts: linkedContracts.length - relinkedContracts };
  }, { timeout: 60000 });

  await logChange(
    req,
    "project",
    null,
    "update",
    `RESET portfela farm (decyzja Kamila 2026-09-18): usunięto ${result.projectsDeleted} projektów (z finansowaniem), utworzono ${result.projectsCreated} projektów (7 farm Grzegorza + BESS + 6 z CF Farmy.xlsx), ${result.financingsCreated} finansowań, ${result.costsCreated} kosztów OPEX; przepięto ${result.relinkedCosts} kosztów i ${result.relinkedContracts} umów, odpięto ${result.detachedCosts}/${result.detachedContracts}.`
  );

  return NextResponse.json({ ok: true, ...result });
}
