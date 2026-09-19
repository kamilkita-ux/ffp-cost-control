// Struktura grupy kapitałowej FFP — dane od Kamila (2026-09-19), stan
// wyjściowy modułu "Struktura grupy" (AppSetting key="groupStructure").
// Później edytowane WYŁĄCZNIE w aplikacji (zakładka Struktura grupy) — ten
// plik to tylko wartość domyślna, gdy w bazie nie ma jeszcze zapisu.
//
// Model (JSON w AppSetting):
//  entities[]: { id, name, short?, type: "S.A." | "Sp. z o.o." | "zewnętrzny" | "osoba",
//                kind: "parent" | "company" | "external", status: "aktywna" | "KRS w toku" | "planowana" | "sprzedana",
//                note?, roles: [{ person, role }], projectIds: [] (farmy/projekty przypięte do spółki) }
//  shares[]:   { owner: entityId, owned: entityId, pct: number, pending?: boolean, note? }
// Udział efektywny FFP liczony w aplikacji: iloczyn udziałów po ścieżce od FFP.
export type GroupRole = { person: string; role: string };
export type GroupEntity = {
  id: string; name: string; short?: string;
  type: "S.A." | "Sp. z o.o." | "zewnętrzny" | "osoba";
  kind: "parent" | "company" | "external";
  status: "aktywna" | "KRS w toku" | "planowana" | "sprzedana";
  note?: string; roles: GroupRole[]; projectIds: string[];
};
export type GroupShare = { owner: string; owned: string; pct: number; pending?: boolean; note?: string };
export type GroupStructure = { version: number; asOfLabel: string; entities: GroupEntity[]; shares: GroupShare[] };

const JK_P = { person: "Jerzy Kędzior", role: "Prezes Zarządu" };
const MN = { person: "Michał Nyznar", role: "Prokurent" };
const TM = { person: "Tomasz Milas", role: "Prezes Zarządu" };
function spv(id: string, name: string, roles: GroupRole[], status: GroupEntity["status"] = "aktywna", note?: string): GroupEntity {
  return { id, name, type: "Sp. z o.o.", kind: "company", status, note, roles, projectIds: [] };
}

export const DEFAULT_GROUP_STRUCTURE: GroupStructure = {
  version: 1,
  asOfLabel: "19.09.2026 — wg informacji Kamila",
  entities: [
    { id: "ffp", name: "Farmy Fotowoltaiki Polska S.A.", short: "FFP", type: "S.A.", kind: "parent", status: "aktywna", note: "spółka publiczna (NewConnect) — właściciel grupy", roles: [{ person: "Kamil Kita", role: "Prezes Zarządu" }], projectIds: [] },
    { id: "farmy", name: "Farmy Sp. z o.o.", short: "Farmy", type: "Sp. z o.o.", kind: "company", status: "aktywna", roles: [JK_P, { person: "Maciej Zapart", role: "Prokurent" }, MN], projectIds: [] },
    { id: "evercon", name: "Evercon", type: "zewnętrzny", kind: "external", status: "aktywna", roles: [], projectIds: [] },
    { id: "theo", name: "Theo", type: "zewnętrzny", kind: "external", status: "aktywna", roles: [], projectIds: [] },
    { id: "tmt", name: "Grupa TMT", type: "zewnętrzny", kind: "external", status: "aktywna", roles: [], projectIds: [] },
    spv("f1", "Farma F1 Sp. z o.o.", [JK_P, MN]),
    spv("f2", "Farma F2 Sp. z o.o.", [JK_P, MN]),
    spv("f3", "Farma F3 Sp. z o.o.", [JK_P, MN]),
    spv("f4", "Farma F4 Sp. z o.o.", [JK_P, MN]),
    spv("f5", "Farma F5 Sp. z o.o.", [JK_P, MN]),
    spv("f6", "Farma F6 Sp. z o.o.", [JK_P, MN]),
    spv("f8", "Farma F8 Sp. z o.o.", [JK_P]),
    spv("f9", "Farma F9 Sp. z o.o.", [JK_P, MN]),
    spv("f10", "Farma F10 Sp. z o.o.", [JK_P, MN]),
    spv("f11", "Farma F11 Sp. z o.o.", [JK_P, MN]),
    spv("f13", "Farma F13 Sp. z o.o.", [JK_P, MN]),
    spv("mp", "Miejsce Piastowe Sp. z o.o.", [{ person: "Jerzy Kędzior", role: "Członek Zarządu" }, { person: "Filip Fersztorowski", role: "Prokurent" }, MN], "KRS w toku", "udziały Farmy 100% — do zaczytania w KRS"),
    spv("es68", "Elektrownia Słoneczna 68 Sp. z o.o.", [JK_P, MN]),
    spv("es84", "Elektrownia Słoneczna 84 Sp. z o.o.", [JK_P, MN]),
    spv("es95", "Elektrownia Słoneczna 95 Sp. z o.o.", [JK_P, { person: "Kamil Kita", role: "Prokurent" }], "KRS w toku", "czekamy na wpis KRS"),
    spv("es54", "Elektrownia Słoneczna 54 Sp. z o.o.", [TM]),
    spv("f7", "Farma F7 Sp. z o.o.", [TM]),
    spv("f12", "Farma F12 Sp. z o.o.", [TM])
  ],
  shares: [
    { owner: "ffp", owned: "farmy", pct: 74 },
    { owner: "evercon", owned: "farmy", pct: 13 },
    { owner: "theo", owned: "farmy", pct: 13 },
    ...["f1", "f2", "f3", "f4", "f5", "f6", "f8", "f9", "f10", "f11", "f13", "es68", "es84"].map((id) => ({ owner: "farmy", owned: id, pct: 100 })),
    { owner: "farmy", owned: "mp", pct: 100, pending: true },
    { owner: "farmy", owned: "es95", pct: 100, pending: true },
    { owner: "farmy", owned: "es54", pct: 90 },
    { owner: "tmt", owned: "es54", pct: 10 },
    { owner: "es54", owned: "f7", pct: 90 },
    { owner: "tmt", owned: "f7", pct: 10 },
    { owner: "es54", owned: "f12", pct: 90 },
    { owner: "tmt", owned: "f12", pct: 10 }
  ]
};
