-- The year whose funds a procurement is for. Usually the year it was received, but an early procurement
-- received in November for next year belongs to next year: its list, its budget and its ID (PROC-2027-…).
ALTER TABLE procurements ADD COLUMN fiscal_year INT NOT NULL DEFAULT 0;
UPDATE procurements SET fiscal_year = YEAR(date_received) WHERE date_received IS NOT NULL;
-- rows without a date (from the 2026 file): the year in the ID, PROC-2026-00001
UPDATE procurements SET fiscal_year = CAST(SUBSTRING(code, 6, 4) AS DECIMAL(4, 0)) WHERE date_received IS NULL;
CREATE INDEX idx_procurements_fiscal_year ON procurements (fiscal_year);
