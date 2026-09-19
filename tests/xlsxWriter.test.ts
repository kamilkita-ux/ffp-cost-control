// Test zapisu .xlsx bez zależności (lib/xlsxWriter.ts): plik musi być
// poprawnym ZIP-em z arkuszami, które da się odczytać (tu: własny czytnik
// ZIP z zlib + kontrola XML; w sandboxie dodatkowo sprawdzone w openpyxl).
import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { buildXlsx } from "../lib/xlsxWriter";

function readZip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8), csize = buf.readUInt32LE(off + 18), nlen = buf.readUInt16LE(off + 26), elen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nlen).toString("utf-8");
    const data = buf.subarray(off + 30 + nlen + elen, off + 30 + nlen + elen + csize);
    out[name] = method === 8 ? inflateRawSync(data).toString("utf-8") : data.toString("utf-8");
    off += 30 + nlen + elen + csize;
  }
  return out;
}

test("buildXlsx: poprawny ZIP, arkusze, liczby jako liczby, tekst z polskimi znakami i znakami specjalnymi", () => {
  const buf = buildXlsx([
    { name: "Projekty", rows: [["Nazwa", "MW", "Uwagi"], ["Dębowiec", 1, "a < b & \"c\""], ["Łubno", 2.5, null]] },
    { name: "Bardzo/długa:nazwa*arkusza[ponad]31znaków?", rows: [["x"]] }
  ]);
  assert.equal(buf.readUInt32LE(0), 0x04034b50, "sygnatura ZIP");
  const files = readZip(buf);
  assert.ok(files["[Content_Types].xml"] && files["xl/workbook.xml"] && files["xl/worksheets/sheet1.xml"] && files["xl/worksheets/sheet2.xml"]);
  assert.match(files["xl/worksheets/sheet1.xml"], /<c r="B2"><v>1<\/v><\/c>/);
  assert.match(files["xl/worksheets/sheet1.xml"], /<c r="B3"><v>2\.5<\/v><\/c>/);
  assert.match(files["xl/worksheets/sheet1.xml"], /Dębowiec/);
  assert.match(files["xl/worksheets/sheet1.xml"], /a &lt; b &amp; &quot;c&quot;/);
  assert.doesNotMatch(files["xl/worksheets/sheet1.xml"], /<c r="C3"/, "pusta komórka pomijana");
  const wb = files["xl/workbook.xml"];
  assert.match(wb, /name="Projekty"/);
  const m = wb.match(/<sheet name="([^"]+)" sheetId="2"/);
  assert.ok(m && m[1].length <= 31 && !/[\\/?*[\]:]/.test(m[1]), "nazwa arkusza oczyszczona i ≤ 31 znaków");
  // koniec centralnego katalogu
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
  assert.equal(buf.readUInt16LE(buf.length - 22 + 10), 6, "6 plików w archiwum");
});
