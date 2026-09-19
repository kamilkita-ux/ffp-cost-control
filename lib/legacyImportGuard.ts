import { prisma } from "./prisma";

// AUDYT 2026-09-19: po "Wyzeruj i odbuduj portfel farm" (reset-farm-portfolio)
// starsze importy (CF Farmy.xlsx, model Grzegorza w wersji "dopisz",
// scalanie duplikatów, przywracanie przychodów) są NIEAKTUALNE i realnie
// psują dane: nadpisują CAPEX/daty wartościami z arkusza kontrolera,
// dokładają drugie finansowanie tej samej farmy, zerują raty, dublują BESS.
// Dlatego każdy z nich jest blokowany (409), gdy w bazie istnieje projekt
// zbudowany przez reset (marker w opisie).
export const GRZ_MARKER = "[Źródło: model Grzegorza, Budżet Farm PV, 2026-09-17]";

export async function portfolioWasReset(): Promise<boolean> {
  const n = await prisma.project.count({ where: { deletedAt: null, description: { contains: GRZ_MARKER } } });
  return n > 0;
}

export const LEGACY_DISABLED_MESSAGE =
  "Ten import jest wyłączony: portfel farm został zbudowany od nowa z danych Grzegorza (reset 18.09.2026). Ponowne użycie nadpisałoby lub zdublowało dane. Użyj „Zastosuj poprawki danych” albo edytuj projekt ręcznie.";
