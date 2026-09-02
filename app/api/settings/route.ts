import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/audit";

const ALLOWED_KEYS = new Set(["currency", "costCategories", "costCenters"]);

// PUT /api/settings  { key: "currency" | "costCategories" | "costCenters", value: ... }
// Proste słowniki (kategorie kosztów, centra kosztów) i ustawienia (waluta)
// trzymane jako klucz -> wartość JSON — nie potrzebują osobnych tabel.
export async function PUT(req: Request) {
  const body = await req.json();
  const key = String(body?.key ?? "");
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }
  const saved = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: body.value },
    update: { value: body.value }
  });
  await logChange(req, "setting", key, "update", key);
  return NextResponse.json({ key: saved.key, value: saved.value });
}
