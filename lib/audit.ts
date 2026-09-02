import { prisma } from "./prisma";

// Odczytuje login użytkownika z nagłówka Basic Auth (ten sam login, którym
// zalogował się do aplikacji — Kamil / Jerzy / Grzegorz). To NIE jest pełny
// system kont — tylko podpisywanie wpisów w dzienniku zmian tym, kto był
// zalogowany w danym żądaniu.
export function currentUser(req: Request): string {
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
      // ignoruj błędne nagłówki — zaloguj jako "nieznany"
    }
  }
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
        user: currentUser(req),
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
