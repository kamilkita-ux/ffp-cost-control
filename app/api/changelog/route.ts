import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/changelog?limit=200 — ostatnie wpisy dziennika zmian (audyt).
// Kto/kiedy/co zmienił — login odczytany z Basic Auth w chwili zapisu
// (patrz lib/audit.ts). Tylko odczyt, bez paginacji kursorowej — dziennik
// przegląda się okazjonalnie w Ustawieniach, nie potrzeba na razie więcej.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitParam = parseInt(searchParams.get("limit") || "200", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 200;

  const entries = await prisma.changeLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      user: e.user || "nieznany",
      entity: e.entity,
      entityId: e.entityId || "",
      action: e.action,
      summary: e.summary || ""
    }))
  });
}
