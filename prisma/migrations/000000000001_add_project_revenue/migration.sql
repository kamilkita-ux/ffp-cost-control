-- Dodaje orientacyjny przychód miesięczny do projektu (farmy) — potrzebny do
-- wyliczenia Zysku (Przychód - Koszty) na Dashboardzie.
ALTER TABLE "Project" ADD COLUMN "revenueMonthly" DECIMAL(14,2);
