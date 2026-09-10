-- Coaching Case: the structured coaching record per team (Flyway parity with boot DDL).
--
-- One JSONB column holding the lean narrative the Agile Coach maintains:
-- { mainGap, hypothesis, nextStep, supportNeeded, reviewAt, stage }.
-- The application also adds this idempotently on every boot
-- (src/server/services/database.ts → COACHING_TABLES_SQL). Additive + idempotent.

ALTER TABLE coaching_scrum_managers ADD COLUMN IF NOT EXISTS coaching_case JSONB;
