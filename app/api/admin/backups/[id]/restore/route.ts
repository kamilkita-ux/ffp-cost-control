import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { restoreSnapshot } from "@/lib/restoreData";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/backups/[id]/restore — przywraca CAŁĄ bazę do stanu
// zapisanego w danym punkcie backupu (operacja niszcząca, w jednej
// transakcji). Odpowiednik "Wgraj kopię zapasową", ale bez potrzeby
// ręcznego pobierania/wgrywania pliku — jeden klik na liście backupów.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await restoreSnapshot(prisma, backup.data);
  } catch (err: any) {
    return NextResponse.json({ error: "restore_failed", message: String(err?.message || err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
