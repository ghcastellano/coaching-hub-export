// Coaching portfolio — the SINGLE source of truth for how a board is read as a
// coaching engagement. Pure logic, NO React: imported by both the client
// (CoachingHub + presentation components) and the server
// (GetCoachingPortfolioController) so the level, status and trends can never
// drift between what the API computes and what the screen shows.
//
// The leadership view (PMO) is organised by ENGAGEMENT STATUS, not by Scrum
// Manager. A board is classified into one of three mutually exclusive buckets
// (At risk / In coaching / On-demand) or hidden when it is not part of the
// coaching program at all.

import { determineMaturityLevel, coachingFocus, CoachingFocus } from '../../util/maturity';

export type Level = 1 | 2 | 3;
export type EngagementStatus = 'at_risk' | 'in_coaching' | 'on_demand';

// Trailing window used to detect a regression and to scope "this period".
export const PERIOD_DAYS = 90;
// A board is "at risk" when its current level is below the highest level it held
// across the most recent N analyses.
export const REGRESSION_WINDOW = 4;

// ── Objective metrics (Jira) ────────────────────────────────────────────────

export interface MetricsData {
    aggregated?: {
        avgSprintHitRatePoints?: number;
        avgSprintHitRate?: number;
        avgRolloverRate?: number;
        totalSprints?: number;
    };
    backlogHealth?: { overallScore?: number };
    flowQuality?: { reworkBySprint?: Array<{ sprint?: string; reworkRate?: number }> };
    sprintMetrics?: Array<{
        sprintName?: string;
        sprintHitRatePoints?: number;
        rolloverRate?: number;
        startDate?: string;
        endDate?: string;
    }>;
}

export interface RecentSprint {
    sprintName: string;
    level: Level;
    hitRate: number;
    rollover: number;
    rework: number;
    startDate?: string;
    endDate?: string;
}

export interface Metrics {
    hitRate: number;
    rollover: number;
    readiness: number;
    avgRework: number;
}

// Extract the 4 weakest-link variables from a persisted metrics_data blob.
export const metricsOf = (m?: MetricsData | null): Metrics => {
    const { aggregated = {}, backlogHealth = {}, flowQuality = {} } = m || {};
    const hitRate = aggregated.avgSprintHitRatePoints ?? aggregated.avgSprintHitRate ?? 0;
    const rollover = aggregated.avgRolloverRate ?? 0;
    const readiness = backlogHealth.overallScore ?? 0;
    const rework = flowQuality.reworkBySprint || [];
    const avgRework =
        rework.length > 0
            ? rework.reduce((sum, s) => sum + (s.reworkRate ?? 0), 0) / rework.length
            : 0;
    return { hitRate, rollover, readiness, avgRework };
};

// True only when the blob carries all four weakest-link inputs. metricsOf backfills
// missing fields with 0, so without this an empty/partial blob would classify as
// Silver — wrongly overriding a persisted Gold/Platinum maturity_level fallback.
const hasCompleteQuantMetrics = (m?: MetricsData | null): boolean =>
    !!m &&
    (m.aggregated?.avgSprintHitRatePoints ?? m.aggregated?.avgSprintHitRate) != null &&
    m.aggregated?.avgRolloverRate != null &&
    m.backlogHealth?.overallScore != null &&
    (m.flowQuality?.reworkBySprint?.some((s) => s.reworkRate != null) ?? false);

// Classify a metrics blob through the shared 4-variable weakest-link model.
// Returns null when there are no (complete) metrics to classify.
export const quantLevel = (m?: MetricsData | null): Level | null => {
    if (!hasCompleteQuantMetrics(m)) return null;
    const { hitRate, rollover, readiness, avgRework } = metricsOf(m);
    return determineMaturityLevel({
        rolloverRatePct: rollover,
        backlogReadinessPct: readiness,
        sprintHitRatePct: hitRate,
        qaReworkRatePct: avgRework,
    }).level;
};

// metrics_history.maturity_level is stored as TEXT (e.g. "Silver" / "Gold" /
// "Platinum", sometimes "Level 2"). Used only as a fallback when a row has no
// metrics_data to recompute from. Tolerates null/unknown.
export const levelNameToNumber = (name?: string | null): Level | null => {
    if (!name) return null;
    const s = String(name).toLowerCase();
    if (s.includes('silver') || s.includes('1')) return 1;
    if (s.includes('gold') || s.includes('2')) return 2;
    if (s.includes('platinum') || s.includes('3')) return 3;
    return null;
};

// ── Behavioral readiness (subjective graduation gate) ───────────────────────
// The signal keys are canonical from the Three Pillars docs. Scores: Not yet 0,
// Emerging 1, Consistent 2. Unrated signals count as 0, so the % matches what is
// shown and only reaches 100% when every signal is Consistent.

export const SIGNAL_KEYS = [
    'scope_churn',
    'planning_realism',
    'ceremonies_effective',
    'dod_discipline',
    'rotating_facilitation',
    'pull_not_push',
    'impediments_self',
    'psych_safety',
    'team_stability',
] as const;

const SIGNAL_SCORE: Record<string, number> = { not_yet: 0, emerging: 1, consistent: 2 };

export type ReadinessLabel = 'not_assessed' | 'forming' | 'developing' | 'ready';

export interface Readiness {
    pct: number | null;
    label: ReadinessLabel;
    rated: number;
    total: number;
}

export const behavioralReadiness = (signals: Record<string, string> = {}): Readiness => {
    const total = SIGNAL_KEYS.length;
    const rated = SIGNAL_KEYS.filter((k) => signals[k] && signals[k] !== 'unknown').length;
    if (rated === 0) return { pct: null, label: 'not_assessed', rated: 0, total };
    const sum = SIGNAL_KEYS.reduce((acc, k) => acc + (SIGNAL_SCORE[signals[k]] ?? 0), 0);
    const pct = Math.round((sum / (total * 2)) * 100);
    const label: ReadinessLabel = pct >= 75 ? 'ready' : pct >= 40 ? 'developing' : 'forming';
    return { pct, label, rated, total };
};

// Ready to confirm a move up when behavioral signals are strong AND the objective
// metrics already sit at Gold or above.
export const graduationReady = (
    level: Level | null,
    readinessPct: number | null
): boolean | null => {
    if (readinessPct == null || level == null) return null;
    return readinessPct >= 75 && level >= 2;
};

// ── Suggested coaching focus — delegates to the shared model (single source) ──
export const focusAreas = (m?: MetricsData | null): CoachingFocus[] => {
    if (!m) return [];
    return coachingFocus(metricsOf(m));
};

// ── Support Model: Scrum Manager ↔ team intensity, by level (canonical docs) ──
// This is how much the SCRUM MANAGER supports the team at each maturity level —
// NOT the Agile Coach's cadence with the SM (that is multi-touch/irregular and is
// captured via logged interventions + a coach-set "next check-in" date). Shown as
// labeled context only.
export type SupportModel = 'bi_weekly' | 'monthly' | 'quarterly' | 'none';

export const supportModelFor = (level: Level | null): SupportModel => {
    if (level === 1) return 'bi_weekly'; // Silver — high-touch
    if (level === 2) return 'monthly'; // Gold — shared/part-time
    if (level === 3) return 'quarterly'; // Platinum — on-demand health checks
    return 'none';
};

// ── Engagement status classification ────────────────────────────────────────

export interface ClassifyInput {
    coaching: boolean;
    currentLevel: Level | null;
    /** maturity levels oldest → newest; may be empty */
    levelSeries: Level[];
}

// Highest level held across the most recent window of analyses.
export const recentMax = (levelSeries: Level[], window = REGRESSION_WINDOW): Level | null => {
    if (!levelSeries.length) return null;
    const recent = levelSeries.slice(-window);
    return Math.max(...recent) as Level;
};

// A board is part of the coaching program if it is actively coached OR it ever
// reached Platinum (so graduated/regressed Platinum teams still surface). Others
// are hidden from the leadership view.
export const isInProgram = (input: ClassifyInput): boolean => {
    const everPlatinum = input.currentLevel === 3 || input.levelSeries.some((l) => l === 3);
    return input.coaching === true || everPlatinum;
};

// Returns the engagement bucket, or null when the board is not in the program
// (hidden). First matching rule wins, in priority order.
export const classifyEngagement = (input: ClassifyInput): EngagementStatus | null => {
    if (!isInProgram(input)) return null;
    const { coaching, currentLevel, levelSeries } = input;

    // 1) At risk — regressed below a level recently held. Early-warning first.
    const rmax = recentMax(levelSeries);
    if (currentLevel != null && rmax != null && currentLevel < rmax) return 'at_risk';

    // 2) On-demand — self-managed Platinum, no active coaching.
    if (currentLevel === 3 && !coaching) return 'on_demand';

    // 3) In coaching — actively coached (incl. Platinum still under support).
    if (coaching) return 'in_coaching';

    // In-program via "ever Platinum" but drifted long ago with no recent
    // regression and not coached → treat as on-demand.
    return 'on_demand';
};

// ── Graduation event ────────────────────────────────────────────────────────

export interface LevelPoint {
    at: string; // ISO timestamp
    level: Level;
}

// When the board reached AND held Platinum: returns the timestamp it entered the
// trailing run of Platinum analyses (held = ≥2 consecutive at the end, or a
// single analysis at Platinum). null otherwise.
export const graduatedAt = (series: LevelPoint[]): string | null => {
    if (!series.length) return null;
    const last = series[series.length - 1];
    if (last.level !== 3) return null;
    let i = series.length - 1;
    while (i > 0 && series[i - 1].level === 3) i -= 1;
    const runLength = series.length - i;
    if (series.length === 1 || runLength >= 2) return series[i].at;
    return null;
};

export const isWithinPeriod = (iso: string | null, periodStartIso: string): boolean => {
    if (!iso) return false;
    return iso >= periodStartIso;
};

// ── Program summary (faixa de saúde) ────────────────────────────────────────

export interface BoardSummaryInput {
    status: EngagementStatus | null;
    coaching: boolean;
    currentLevel: Level | null;
    graduatedThisPeriod: boolean;
    /** sign contributes to net movement (current − first level in period) */
    levelDeltaInPeriod: number;
    /** latest transition was upward and happened within the period */
    leveledUpThisPeriod: boolean;
}

export interface Summary {
    inCoaching: number;
    atRisk: number;
    onDemand: number;
    graduatedThisPeriod: number;
    bands: { silver: number; gold: number; platinum: number };
    /** teams that gained a level this period (Silver→Gold or Gold→Platinum) */
    leveledUp: number;
}

// ── Full aggregation (server builds this from raw DB rows; pure + testable) ──

export interface HistoryRowInput {
    board_id: number;
    board_name: string;
    calculated_at: string;
    maturity_level: string | null;
    metrics_data: MetricsData | null;
}
export interface CoachingCaseInput {
    mainGap?: string | null;
    hypothesis?: string | null;
    nextStep?: string | null;
    supportNeeded?: string | null;
    reviewAt?: string | null;
    stage?: string | null;
}
export interface AssignmentInput {
    boardId: number;
    boardName: string | null;
    smName: string | null;
    role: string;
    coaching: boolean;
    engagedBy: string | null;
    engagedAt: string | null;
    coachingCase?: CoachingCaseInput | null;
    detectedSm?: { displayName?: string } | null;
}
export interface AssessmentInput {
    boardId: number;
    signals: Record<string, string>;
}
export interface ExperimentInput {
    boardId: number;
    status: string;
    pillar: string | null;
}

export interface TrendPoint {
    at: string;
    value: number;
    /** Last sprint name in this analysis window — used as chart label */
    sprintName?: string;
}
export interface PortfolioBoard {
    boardId: number;
    boardName: string;
    sm: { name: string; role: string } | null;
    agileCoach: string | null;
    engagedAt: string | null;
    supportModel: SupportModel;
    coaching: boolean;
    currentLevel: Level | null;
    firstLevel: Level | null;
    levelSeries: LevelPoint[];
    metricTrends: {
        hitRate: TrendPoint[];
        rollover: TrendPoint[];
        rework: TrendPoint[];
        readiness: TrendPoint[];
    };
    latestMetrics: Metrics | null;
    behavioral: Readiness;
    experiments: { active: number; done: number; dropped: number };
    /** distinct pillar keys of the ACTIVE experiments — what's actually being worked on */
    workingOn: string[];
    focus: CoachingFocus[];
    graduationReady: boolean | null;
    coachingCase: CoachingCaseInput | null;
    /** ISO time the team entered its CURRENT level (start of the trailing run) */
    levelSince: string | null;
    /** the level held just before the current run, or null if no prior change */
    previousLevel: Level | null;
    /** null = analyzed but not part of the coaching program (hidden from leadership) */
    status: EngagementStatus | null;
    graduatedAt: string | null;
    graduatedThisPeriod: boolean;
    levelDeltaInPeriod: number;
    leveledUpThisPeriod: boolean;
    /** Last 3 sprints from the most recent analysis, oldest → newest */
    recentSprints: RecentSprint[];
    /** Total sprints included in the most recent analysis (≥ recentSprints.length) */
    analysisSprintCount: number;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

export interface BuildPortfolioInput {
    history: HistoryRowInput[];
    assignments: AssignmentInput[];
    assessments: AssessmentInput[];
    experiments: ExperimentInput[];
    /** ISO start of the trailing reporting period */
    periodStart: string;
}

// Reads raw DB rows into the leadership portfolio: per board, the maturity/metric
// trends, engagement, behavioral readiness, experiments and engagement status.
// Boards not in the program get status:null (kept, so an Edit roster can list them).
export const buildPortfolio = (input: BuildPortfolioInput): PortfolioBoard[] => {
    const { history, assignments, assessments, experiments, periodStart } = input;
    const aByBoard = new Map(assignments.map((a) => [a.boardId, a]));
    const sByBoard = new Map(assessments.map((s) => [s.boardId, s]));
    const expByBoard = new Map<number, ExperimentInput[]>();
    for (const e of experiments) {
        const arr = expByBoard.get(e.boardId) || [];
        arr.push(e);
        expByBoard.set(e.boardId, arr);
    }

    // Group history by board, preserving first-seen order (rows arrive oldest→newest).
    const histByBoard = new Map<number, HistoryRowInput[]>();
    const order: number[] = [];
    for (const r of history) {
        const arr = histByBoard.get(r.board_id);
        if (arr) arr.push(r);
        else {
            histByBoard.set(r.board_id, [r]);
            order.push(r.board_id);
        }
    }
    // Coached boards with no persisted analyses still belong in the program.
    for (const a of assignments) {
        if (a.coaching && !histByBoard.has(a.boardId)) {
            histByBoard.set(a.boardId, []);
            order.push(a.boardId);
        }
    }

    const out: PortfolioBoard[] = [];
    for (const boardId of order) {
        const rows = histByBoard.get(boardId) || [];
        const a = aByBoard.get(boardId) || null;

        const levelPoints: LevelPoint[] = [];
        const hitRate: TrendPoint[] = [];
        const rollover: TrendPoint[] = [];
        const rework: TrendPoint[] = [];
        const readiness: TrendPoint[] = [];
        for (const r of rows) {
            const md = r.metrics_data || null;
            const lvl = quantLevel(md) ?? levelNameToNumber(r.maturity_level);
            if (lvl != null) levelPoints.push({ at: r.calculated_at, level: lvl });
            if (md) {
                const m = metricsOf(md);
                // Last sprint in this analysis window — used as X-axis label in the chart
                const sprintMets = md.sprintMetrics ?? [];
                const sprintName = sprintMets.length
                    ? sprintMets[sprintMets.length - 1].sprintName
                    : undefined;
                hitRate.push({ at: r.calculated_at, value: round1(m.hitRate), sprintName });
                rollover.push({ at: r.calculated_at, value: round1(m.rollover), sprintName });
                rework.push({ at: r.calculated_at, value: round1(m.avgRework), sprintName });
                readiness.push({ at: r.calculated_at, value: round1(m.readiness), sprintName });
            }
        }

        const levelSeries = levelPoints.map((p) => p.level);
        const currentLevel = levelSeries.length ? levelSeries[levelSeries.length - 1] : null;
        const firstLevel = levelSeries.length ? levelSeries[0] : null;
        const coaching = !!a?.coaching;
        // status is null for boards not in the program. We KEEP them (so an Edit-mode
        // roster can list every analyzed team); the leadership view filters by status.
        const status = classifyEngagement({ coaching, currentLevel, levelSeries });

        const lastMd = rows.length ? rows[rows.length - 1].metrics_data || null : null;

        const recentSprints: RecentSprint[] = (() => {
            const sprintMets = lastMd?.sprintMetrics ?? [];
            const reworkArr = lastMd?.flowQuality?.reworkBySprint ?? [];
            const reworkByName = new Map(reworkArr.map((r) => [r.sprint ?? '', r.reworkRate ?? 0]));
            return sprintMets.slice(-3).map((sm) => {
                const rework = reworkByName.get(sm.sprintName ?? '') ?? 0;
                const lvl = determineMaturityLevel({
                    sprintHitRatePct: sm.sprintHitRatePoints ?? 0,
                    rolloverRatePct: sm.rolloverRate ?? 0,
                    qaReworkRatePct: rework,
                }).level;
                return {
                    sprintName: sm.sprintName ?? '',
                    level: lvl,
                    hitRate: sm.sprintHitRatePoints ?? 0,
                    rollover: sm.rolloverRate ?? 0,
                    rework,
                    startDate: sm.startDate,
                    endDate: sm.endDate,
                };
            });
        })();
        const behavioral = behavioralReadiness(sByBoard.get(boardId)?.signals || {});
        const exps = expByBoard.get(boardId) || [];
        const experimentsCount = { active: 0, done: 0, dropped: 0 };
        for (const e of exps) {
            if (e.status === 'active') experimentsCount.active += 1;
            else if (e.status === 'done') experimentsCount.done += 1;
            else if (e.status === 'dropped') experimentsCount.dropped += 1;
        }
        const workingOn = Array.from(
            new Set(
                exps
                    .filter((e) => e.status === 'active')
                    .map((e) => e.pillar)
                    .filter((p): p is string => !!p)
            )
        );
        // Time at the current level: walk back over the trailing run of the same
        // level; levelSince = when it entered, previousLevel = the level before it.
        let levelSince: string | null = null;
        let previousLevel: Level | null = null;
        if (levelPoints.length && currentLevel != null) {
            let i = levelPoints.length - 1;
            while (i > 0 && levelPoints[i - 1].level === currentLevel) i -= 1;
            levelSince = levelPoints[i].at;
            previousLevel = i > 0 ? levelPoints[i - 1].level : null;
        }
        const gradAt = graduatedAt(levelPoints);
        const pointsInPeriod = levelPoints.filter((p) => p.at >= periodStart);
        const levelDeltaInPeriod =
            currentLevel != null && pointsInPeriod.length
                ? currentLevel - pointsInPeriod[0].level
                : 0;
        // "Leveled up" = the team's most recent move was upward and it happened in
        // this period. Using the latest transition (not the net first-to-last delta)
        // so a team that dipped and recovered within the period — e.g. Gold, down to
        // Silver, back to Gold — still counts, matching the up-arrow on its card.
        const leveledUpThisPeriod =
            currentLevel != null &&
            previousLevel != null &&
            currentLevel > previousLevel &&
            isWithinPeriod(levelSince, periodStart);
        const smName = a ? a.smName || a.detectedSm?.displayName || null : null;

        out.push({
            boardId,
            boardName: rows.length
                ? rows[rows.length - 1].board_name
                : a?.boardName || `Board ${boardId}`,
            sm: smName ? { name: smName, role: a?.role || 'scrum_master' } : null,
            agileCoach: a?.engagedBy ?? null,
            engagedAt: a?.engagedAt ?? null,
            supportModel: supportModelFor(currentLevel),
            coaching,
            currentLevel,
            firstLevel,
            levelSeries: levelPoints,
            metricTrends: { hitRate, rollover, rework, readiness },
            latestMetrics: lastMd ? metricsOf(lastMd) : null,
            behavioral,
            experiments: experimentsCount,
            workingOn,
            focus: focusAreas(lastMd),
            graduationReady: graduationReady(currentLevel, behavioral.pct),
            coachingCase: a?.coachingCase ?? null,
            levelSince,
            previousLevel,
            status,
            graduatedAt: gradAt,
            graduatedThisPeriod: isWithinPeriod(gradAt, periodStart),
            levelDeltaInPeriod,
            leveledUpThisPeriod,
            recentSprints,
            analysisSprintCount: lastMd?.sprintMetrics?.length ?? 0,
        });
    }
    return out;
};

export const summarize = (boards: BoardSummaryInput[]): Summary => {
    const s: Summary = {
        inCoaching: 0,
        atRisk: 0,
        onDemand: 0,
        graduatedThisPeriod: 0,
        bands: { silver: 0, gold: 0, platinum: 0 },
        leveledUp: 0,
    };
    for (const b of boards) {
        if (b.status === null) continue; // hidden — not in program
        // Count ALL coached teams regardless of engagement status — an at_risk team
        // that is actively coached must appear in "Coaching", not just "Needs attention".
        if (b.coaching) s.inCoaching += 1;
        if (b.status === 'at_risk') s.atRisk += 1;
        else if (b.status === 'on_demand') s.onDemand += 1;
        if (b.graduatedThisPeriod) s.graduatedThisPeriod += 1;
        if (b.currentLevel === 1) s.bands.silver += 1;
        else if (b.currentLevel === 2) s.bands.gold += 1;
        else if (b.currentLevel === 3) s.bands.platinum += 1;
        if (b.leveledUpThisPeriod) s.leveledUp += 1;
    }
    return s;
};
