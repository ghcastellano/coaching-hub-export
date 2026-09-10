import {
    determineMaturityLevel,
    MaturityLevel,
    tierHitRate,
    tierRollover,
    tierRework,
    tierReadiness,
    metricTier,
    tierTextClass,
    formatPct,
    coachingFocus,
    nextLevelTarget,
} from './maturity';

const lvl = (rolloverRatePct: number, backlogReadinessPct: number): MaturityLevel =>
    determineMaturityLevel({ rolloverRatePct, backlogReadinessPct });

describe('determineMaturityLevel', () => {
    describe('Level 1 (Silver) — rollover > 25% OR backlogReadiness < 25%', () => {
        it.each([
            ['high rollover only', 30, 80],
            ['low readiness only', 10, 20],
            ['both bad', 100, 0],
            ['rollover just over the line', 25.1, 100],
            ['readiness just under the line', 0, 24.9],
        ])('%s → level 1', (_label, rollover, ready) => {
            expect(lvl(rollover, ready).level).toBe(1);
        });

        it('reports the offending blockers', () => {
            expect(lvl(30, 80).blockers).toEqual(['rollover']);
            expect(lvl(10, 20).blockers).toEqual(['backlogReady']);
            expect(lvl(100, 0).blockers).toEqual(['rollover', 'backlogReady']);
        });

        it('carries Silver naming + next-level thresholds toward level 2', () => {
            const r = lvl(40, 10);
            expect(r.name).toBe('Silver');
            expect(r.description).toBe('Scrum Manager Required');
            expect(r.nextLevelThresholds).toMatchObject({
                nextLevel: 2,
                rolloverMax: 25,
                backlogReadyMin: 25,
            });
        });
    });

    describe('Level 3 (Platinum) — rollover < 15% AND backlogReadiness > 75%', () => {
        it.each([
            ['clearly excellent', 5, 95],
            ['rollover just under 15', 14.9, 75.1],
            ['boundary excellent', 0, 100],
        ])('%s → level 3', (_label, rollover, ready) => {
            expect(lvl(rollover, ready).level).toBe(3);
        });

        it('has no blockers and no next level', () => {
            const r = lvl(5, 95);
            expect(r.name).toBe('Platinum');
            expect(r.blockers).toEqual([]);
            expect(r.nextLevelThresholds).toBeNull();
        });
    });

    describe('Level 2 (Gold) — everything in between', () => {
        it.each([
            ['exact lower boundary 25/25', 25, 25],
            ['rollover exactly 15 (not <15)', 15, 80],
            ['readiness exactly 75 (not >75)', 10, 75],
            ['mid band', 20, 50],
        ])('%s → level 2', (_label, rollover, ready) => {
            expect(lvl(rollover, ready).level).toBe(2);
        });

        it('flags blockers blocking the jump to level 3 and exposes a support model', () => {
            const r = lvl(20, 50);
            expect(r.name).toBe('Gold');
            expect(r.blockers).toEqual(['rollover', 'backlogReady']);
            expect(r.supportModel).toMatch(/Shared Scrum Manager/);
            expect(r.nextLevelThresholds).toMatchObject({
                nextLevel: 3,
                rolloverMax: 15,
                backlogReadyMin: 75,
            });
        });

        it('a team at 14% rollover but only 75% readiness is held at level 2 (readiness blocker only)', () => {
            const r = lvl(14, 75);
            expect(r.level).toBe(2);
            expect(r.blockers).toEqual(['backlogReady']);
        });
    });

    // 4-variable weakest-link: hit rate and QA rework also gate the level.
    describe('4-variable model (hit rate + QA rework as weakest link)', () => {
        const lvl4 = (
            rolloverRatePct: number,
            backlogReadinessPct: number,
            sprintHitRatePct: number,
            qaReworkRatePct: number
        ): MaturityLevel =>
            determineMaturityLevel({
                rolloverRatePct,
                backlogReadinessPct,
                sprintHitRatePct,
                qaReworkRatePct,
            });

        it('rollover+readiness excellent but hit rate <80 → Silver (weakest link), hitRate blocker', () => {
            const r = lvl4(5, 95, 70, 2);
            expect(r.level).toBe(1);
            expect(r.blockers).toEqual(['hitRate']);
        });

        it('rollover+readiness excellent but QA rework >15 → Silver, rework blocker', () => {
            const r = lvl4(5, 95, 95, 20);
            expect(r.level).toBe(1);
            expect(r.blockers).toEqual(['rework']);
        });

        it('Platinum on rollover+readiness but rework in the Gold band → held at Gold', () => {
            const r = lvl4(5, 95, 95, 10);
            expect(r.level).toBe(2);
            expect(r.blockers).toEqual(['rework']);
        });

        it('all four in the Platinum band → Platinum', () => {
            expect(lvl4(10, 90, 95, 3).level).toBe(3);
        });

        it('all four in the Silver band → Silver with every metric a blocker', () => {
            const r = lvl4(40, 10, 60, 30);
            expect(r.level).toBe(1);
            expect(r.blockers).toEqual(['rollover', 'hitRate', 'rework', 'backlogReady']);
        });
    });
});

// These power BOTH the dashboard KPI numbers and the Coaching Hub, so a metric is
// classified + colored identically everywhere. Boundary-locked.
describe('per-metric tiers (shared with the dashboard + coaching)', () => {
    it('Hit Rate: Platinum ≥90, Silver <80', () => {
        expect(tierHitRate(90)).toBe(3);
        expect(tierHitRate(89.9)).toBe(2);
        expect(tierHitRate(80)).toBe(2);
        expect(tierHitRate(79.9)).toBe(1);
    });
    it('Rollover: Platinum <15, Silver >25', () => {
        expect(tierRollover(14.9)).toBe(3);
        expect(tierRollover(15)).toBe(2);
        expect(tierRollover(25)).toBe(2);
        expect(tierRollover(25.1)).toBe(1);
    });
    it('QA Rework: Platinum <7, Silver >15', () => {
        expect(tierRework(6.9)).toBe(3);
        expect(tierRework(7)).toBe(2);
        expect(tierRework(15)).toBe(2);
        expect(tierRework(15.1)).toBe(1);
    });
    it('Readiness: Platinum >75, Silver <25', () => {
        expect(tierReadiness(75.1)).toBe(3);
        expect(tierReadiness(75)).toBe(2);
        expect(tierReadiness(25)).toBe(2);
        expect(tierReadiness(24.9)).toBe(1);
    });
    it('metricTier dispatches by key', () => {
        expect(metricTier('hitRate', 95)).toBe(3);
        expect(metricTier('rollover', 30)).toBe(1);
        expect(metricTier('rework', 10)).toBe(2);
        expect(metricTier('readiness', 90)).toBe(3);
    });
});

describe('coachingFocus — data-driven, shared by dashboard + hub', () => {
    it('flags commitment when rollover high / hit low, max two areas', () => {
        const out = coachingFocus({ hitRate: 70, rollover: 30, readiness: 80, avgRework: 5 });
        expect(out.length).toBeLessThanOrEqual(2);
        expect(out[0].pillar).toBe('commitment');
    });
    it('flags flow on high QA rework and ownership on low readiness', () => {
        const out = coachingFocus({ hitRate: 95, rollover: 5, readiness: 20, avgRework: 18 });
        expect(out.map((f) => f.pillar)).toEqual(['flow', 'ownership']);
    });
    it('falls back to an ownership/maintenance focus when healthy', () => {
        const out = coachingFocus({ hitRate: 95, rollover: 5, readiness: 90, avgRework: 4 });
        expect(out).toHaveLength(1);
        expect(out[0].pillar).toBe('ownership');
    });
});

describe('nextLevelTarget — aims at the NEXT level, not always Platinum', () => {
    it('a Silver team targets the Gold bands', () => {
        expect(nextLevelTarget('hitRate', 1)).toEqual({ levelName: 'Gold', text: '≥80%' });
        expect(nextLevelTarget('rollover', 1)).toEqual({ levelName: 'Gold', text: '≤25%' });
        expect(nextLevelTarget('rework', 1)).toEqual({ levelName: 'Gold', text: '≤15%' });
        expect(nextLevelTarget('readiness', 1)).toEqual({ levelName: 'Gold', text: '≥25%' });
    });
    it('a Gold team targets the Platinum bands', () => {
        expect(nextLevelTarget('hitRate', 2)).toEqual({ levelName: 'Platinum', text: '≥90%' });
        expect(nextLevelTarget('rollover', 2)).toEqual({ levelName: 'Platinum', text: '<15%' });
        expect(nextLevelTarget('rework', 2)).toEqual({ levelName: 'Platinum', text: '<7%' });
        expect(nextLevelTarget('readiness', 2)).toEqual({ levelName: 'Platinum', text: '>75%' });
    });
    it('a Platinum team has nothing higher to target', () => {
        expect(nextLevelTarget('hitRate', 3)).toBeNull();
    });
});

describe('tierTextClass — canonical metallic colors', () => {
    it('maps each tier to the dashboard color', () => {
        expect(tierTextClass(3)).toBe('text-[#0891B2]'); // Platinum cyan
        expect(tierTextClass(2)).toBe('text-[#7A6214]'); // Gold
        expect(tierTextClass(1)).toBe('text-[#475569]'); // Silver slate
    });
});

describe('formatPct — one decimal, matching the dashboard KPI cards', () => {
    it('formats to 1 decimal', () => {
        expect(formatPct(80.7)).toBe('80.7%');
        expect(formatPct(80)).toBe('80.0%');
        expect(formatPct(14.84)).toBe('14.8%');
    });
    it('shows an em dash for null/undefined', () => {
        expect(formatPct(null)).toBe('—');
        expect(formatPct(undefined)).toBe('—');
    });
});

// Fidelity: a realistic dashboard-shaped metrics blob must produce, in the
// coaching layer, the same level + per-metric tiers the dashboard would show.
describe('dashboard ↔ coaching fidelity', () => {
    it('CES-like blob (Gold) is read identically', () => {
        const hit = 80.7;
        const rollover = 14.8;
        const rework = 9.1;
        const readiness = 83.3;
        // weakest-link level
        expect(
            determineMaturityLevel({
                rolloverRatePct: rollover,
                backlogReadinessPct: readiness,
                sprintHitRatePct: hit,
                qaReworkRatePct: rework,
            }).level
        ).toBe(2); // Gold (hit + rework are tier 2)
        // per-metric tiers (what colors each number on both surfaces)
        expect(metricTier('hitRate', hit)).toBe(2); // gold
        expect(metricTier('rollover', rollover)).toBe(3); // cyan
        expect(metricTier('rework', rework)).toBe(2); // gold
        expect(metricTier('readiness', readiness)).toBe(3); // cyan
    });
});
