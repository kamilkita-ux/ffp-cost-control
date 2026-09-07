import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { restoreSnapshot } from "@/lib/restoreData";
import { isAdminCaller } from "@/lib/access";
import { logChange } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/backups/[id]/restore — przywraca CAŁĄ bazę do stanu
// zapisanego w danym punkcie backupu (operacja niszcząca, w jednej
// transakcji). Odpowiednik "Wgraj kopię zapasową", ale bez potrzeby
// ręcznego pobierania/wgrywania pliku — jeden klik na liście backupów.
// Admin-only — patrz uwaga w app/api/admin/backups/route.ts (brakujący
// guard, naprawa 2026-09-08): to najbardziej destrukcyjna operacja w całej
// aplikacji (kasuje i zastępuje CAŁĄ produkcyjną bazę), a wcześniej mogło
// ją wywołać dowolne zalogowane konto, także ograniczone.
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await restoreSnapshot(prisma, backup.data);
  } catch (err: any) {
    return NextResponse.json({ error: "restore_failed", message: String(err?.message || err) }, { status: 500 });
  }
  await logChange(req, "database", id, "update", "Przywrócono bazę z punktu backupu (panel administracyjny)");
  return NextResponse.json({ ok: true });
}
