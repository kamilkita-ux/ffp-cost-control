import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { DATA_ADJUSTMENTS } from "@/lib/dataAdjustments";

// POST /api/admin/apply-data-adjustments — stosuje listę poprawek z
// lib/dataAdjustments.ts (patrz opis tam). Admin-only, idempotentne.
const OPEX_MARKER = "[OPEX wg modelu Grzegorza]";
function exactName(s: string | null | undefined): string {
  return (s || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const all: Array<Record<string, any>> = await prisma.project.findMany({ where: { isDemo: false, deletedAt: null } });
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const a of DATA_ADJUSTMENTS) {
    const candidates = all.filter((p) => exactName(p.name) === exactName(a.projectName));
    const project = candidates.find((p) => p.code) || candidates[0];
    if (!project) { skipped.push(`${a.id}: nie znaleziono projektu "${a.projectName}"`); continue; }

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a.set)) {
      if (v === undefined) continue;
      data[k] = (k === "startDate" || k === "endDate") ? new Date(String(v)) : v;
    }
    if (Object.keys(data).length) await prisma.project.update({ where: { id: project.id }, data });

    let opexMoved = 0;
    if (a.opexStartDate) {
      const res = await prisma.cost.updateMany({
        where: { projectId: project.id, notes: { contains: OPEX_MARKER } },
        data: { costDate: new Date(a.opexStartDate) }
      });
      opexMoved = res.count;
    }
    applied.push(`${a.id}: ${a.projectName} — ${Object.keys(data).join(", ")}${a.opexStartDate ? `, OPEX od ${a.opexStartDate} (${opexMoved} poz.)` : ""}`);
  }

  await logChange(req, "project", null, "update", `Zastosowano poprawki danych (lib/dataAdjustments.ts): ${applied.join("; ") || "brak"}. Pominięte: ${skipped.join("; ") || "brak"}.`);
  return NextResponse.json({ ok: true, applied, skipped });
}
