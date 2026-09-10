import {
    metricsOf,
    quantLevel,
    levelNameToNumber,
    behavioralReadiness,
    graduationReady,
    focusAreas,
    supportModelFor,
    recentMax,
    isInProgram,
    classifyEngagement,
    graduatedAt,
    isWithinPeriod,
    summarize,
    buildPortfolio,
    SIGNAL_KEYS,
    REGRESSION_WINDOW,
    type Level,
    type LevelPoint,
    type MetricsData,
    type HistoryRowInput,
    type AssignmentInput,
} from './portfolio';

// Metrics blobs at the band extremes, so quantLevel is deterministic.
const platinumMetrics: MetricsData = {
    aggregated: { avgSprintHitRate: 95, avgRolloverRate: 5 },
    backlogHealth: { overallScore: 90 },
    flowQuality: { reworkBySprint: [{ reworkRate: 3 }] },
};
const silverMetrics: MetricsData = {
    aggregated: { avgSprintHitRate: 70, avgRolloverRate: 35 },
    backlogHealth: { overallScore: 10 },
    flowQuality: { reworkBySprint: [{ reworkRate: 25 }] },
};
const goldMetrics: MetricsData = {
    aggregated: { avgSprintHitRate: 85, avgRolloverRate: 18 },
    backlogHealth: { overallScore: 50 },
    flowQuality: { reworkBySprint: [{ reworkRate: 10 }] },
};

describe('metricsOf', () => {
    it('extracts the four variables, preferring points-based hit rate', () => {
        const m = metricsOf({
            aggregated: { avgSprintHitRatePoints: 88, avgSprintHitRate: 80, avgRolloverRate: 12 },
            backlogHealth: { overallScore: 60 },
            flowQuality: { reworkBySprint: [{ reworkRate: 4 }, { reworkRate: 8 }] },
        });
        expect(m.hitRate).toBe(88);
        expect(m.rollover).toBe(12);
        expect(m.readiness).toBe(60);
        expect(m.avgRework).toBe(6); // (4 + 8) / 2
    });

    it('defaults missing fields to 0 and handles an empty rework array', () => {
        expect(metricsOf(null)).toEqual({ hitRate: 0, rollover: 0, readiness: 0, avgRework: 0 });
        expect(metricsOf({ flowQuality: { reworkBySprint: [] } }).avgRework).toBe(0);
    });
});

describe('quantLevel', () => {
    it('classifies the band extremes', () => {
        expect(quantLevel(platinumMetrics)).toBe(3);
        expect(quantLevel(goldMetrics)).toBe(2);
        expect(quantLevel(silverMetrics)).toBe(1);
    });
    it('is null with no metrics', () => {
        expect(quantLevel(null)).toBeNull();
        expect(quantLevel(undefined)).toBeNull();
    });
    it('is weakest-link: one Silver variable pulls the level to Silver', () => {
        expect(quantLevel({ ...platinumMetrics, backlogHealth: { overallScore: 10 } })).toBe(1);
    });
});

describe('levelNameToNumber', () => {
    it('maps band names and "Level N" strings', () => {
        expect(levelNameToNumber('Silver')).toBe(1);
        expect(levelNameToNumber('gold')).toBe(2);
        expect(levelNameToNumber('Platinum')).toBe(3);
        expect(levelNameToNumber('Level 2')).toBe(2);
    });
    it('tolerates null / unknown', () => {
        expect(levelNameToNumber(null)).toBeNull();
        expect(levelNameToNumber('')).toBeNull();
        expect(levelNameToNumber('???')).toBeNull();
    });
});

describe('behavioralReadiness', () => {
    it('is not_assessed when nothing is rated', () => {
        expect(behavioralReadiness({})).toEqual({
            pct: null,
            label: 'not_assessed',
            rated: 0,
            total: SIGNAL_KEYS.length,
        });
        expect(behavioralReadiness({ scope_churn: 'unknown' }).label).toBe('not_assessed');
    });

    it('reaches 100% / ready only when every signal is Consistent', () => {
        const all: Record<string, string> = {};
        SIGNAL_KEYS.forEach((k) => (all[k] = 'consistent'));
        expect(behavioralReadiness(all)).toEqual({
            pct: 100,
            label: 'ready',
            rated: SIGNAL_KEYS.length,
            total: SIGNAL_KEYS.length,
        });
    });

    it('counts unrated signals as 0 (partial assessment scores low)', () => {
        // 1 of 9 consistent → 2 / 18 ≈ 11%
        const r = behavioralReadiness({ scope_churn: 'consistent' });
        expect(r.pct).toBe(11);
        expect(r.label).toBe('forming');
        expect(r.rated).toBe(1);
    });

    it('labels developing in the mid band', () => {
        // 5 of 9 consistent → 10 / 18 ≈ 56%
        const sig: Record<string, string> = {};
        SIGNAL_KEYS.slice(0, 5).forEach((k) => (sig[k] = 'consistent'));
        const r = behavioralReadiness(sig);
        expect(r.pct).toBe(56);
        expect(r.label).toBe('developing');
    });
});

describe('graduationReady', () => {
    it('needs strong behavior AND objective Gold+', () => {
        expect(graduationReady(2, 80)).toBe(true);
        expect(graduationReady(3, 75)).toBe(true);
        expect(graduationReady(1, 90)).toBe(false); // level too low
        expect(graduationReady(2, 70)).toBe(false); // behavior too weak
    });
    it('is null when behavior not assessed or level unknown', () => {
        expect(graduationReady(2, null)).toBeNull();
        expect(graduationReady(null, 80)).toBeNull();
    });
});

describe('focusAreas', () => {
    it('flags commitment + ownership for a weak team, max two', () => {
        const out = focusAreas(silverMetrics);
        expect(out.length).toBe(2);
        expect(out.map((f) => f.pillar)).toContain('commitment');
    });
    it('falls back to an ownership message when metrics are healthy', () => {
        const out = focusAreas(platinumMetrics);
        expect(out).toHaveLength(1);
        expect(out[0].pillar).toBe('ownership');
        expect(out[0].text).toMatch(/ownership/i);
    });
    it('returns nothing without metrics', () => {
        expect(focusAreas(null)).toEqual([]);
    });
});

describe('supportModelFor', () => {
    it('derives the SM↔team support model from level (canonical docs)', () => {
        expect(supportModelFor(1)).toBe('bi_weekly');
        expect(supportModelFor(2)).toBe('monthly');
        expect(supportModelFor(3)).toBe('quarterly');
        expect(supportModelFor(null)).toBe('none');
    });
});

describe('recentMax', () => {
    it('looks only at the trailing window', () => {
        const series: Level[] = [3, 3, 1, 1, 1, 2]; // last 4 = [1,1,1,2]
        expect(recentMax(series, REGRESSION_WINDOW)).toBe(2);
    });
    it('is null for an empty series', () => {
        expect(recentMax([])).toBeNull();
    });
});

describe('isInProgram', () => {
    it('includes actively coached boards', () => {
        expect(isInProgram({ coaching: true, currentLevel: 1, levelSeries: [1] })).toBe(true);
    });
    it('includes boards that ever reached Platinum', () => {
        expect(isInProgram({ coaching: false, currentLevel: 2, levelSeries: [3, 2] })).toBe(true);
    });
    it('hides analyzed-but-uncoached, never-Platinum boards', () => {
        expect(isInProgram({ coaching: false, currentLevel: 2, levelSeries: [1, 2] })).toBe(false);
    });
});

describe('classifyEngagement', () => {
    it('hides boards not in the program', () => {
        expect(
            classifyEngagement({ coaching: false, currentLevel: 1, levelSeries: [1, 1] })
        ).toBeNull();
    });

    it('flags at risk when current level dropped below a recently held level', () => {
        expect(
            classifyEngagement({ coaching: true, currentLevel: 1, levelSeries: [2, 2, 1] })
        ).toBe('at_risk');
        // regressed Platinum, not coached, still surfaces as at risk (early warning)
        expect(
            classifyEngagement({ coaching: false, currentLevel: 2, levelSeries: [3, 3, 2] })
        ).toBe('at_risk');
    });

    it('marks self-managed Platinum (not coached) as on-demand', () => {
        expect(
            classifyEngagement({ coaching: false, currentLevel: 3, levelSeries: [3, 3, 3] })
        ).toBe('on_demand');
    });

    it('keeps actively coached teams in coaching (incl. Platinum under support)', () => {
        expect(classifyEngagement({ coaching: true, currentLevel: 2, levelSeries: [1, 2] })).toBe(
            'in_coaching'
        );
        expect(classifyEngagement({ coaching: true, currentLevel: 3, levelSeries: [3, 3] })).toBe(
            'in_coaching'
        );
    });

    it('does not flag at risk on a single data point', () => {
        expect(classifyEngagement({ coaching: true, currentLevel: 1, levelSeries: [1] })).toBe(
            'in_coaching'
        );
    });

    it('does not regress on an OLD Platinum outside the window', () => {
        // [3] then four recent analyses at 2 → recentMax over last 4 is 2, current 2 → not at risk
        const status = classifyEngagement({
            coaching: false,
            currentLevel: 2,
            levelSeries: [3, 2, 2, 2, 2],
        });
        expect(status).toBe('on_demand');
    });
});

describe('graduatedAt', () => {
    it('returns the entry timestamp of a held Platinum run', () => {
        const series: LevelPoint[] = [
            { at: '2026-01-01T00:00:00Z', level: 1 },
            { at: '2026-02-01T00:00:00Z', level: 2 },
            { at: '2026-03-01T00:00:00Z', level: 3 },
            { at: '2026-04-01T00:00:00Z', level: 3 },
        ];
        expect(graduatedAt(series)).toBe('2026-03-01T00:00:00Z');
    });
    it('treats a single Platinum analysis as graduated', () => {
        expect(graduatedAt([{ at: '2026-05-01T00:00:00Z', level: 3 }])).toBe(
            '2026-05-01T00:00:00Z'
        );
    });
    it('is null when Platinum was not held (single trailing 3 after lower)', () => {
        const series: LevelPoint[] = [
            { at: '2026-03-01T00:00:00Z', level: 2 },
            { at: '2026-04-01T00:00:00Z', level: 3 },
        ];
        expect(graduatedAt(series)).toBeNull();
    });
    it('is null when not currently Platinum, or empty', () => {
        expect(graduatedAt([{ at: '2026-04-01T00:00:00Z', level: 2 }])).toBeNull();
        expect(graduatedAt([])).toBeNull();
    });
});

describe('isWithinPeriod', () => {
    it('compares ISO timestamps against the period start', () => {
        expect(isWithinPeriod('2026-05-01T00:00:00Z', '2026-03-01T00:00:00Z')).toBe(true);
        expect(isWithinPeriod('2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z')).toBe(false);
        expect(isWithinPeriod(null, '2026-03-01T00:00:00Z')).toBe(false);
    });
});

describe('buildPortfolio', () => {
    const periodStart = '2026-01-01T00:00:00Z';
    const hist = (
        board_id: number,
        board_name: string,
        points: Array<{ at: string; m: MetricsData; level?: string }>
    ): HistoryRowInput[] =>
        points.map((p) => ({
            board_id,
            board_name,
            calculated_at: p.at,
            maturity_level: p.level ?? null,
            metrics_data: p.m,
        }));
    const assign = (over: Partial<AssignmentInput> & { boardId: number }): AssignmentInput => ({
        boardName: null,
        smName: null,
        role: 'scrum_master',
        coaching: false,
        engagedBy: null,
        engagedAt: null,
        ...over,
    });

    it('builds a coached board: trends, engagement chain, status, focus', () => {
        const history = hist(1, 'CES', [
            { at: '2026-02-01T00:00:00Z', m: silverMetrics },
            { at: '2026-03-01T00:00:00Z', m: goldMetrics },
        ]);
        const boards = buildPortfolio({
            history,
            assignments: [
                assign({
                    boardId: 1,
                    smName: 'Gabriel',
                    coaching: true,
                    engagedBy: 'coach@indeed.com',
                    engagedAt: '2026-02-01T00:00:00Z',
                }),
            ],
            assessments: [{ boardId: 1, signals: { scope_churn: 'consistent' } }],
            experiments: [
                { boardId: 1, status: 'active', pillar: 'commitment' },
                { boardId: 1, status: 'done', pillar: 'flow' },
            ],
            periodStart,
        });
        expect(boards).toHaveLength(1);
        const b = boards[0];
        expect(b.boardName).toBe('CES');
        expect(b.sm).toEqual({ name: 'Gabriel', role: 'scrum_master' });
        expect(b.agileCoach).toBe('coach@indeed.com');
        expect(b.engagedAt).toBe('2026-02-01T00:00:00Z');
        expect(b.status).toBe('in_coaching');
        expect(b.currentLevel).toBe(2);
        expect(b.firstLevel).toBe(1);
        expect(b.supportModel).toBe('monthly');
        expect(b.metricTrends.hitRate).toHaveLength(2);
        expect(b.metricTrends.hitRate[1].value).toBe(85);
        expect(b.experiments).toEqual({ active: 1, done: 1, dropped: 0 });
        expect(b.levelDeltaInPeriod).toBe(1); // 2 − 1 within period
        expect(b.leveledUpThisPeriod).toBe(true); // latest move was up, within the period
        expect(b.focus.length).toBeGreaterThan(0);
        expect(b.behavioral.rated).toBe(1);
    });

    it('keeps out-of-program boards with status null (for the Edit roster)', () => {
        const history = hist(2, 'Other', [{ at: '2026-03-01T00:00:00Z', m: goldMetrics }]);
        const boards = buildPortfolio({
            history,
            assignments: [assign({ boardId: 2, coaching: false })],
            assessments: [],
            experiments: [],
            periodStart,
        });
        expect(boards).toHaveLength(1);
        expect(boards[0].status).toBeNull();
        expect(boards[0].currentLevel).toBe(2);
    });

    it('flags a regressed Platinum (not coached) as at risk and marks graduation', () => {
        const history = hist(3, 'Reg', [
            { at: '2026-02-01T00:00:00Z', m: platinumMetrics },
            { at: '2026-03-01T00:00:00Z', m: platinumMetrics },
            { at: '2026-04-01T00:00:00Z', m: silverMetrics },
        ]);
        const boards = buildPortfolio({
            history,
            assignments: [assign({ boardId: 3, coaching: false })],
            assessments: [],
            experiments: [],
            periodStart,
        });
        expect(boards).toHaveLength(1);
        expect(boards[0].status).toBe('at_risk');
        expect(boards[0].currentLevel).toBe(1);
    });

    it('includes a coached board with no persisted analyses', () => {
        const boards = buildPortfolio({
            history: [],
            assignments: [assign({ boardId: 4, boardName: 'New', coaching: true, smName: 'Ana' })],
            assessments: [],
            experiments: [],
            periodStart,
        });
        expect(boards).toHaveLength(1);
        expect(boards[0].boardName).toBe('New');
        expect(boards[0].currentLevel).toBeNull();
        expect(boards[0].status).toBe('in_coaching');
        expect(boards[0].metricTrends.hitRate).toHaveLength(0);
    });

    it('falls back to the detected SM name when none confirmed', () => {
        const history = hist(5, 'Det', [{ at: '2026-03-01T00:00:00Z', m: goldMetrics }]);
        const boards = buildPortfolio({
            history,
            assignments: [
                assign({ boardId: 5, coaching: true, detectedSm: { displayName: 'Victor' } }),
            ],
            assessments: [],
            experiments: [],
            periodStart,
        });
        expect(boards[0].sm).toEqual({ name: 'Victor', role: 'scrum_master' });
    });
});

describe('summarize', () => {
    it('counts statuses, bands, graduations and net movement; ignores hidden', () => {
        const s = summarize([
            {
                status: 'in_coaching',
                coaching: true,
                currentLevel: 1,
                graduatedThisPeriod: false,
                levelDeltaInPeriod: 1,
                leveledUpThisPeriod: true,
            },
            {
                status: 'in_coaching',
                coaching: true,
                currentLevel: 2,
                graduatedThisPeriod: false,
                levelDeltaInPeriod: 0,
                leveledUpThisPeriod: false,
            },
            {
                // at_risk but also coaching — must be counted in inCoaching too
                status: 'at_risk',
                coaching: true,
                currentLevel: 2,
                graduatedThisPeriod: false,
                levelDeltaInPeriod: -1,
                leveledUpThisPeriod: false,
            },
            {
                status: 'on_demand',
                coaching: false,
                currentLevel: 3,
                graduatedThisPeriod: true,
                levelDeltaInPeriod: 1,
                leveledUpThisPeriod: true,
            },
            {
                status: null,
                coaching: false,
                currentLevel: 1,
                graduatedThisPeriod: false,
                levelDeltaInPeriod: 5,
                leveledUpThisPeriod: true,
            }, // hidden
        ]);
        expect(s.inCoaching).toBe(3); // 2 in_coaching + 1 at_risk with coaching=true
        expect(s.atRisk).toBe(1);
        expect(s.onDemand).toBe(1);
        expect(s.graduatedThisPeriod).toBe(1);
        expect(s.bands).toEqual({ silver: 1, gold: 2, platinum: 1 });
        expect(s.leveledUp).toBe(2); // two visible boards leveled up this period (hidden one excluded)
    });
});

describe('buildPortfolio — workingOn, level tenure, and rework fidelity', () => {
    const md = (hit: number, roll: number, ready: number, rework: number) => ({
        aggregated: { avgSprintHitRate: hit, avgRolloverRate: roll },
        backlogHealth: { overallScore: ready },
        flowQuality: { reworkBySprint: [{ reworkRate: rework }] },
    });

    it('reads active-experiment pillars, level tenure, and the avgRework value', () => {
        const boards = buildPortfolio({
            history: [
                {
                    board_id: 1,
                    board_name: 'T',
                    calculated_at: '2026-02-01T00:00:00Z',
                    maturity_level: null,
                    metrics_data: md(70, 35, 10, 25), // Silver
                },
                {
                    board_id: 1,
                    board_name: 'T',
                    calculated_at: '2026-03-01T00:00:00Z',
                    maturity_level: null,
                    metrics_data: md(85, 18, 50, 9.1), // Gold
                },
            ],
            assignments: [
                {
                    boardId: 1,
                    boardName: 'T',
                    smName: 'Ana',
                    role: 'scrum_master',
                    coaching: true,
                    engagedBy: 'Coach',
                    engagedAt: '2026-02-01T00:00:00Z',
                },
            ],
            assessments: [],
            experiments: [
                { boardId: 1, status: 'active', pillar: 'flow' },
                { boardId: 1, status: 'active', pillar: 'flow' }, // duplicate pillar → deduped
                { boardId: 1, status: 'done', pillar: 'commitment' },
            ],
            periodStart: '2026-01-01T00:00:00Z',
        });
        const b = boards[0];
        expect(b.currentLevel).toBe(2);
        expect(b.previousLevel).toBe(1); // came up from Silver
        expect(b.levelSince).toBe('2026-03-01T00:00:00Z');
        expect(b.workingOn).toEqual(['flow']); // distinct ACTIVE pillars only
        expect(b.experiments).toEqual({ active: 2, done: 1, dropped: 0 });
        // The QA Rework value the team page renders (avgRework key) — matches the model.
        expect(b.latestMetrics?.avgRework).toBeCloseTo(9.1);
    });
});
