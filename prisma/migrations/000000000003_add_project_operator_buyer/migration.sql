-- Dodaje do projektu (farmy): operatora sieci (OSD) oraz odbiorcę energii /
-- pośrednika zakupu — potrzebne przy projektach już operacyjnych,
-- sprzedających energię (np. "Miejsce Piastowe").
ALTER TABLE "Project" ADD COLUMN "gridOperator" TEXT;
ALTER TABLE "Project" ADD COLUMN "energyBuyer" TEXT;
