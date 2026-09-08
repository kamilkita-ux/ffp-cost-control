import { prisma } from "./prisma";
import { getVerifiedSession } from "./access";

// Odczytuje login użytkownika, który wykonał żądanie — do podpisywania
// wpisów w dzienniku zmian. Sprawdza Basic Auth (Kamil / Jerzy / Grzegorz —
// tak działało to od początku) ORAZ, jeśli nagłówka Basic Auth nie ma,
// sesję z systemu kont (AUTH_MODE=accounts).
//
// UWAGA — naprawione 2026-09-08 (audyt logowania zmian): przed tą zmianą
// funkcja sprawdzała WYŁĄCZNIE nagłówek Basic Auth. Po przełączeniu na
// AUTH_MODE=accounts każdy wpis w dzienniku zmian (kto/kiedy/co) zapisywałby
// się jako "nieznany", bo accounts-mode nie wysyła nagłówka Basic Auth —
// dziennik zmian straciłby swoją podstawową wartość (rozliczalność: kto
// dokonał zmiany) dokładnie w momencie przejścia na docelowy system kont.
export async function currentUser(req: Request): Promise<string> {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
      const idx = decoded.indexOf(":");
      if (idx !== -1) {
        const user = decoded.slice(0, idx);
        if (user) return user;
      }
    } catch {
      // ignoruj błędne nagłówki, spróbuj sesji kont poniżej
    }
  }
  const session = await getVerifiedSession(req);
  if (session) return session.username;
  return "nieznany";
}

// Zapisuje wpis w dzienniku zmian. Celowo NIGDY nie rzuca błędu dalej —
// logowanie audytowe nie może zablokować głównej operacji zapisu danych.
export async function logChange(
  req: Request,
  entity: string,
  entityId: string | null,
  action: "create" | "update" | "delete",
  summary?: string
) {
  try {
    await prisma.changeLog.create({
      data: {
        user: await currentUser(req),
        entity,
        entityId: entityId || undefined,
        action,
        summary: summary || undefined
      }
    });
  } catch (e) {
    console.error("[audit] Nie udało się zapisać wpisu w dzienniku zmian:", e);
  }
}
