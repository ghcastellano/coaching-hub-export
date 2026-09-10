import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';
import { TENANT } from './tenant';

let pool: Pool | null = null;

// Indeed Aurora SSL pattern: verify the server certificate against the system CA
// bundle (sslmode=verify-ca) instead of disabling verification. Local Postgres
// (docker/localhost) needs no TLS. Falls back to TLS-without-verify only if the CA
// bundle is missing — with a warning, never silently for a remote host.
const CA_BUNDLE_PATH = process.env.PG_CA_CERT ?? '/etc/ssl/certs/ca-certificates.crt';

function resolveSsl(target: string): PoolConfig['ssl'] {
    if (/localhost|127\.0\.0\.1/.test(target)) return undefined; // local: no TLS
    try {
        if (fs.existsSync(CA_BUNDLE_PATH)) {
            // verify-ca: validate the chain against the CA bundle, but skip hostname
            // verification (Aurora endpoints don't match the cert CN/SAN).
            return {
                ca: fs.readFileSync(CA_BUNDLE_PATH).toString(),
                rejectUnauthorized: true,
                checkServerIdentity: () => undefined,
            } as PoolConfig['ssl'];
        }
        console.warn(
            `[db] CA bundle not found at ${CA_BUNDLE_PATH} — TLS without chain verification`
        );
    } catch (err) {
        console.warn('[db] resolveSsl failed:', err instanceof Error ? err.message : err);
    }
    return { rejectUnauthorized: false };
}

function resolveConfig(): PoolConfig | null {
    const envUrl = process.env.DATABASE_URL;
    if (envUrl) {
        return {
            connectionString: envUrl,
            ssl: resolveSsl(envUrl),
        };
    }

    const host = process.env.DB_HOST;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    if (!host || !user || !password) return null;

    return {
        host,
        port: Number(process.env.DB_PORT ?? 5432),
        user,
        password,
        database: process.env.DB_NAME ?? 'scrum_maturity_dash',
        ssl: resolveSsl(host),
    };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS boards_cache (
  id BIGSERIAL PRIMARY KEY,
  boards_data JSONB NOT NULL DEFAULT '[]',
  tenant_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boards_cache_tenant ON boards_cache (tenant_id);

CREATE TABLE IF NOT EXISTS user_boards (
  tenant_id TEXT NOT NULL,
  board_id INTEGER NOT NULL,
  board_name TEXT NOT NULL,
  board_type TEXT,
  project_key TEXT,
  project_name TEXT,
  last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, board_id)
);
CREATE INDEX IF NOT EXISTS idx_user_boards_tenant ON user_boards (tenant_id);

CREATE TABLE IF NOT EXISTS metrics_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  board_id INTEGER NOT NULL,
  board_name TEXT NOT NULL,
  sprint_count INTEGER,
  maturity_level TEXT,
  metrics_data JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant_board ON metrics_history (tenant_id, board_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_calculated ON metrics_history (calculated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON boards_cache, user_boards, metrics_history TO "scrum-maturity-dash-rw";
GRANT USAGE, SELECT ON SEQUENCE boards_cache_id_seq TO "scrum-maturity-dash-rw";
GRANT USAGE, SELECT ON SEQUENCE metrics_history_id_seq TO "scrum-maturity-dash-rw";
`;

// Coaching Hub tables — applied UNCONDITIONALLY on boot (idempotent), so the feature
// persists in every environment without depending on DB_BOOTSTRAP_SCHEMA or a separate
// migration. Grants run separately (best-effort) so a grant failure can't roll back the
// table creation (a multi-statement query is one implicit transaction).
const COACHING_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS coaching_scrum_managers (
  tenant_id TEXT NOT NULL,
  board_id INTEGER NOT NULL,
  board_name TEXT,
  sm_name TEXT,
  sm_account_id TEXT,
  role TEXT NOT NULL DEFAULT 'scrum_master',
  coaching BOOLEAN NOT NULL DEFAULT false,
  engaged_by TEXT,
  engaged_at TIMESTAMPTZ,
  coaching_case JSONB,
  detected_sm JSONB,
  detected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, board_id)
);
CREATE INDEX IF NOT EXISTS idx_coaching_sm_tenant ON coaching_scrum_managers (tenant_id);
-- Additive columns: ensure they exist on tables created before these changes.
ALTER TABLE coaching_scrum_managers ADD COLUMN IF NOT EXISTS engaged_by TEXT;
ALTER TABLE coaching_scrum_managers ADD COLUMN IF NOT EXISTS engaged_at TIMESTAMPTZ;
ALTER TABLE coaching_scrum_managers ADD COLUMN IF NOT EXISTS coaching_case JSONB;

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
  outcome TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  origin TEXT NOT NULL DEFAULT 'manual',
  started_at DATE,
  target_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_experiments_tenant_board ON coaching_experiments (tenant_id, board_id);
ALTER TABLE coaching_experiments ADD COLUMN IF NOT EXISTS outcome TEXT;
`;

const COACHING_GRANTS_SQL = `
GRANT SELECT, INSERT, UPDATE, DELETE ON coaching_scrum_managers, coaching_assessments, coaching_experiments TO "scrum-maturity-dash-rw";
GRANT USAGE, SELECT ON SEQUENCE coaching_assessments_id_seq TO "scrum-maturity-dash-rw";
GRANT USAGE, SELECT ON SEQUENCE coaching_experiments_id_seq TO "scrum-maturity-dash-rw";
`;

export async function initDatabase(): Promise<void> {
    try {
        const config = resolveConfig();
        if (!config) {
            console.warn('[db] DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD not set — DB disabled');
            return;
        }

        pool = new Pool({
            ...config,
            max: 10,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
        });

        await pool.query('SELECT 1');

        // Coaching Hub tables are ensured on EVERY boot (idempotent), independent of
        // DB_BOOTSTRAP_SCHEMA — so the feature persists in prod without extra config.
        //
        // The runtime user (app_rw) has DML only, NOT DDL, so a CREATE TABLE as that
        // user fails silently in prod. When DDL credentials (DB_DDL_USER/DB_DDL_PASSWORD,
        // i.e. the flyway role) are provided, run the schema + grants through a
        // short-lived privileged pool; otherwise fall back to the main pool (works
        // locally where the dev user owns the schema).
        const ddlUser = process.env.DB_DDL_USER;
        const ddlPassword = process.env.DB_DDL_PASSWORD;
        const ddlPool =
            ddlUser && ddlPassword
                ? new Pool({
                      host: process.env.DB_HOST,
                      port: Number(process.env.DB_PORT ?? 5432),
                      database: process.env.DB_NAME,
                      user: ddlUser,
                      password: ddlPassword,
                      ssl: resolveSsl(process.env.DB_HOST ?? ''),
                      max: 1,
                      connectionTimeoutMillis: 10_000,
                  })
                : pool;
        try {
            await ddlPool.query(COACHING_TABLES_SQL);
            try {
                await ddlPool.query(COACHING_GRANTS_SQL);
            } catch (grantErr) {
                console.warn(
                    '[db] coaching grants skipped (owner already has access):',
                    grantErr instanceof Error ? grantErr.message : grantErr
                );
            }
            console.log(`[db] coaching tables ensured${ddlPool !== pool ? ' (via DDL role)' : ''}`);
        } catch (coachErr) {
            console.warn(
                '[db] ensuring coaching tables failed:',
                coachErr instanceof Error ? coachErr.message : coachErr
            );
        } finally {
            if (ddlPool !== pool) await ddlPool.end();
        }

        if (process.env.DB_BOOTSTRAP_SCHEMA === '1') {
            await pool.query(SCHEMA_SQL);
            console.log('[db] Connected to Aurora and bootstrap schema applied');
        } else {
            console.log('[db] Connected to Aurora');
        }
    } catch (err) {
        console.error('[db] Init failed:', err instanceof Error ? err.message : err);
        pool = null;
    }
}

export function isDbEnabled(): boolean {
    return pool !== null;
}

const BOARDS_CACHE_TTL_MS = 24 * 3600 * 1000;

export async function getCachedBoards<T>(): Promise<T[] | null> {
    if (!pool) return null;
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            'SELECT boards_data, updated_at FROM boards_cache WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 1',
            [tenantId]
        );
        if (rows.length === 0) return null;
        const age = Date.now() - new Date(rows[0].updated_at).getTime();
        if (age > BOARDS_CACHE_TTL_MS) return null;
        return rows[0].boards_data as T[];
    } catch (err) {
        console.warn('[db] getCachedBoards failed:', err instanceof Error ? err.message : err);
        return null;
    }
}

export async function setCachedBoards<T>(boards: T[]): Promise<void> {
    if (!pool) return;
    const tenantId = TENANT;
    try {
        await pool.query('INSERT INTO boards_cache (boards_data, tenant_id) VALUES ($1, $2)', [
            JSON.stringify(boards),
            tenantId,
        ]);
    } catch (err) {
        console.warn('[db] setCachedBoards failed:', err instanceof Error ? err.message : err);
    }
}

export interface UserBoard {
    boardId: number;
    boardName: string;
    type: string;
    projectKey?: string;
    projectName?: string;
    lastAnalyzedAt: string;
}

export async function getUserBoards(): Promise<UserBoard[]> {
    if (!pool) return [];
    const tenantId = TENANT;
    const { rows } = await pool.query(
        `SELECT board_id, board_name, board_type, project_key, project_name, last_analyzed_at
         FROM user_boards
         WHERE tenant_id = $1
         ORDER BY last_analyzed_at DESC`,
        [tenantId]
    );
    return rows.map((r) => ({
        boardId: r.board_id,
        boardName: r.board_name,
        type: r.board_type ?? 'scrum',
        projectKey: r.project_key ?? undefined,
        projectName: r.project_name ?? undefined,
        lastAnalyzedAt:
            r.last_analyzed_at instanceof Date
                ? r.last_analyzed_at.toISOString()
                : String(r.last_analyzed_at),
    }));
}

export async function upsertUserBoards(boards: UserBoard[]): Promise<void> {
    if (!pool || boards.length === 0) return;
    const tenantId = TENANT;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const b of boards) {
            await client.query(
                `INSERT INTO user_boards
                    (tenant_id, board_id, board_name, board_type, project_key, project_name, last_analyzed_at)
                 VALUES ($1, $2, $3, $4, $5, $6, now())
                 ON CONFLICT (tenant_id, board_id) DO UPDATE SET
                    board_name = EXCLUDED.board_name,
                    board_type = EXCLUDED.board_type,
                    project_key = EXCLUDED.project_key,
                    project_name = EXCLUDED.project_name,
                    last_analyzed_at = now()`,
                [
                    tenantId,
                    b.boardId,
                    b.boardName,
                    b.type ?? null,
                    b.projectKey ?? null,
                    b.projectName ?? null,
                ]
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function removeUserBoard(boardId: number): Promise<void> {
    if (!pool) return;
    const tenantId = TENANT;
    await pool.query('DELETE FROM user_boards WHERE tenant_id = $1 AND board_id = $2', [
        tenantId,
        boardId,
    ]);
}

export interface BoardWithMetrics {
    board_id: number;
    board_name: string;
    last_calculated: string;
    sprint_count: number | null;
    maturity_level: string | null;
    metrics_data: unknown;
}

// INSERT a new row per analysis — matches Vercel write behavior (keeps full history)
export async function saveMetricsHistory(
    boardId: number,
    boardName: string,
    sprintCount: number | null,
    maturityLevel: string | null,
    metricsData: unknown
): Promise<void> {
    if (!pool) return;
    const tenantId = TENANT;
    try {
        await pool.query(
            `INSERT INTO metrics_history
                (tenant_id, board_id, board_name, sprint_count, maturity_level, metrics_data)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                tenantId,
                boardId,
                boardName,
                sprintCount,
                maturityLevel,
                JSON.stringify(metricsData ?? {}),
            ]
        );
    } catch (err) {
        console.warn('[db] saveMetricsHistory failed:', err instanceof Error ? err.message : err);
    }
}

export interface LatestAnalysisSummary {
    calculatedAt: string;
    sprintIds: number[];
}

// Lightweight read for staleness checks: only calculated_at + the sprint ids
// inside the latest analysis, never the full JSONB payload.
export async function getLatestAnalysisSummary(
    boardId: number
): Promise<LatestAnalysisSummary | null> {
    if (!pool) return null;
    try {
        const { rows } = await pool.query(
            `SELECT calculated_at, metrics_data->'sprintMetrics' AS sprint_metrics
             FROM metrics_history
             WHERE tenant_id = $1 AND board_id = $2
             ORDER BY calculated_at DESC
             LIMIT 1`,
            [TENANT, boardId]
        );
        if (rows.length === 0) return null;
        const row = rows[0];
        const sprintMetrics = Array.isArray(row.sprint_metrics) ? row.sprint_metrics : [];
        return {
            calculatedAt:
                row.calculated_at instanceof Date
                    ? row.calculated_at.toISOString()
                    : String(row.calculated_at),
            sprintIds: sprintMetrics
                .map((s: { sprintId?: unknown }) => Number(s?.sprintId))
                .filter((n: number) => Number.isFinite(n)),
        };
    } catch (err) {
        console.warn(
            '[db] getLatestAnalysisSummary failed:',
            err instanceof Error ? err.message : err
        );
        return null;
    }
}

export interface MetricsHistoryEntry {
    id: number;
    board_id: number;
    board_name: string;
    calculated_at: string;
    sprint_count: number | null;
    maturity_level: string | null;
}

export interface MetricsHistoryRow extends MetricsHistoryEntry {
    metrics_data: unknown;
    tenant_id: string;
}

// Returns up to `limit` history entries for a single board (newest first).
export async function getMetricsHistory(
    boardId: number,
    limit = 30
): Promise<MetricsHistoryEntry[]> {
    if (!pool) return [];
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            `SELECT id, board_id, board_name, calculated_at, sprint_count, maturity_level
             FROM metrics_history
             WHERE tenant_id = $1 AND board_id = $2
             ORDER BY calculated_at DESC
             LIMIT $3`,
            [tenantId, boardId, limit]
        );
        return rows.map((r) => ({
            id: Number(r.id),
            board_id: r.board_id,
            board_name: r.board_name,
            calculated_at:
                r.calculated_at instanceof Date
                    ? r.calculated_at.toISOString()
                    : String(r.calculated_at),
            sprint_count: r.sprint_count ?? null,
            maturity_level: r.maturity_level ?? null,
        }));
    } catch (err) {
        console.warn('[db] getMetricsHistory failed:', err instanceof Error ? err.message : err);
        return [];
    }
}

// Returns a single history row (incl. metrics_data) by id, tenant-scoped.
export async function getMetricsById(id: number): Promise<MetricsHistoryRow | null> {
    if (!pool) return null;
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            `SELECT id, tenant_id, board_id, board_name, calculated_at, sprint_count, maturity_level, metrics_data
             FROM metrics_history
             WHERE id = $1 AND tenant_id = $2
             LIMIT 1`,
            [id, tenantId]
        );
        if (rows.length === 0) return null;
        const r = rows[0];
        return {
            id: Number(r.id),
            tenant_id: r.tenant_id,
            board_id: r.board_id,
            board_name: r.board_name,
            calculated_at:
                r.calculated_at instanceof Date
                    ? r.calculated_at.toISOString()
                    : String(r.calculated_at),
            sprint_count: r.sprint_count ?? null,
            maturity_level: r.maturity_level ?? null,
            metrics_data: r.metrics_data,
        };
    } catch (err) {
        console.warn('[db] getMetricsById failed:', err instanceof Error ? err.message : err);
        return null;
    }
}

// Counts what pruneHistoryKeepLatest would do without modifying anything.
// Scope: per tenant (mandatory), optionally narrowed to a single board.
export async function countPruneHistoryKeepLatest(
    boardId?: number
): Promise<{ wouldDelete: number; wouldKeep: number }> {
    if (!pool) return { wouldDelete: 0, wouldKeep: 0 };
    const tenantId = TENANT;
    const params: any[] = [tenantId];
    let boardFilter = '';
    if (boardId !== undefined) {
        params.push(boardId);
        boardFilter = ' AND board_id = $2';
    }
    const { rows } = await pool.query(
        `WITH latest AS (
            SELECT DISTINCT ON (tenant_id, board_id) id
            FROM metrics_history
            WHERE tenant_id = $1${boardFilter}
            ORDER BY tenant_id, board_id, calculated_at DESC
        )
        SELECT
            COUNT(*) FILTER (WHERE id NOT IN (SELECT id FROM latest)) AS would_delete,
            COUNT(*) FILTER (WHERE id IN     (SELECT id FROM latest)) AS would_keep
        FROM metrics_history
        WHERE tenant_id = $1${boardFilter}`,
        params
    );
    return {
        wouldDelete: Number(rows[0]?.would_delete ?? 0),
        wouldKeep: Number(rows[0]?.would_keep ?? 0),
    };
}

// Deletes all rows from metrics_history EXCEPT the most recent per (tenant_id, board_id).
// Scope: per tenant (mandatory). Use boardId to narrow further. Single SQL statement,
// implicit transaction. Returns the actually deleted/kept counts.
export async function pruneHistoryKeepLatest(
    boardId?: number
): Promise<{ deleted: number; kept: number }> {
    if (!pool) return { deleted: 0, kept: 0 };
    const tenantId = TENANT;
    const params: any[] = [tenantId];
    let boardFilter = '';
    if (boardId !== undefined) {
        params.push(boardId);
        boardFilter = ' AND board_id = $2';
    }
    const result = await pool.query(
        `DELETE FROM metrics_history
         WHERE tenant_id = $1${boardFilter}
           AND id NOT IN (
               SELECT DISTINCT ON (tenant_id, board_id) id
               FROM metrics_history
               WHERE tenant_id = $1${boardFilter}
               ORDER BY tenant_id, board_id, calculated_at DESC
           )`,
        params
    );
    const { rows: keptRows } = await pool.query(
        `SELECT COUNT(*)::int AS kept FROM metrics_history WHERE tenant_id = $1${boardFilter}`,
        params
    );
    return {
        deleted: result.rowCount ?? 0,
        kept: keptRows[0]?.kept ?? 0,
    };
}

// Deletes all history rows for a (tenant, board). Returns deleted row count.
export async function deleteBoardMetrics(boardId: number): Promise<number> {
    if (!pool) return 0;
    const tenantId = TENANT;
    try {
        const result = await pool.query(
            `DELETE FROM metrics_history WHERE tenant_id = $1 AND board_id = $2`,
            [tenantId, boardId]
        );
        return result.rowCount ?? 0;
    } catch (err) {
        console.warn('[db] deleteBoardMetrics failed:', err instanceof Error ? err.message : err);
        return 0;
    }
}

// Returns the latest row per (tenant_id, board_id) for this tenant, newest first.
export async function getAllBoardsWithMetrics(): Promise<BoardWithMetrics[]> {
    if (!pool) return [];
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            `SELECT DISTINCT ON (board_id)
                board_id, board_name, calculated_at, sprint_count, maturity_level, metrics_data
             FROM metrics_history
             WHERE tenant_id = $1
             ORDER BY board_id, calculated_at DESC`,
            [tenantId]
        );
        return rows
            .map((r) => ({
                board_id: r.board_id,
                board_name: r.board_name,
                last_calculated:
                    r.calculated_at instanceof Date
                        ? r.calculated_at.toISOString()
                        : String(r.calculated_at),
                sprint_count: r.sprint_count ?? null,
                maturity_level: r.maturity_level ?? null,
                metrics_data: r.metrics_data,
            }))
            .sort((a, b) => (a.last_calculated < b.last_calculated ? 1 : -1));
    } catch (err) {
        console.warn(
            '[db] getAllBoardsWithMetrics failed:',
            err instanceof Error ? err.message : err
        );
        return [];
    }
}

export interface PortfolioHistoryRow {
    board_id: number;
    board_name: string;
    calculated_at: string;
    maturity_level: string | null;
    metrics_data: unknown;
}

// Full history (incl. metrics_data) for ALL boards in one query, oldest → newest
// per board, capped at `perBoard` analyses each. Feeds the coaching portfolio
// endpoint so the leadership view computes trends without N round-trips.
export async function getPortfolioHistory(perBoard = 30): Promise<PortfolioHistoryRow[]> {
    if (!pool) return [];
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            `SELECT board_id, board_name, calculated_at, maturity_level, metrics_data
             FROM (
                SELECT board_id, board_name, calculated_at, maturity_level, metrics_data,
                       ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY calculated_at DESC) AS rn
                FROM metrics_history
                WHERE tenant_id = $1
             ) t
             WHERE rn <= $2
             ORDER BY board_id, calculated_at ASC`,
            [tenantId, perBoard]
        );
        return rows.map((r) => ({
            board_id: r.board_id,
            board_name: r.board_name,
            calculated_at:
                r.calculated_at instanceof Date
                    ? r.calculated_at.toISOString()
                    : String(r.calculated_at),
            maturity_level: r.maturity_level ?? null,
            metrics_data: r.metrics_data,
        }));
    } catch (err) {
        console.warn('[db] getPortfolioHistory failed:', err instanceof Error ? err.message : err);
        return [];
    }
}

// ── Coaching layer ───────────────────────────────────────────────────────────

export type CoachingRole = 'scrum_master' | 'tech_lead' | 'pm' | 'po' | 'none';

export interface DetectedSm {
    accountId?: string;
    displayName?: string;
    score?: number;
    isProjectAdmin?: boolean;
    candidates?: Array<{
        accountId?: string;
        displayName?: string;
        score: number;
        isProjectAdmin?: boolean;
    }>;
}

// The structured coaching record per team (the "Coaching Case"). Kept lean on
// purpose — one short line each — so it stays objective and scannable.
export interface CoachingCase {
    mainGap?: string | null;
    hypothesis?: string | null;
    nextStep?: string | null;
    supportNeeded?: string | null;
    reviewAt?: string | null; // YYYY-MM-DD
    stage?: string | null; // discovery | active | monitoring | self_sustained
}

export interface CoachingAssignment {
    boardId: number;
    boardName: string | null;
    smName: string | null;
    smAccountId: string | null;
    role: CoachingRole;
    coaching: boolean;
    engagedBy: string | null;
    engagedAt: string | null;
    coachingCase: CoachingCase | null;
    detectedSm: DetectedSm | null;
    detectedAt: string | null;
    updatedAt: string;
}

const toIso = (v: unknown): string =>
    v instanceof Date ? v.toISOString() : v == null ? '' : String(v);

export async function getCoachingAssignments(): Promise<CoachingAssignment[]> {
    if (!pool) return [];
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            `SELECT board_id, board_name, sm_name, sm_account_id, role, coaching,
                    engaged_by, engaged_at, coaching_case, detected_sm, detected_at, updated_at
             FROM coaching_scrum_managers
             WHERE tenant_id = $1`,
            [tenantId]
        );
        return rows.map((r) => ({
            boardId: r.board_id,
            boardName: r.board_name ?? null,
            smName: r.sm_name ?? null,
            smAccountId: r.sm_account_id ?? null,
            role: (r.role ?? 'scrum_master') as CoachingRole,
            coaching: !!r.coaching,
            engagedBy: r.engaged_by ?? null,
            engagedAt: r.engaged_at ? toIso(r.engaged_at) : null,
            coachingCase: (r.coaching_case ?? null) as CoachingCase | null,
            detectedSm: (r.detected_sm ?? null) as DetectedSm | null,
            detectedAt: r.detected_at ? toIso(r.detected_at) : null,
            updatedAt: toIso(r.updated_at),
        }));
    } catch (err) {
        console.warn(
            '[db] getCoachingAssignments failed:',
            err instanceof Error ? err.message : err
        );
        return [];
    }
}

// Upsert the human-confirmed assignment. Leaves detected_sm/detected_at untouched.
export async function upsertCoachingAssignment(a: {
    boardId: number;
    boardName?: string | null;
    smName?: string | null;
    smAccountId?: string | null;
    role?: CoachingRole;
    coaching?: boolean;
    engagedBy?: string | null;
    coachingCase?: CoachingCase | null;
}): Promise<void> {
    if (!pool) return;
    const tenantId = TENANT;

    // On a partial update, only overwrite the columns the caller actually
    // provided. Otherwise omitted fields (coerced to null/defaults below) would
    // wipe a previously saved sm_name/sm_account_id or reset role/coaching. A
    // key that is present but null is honored as an explicit clear.
    const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(a, k);
    const updates = [
        'board_name = COALESCE(EXCLUDED.board_name, coaching_scrum_managers.board_name)',
    ];
    if (has('smName')) updates.push('sm_name = EXCLUDED.sm_name');
    if (has('smAccountId')) updates.push('sm_account_id = EXCLUDED.sm_account_id');
    if (has('role')) updates.push('role = EXCLUDED.role');
    if (has('coaching')) updates.push('coaching = EXCLUDED.coaching');
    if (has('coachingCase')) updates.push('coaching_case = EXCLUDED.coaching_case');
    // Update the Agile Coach whenever it is explicitly provided (so a partial save
    // that only sets engagedBy is honored, not just when coaching is toggled on).
    if (has('engagedBy')) updates.push('engaged_by = EXCLUDED.engaged_by');
    // Stamp the engagement start when coaching is turned on, preserving the first
    // start date. The INSERT branch seeds engaged_at via the same CASE on $7.
    if (has('coaching') && a.coaching === true) {
        updates.push('engaged_at = COALESCE(coaching_scrum_managers.engaged_at, now())');
    }
    updates.push('updated_at = now()');

    await pool.query(
        `INSERT INTO coaching_scrum_managers
            (tenant_id, board_id, board_name, sm_name, sm_account_id, role, coaching, engaged_by, engaged_at, coaching_case, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $7 THEN now() ELSE NULL END, $9, now())
         ON CONFLICT (tenant_id, board_id) DO UPDATE SET
            ${updates.join(',\n            ')}`,
        [
            tenantId,
            a.boardId,
            a.boardName ?? null,
            a.smName ?? null,
            a.smAccountId ?? null,
            a.role ?? 'scrum_master',
            a.coaching ?? false,
            a.engagedBy ?? null,
            a.coachingCase != null ? JSON.stringify(a.coachingCase) : null,
        ]
    );
}

// Persist the Jira-detected SM suggestion (run once / re-detect on demand). Preserves human fields.
export async function saveDetectedSm(
    boardId: number,
    boardName: string | null,
    detected: DetectedSm
): Promise<void> {
    if (!pool) return;
    const tenantId = TENANT;
    await pool.query(
        `INSERT INTO coaching_scrum_managers
            (tenant_id, board_id, board_name, detected_sm, detected_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (tenant_id, board_id) DO UPDATE SET
            board_name = COALESCE(EXCLUDED.board_name, coaching_scrum_managers.board_name),
            detected_sm = EXCLUDED.detected_sm,
            detected_at = now(),
            updated_at = now()`,
        [tenantId, boardId, boardName, JSON.stringify(detected)]
    );
}

export interface CoachingAssessment {
    id: number;
    boardId: number;
    signals: Record<string, string>;
    note: string | null;
    author: string | null;
    assessedAt: string;
}

// Latest assessment per board for the tenant.
export async function getLatestAssessments(): Promise<CoachingAssessment[]> {
    if (!pool) return [];
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            `SELECT DISTINCT ON (board_id)
                id, board_id, signals, note, author, assessed_at
             FROM coaching_assessments
             WHERE tenant_id = $1
             ORDER BY board_id, assessed_at DESC`,
            [tenantId]
        );
        return rows.map((r) => ({
            id: Number(r.id),
            boardId: r.board_id,
            signals: (r.signals ?? {}) as Record<string, string>,
            note: r.note ?? null,
            author: r.author ?? null,
            assessedAt: toIso(r.assessed_at),
        }));
    } catch (err) {
        console.warn('[db] getLatestAssessments failed:', err instanceof Error ? err.message : err);
        return [];
    }
}

export async function saveAssessment(
    boardId: number,
    signals: Record<string, string>,
    note: string | null,
    author: string | null
): Promise<CoachingAssessment | null> {
    if (!pool) return null;
    const tenantId = TENANT;
    const { rows } = await pool.query(
        `INSERT INTO coaching_assessments (tenant_id, board_id, signals, note, author)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, board_id, signals, note, author, assessed_at`,
        [tenantId, boardId, JSON.stringify(signals ?? {}), note ?? null, author ?? null]
    );
    const r = rows[0];
    // Bound table growth: the read path (getLatestAssessments) only ever surfaces the
    // newest row per board, so prune the now-superseded rows for this board. Best-effort.
    try {
        await pool.query(
            `DELETE FROM coaching_assessments WHERE tenant_id = $1 AND board_id = $2 AND id <> $3`,
            [tenantId, boardId, r.id]
        );
    } catch (err) {
        console.warn(
            '[db] pruning old assessments failed:',
            err instanceof Error ? err.message : err
        );
    }
    return {
        id: Number(r.id),
        boardId: r.board_id,
        signals: (r.signals ?? {}) as Record<string, string>,
        note: r.note ?? null,
        author: r.author ?? null,
        assessedAt: toIso(r.assessed_at),
    };
}

export interface CoachingExperiment {
    id: number;
    boardId: number;
    pillar: string | null;
    metric: string | null;
    behavior: string | null;
    hypothesis: string | null;
    outcome: string | null;
    status: string;
    origin: string;
    startedAt: string | null;
    targetAt: string | null;
}

const mapExperiment = (r: any): CoachingExperiment => ({
    id: Number(r.id),
    boardId: r.board_id,
    pillar: r.pillar ?? null,
    metric: r.metric ?? null,
    behavior: r.behavior ?? null,
    hypothesis: r.hypothesis ?? null,
    outcome: r.outcome ?? null,
    status: r.status ?? 'active',
    origin: r.origin ?? 'manual',
    startedAt: r.started_at ? toIso(r.started_at).slice(0, 10) : null,
    targetAt: r.target_at ? toIso(r.target_at).slice(0, 10) : null,
});

export async function getExperiments(): Promise<CoachingExperiment[]> {
    if (!pool) return [];
    const tenantId = TENANT;
    try {
        const { rows } = await pool.query(
            `SELECT id, board_id, pillar, metric, behavior, hypothesis, outcome, status, origin, started_at, target_at
             FROM coaching_experiments
             WHERE tenant_id = $1
             ORDER BY created_at DESC`,
            [tenantId]
        );
        return rows.map(mapExperiment);
    } catch (err) {
        console.warn('[db] getExperiments failed:', err instanceof Error ? err.message : err);
        return [];
    }
}

export async function saveExperiment(e: {
    id?: number;
    boardId: number;
    pillar?: string | null;
    metric?: string | null;
    behavior?: string | null;
    hypothesis?: string | null;
    outcome?: string | null;
    status?: string;
    origin?: string;
    startedAt?: string | null;
    targetAt?: string | null;
}): Promise<CoachingExperiment | null> {
    if (!pool) return null;
    const tenantId = TENANT;
    if (e.id) {
        const { rows } = await pool.query(
            `UPDATE coaching_experiments SET
                pillar = $3, metric = $4, behavior = $5, hypothesis = $6,
                status = $7, started_at = $8, target_at = $9, outcome = $10, updated_at = now()
             WHERE tenant_id = $1 AND id = $2
             RETURNING id, board_id, pillar, metric, behavior, hypothesis, outcome, status, origin, started_at, target_at`,
            [
                tenantId,
                e.id,
                e.pillar ?? null,
                e.metric ?? null,
                e.behavior ?? null,
                e.hypothesis ?? null,
                e.status ?? 'active',
                e.startedAt ?? null,
                e.targetAt ?? null,
                e.outcome ?? null,
            ]
        );
        return rows[0] ? mapExperiment(rows[0]) : null;
    }
    const { rows } = await pool.query(
        `INSERT INTO coaching_experiments
            (tenant_id, board_id, pillar, metric, behavior, hypothesis, outcome, status, origin, started_at, target_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, board_id, pillar, metric, behavior, hypothesis, outcome, status, origin, started_at, target_at`,
        [
            tenantId,
            e.boardId,
            e.pillar ?? null,
            e.metric ?? null,
            e.behavior ?? null,
            e.hypothesis ?? null,
            e.outcome ?? null,
            e.status ?? 'active',
            e.origin ?? 'manual',
            e.startedAt ?? null,
            e.targetAt ?? null,
        ]
    );
    return rows[0] ? mapExperiment(rows[0]) : null;
}

export async function deleteExperiment(id: number): Promise<number> {
    if (!pool) return 0;
    const tenantId = TENANT;
    try {
        const result = await pool.query(
            `DELETE FROM coaching_experiments WHERE tenant_id = $1 AND id = $2`,
            [tenantId, id]
        );
        return result.rowCount ?? 0;
    } catch (err) {
        console.warn('[db] deleteExperiment failed:', err instanceof Error ? err.message : err);
        return 0;
    }
}
