import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/audit";
import { isAdminCaller } from "@/lib/access";
import { looksLikeRealBackup } from "@/lib/backupShape";
import { restoreSnapshot } from "@/lib/restoreData";

// POST /api/restore — przywraca CAŁĄ bazę z pliku kopii zapasowej JSON
// (dokładnie ten sam format, który zwraca /api/bootstrap i który pobiera
// przycisk "Pobierz kopię zapasową" w Ustawieniach).
//
// Operacja niszcząca: usuwa bieżące dane i zastępuje je zawartością pliku,
// w jednej transakcji (albo wszystko się powiedzie, albo nic się nie zmienia).
//
// Admin-only od 2026-09-08 (wcześniej dowolne konto mogło podmienić bazę).
// Od audytu 2026-09-19 (pkt 25) sama logika przywracania jest w
// lib/restoreData.ts (wspólna z przywracaniem punktów backupu) — tu tylko
// uprawnienia, walidacja wejścia i dziennik zmian.
export async function POST(req: Request) {
  if (!(await isAdminCaller(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const data = await req.json();
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (!looksLikeRealBackup(data)) {
    return NextResponse.json(
      { error: "invalid_input", message: "Plik nie wygląda na prawidłowy eksport bazy (brak którejś z oczekiwanych tablic albo eksport z konta ograniczonego) — przywracanie przerwane, żeby nie wyczyścić bazy przypadkowym plikiem." },
      { status: 400 }
    );
  }
  await restoreSnapshot(prisma, data);
  await logChange(req, "database", null, "update", "Przywrócono bazę z pliku kopii zapasowej (restore)");
  return NextResponse.json({ ok: true });
}
