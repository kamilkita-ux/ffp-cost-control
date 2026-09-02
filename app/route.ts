import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

// Serwuje istniejący interfejs FFP Cost Control (app/app-shell.html) pod "/".
// Cały wygląd, nawigacja i formularze pozostają bez zmian — jedyna różnica
// względem poprzedniej wersji polega na tym, że dane pochodzą teraz z
// PostgreSQL przez /api/* (patrz app-shell.html: refreshState()/apiCall()).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cachedHtml: string | null = null;

function loadShell(): string {
  if (cachedHtml && process.env.NODE_ENV === "production") return cachedHtml;
  const filePath = path.join(process.cwd(), "app", "app-shell.html");
  const raw = fs.readFileSync(filePath, "utf8");
  const titleMatch = raw.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : "FFP Cost Control";
  const body = raw.replace(/<title>.*?<\/title>\s*/i, "");
  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>`;
  cachedHtml = html;
  return html;
}

export async function GET() {
  return new NextResponse(loadShell(), {
    status: 200,
    // Bez Cache-Control przeglądarka (zwłaszcza na telefonie) potrafi
    // pokazywać starą wersję strony po wdrożeniu nowego kodu, mimo że
    // serwer ma już nową wersję — stąd wrażenie "nie działa", chociaż
    // deploy przeszedł poprawnie. Wymuszamy zawsze świeże pobranie.
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate"
    }
  });
}
