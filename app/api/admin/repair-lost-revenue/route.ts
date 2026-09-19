import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { portfolioWasReset, LEGACY_DISABLED_MESSAGE } from "@/lib/legacyImportGuard";
import { LOST_REVENUE_REPAIRS } from "@/lib/lostRevenueRepair";

// POST /api/admin/repair-lost-revenue — przywraca "Przychód / mies." (i
// lokalizację) utracone przy pierwszym scalaniu duplikatów — patrz
// lib/lostRevenueRepair.ts. Wpisuje wartość TYLKO gdy pole jest puste/0;
// nigdy nie nadpisuje istniejącej wartości. Idempotentne, admin-only.
function exactName(s: string | null | undefined): string {
  return (s || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (await portfolioWasReset()) {
    return NextResponse.json({ error: "legacy_disabled", message: LEGACY_DISABLED_MESSAGE }, { status: 409 });
  }

  const all: Array<Record<string, any>> = await prisma.project.findMany({ where: { isDemo: false, deletedAt: null } });
  const filled: string[] = [];
  const skipped: string[] = [];

  for (const r of LOST_REVENUE_REPAIRS) {
    const candidates = all.filter((p) => exactName(p.name) === exactName(r.name));
    const project = candidates.find((p) => p.code) || candidates[0];
    if (!project) {
      skipped.push(`${r.name}: nie znaleziono projektu — pomiń.`);
      continue;
    }
    const data: Record<string, unknown> = {};
    const curRev = project.revenueMonthly;
    if (curRev === null || curRev === undefined || curRev === "" || Number(curRev) === 0) {
      data.revenueMonthly = r.revenueMonthly;
    }
    if (r.location && !(project.location || "").trim()) {
      data.location = r.location;
    }
    if (Object.keys(data).length) {
      await prisma.project.update({ where: { id: project.id }, data });
      filled.push(`${r.name}: ${Object.keys(data).map((k) => `${k}=${String(data[k])}`).join(", ")}`);
    } else {
      skipped.push(`${r.name}: przychód już wpisany (${String(curRev)}) — nie nadpisuję.`);
    }
  }

  await logChange(
    req,
    "project",
    null,
    "update",
    `Przywrócenie utraconych przychodów po scalaniu duplikatów: ${filled.length} uzupełnionych (${filled.join("; ") || "brak"}); ${skipped.length} pominiętych.`
  );

  return NextResponse.json({ ok: true, filled, skipped });
}
