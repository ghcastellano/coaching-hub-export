-- Initial schema for scrum-maturity-dashboard-marvin
-- Ported from the Vercel app's server/sql/schema.sql (2026-04-20).
-- Flyway naming: V<version>__<description>.sql

-- 1. Metrics History: snapshots of aggregated scrum metrics per board.
CREATE TABLE metrics_history (
    id BIGSERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL,
    board_name TEXT,
    sprint_count INTEGER,
    metrics_data JSONB NOT NULL DEFAULT '{}',
    maturity_level TEXT,
    tenant_id TEXT,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_history_tenant ON metrics_history (tenant_id);
CREATE INDEX idx_metrics_history_tenant_board ON metrics_history (tenant_id, board_id);
CREATE INDEX idx_metrics_history_calculated ON metrics_history (calculated_at DESC);

-- 2. Boards Cache: list of Jira boards per tenant, refreshed on TTL.
CREATE TABLE boards_cache (
    id BIGSERIAL PRIMARY KEY,
    boards_data JSONB NOT NULL DEFAULT '[]',
    tenant_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boards_cache_tenant ON boards_cache (tenant_id);

-- 3. Product Data Cache: reserved for Product Management features
-- (epic intelligence, prioritization, portfolio). Not yet consumed
-- by the Marvin app but included so schema is in lockstep with Vercel.
CREATE TABLE product_data_cache (
    id BIGSERIAL PRIMARY KEY,
    cache_key TEXT UNIQUE NOT NULL,
    board_ids TEXT NOT NULL,
    data_type TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    tenant_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_cache_key ON product_data_cache (cache_key);
CREATE INDEX idx_product_board_ids ON product_data_cache (board_ids);
CREATE INDEX idx_product_data_cache_tenant ON product_data_cache (tenant_id);
