// W repozytorium nie ma node_modules (instalacja odbywa się przy budowie na
// Railway), więc testy importujące middleware.ts biorą "next/server" z małej
// atrapy w tests/stubs/node_modules — ale tylko wtedy, gdy prawdziwy pakiet
// nie jest dostępny. Importować PRZED "next/server" (importy wykonują się
// w kolejności zapisu).
import path from "node:path";
import fs from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const M = require("module") as { _resolveFilename: (request: string, ...rest: unknown[]) => string };

// Celowo bez require.resolve: tsx zapamiętuje nieudane rozwiązanie modułu i
// późniejsza podmiana już by nie zadziałała. Sprawdzamy plik na dysku.
const hasReal = fs.existsSync(path.join(__dirname, "..", "..", "node_modules", "next", "package.json"));
if (!hasReal) {
  const stubPath = path.join(__dirname, "node_modules", "next", "server.js");
  const original = M._resolveFilename;
  M._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    if (request === "next/server") return stubPath;
    return original.call(this, request, ...rest);
  };
}
