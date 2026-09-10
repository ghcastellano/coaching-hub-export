import { AppContext } from '../app';
import { JiraService, JiraCredentials } from '../services/JiraService';
import { SM_CANDIDATES } from '../config/coaching';
import {
    isDbEnabled,
    getCoachingAssignments,
    upsertCoachingAssignment,
    saveDetectedSm,
    getLatestAssessments,
    saveAssessment,
    getExperiments,
    saveExperiment,
    deleteExperiment,
    getPortfolioHistory,
    CoachingRole,
    DetectedSm,
} from '../services/database';
import {
    buildPortfolio,
    summarize,
    PERIOD_DAYS,
    MetricsData,
} from '../../components/coaching/portfolio';
import { isAllowedCoachingEmail } from '../../util/coachingAccess';

// Gate every Coaching Hub endpoint to the allowlist. Identity is the caller's
// login email, sent on the `x-user-email` header; anyone else gets a 403 and no
// data. Returns true (and writes the 403) when the caller is NOT authorized.
const denyCoachingAccess = (ctx: AppContext): boolean => {
    if (isAllowedCoachingEmail(ctx.get('x-user-email'))) return false;
    ctx.status = 403;
    ctx.body = { success: false, error: 'Not authorized to access the Coaching Hub.' };
    return true;
};

const dbDisabled = (ctx: AppContext): boolean => {
    if (!isDbEnabled()) {
        ctx.status = 200;
        ctx.body = { success: false, error: 'db-disabled', dbEnabled: false };
        return true;
    }
    return false;
};

// ── Board → Scrum Manager assignments ────────────────────────────────────────

export const GetBoardManagersController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    if (!isDbEnabled()) {
        ctx.status = 200;
        ctx.body = { success: true, assignments: [], dbEnabled: false };
        return;
    }
    try {
        const assignments = await getCoachingAssignments();
        ctx.status = 200;
        ctx.body = { success: true, assignments, dbEnabled: true };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

interface SaveManagerBody {
    boardId?: number;
    boardName?: string | null;
    smName?: string | null;
    smAccountId?: string | null;
    role?: CoachingRole;
    coaching?: boolean;
    engagedBy?: string | null;
    coachingCase?: Record<string, unknown> | null;
}

export const SaveBoardManagerController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    const body = ctx.request.body as SaveManagerBody;
    const boardId = Number(body?.boardId);
    if (!Number.isFinite(boardId)) {
        ctx.status = 400;
        ctx.body = { success: false, error: 'boardId is required' };
        return;
    }
    if (dbDisabled(ctx)) return;
    try {
        // Presence-aware: only touch coaching/engagedBy when the caller actually sent
        // them. A partial save (e.g. SM re-detection) must NOT silently flip coaching
        // off — that would drop the team from the program.
        await upsertCoachingAssignment({
            boardId,
            boardName: body.boardName ?? null,
            smName: body.smName ?? null,
            smAccountId: body.smAccountId ?? null,
            role: body.role ?? 'scrum_master',
            ...(body.coaching !== undefined ? { coaching: body.coaching } : {}),
            ...(body.engagedBy != null ? { engagedBy: body.engagedBy } : {}),
            ...(body.coachingCase !== undefined ? { coachingCase: body.coachingCase } : {}),
        });
        ctx.status = 200;
        ctx.body = { success: true };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

// ── Leadership portfolio (engagement-status view, pre-aggregated) ────────────

export const GetCoachingPortfolioController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    const since = new Date(Date.now() - PERIOD_DAYS * 24 * 3600 * 1000).toISOString();
    const period = { days: PERIOD_DAYS, since };
    if (!isDbEnabled()) {
        ctx.status = 200;
        ctx.body = { success: true, dbEnabled: false, period, boards: [], summary: summarize([]) };
        return;
    }
    try {
        const [history, assignments, assessments, experiments] = await Promise.all([
            getPortfolioHistory(),
            getCoachingAssignments(),
            getLatestAssessments(),
            getExperiments(),
        ]);
        const boards = buildPortfolio({
            history: history.map((r) => ({
                board_id: r.board_id,
                board_name: r.board_name,
                calculated_at: r.calculated_at,
                maturity_level: r.maturity_level,
                metrics_data: (r.metrics_data || null) as MetricsData | null,
            })),
            assignments: assignments.map((a) => ({
                boardId: a.boardId,
                boardName: a.boardName,
                smName: a.smName,
                role: a.role,
                coaching: a.coaching,
                engagedBy: a.engagedBy,
                engagedAt: a.engagedAt,
                coachingCase: a.coachingCase,
                detectedSm: a.detectedSm,
            })),
            assessments: assessments.map((s) => ({ boardId: s.boardId, signals: s.signals })),
            experiments: experiments.map((e) => ({
                boardId: e.boardId,
                status: e.status,
                pillar: e.pillar,
            })),
            periodStart: since,
        });
        const summary = summarize(
            boards.map((b) => ({
                status: b.status,
                coaching: b.coaching,
                currentLevel: b.currentLevel,
                graduatedThisPeriod: b.graduatedThisPeriod,
                levelDeltaInPeriod: b.levelDeltaInPeriod,
                leveledUpThisPeriod: b.leveledUpThisPeriod,
            }))
        );
        ctx.status = 200;
        ctx.body = { success: true, dbEnabled: true, period, boards, summary };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

// ── Detect the Scrum Manager from Jira changelog ─────────────────────────────

interface DetectSmBody extends Partial<JiraCredentials> {
    boardId?: number;
    boardName?: string | null;
    sprintCount?: number;
}

const matchesCandidate = (
    r: { accountId?: string; displayName?: string },
    candidates: string[]
): boolean => {
    const norm = (s?: string) => (s ?? '').trim().toLowerCase();
    const cands = candidates.map(norm).filter(Boolean);
    return cands.includes(norm(r.displayName));
};

export const DetectScrumManagerController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    const body = ctx.request.body as DetectSmBody;
    const boardId = Number(body?.boardId);
    if (
        !body?.jiraUrl ||
        !body?.email ||
        !body?.apiToken ||
        !Number.isInteger(boardId) ||
        boardId <= 0
    ) {
        ctx.status = 400;
        ctx.body = {
            success: false,
            error: 'jiraUrl, email, apiToken, and a numeric boardId are required',
        };
        return;
    }

    try {
        const jira = new JiraService({
            jiraUrl: body.jiraUrl,
            email: body.email,
            apiToken: body.apiToken,
        });
        const { ranking, sampledSprints, sampledIssues } = await jira.detectScrumManager(
            boardId,
            body.sprintCount ?? 3
        );

        // STRICT: only pick someone from the known candidate list (server-owned). If the
        // top movers aren't in the list, return no SM — do NOT fall back to the overall
        // top mover (the team is run by someone outside the list).
        const filtered = ranking.filter((r) => matchesCandidate(r, SM_CANDIDATES));
        const top = (filtered[0] ?? null) as {
            accountId?: string;
            displayName?: string;
            score: number;
            isProjectAdmin?: boolean;
        } | null;

        // Persist the attempt either way (incl. "no candidate matched") so the hub
        // doesn't re-detect on every load. `candidates` keeps the ranking for context.
        const detected: DetectedSm = {
            accountId: top?.accountId,
            displayName: top?.displayName,
            score: top?.score ?? 0,
            isProjectAdmin: top?.isProjectAdmin,
            candidates: ranking.slice(0, 5),
        };

        if (isDbEnabled()) {
            await saveDetectedSm(boardId, body.boardName ?? null, detected);
        }

        ctx.status = 200;
        ctx.body = {
            success: true,
            detected,
            matched: !!top,
            sampledSprints,
            sampledIssues,
            dbEnabled: isDbEnabled(),
        };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

// ── Subjective assessments (behavioral readiness rubric) ─────────────────────

export const GetAssessmentsController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    if (!isDbEnabled()) {
        ctx.status = 200;
        ctx.body = { success: true, assessments: [], dbEnabled: false };
        return;
    }
    try {
        const assessments = await getLatestAssessments();
        ctx.status = 200;
        ctx.body = { success: true, assessments, dbEnabled: true };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

interface SaveAssessmentBody {
    boardId?: number;
    signals?: Record<string, string>;
    note?: string | null;
    author?: string | null;
}

export const SaveAssessmentController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    const body = ctx.request.body as SaveAssessmentBody;
    const boardId = Number(body?.boardId);
    if (!Number.isFinite(boardId)) {
        ctx.status = 400;
        ctx.body = { success: false, error: 'boardId is required' };
        return;
    }
    if (dbDisabled(ctx)) return;
    try {
        const assessment = await saveAssessment(
            boardId,
            body.signals ?? {},
            body.note ?? null,
            body.author ?? null
        );
        ctx.status = 200;
        ctx.body = { success: true, assessment };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

// ── Coaching experiments ─────────────────────────────────────────────────────

export const GetExperimentsController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    if (!isDbEnabled()) {
        ctx.status = 200;
        ctx.body = { success: true, experiments: [], dbEnabled: false };
        return;
    }
    try {
        const experiments = await getExperiments();
        ctx.status = 200;
        ctx.body = { success: true, experiments, dbEnabled: true };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

interface SaveExperimentBody {
    id?: number;
    boardId?: number;
    pillar?: string | null;
    metric?: string | null;
    behavior?: string | null;
    hypothesis?: string | null;
    outcome?: string | null;
    status?: string;
    origin?: string;
    startedAt?: string | null;
    targetAt?: string | null;
}

export const SaveExperimentController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    const body = ctx.request.body as SaveExperimentBody;
    const boardId = Number(body?.boardId);
    if (!Number.isFinite(boardId)) {
        ctx.status = 400;
        ctx.body = { success: false, error: 'boardId is required' };
        return;
    }
    if (dbDisabled(ctx)) return;
    try {
        const experiment = await saveExperiment({
            id: body.id,
            boardId,
            pillar: body.pillar ?? null,
            metric: body.metric ?? null,
            behavior: body.behavior ?? null,
            hypothesis: body.hypothesis ?? null,
            outcome: body.outcome ?? null,
            status: body.status ?? 'active',
            origin: body.origin ?? 'manual',
            startedAt: body.startedAt ?? null,
            targetAt: body.targetAt ?? null,
        });
        ctx.status = 200;
        ctx.body = { success: true, experiment };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

export const DeleteExperimentController = async (ctx: AppContext): Promise<void> => {
    if (denyCoachingAccess(ctx)) return;
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) {
        ctx.status = 400;
        ctx.body = { success: false, error: 'id is required' };
        return;
    }
    if (dbDisabled(ctx)) return;
    try {
        const removed = await deleteExperiment(id);
        ctx.status = 200;
        ctx.body = { success: true, removed };
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};
