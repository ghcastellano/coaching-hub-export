-- Coaching Hub tables (Flyway source of truth).
--
-- The application also ensures these idempotently on every boot
-- (src/server/services/database.ts → COACHING_TABLES_SQL) as a runtime safety net,
-- but this migration makes the schema reproducible via the Aurora Flyway/ORC flow
-- without the app having to boot.
--
-- Single-tenant app: tenant_id is kept for parity with the other tables and is
-- always bound to the application's single tenant constant (APP_TENANT_ID). Grants
-- are intentionally omitted here (role-specific, applied best-effort at boot).

CREATE TABLE IF NOT EXISTS coaching_scrum_managers (
  tenant_id TEXT NOT NULL,
  board_id INTEGER NOT NULL,
  board_name TEXT,
  sm_name TEXT,
  sm_account_id TEXT,
  role TEXT NOT NULL DEFAULT 'scrum_master',
  coaching BOOLEAN NOT NULL DEFAULT false,
  detected_sm JSONB,
  detected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, board_id)
);
CREATE INDEX IF NOT EXISTS idx_coaching_sm_tenant ON coaching_scrum_managers (tenant_id);

CREATE TABLE IF NOT EXISTS coaching_assessments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  board_id INTEGER NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}',
  note TEXT,
  author TEXT,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_assessments_tenant_board ON coaching_assessments (tenant_id, board_id);
CREATE INDEX IF NOT EXISTS idx_coaching_assessments_assessed ON coaching_assessments (assessed_at DESC);

CREATE TABLE IF NOT EXISTS coaching_experiments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  board_id INTEGER NOT NULL,
  pillar TEXT,
  metric TEXT,
  behavior TEXT,
  hypothesis TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  origin TEXT NOT NULL DEFAULT 'manual',
  started_at DATE,
  target_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_experiments_tenant_board ON coaching_experiments (tenant_id, board_id);
