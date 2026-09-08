import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSnapshot } from "@/lib/snapshot";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/admin/backups — lista dostępnych punktów przywracania (kopie
// automatyczne co kilka godzin z osobnego serwisu-cron na Railway, oraz
// kopie ręczne "na żądanie"), najnowsze pierwsze. Zwraca tylko metadane +
// liczności rekordów — pełne dane pobiera się osobno (GET .../[id]).
//
// UWAGA — znalezione i naprawione 2026-09-08 (audyt bezpieczeństwa ścieżek
// zapisu): mimo ścieżki "/api/admin/...", ten route (i cały katalog
// backups/restore) nie miał ŻADNEGO sprawdzenia isAdminCaller — w
// przeciwieństwie do /api/admin/users, który to sprawdzenie ma od dawna.
// Skutek: każde zalogowane konto, także "ograniczone" (bez wglądu w
// wynagrodzenia), mogło pobrać pełną, nieredagowaną kopię zapasową bazy
// (z surowymi kwotami wynagrodzeń) albo — gorzej — nadpisać całą bazę
// starym backupem. Domyślny opiekun tego katalogu to admin (rola "full"
// w trybie kont / główne konto Kamila w Basic Auth), tak jak /api/admin/users.
export async function GET(req: Request) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const backups = await prisma.backup.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, createdAt: true, kind: true, data: true }
  });
  return NextResponse.json(
    backups.map((b) => {
      const d: any = b.data || {};
      return {
        id: b.id,
        createdAt: b.createdAt,
        kind: b.kind,
        counts: {
          employees: Array.isArray(d.employees) ? d.employees.length : 0,
          projects: Array.isArray(d.projects) ? d.projects.length : 0,
          costs: Array.isArray(d.costs) ? d.costs.length : 0,
          vendors: Array.isArray(d.vendors) ? d.vendors.length : 0
        }
      };
    })
  );
}

// POST /api/admin/backups — tworzy kopię "na żądanie" (kind="manual"),
// np. tuż przed ryzykowną zmianą danych — niezależnie od kopii automatycznych.
export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const snapshot = await buildSnapshot(prisma);
  const created = await prisma.backup.create({
    data: { kind: "manual", data: snapshot as any }
  });
  await logChange(req, "backup", created.id, "create", "Utworzono ręczną kopię zapasową");
  return NextResponse.json(
    { id: created.id, createdAt: created.createdAt, kind: created.kind },
    { status: 201 }
  );
}
