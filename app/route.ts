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
  // Meta tagi i manifest poniżej to "PWA-fikacja" (2026-09-07, na
  // polecenie Kamila: appka ma dać się dodać do ekranu głównego telefonu/
  // iPada i otwierać jak natywna aplikacja, nie tylko przez przeglądarkę).
  // Pliki manifest.json / ikony / sw.js leżą w public/ — Next.js serwuje
  // je automatycznie pod tymi samymi ścieżkami w katalogu głównym.
  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>${title}</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0f6e4f">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="FFP Cost">
</head>
<body>
${body}
<script>
// Rejestracja Service Workera — patrz public/sw.js: cache'uje TYLKO
// powłokę interfejsu (żeby appka otwierała się od razu z ekranu głównego),
// nigdy dane z /api/* (te zawsze świeże z sieci — patrz komentarz w sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js').catch(function(){ /* offline-boost jest opcjonalny — appka ma działać też bez tego */ });
  });
}
</script>
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
