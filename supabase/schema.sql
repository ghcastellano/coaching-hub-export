-- supabase/schema.sql — Coaching Hub (idempotente, single-instance)
-- Cole no supabase/schema.sql do Status Pilot. tenant_id removido; GRANTs Aurora removidos.
-- Se multi-workspace: ver bloco comentado no fim.

-- =========================================================================
-- coaching_scrum_managers: 1 linha por board. Backing de board-managers + detect-sm.
-- =========================================================================
CREATE TABLE IF NOT EXISTS coaching_scrum_managers (
  board_id      INTEGER PRIMARY KEY,
  board_name    TEXT,
  sm_name       TEXT,
  sm_account_id TEXT,
  role          TEXT NOT NULL DEFAULT 'scrum_master',   -- scrum_master|tech_lead|pm|po|none
  coaching      BOOLEAN NOT NULL DEFAULT false,
  engaged_by    TEXT,
  engaged_at    TIMESTAMPTZ,
  coaching_case JSONB,                                  -- {mainGap,hypothesis,nextStep,supportNeeded,reviewAt,stage}
  detected_sm   JSONB,                                  -- DetectedSm
  detected_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- coaching_assessments: sinais comportamentais. Le-se a MAIS RECENTE por board.
-- saveAssessment faz INSERT e depois prune das antigas do mesmo board.
-- =========================================================================
CREATE TABLE IF NOT EXISTS coaching_assessments (
  id          BIGSERIAL PRIMARY KEY,
  board_id    INTEGER NOT NULL,
  signals     JSONB NOT NULL DEFAULT '{}'::jsonb,       -- {signalKey: not_yet|emerging|consistent}
  note        TEXT,
  author      TEXT,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_assessments_board    ON coaching_assessments (board_id);
CREATE INDEX IF NOT EXISTS idx_coaching_assessments_assessed ON coaching_assessments (assessed_at DESC);

-- =========================================================================
-- coaching_experiments: intervencoes/experimentos. Le-se ORDER BY created_at DESC.
-- =========================================================================
CREATE TABLE IF NOT EXISTS coaching_experiments (
  id         BIGSERIAL PRIMARY KEY,
  board_id   INTEGER NOT NULL,
  pillar     TEXT,                                       -- commitment|flow|ownership
  metric     TEXT,
  behavior   TEXT,
  hypothesis TEXT,
  outcome    TEXT,
  status     TEXT NOT NULL DEFAULT 'active',             -- active|done|dropped
  origin     TEXT NOT NULL DEFAULT 'manual',             -- manual|suggested
  started_at DATE,
  target_at  DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_experiments_board ON coaching_experiments (board_id);

-- =========================================================================
-- PRE-REQUISITO (NAO escrito pelo coaching; lido por /coaching/portfolio):
-- o portfolio le de uma tabela tipo metrics_history. Confirme que o Status Pilot
-- ja a possui (escrita pelo lado Scrum Maturity). Formato minimo esperado:
-- =========================================================================
-- CREATE TABLE IF NOT EXISTS metrics_history (
--   id            BIGSERIAL PRIMARY KEY,
--   board_id      INTEGER NOT NULL,
--   board_name    TEXT,
--   sprint_count  INTEGER,
--   maturity_level TEXT,                 -- 'Silver'/'Gold'/'Platinum' ou '1'/'2'/'3'
--   metrics_data  JSONB,                 -- blob: ver DATA_CONTRACT.md secao 2.8
--   calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- CREATE INDEX IF NOT EXISTS idx_metrics_history_board ON metrics_history (board_id, calculated_at DESC);

-- =========================================================================
-- VARIANTE MULTI-WORKSPACE (se aplicavel): adicione workspace_id e ajuste PKs.
-- =========================================================================
-- ALTER TABLE coaching_scrum_managers ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';
-- -- e recrie a PK como (workspace_id, board_id); idem com workspace_id nas demais
-- -- e prefixe os indices por workspace_id.

-- NOTA Indeed-especifico (NAO portar): a origem usa tenant_id TEXT (constante
-- 'indeed.atlassian.net') e PK (tenant_id, board_id), alem de
-- GRANT ... TO "scrum-maturity-dash-rw" + GRANT USAGE em SEQUENCE.
-- No Supabase isso e desnecessario: o acesso e via service_role key (server-only).
