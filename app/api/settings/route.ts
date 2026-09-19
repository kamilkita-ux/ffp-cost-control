import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/audit";
import { isRestrictedUser } from "@/lib/access";

const ALLOWED_KEYS = new Set(["currency", "costCategories", "costCenters", "assumptions", "fixedCostSchedule", "shareholderStructure", "groupStructure"]);

// Klucze finansowe/wrażliwe — patrz SETTINGS_PERMISSION_MATRIX w raporcie
// nocnym (2026-09-08), zatwierdzone przez Kamila: konto ograniczone (bez
// wglądu w wynagrodzenia) nie powinno móc zapisywać założeń finansowych,
// struktury akcjonariatu ani harmonogramu kosztów stałych (ten ostatni
// zawiera dokładnie te nazwiska/kwoty, które redactFixedCostLineItem ukrywa
// przy odczycie — bez tego ograniczenia dało by się je nadpisać przez samo
// wywołanie API, mimo że w interfejsie nie ma do tego żadnego formularza).
const RESTRICTED_FORBIDDEN_KEYS = new Set(["assumptions", "fixedCostSchedule", "shareholderStructure", "groupStructure"]);

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
  // AUDYT 2026-09-19: minimalna walidacja kształtu — zły typ (np. string zamiast
  // tablicy kategorii) wywalał interfejs WSZYSTKIM użytkownikom.
  const v = body.value;
  const bad = (msg: string) => NextResponse.json({ error: "invalid_value", message: msg }, { status: 400 });
  if (key === "costCategories" || key === "costCenters") {
    if (!Array.isArray(v) || !v.every((x: unknown) => typeof x === "string")) return bad("Oczekiwano listy nazw (tablica tekstów).");
  } else if (key === "currency") {
    if (!["PLN", "EUR", "USD"].includes(String(v))) return bad("Waluta musi być PLN, EUR lub USD.");
  } else if (key === "groupStructure") {
    if (!v || typeof v !== "object" || !Array.isArray(v.entities) || !Array.isArray(v.shares)) return bad("Struktura grupy musi mieć listy entities i shares.");
    if (!v.entities.every((e: any) => e && typeof e.id === "string" && typeof e.name === "string")) return bad("Każda spółka musi mieć id i nazwę.");
    if (!v.shares.every((s: any) => s && typeof s.owner === "string" && typeof s.owned === "string" && Number.isFinite(Number(s.pct)))) return bad("Każdy udział musi mieć właściciela, spółkę i procent.");
  } else if (key === "shareholderStructure") {
    if (!v || typeof v !== "object" || !Array.isArray(v.shareholders)) return bad("Akcjonariat musi mieć listę shareholders.");
  } else if (key === "assumptions" || key === "fixedCostSchedule") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return bad("Oczekiwano obiektu ustawień.");
  }
  const saved = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: body.value },
    update: { value: body.value }
  });
  await logChange(req, "setting", key, "update", key);
  return NextResponse.json({ key: saved.key, value: saved.value });
}
