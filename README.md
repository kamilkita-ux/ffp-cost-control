# FFP Cost Control

Narzędzie zarządcze do kontroli kosztów **Farmy Fotowoltaiki Polska S.A.** —
pracownicy, projekty, koszty, umowy, leasingi/kredyty, dostawcy, płatności,
działy/centra kosztów, analiza kosztów, symulator oszczędności, dokumenty.

Interfejs użytkownika (wszystkie moduły i formularze) pozostaje identyczny
z wcześniejszą wersją. Jedyna zmiana: **jedynym źródłem prawdy dla danych
jest teraz PostgreSQL** — nie Artifact, nie localStorage, nie konkretna
przeglądarka.

## Stos technologiczny

- **PostgreSQL 16** — baza danych (jedyne źródło prawdy)
- **Prisma ORM** (`^6.10.0`) — schemat, migracje, klient bazy danych
- **Next.js 15 (App Router)** — serwer aplikacji + API (Route Handlers)
- Frontend: ten sam interfejs co wcześniej (`app/app-shell.html`), serwowany
  przez `app/route.ts`; logika UI woła REST API zamiast localStorage/Artifact

Brak logowania w tej wersji (celowo, zgodnie z ustaleniami) — każdy z dostępem
do adresu aplikacji widzi te same dane. Miejsce na Microsoft Entra ID i
integrację SharePoint jest już przygotowane w modelu danych (patrz sekcja E).

## A. Gdzie fizycznie znajduje się baza danych

W tym środowisku roboczym baza działa lokalnie: **PostgreSQL 16, port 5432,
host `localhost`**, baza `ffp_cost_control`, użytkownik `ffp_app`. Dane
fizycznie leżą na dysku tej maszyny/kontenera, w standardowym katalogu
danych klastra PostgreSQL (`/var/lib/postgresql/16/main`).

To jest środowisko robocze/deweloperskie — **nie jest to docelowe miejsce
produkcyjne**. Do pracy zespołu i dostępu z wielu urządzeń baza musi zostać
wystawiona na zewnątrz jako usługa hostowana (rekomendacja: **Neon** albo
**Supabase**, oba mają darmowy plan startowy i natywnie wspierają Prisma) —
albo docelowo przeniesiona na własny serwer firmy (patrz sekcja E).

Adres bazy jest zawsze skonfigurowany w jednym miejscu: zmienna środowiskowa
`DATABASE_URL` (plik `.env`, niewersjonowany w Git). Zmiana hostingu bazy =
zmiana jednej wartości `DATABASE_URL`, bez zmian w kodzie aplikacji.

## B. Jak wykonywany jest backup

Dwa niezależne poziomy zabezpieczenia danych:

**1. Backup bazy PostgreSQL (główne źródło prawdy)**

- Skrypt `scripts/backup.sh` (`npm run db:backup`) wykonuje `pg_dump` całej
  bazy do skompresowanego pliku w katalogu `backups/` i automatycznie usuwa
  kopie starsze niż 30 dni.
- Uruchomienie automatyczne na własnym serwerze: wpis crontab, np. codziennie
  o 2:00 w nocy:
  ```
  0 2 * * *  cd /sciezka/do/ffp-nextjs && bash scripts/backup.sh >> backups/backup.log 2>&1
  ```
- Jeśli baza jest hostowana u dostawcy zarządzanego (Neon, Supabase, Railway,
  Render) — każdy z nich ma **wbudowany automatyczny backup / point-in-time
  recovery**, włączany jednym przełącznikiem w panelu administracyjnym,
  bez potrzeby uruchamiania własnego skryptu. `scripts/backup.sh` zostaje
  wtedy dodatkowym, niezależnym zabezpieczeniem (kopia poza providerem).
- Przywracanie z pliku `.dump`:
  ```
  pg_restore --dbname="$DATABASE_URL" --clean --if-exists backups/plik.dump
  ```

**2. Eksport/import JSON w samej aplikacji (dodatkowy backup, jak dotychczas)**

- W zakładce *Ustawienia* przycisk „Pobierz kopię zapasową (.json)” zapisuje
  pełny stan danych na dysk użytkownika.
- Przycisk „Wgraj kopię zapasową” pozwala odtworzyć cały stan z takiego
  pliku (operacja niszcząca, z potwierdzeniem) — trafia do `/api/restore`,
  które nadpisuje bazę w jednej transakcji.
- To zabezpieczenie ręczne/awaryjne, niezależne od PostgreSQL — przydatne
  np. przed dużą, ryzykowną zmianą danych.

## C. Jak aplikacja łączy się z bazą

1. `.env` zawiera `DATABASE_URL` — connection string do PostgreSQL.
2. `lib/prisma.ts` tworzy jeden, współdzielony klient Prisma
   (`PrismaClient`), który łączy się z bazą wskazaną w `DATABASE_URL`.
3. Każdy moduł UI (Pracownicy, Projekty, Koszty, ...) woła REST API
   aplikacji (`/api/employees`, `/api/projects`, `/api/costs`, ...) —
   nigdy nie odwołuje się do bazy bezpośrednio z przeglądarki.
4. Każdy endpoint API (`app/api/**/route.ts`) używa Prisma do wykonania
   operacji CRUD na PostgreSQL, w razie potrzeby w transakcji
   (`prisma.$transaction`) — np. zapis pracownika razem z jego
   przypisaniami do projektów, albo pełne odtworzenie bazy z kopii JSON.
5. Po każdym zapisie przeglądarka pobiera świeży stan z `/api/bootstrap`
   (pojedyncze zapytanie zwracające wszystkie dane) — więc dwa urządzenia
   otwierające aplikację zawsze widzą te same, aktualne dane z PostgreSQL.

Schemat danych (`prisma/schema.prisma`): Department, Project, Employee +
EmployeeProjectAllocation, Vendor, Cost, Contract, Financing, Document,
AppSetting. Każdy rekord ma stabilne `id` (UUID), `createdAt`/`updatedAt`;
tam gdzie inne rekordy się do niego odwołują (Department, Project, Vendor)
zastosowano miękkie usuwanie (`deletedAt`) zamiast trwałego kasowania.

## D. Jak wdrożyć aplikację ponownie z GitHub

**Wymaganie wstępne, ważne:** to repozytorium zostało przygotowane w
środowisku bez dostępu do rejestru npm, więc `npm install` **nie został
jeszcze uruchomiony ani przetestowany end-to-end** w tym środowisku.
Warstwa bazy danych (schemat, migracja SQL) została **zweryfikowana wprost
na żywej bazie PostgreSQL** (utworzenie tabel, testowe operacje INSERT/
UPDATE/DELETE, klucze obce, miękkie usuwanie — wszystko potwierdzone
działające). Kod API i frontendu został napisany starannie wg
sprawdzonych wzorców Next.js 15 / Prisma 6, ale wymaga jednorazowego
`npm install` w środowisku z dostępem do internetu, zanim zostanie
uruchomiony po raz pierwszy.

Kroki wdrożenia (dowolny host: własny serwer, Vercel, Railway, Render):

```bash
git clone <adres-repo-na-github>
cd ffp-nextjs
npm install
cp .env.example .env
# wpisz do .env prawdziwy DATABASE_URL (patrz sekcja A/E)
npm run db:migrate      # nakłada migracje na bazę (prisma migrate deploy)
npm run db:seed         # dane startowe: działy, słowniki, rekordy DEMO — bezpieczne do powtórzenia, pomija się jeśli baza już ma dane
npm run build
npm run start           # albo: npm run dev do pracy lokalnej
```

Wdrożenie na Vercel: podłącz repo GitHub w panelu Vercel, ustaw zmienną
środowiskową `DATABASE_URL` (np. z Neon — Vercel ma natywną integrację
"Storage → Postgres" opartą o Neon), Vercel automatycznie wykona
`npm install` i `npm run build`; krok `db:migrate`/`db:seed` uruchom raz
ręcznie (lokalnie, wskazując tym samym `DATABASE_URL`) albo jako "Build
Command" rozszerzony o `npx prisma migrate deploy &&`.

### Przygotowanie repozytorium pod GitHub

W tym katalogu wykonano już `git init` i pierwszy commit. Aby wypchnąć na
GitHub:

```bash
gh repo create ffp-cost-control --private --source=. --remote=origin
git push -u origin main
```

albo ręcznie, jeśli repo zostało utworzone przez stronę github.com:

```bash
git remote add origin git@github.com:<twoja-organizacja>/ffp-cost-control.git
git branch -M main
git push -u origin main
```

## E. Jak przenieść bazę w przyszłości na własny serwer bez utraty danych

Cała aplikacja mówi z bazą wyłącznie przez `DATABASE_URL` — przeniesienie
bazy nigdy nie wymaga zmian w kodzie, tylko w tej jednej zmiennej.

1. Wykonaj pełny backup obecnej bazy:
   ```
   pg_dump --dbname="$DATABASE_URL_STARE" --format=custom --file=migracja.dump
   ```
2. Utwórz pustą bazę PostgreSQL na docelowym własnym serwerze (ta sama
   wersja PostgreSQL 16 lub nowsza; utwórz użytkownika i uprawnienia).
3. Wgraj dane do nowej bazy:
   ```
   pg_restore --dbname="$DATABASE_URL_NOWE" --clean --if-exists migracja.dump
   ```
4. Zaktualizuj `DATABASE_URL` w środowisku aplikacji (`.env` na serwerze
   produkcyjnym / zmienna środowiskowa hostingu) na nowy connection string.
5. Uruchom ponownie aplikację (`npm run start` / redeploy) — Prisma
   połączy się z nową bazą automatycznie, bez migracji od zera (schemat
   i dane są już tam, bo `pg_restore` odtworzył wszystko 1:1).
6. Zweryfikuj: `npm run db:migrate` na nowej bazie powinno zgłosić, że
   migracje są już zastosowane (bo `pg_restore` przeniósł też tabelę
   `_prisma_migrations`) — jeśli tabela migracji nie została przeniesiona,
   uruchom `npx prisma migrate resolve --applied 000000000000_init`
   przed jakąkolwiek nową migracją, żeby Prisma nie próbowało nałożyć
   schematu drugi raz.

Zero utraty danych na żadnym etapie — `pg_dump`/`pg_restore` to
standardowe, w pełni odwracalne narzędzia PostgreSQL do przenoszenia całych
baz między serwerami.

## Struktura projektu

```
app/
  app-shell.html        # cały interfejs (CSS + HTML + JS), niezmieniony UX
  route.ts               # serwuje app-shell.html pod "/"
  api/
    bootstrap/           # GET  — pobiera cały stan danych naraz
    departments/         # POST, PUT, DELETE (miękkie)
    projects/             "
    employees/             "  (+ transakcja z alokacjami do projektów)
    vendors/                "
    costs/                  "
    contracts/              "
    financings/             "
    documents/               "
    settings/            # PUT — słowniki (kategorie, centra kosztów, waluta)
    demo/                 # DELETE — usuwa rekordy DEMO
    restore/              # POST — odtwarza całą bazę z pliku JSON
lib/
  prisma.ts              # współdzielony klient Prisma
  serialize.ts           # tłumaczenie enumów Prisma <-> wartości UI (polskie)
prisma/
  schema.prisma          # model danych
  migrations/            # migracja SQL (zweryfikowana na żywej bazie)
  seed.ts                # dane startowe (działy, słowniki, rekordy DEMO)
scripts/
  backup.sh              # pg_dump z automatycznym czyszczeniem starych kopii
```

## Znane ograniczenie tego środowiska roboczego

To repozytorium zostało przygotowane w środowisku bez dostępu do rejestru
npm (nie dało się uruchomić `npm install`, `next dev` ani `prisma generate`
tutaj). Warstwa danych (SQL/migracja/Postgres) jest w pełni zweryfikowana
bezpośrednio na żywej bazie. Warstwa API/frontend Next.js została napisana
starannie, ale **wymaga pierwszego `npm install` w normalnym środowisku
z dostępem do internetu** przed uruchomieniem — patrz sekcja D.
