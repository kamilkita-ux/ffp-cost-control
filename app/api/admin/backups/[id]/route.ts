import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminCaller } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/backups/[id] — zwraca PEŁNE, NIEREDAGOWANE dane danego
// punktu backupu (surowe wynagrodzenia włącznie), do pobrania jako plik
// .json. Admin-only — patrz uwaga w app/api/admin/backups/route.ts (ten sam
// brakujący guard, ta sama naprawa 2026-09-08).
export async function GET(req: Request, { params }: Ctx) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(backup.data);
}
