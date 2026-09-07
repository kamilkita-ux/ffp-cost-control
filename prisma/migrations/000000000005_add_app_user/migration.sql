-- Prawdziwe konta użytkowników (login + hasło zahaszowane w bazie) —
-- docelowo zastępują wspólne pary login:hasło z Basic Auth trzymane w
-- zmiennych środowiskowych. Na razie DODATKOWA tabela, nieużywana jeszcze
-- przez middleware (patrz middleware.ts — działa dopiero po ustawieniu
-- zmiennej AUTH_MODE=accounts), więc to bezpieczna zmiana: nic nie zmienia
-- się w logowaniu, dopóki Kamil świadomie nie przełączy trybu.
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'restricted',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
