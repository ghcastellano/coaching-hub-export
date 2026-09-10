-- Coaching engagement columns (Flyway source of truth, parity with the boot DDL).
--
-- Records WHO (the Agile Coach) is coaching a team and SINCE WHEN, so the
-- leadership portfolio can show the engagement chain (Agile Coach → Scrum Manager
-- → Team) and tenure. The application also adds these idempotently on every boot
-- (src/server/services/database.ts → COACHING_TABLES_SQL) as a runtime safety net.
--
-- Additive and idempotent: safe to re-run; never drops or rewrites existing data.

ALTER TABLE coaching_scrum_managers ADD COLUMN IF NOT EXISTS engaged_by TEXT;
ALTER TABLE coaching_scrum_managers ADD COLUMN IF NOT EXISTS engaged_at TIMESTAMPTZ;
