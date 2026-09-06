# CHECKPOINT DLA LU — Dashboard Prezesa FFP (FFP Cost Control)
**Data:** 06.09.2026
**Przygotował:** Claude (sesja robocza nad kodem aplikacji), na polecenie Kamila Kity
**Przeznaczenie:** przekazanie do LU Executive / FFP Command Center jako trzeci filar (obok FFP Inwestor i Kita AI Hub) do złożenia FFP CHECKPOINT 0.
**Zasada dokumentu:** każda sekcja rozdziela ✅ **POTWIERDZONE** (rzeczywiście zweryfikowany stan) od 🔶 **ZBUDOWANE, NIE POTWIERDZONE NA PRODUKCJI** i 📋 **PLANOWANE/ZAŁOŻENIE**. Nic poniżej nie jest domysłem — tam gdzie nie miałem twardego źródła (np. treść żywego pliku produkcyjnego, bo to środowisko nie ma dostępu sieciowego do domeny produkcyjnej), jest to wyraźnie napisane.

---

## 1. Cel dashboardu

"FFP Cost Control" / roboczo "Dashboard Prezesa" to wewnętrzne narzędzie zarządcze dla Farmy Fotowoltaiki Polska S.A. Cel: jedno miejsce prawdy o bieżących kosztach, przychodach, zysku, projektach, pracownikach, umowach, finansowaniu (leasing/kredyt) i płatnościach spółki — zastępujące rozproszone arkusze — z KPI liczonymi automatycznie z danych transakcyjnych, a nie ręcznie sumowanymi.

---

## 2. Co już zbudowano (zakres funkcjonalny — kod istnieje w repozytorium)

Moduły/widoki (16 zakładek w menu głównym): Dashboard, Pracownicy, Projekty, Koszty, Koszty stałe, Umowy i abonamenty, Leasingi/kredyty, Dostawcy, Płatności, Działy/centra kosztów, Analiza kosztów, Wykresy, Założenia, Symulator oszczędności, Dokumenty, Ustawienia/słowniki.

Pełny model danych w PostgreSQL (Prisma): Department, Project, Employee, EmployeeProjectAllocation (alokacja % czasu pracownika na projekt/administrację), Vendor, Cost, Contract, Financing, Document, AppSetting, Backup, ChangeLog.

Mechanizmy: dziennik zmian/audyt (ChangeLog — kto/kiedy/co, na bazie loginu Basic Auth), automatyczne kopie zapasowe co kilka godzin (osobny serwis cron na Railway) + kopie ręczne + przywracanie z poziomu UI, eksport CSV z BOM (poprawne polskie znaki w Excelu), autozapis wersji roboczej formularza (ochrona przed utratą danych), oznaczanie danych DEMO (`isDemo`) tak, by przykładowe dane nigdy nie wchodziły do żadnego wyliczenia finansowego, konta z ograniczonym dostępem (bez wglądu w wynagrodzenia — dla Grzegorza/Macieja/Michała/Magdaleny) obok kont pełnych (Kamil, Jerzy).

---

## 3. Co rzeczywiście działa ✅ POTWIERDZONE (produkcja)

**Twarde źródło:** historia deploymentów Railway (`list-deployments` + `environment-status`, sprawdzone dziś). Ostatni i jedyny aktualnie aktywny deployment serwisu `app` to commit `691ce69` ("Rename ffp-app-shell-final.html to app-shell.html"), wdrożony **2026-09-05 00:41 UTC**, status SUCCESS, serwis online, 1/1 replik, bez błędów. Żaden nowszy deployment się NIE powiódł/nie uruchomił od tego czasu — mimo kilku prób wgrania nowszych plików przez Kamila (patrz sekcja 10).

Na tej podstawie za **potwierdzone jako żywe na produkcji** uznaję (zweryfikowane też wcześniej w tej sesji roboczej na realnym ekranie dashboardu):
- Cały rdzeń aplikacji: 14 spośród 16 zakładek (bez „Wykresy" i „Założenia" — patrz sekcja 4), CRUD na wszystkich encjach, panel „Wyniki wg okresu" (miesiąc/kwartał/rok/2/3/5 lat/własny zakres) z projekcją przychód−koszty−zysk, zestawienie portfela wg rodzaju aktywa (PV/BESS/Hybryda), CAPEX/ROI i przyszłe zapotrzebowanie na kapitał per projekt, alert przekroczenia budżetu projektu, ryzyko regulacyjne (warunki przyłączenia, pozwolenia, decyzja środowiskowa, MPZP), dziennik zmian.
- Zabezpieczenie dostępu: HTTP Basic Auth z kontem głównym (Kamil), kontami pełnymi (Jerzy) i ograniczonymi bez wynagrodzeń (Grzegorz, Maciej, Michał, Magdalena).
- Automatyczny backup (serwis `backup-cron` na Railway — ostatnie uruchomienie 2026-09-06 16:02 UTC zakończone sukcesem).
- Baza danych PostgreSQL na Railway — online.
- Poprawka: dane DEMO nie zawyżają już żadnych liczb finansowych (naprawiona wcześniej wykryta usterka).

**Zastrzeżenie:** nie mam bezpośredniego dostępu sieciowego do domeny produkcyjnej z tego środowiska, więc dokładna zawartość żywego pliku nie jest przeze mnie odczytana wprost — powyższe opieram na historii deploymentów Railway + wcześniejszej weryfikacji w tej sesji (zrzuty ekranu od Kamila, jego bezpośrednie potwierdzenia działania konkretnych funkcji).

---

## 4. Co jest tylko projektem/mockiem albo zbudowane, ale NIE potwierdzone na produkcji 🔶

Ten dashboard **nie ma modelu danych "mock"** w sensie fałszywych/testowych danych pokazywanych jako realne (poza jawnie oznaczonymi rekordami DEMO, które są usuwalne i nigdy nie liczą się do KPI). Natomiast jest istotna kategoria: **kod gotowy lokalnie, jeszcze niewgrany na produkcję** — bo `git push` z tego środowiska jest zablokowany na poziomie infrastruktury (proxy repozytoriów), więc wdrożenie wymaga ręcznego wgrania pliku przez Kamila w interfejsie GitHub. To jest główna, powtarzająca się blokada operacyjna tego projektu (patrz sekcja 11).

Zbudowane i zweryfikowane lokalnie (testy składni + funkcjonalne, w tym render w trybie jasnym/ciemnym), ale **jeszcze NIE potwierdzone jako żywe**, bo ostatnie próby wgrania kończyły się wgraniem przez pomyłkę starszych plików:
- Zakładki **Wykresy** (5 wykresów SVG: przychód wg projektu, koszty wg kategorii, harmonogram kosztów stałych w czasie — liniowy i skumulowany wg kategorii, profil produkcji) i **Założenia** (edytowalny formularz założeń finansowych + tabela referencyjna „Koszty stałe — pozycje"), zbudowane na bazie arkusza kontrolera `CF Farmy.xlsx`.
- Znacznik wersji `APP_BUILD_TAG` widoczny w menu (do weryfikacji, który build jest wdrożony).
- Poprawka liczenia: bieżący przychód/zysk mają liczyć się WYŁĄCZNIE z projektów o statusie „operacyjny" (nie z projektów w rozwoju/pozwoleniach/RTB/budowie, nawet jeśli mają wpisany planowany przychód) — to była naprawa realnie znalezionego błędu (dashboard pokazywał ~807 tys. zł/mies. zamiast realnych ~122 tys. zł/mies., bo sumował też przychód docelowy nieuruchomionych jeszcze projektów).

📋 **Świadomie NIE wdrożone do żadnej tabeli/KPI** (celowa decyzja, czeka na potwierdzenie): pozycje kosztów pracowniczych z arkusza kontrolera (Michał/Maciek/Natalia/Marek/Grzegorz Woźniak, forma B2B) — istnieje ryzyko, że to już są istniejące rekordy Employee w bazie, więc wpisanie ich ponownie jako nowych kosztów podwoiłoby fundusz płac. Dane te leżą na razie WYŁĄCZNIE jako tabela referencyjna, odłączona od jakiegokolwiek sumowania KPI, do czasu potwierdzenia przez Kamila/kontrolera.

---

## 5. Architektura i technologie

- **Next.js 15** (App Router) + **React 19**, aplikacja jednostronicowa oparta o pojedynczy plik `app/app-shell.html` (cały frontend: stan, widoki, wykresy SVG, logika KPI — bez frameworka SPA typu React na kliencie, czysty JS).
- **Prisma ORM 6** + **PostgreSQL 16**.
- **Railway** — hosting (serwis `app`, serwis `Postgres`, serwis cron `backup-cron`).
- Zabezpieczenie: HTTP Basic Auth w `middleware.ts` (zmienne środowiskowe Railway, nie tabela użytkowników — patrz ograniczenia w sekcji 14).
- Brak własnego systemu ról/kont — to nie jest pełny system autoryzacji, tylko zestaw par login/hasło.

---

## 6. Repozytorium / lokalizacja plików

- Repozytorium GitHub: `kamilkita-ux/ffp-cost-control`, branch `main`.
- Struktura: `app/app-shell.html` (cały frontend), `app/api/*/route.ts` (23 endpointy REST), `prisma/schema.prisma` (model danych), `middleware.ts` (Basic Auth), `scripts/` (backup).
- **Ograniczenie infrastrukturalne (potwierdzone dziś ponownie):** to środowisko robocze (sesja Claude) nie ma autoryzacji `git push` do tego repozytorium (blokada na poziomie proxy — repo nie jest na liście autoryzowanych repozytoriów tej sesji). Cały kod jest commitowany lokalnie (26 niewypchniętych commitów), a wdrożenie odbywa się przez ręczne wgranie pojedynczych plików w interfejsie GitHub przez Kamila. To jest znana, powtarzająca się przyczyna opóźnień i pomyłek (wgrywanie nieaktualnych plików).

---

## 7. Wszystkie obecne źródła danych

- **Baza produkcyjna PostgreSQL na Railway** — jedyne rzeczywiste źródło danych operacyjnych (projekty, pracownicy, koszty, umowy, finansowanie, dostawcy, dokumenty).
- **Arkusz kontrolera `CF Farmy.xlsx`** — źródło dla nowych „Założeń" finansowych i harmonogramu kosztów stałych (patrz sekcja 4) — na razie referencyjne, nie zintegrowane z bazą operacyjną.
- Brak jakiegokolwiek innego zewnętrznego źródła danych (brak integracji z bankiem, giełdą, systemem księgowym, SharePoint itd. — pola pod przyszłą integrację SharePoint istnieją w modelu `Document`, ale są puste/nieużywane).

---

## 8. Istniejące integracje

- **Railway** (hosting, baza, cron backupu) — działająca.
- **Brak integracji z Kita AI Hub, FFP Inwestor, OpenAI/Claude/Grok/GitHub API, Synology** — ten dashboard nie ma żadnego routingu agentów, kolejki zadań ani współdzielonej pamięci. Cały „audyt" to lokalny `ChangeLog` w tej samej bazie danych, niezależny od jakiegokolwiek audytu Hub.
- Zgodnie z ustaleniem z Kita AI Hub: **to jest świadomie rozpoznane jako luka do zamknięcia integracją, a nie stan docelowy** — patrz sekcja 12 i 13.

---

## 9. KPI i widoki

Dashboard Prezesa (widok stały, niezależny od okresu): miesięczny/roczny koszt spółki, koszty stałe, koszty pracowników (ukryte na kontach ograniczonych), koszty projektów, koszty administracyjne, płatności w 7/30 dniach, liczba pracowników, liczba aktywnych projektów, potencjalne oszczędności (mies./rok), przyszłe zapotrzebowanie na kapitał, **docelowy przychód po uruchomieniu (założenie)** dla projektów nieoperacyjnych (nowość z dzisiejszej poprawki).

Panel „Wyniki wg okresu" (przełącznik: miesiąc/kwartał/rok/2/3/5 lat/własny zakres): przychód w okresie (od dziś: WYŁĄCZNIE z projektów operacyjnych), koszty w okresie (run-rate + realne koszty jednorazowe z tego okresu), zysk w okresie.

Portfel projektów wg rodzaju aktywa (PV/BESS/Hybryda/Inne): przychód, koszt, liczba, moc MW.

---

## 10. Aktualny backlog (zbudowane, czeka na wdrożenie/potwierdzenie)

1. Wgranie pakietu Wykresy + Założenia (3 pliki, ostatnia wersja z unikalną nazwą `*-194506`) — wysłane Kamilowi, czeka na wgranie i weryfikację.
2. Wgranie poprawki „przychód tylko z projektów operacyjnych" (plik `wgraj-do-app-appshell-revfix.html`) — wysłane, czeka na wgranie i weryfikację.
3. Potwierdzenie, czy pozycje kosztowe z arkusza kontrolera (Michał/Maciek/Natalia/Marek/Grzegorz Woźniak) już istnieją jako rekordy Employee — blokuje dalszą rozbudowę Harmonogramu/CF Rocznego.
4. Sprawdzenie przez Kamila, które projekty w zakładce Projekty mają wypełnione `revenueMonthly`, żeby ocenić skalę różnicy między przychodem operacyjnym a projektowanym.

---

## 11. Blokady

- **Blokada techniczna (infrastrukturalna, potwierdzona wielokrotnie):** brak autoryzacji `git push` z tej sesji do repozytorium — wymusza ręczny, podatny na pomyłki proces wgrywania plików przez GitHub UI. Trzykrotnie w tym projekcie prowadziło to do wdrożenia nieaktualnej wersji pliku.
- **Blokada decyzyjna:** ryzyko podwójnego liczenia kosztów pracowniczych (patrz sekcja 4) — nie rozwiązana, wymaga odpowiedzi Kamila/kontrolera.
- Brak integracji z Kita AI Hub (kolejka/audyt/pamięć/API) — nie jest to "blokada" w sensie awarii, ale świadomie nierozwiązana zależność architektoniczna (patrz sekcja 13).

---

## 12. Najbliższe kroki

1. Kamil wgrywa 2 oczekujące pakiety plików → ja weryfikuję przez `git clone`+`diff` (nigdy nie ufam samemu potwierdzeniu "gotowe") → wdrożenie na Railway.
2. Po potwierdzeniu: decyzja ws. pozycji kosztów pracowniczych z arkusza kontrolera.
3. Rozbudowa modułu Harmonogram/CF Roczny — dopiero po rozstrzygnięciu punktu 2.
4. Docelowo: podłączenie tego narzędzia do wspólnej kolejki/audytu/pamięci/API Kita AI Hub zamiast własnego, osobnego audytu (`ChangeLog`) i własnych kont Basic Auth — pod warunkiem, że Hub faktycznie to udostępni (obecnie integracje OpenAI/Claude/Grok/GitHub/Synology w Hubie są `PENDING_INTEGRATION`, więc to nie jest jeszcze możliwe do wykonania).

---

## 13. Zależności od FFP Inwestor i Kita AI Hub

**Zastrzeżenie źródła:** poniższe opieram wyłącznie na tym, co Kamil przekazał w tej rozmowie o obu checkpointach — nie miałem bezpośredniego dostępu do treści plików FFP Inwestor ani Kita AI Hub, więc nie mogę zweryfikować ich pierwotnie, tylko odnotować jako kontekst przekazany przez Kamila.

- **Kita AI Hub:** zgodnie z przekazem Kamila, Dashboard Prezesa FFP (FFP Command Center) ma w przyszłości korzystać z **tej samej** kolejki zadań, audytu, pamięci i API co Hub — a nie budować własnego routingu ani drugiej instancji "Lu". **To jest zgodne z tym, jak dashboard jest dziś zbudowany "od zera"** (własny prosty ChangeLog, własny Basic Auth) — więc integracja z Hubem to realna zmiana architektoniczna do zaplanowania, nie coś już zaimplementowanego. Obecnie (wg przekazu) Hub sam nie jest jeszcze gotową "Lu Executive": Mac mini i MacBook działają, dwóch agentów online, ale integracje OpenAI/Claude/Grok/GitHub/Synology są `PENDING_INTEGRATION`, a routing Lu jest symulowany. Do czasu ich ukończenia dashboard nie ma z czym się fizycznie integrować.
- **FFP Inwestor:** brak szczegółów przekazanych mi w tej rozmowie poza samym faktem istnienia checkpointu — nie odnotowuję tu żadnych konkretnych zależności, żeby nie zgadywać.
- Architektura docelowej "Lu" (wg przekazu Kamila): identyfikacja projektu/źródeł prawdy → ryzyko → dekompozycja → wybór agenta wg kompetencji/kosztu/dostępności → niezależny kontroler → minimalne uprawnienia → dowody → kontrola konfliktów → jedna odpowiedź Lu. Ten dashboard NIE implementuje niczego z tego przepływu — działa jako zwykła aplikacja webowa z bezpośrednią edycją danych przez ludzi, nie przez agentów.

---

## 14. Pełna lista elementów, których absolutnie nie należy budować ponownie

- **Drugiego Hubu / drugiego routingu agentów / drugiej "Lu"** dla FFP — zgodnie z ustaleniem, FFP Command Center ma używać istniejącej kolejki/audytu/pamięci/API Kita AI Hub, gdy ta będzie gotowa.
- Modelu danych (Prisma/PostgreSQL) — 12 encji już zaprojektowanych i wdrożonych (Department, Project, Employee, EmployeeProjectAllocation, Vendor, Cost, Contract, Financing, Document, AppSetting, Backup, ChangeLog).
- 23 endpointów API REST — już istnieją i działają.
- Mechanizmu Basic Auth z kontami pełnymi/ograniczonymi (bez wynagrodzeń) — już istnieje.
- Mechanizmu automatycznych i ręcznych kopii zapasowych + przywracania — już istnieje.
- Dziennika zmian (audytu) na poziomie samej aplikacji — już istnieje (choć docelowo może zostać zastąpiony/uzupełniony audytem Hub, patrz sekcja 13 — nie usuwać przed ustaleniem docelowej architektury).
- Konwencji oznaczania danych demonstracyjnych (`isDemo`) i wykluczania ich z KPI — już istnieje i jest krytyczna dla poprawności liczb.
- Panelu okresowych projekcji przychód/koszt/zysk, zestawienia portfela wg rodzaju aktywa, CAPEX/ROI, alertów budżetowych, ryzyka regulacyjnego per projekt — już istnieją.
- Zakładek Wykresy i Założenia oraz danych z arkusza `CF Farmy.xlsx` — już zbudowane (czekają tylko na wdrożenie, nie na ponowne zaprojektowanie).
- Poprawki liczenia przychodu operacyjnego vs. projektowanego — już zaimplementowana (czeka na wdrożenie).

---

**Status dokumentu:** checkpoint informacyjny. Nie wykonano żadnych zmian w kodzie poza utworzeniem tego pliku. Wszystkie zmiany kodu opisane w sekcjach 4 i 10 zostały wykonane WCZEŚNIEJ, w ramach bieżącej pracy nad dashboardem, i są tu tylko udokumentowane.
