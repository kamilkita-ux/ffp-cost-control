import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/backups/[id] — zwraca pełne dane danego punktu backupu
// (do pobrania jako plik .json, tym samym mechanizmem co ręczny eksport).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(backup.data);
}
