import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/audit";
import { isRestrictedUser } from "@/lib/access";

const ALLOWED_KEYS = new Set(["currency", "costCategories", "costCenters", "assumptions", "fixedCostSchedule", "shareholderStructure"]);

// Klucze finansowe/wrażliwe — patrz SETTINGS_PERMISSION_MATRIX w raporcie
// nocnym (2026-09-08), zatwierdzone przez Kamila: konto ograniczone (bez
// wglądu w wynagrodzenia) nie powinno móc zapisywać założeń finansowych,
// struktury akcjonariatu ani harmonogramu kosztów stałych (ten ostatni
// zawiera dokładnie te nazwiska/kwoty, które redactFixedCostLineItem ukrywa
// przy odczycie — bez tego ograniczenia dało by się je nadpisać przez samo
// wywołanie API, mimo że w interfejsie nie ma do tego żadnego formularza).
const RESTRICTED_FORBIDDEN_KEYS = new Set(["assumptions", "fixedCostSchedule", "shareholderStructure"]);

// PUT /api/settings  { key: "currency" | "costCategories" | "costCenters" | "assumptions" | "fixedCostSchedule" | "shareholderStructure", value: ... }
// Proste słowniki (kategorie kosztów, centra kosztów) i ustawienia (waluta)
// trzymane jako klucz -> wartość JSON — nie potrzebują osobnych tabel.
// "assumptions" i "fixedCostSchedule" to założenia finansowe i harmonogram
// kosztów stałych od kontrolera (domyślne wartości: patrz app/api/bootstrap) —
// edytowalne z modułu "Założenia". "shareholderStructure" to kurs akcji,
// liczba akcji, wycena aktywów i lista akcjonariuszy — edytowalne z modułu
// "Akcjonariat".
export async function PUT(req: Request) {
  const body = await req.json();
  const key = String(body?.key ?? "");
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }
  if (RESTRICTED_FORBIDDEN_KEYS.has(key) && (await isRestrictedUser(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const saved = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: body.value },
    update: { value: body.value }
  });
  await logChange(req, "setting", key, "update", key);
  return NextResponse.json({ key: saved.key, value: saved.value });
}
