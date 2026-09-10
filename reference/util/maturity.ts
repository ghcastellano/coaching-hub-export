// Maturity Level logic — the SINGLE source of truth, shared across server
// (MetricsService), the Dashboard badges (overall + sprint-by-sprint) and the
// Coaching Hub. Every surface classifies a team through determineMaturityLevel
// so the level, the variables and the numbers can never drift apart.
//
// Model: 4-variable "weakest-link". A team is only as mature as its weakest
// pillar signal — Sprint Hit Rate & Rollover (Commitment Reliability),
// QA Rework (Flow & Quality) and Backlog Readiness (Team Ownership).
//   • Silver   if ANY provided metric sits in the Silver band
//   • Platinum if ALL provided metrics sit in the Platinum band
//   • Gold     otherwise
// Metrics are optional so a caller can classify on whatever it has: the overall
// (6-sprint) badge passes all four; the sprint-by-sprint badge omits readiness
// (a current-backlog snapshot that cannot be reconstructed per past sprint).

export interface MaturityInput {
    rolloverRatePct: number;
    backlogReadinessPct?: number;
    sprintHitRatePct?: number;
    qaReworkRatePct?: number;
}

// The ONE place the band boundaries live. Mirrors the Maturity Levels Reference
// panel. Any surface that needs a threshold must read it from here.
export const MATURITY_THRESHOLDS = {
    hitRate: { platinumMin: 90, silverBelow: 80 }, // Platinum ≥90, Silver <80
    rollover: { platinumBelow: 15, silverAbove: 25 }, // Platinum <15, Silver >25
    rework: { platinumBelow: 7, silverAbove: 15 }, // Platinum <7, Silver >15
    readiness: { platinumAbove: 75, silverBelow: 25 }, // Platinum >75, Silver <25
} as const;

const T = MATURITY_THRESHOLDS;

// Per-metric tier: 3 = Platinum band, 2 = Gold band, 1 = Silver band.
export const tierHitRate = (v: number): 1 | 2 | 3 =>
    v >= T.hitRate.platinumMin ? 3 : v < T.hitRate.silverBelow ? 1 : 2;
export const tierRollover = (v: number): 1 | 2 | 3 =>
    v < T.rollover.platinumBelow ? 3 : v > T.rollover.silverAbove ? 1 : 2;
export const tierRework = (v: number): 1 | 2 | 3 =>
    v < T.rework.platinumBelow ? 3 : v > T.rework.silverAbove ? 1 : 2;
export const tierReadiness = (v: number): 1 | 2 | 3 =>
    v > T.readiness.platinumAbove ? 3 : v < T.readiness.silverBelow ? 1 : 2;

export type MetricKey = 'hitRate' | 'rollover' | 'rework' | 'readiness';

// Tier for any of the 4 metrics by key — one entry point for callers.
export const metricTier = (key: MetricKey, v: number): 1 | 2 | 3 =>
    key === 'hitRate'
        ? tierHitRate(v)
        : key === 'rollover'
          ? tierRollover(v)
          : key === 'rework'
            ? tierRework(v)
            : tierReadiness(v);

// Canonical tier → text color (metallic), shared by the dashboard KPI numbers and
// the coaching app so a metric value is colored IDENTICALLY everywhere. Mirrors
// MaturityBadge / MaturityLevelsReference.
export const tierTextClass = (tier: 1 | 2 | 3): string =>
    tier === 3 ? 'text-[#0891B2]' : tier === 2 ? 'text-[#7A6214]' : 'text-[#475569]';

// Metric values render with ONE decimal, matching the dashboard KPI cards
// (e.g. 80.7%, not 80%).
export const formatPct = (v: number | null | undefined): string =>
    v == null ? '—' : `${v.toFixed(1)}%`;

// ── Data-driven coaching focus (SINGLE source — dashboard + Coaching Hub) ────
// Derives 1–2 focus areas from the team's actual metrics, mapped to the canonical
// pillars. Replaces the old static per-level recommendation lists so the dashboard
// and the hub always suggest the same thing for the same numbers.
export type Pillar = 'commitment' | 'flow' | 'ownership';
export interface CoachingFocus {
    pillar: Pillar;
    text: string;
}

// The threshold a metric must reach to move the team to the NEXT level. Silver
// teams aim for Gold (not Platinum); Gold teams aim for Platinum; Platinum holds.
// Returns null at Platinum (nothing higher to target).
export const nextLevelTarget = (
    key: MetricKey,
    currentLevel: 1 | 2 | 3
): { levelName: string; text: string } | null => {
    if (currentLevel === 3) return null;
    if (currentLevel === 1) {
        // Reach the Gold band (out of Silver).
        const text =
            key === 'hitRate'
                ? `≥${T.hitRate.silverBelow}%`
                : key === 'rollover'
                  ? `≤${T.rollover.silverAbove}%`
                  : key === 'rework'
                    ? `≤${T.rework.silverAbove}%`
                    : `≥${T.readiness.silverBelow}%`;
        return { levelName: 'Gold', text };
    }
    // Gold → Platinum band.
    const text =
        key === 'hitRate'
            ? `≥${T.hitRate.platinumMin}%`
            : key === 'rollover'
              ? `<${T.rollover.platinumBelow}%`
              : key === 'rework'
                ? `<${T.rework.platinumBelow}%`
                : `>${T.readiness.platinumAbove}%`;
    return { levelName: 'Platinum', text };
};

export const coachingFocus = (m: {
    hitRate: number;
    rollover: number;
    readiness: number;
    avgRework: number;
}): CoachingFocus[] => {
    const out: CoachingFocus[] = [];
    if (m.rollover > 20 || m.hitRate < 80)
        out.push({
            pillar: 'commitment',
            text: 'Tighten planning to cut rollover and lift hit rate (plan to recent velocity).',
        });
    if (m.avgRework > 10)
        out.push({
            pillar: 'flow',
            text: 'Reduce QA rework: clearer AC and an integrated Dev+QA DoD.',
        });
    if (m.readiness < 50)
        out.push({
            pillar: 'ownership',
            text: 'Raise backlog readiness: AC + estimates before work starts.',
        });
    if (out.length === 0)
        out.push({
            pillar: 'ownership',
            text: 'Metrics healthy — shift to ownership: rotate facilitation, move to pull-based work.',
        });
    return out.slice(0, 2);
};

export interface MaturityThresholds {
    rolloverMax: number;
    rolloverLabel: string;
    backlogReadyMin: number;
    backlogReadyLabel: string;
    nextLevel: 2 | 3;
}

export interface MaturityLevel {
    level: 1 | 2 | 3;
    name: string;
    description: string;
    characteristics: string[];
    blockers: string[];
    supportModel?: string;
    recommendations: string[];
    nextLevelThresholds: MaturityThresholds | null;
}

const thresholdsForLevel = (level: 1 | 2 | 3): MaturityThresholds | null => {
    if (level === 1)
        return {
            rolloverMax: 25,
            rolloverLabel: '≤25%',
            backlogReadyMin: 25,
            backlogReadyLabel: '≥25%',
            nextLevel: 2,
        };
    if (level === 2)
        return {
            rolloverMax: 15,
            rolloverLabel: '<15%',
            backlogReadyMin: 75,
            backlogReadyLabel: '>75%',
            nextLevel: 3,
        };
    return null;
};

const RECOMMENDATIONS: Record<1 | 2 | 3, string[]> = {
    1: [
        'Establish basic operating cadence',
        'Improve backlog readiness and capacity planning',
        'Reduce scope churn',
        'Coach ownership behaviors',
        'Introduce visible metrics and patterns',
    ],
    2: [
        'Pattern recognition (last-minute rush, WIP aging)',
        'Coaching Product on backlog ownership',
        'Enabling team-led ceremonies',
        'Driving retro action execution',
    ],
    3: [
        'On-demand coaching',
        'Quarterly health check',
        'Stakeholder/product check in',
        'Pattern escalation if regression occurs',
        'Share best practices with other teams',
    ],
};

export const determineMaturityLevel = ({
    rolloverRatePct,
    backlogReadinessPct,
    sprintHitRatePct,
    qaReworkRatePct,
}: MaturityInput): MaturityLevel => {
    // Evaluate each provided metric into a tier; the level is the weakest link.
    const parts: { key: string; tier: 1 | 2 | 3 }[] = [
        { key: 'rollover', tier: tierRollover(rolloverRatePct) },
    ];
    if (sprintHitRatePct !== undefined)
        parts.push({ key: 'hitRate', tier: tierHitRate(sprintHitRatePct) });
    if (qaReworkRatePct !== undefined)
        parts.push({ key: 'rework', tier: tierRework(qaReworkRatePct) });
    if (backlogReadinessPct !== undefined)
        parts.push({ key: 'backlogReady', tier: tierReadiness(backlogReadinessPct) });

    const level = Math.min(...parts.map((p) => p.tier)) as 1 | 2 | 3;

    const fmt = (v: number | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);
    const characteristics: string[] = [
        `Rollover: ${fmt(rolloverRatePct)} (Platinum <15% · Silver >25%)`,
    ];
    if (sprintHitRatePct !== undefined)
        characteristics.push(`Hit Rate: ${fmt(sprintHitRatePct)} (Platinum ≥90% · Silver <80%)`);
    if (qaReworkRatePct !== undefined)
        characteristics.push(`QA Rework: ${fmt(qaReworkRatePct)} (Platinum <7% · Silver >15%)`);
    if (backlogReadinessPct !== undefined)
        characteristics.push(
            `Backlog Ready: ${fmt(backlogReadinessPct)} (Platinum >75% · Silver <25%)`
        );

    if (level === 1) {
        // Silver — any metric in the Silver band is a blocker out of Level 1.
        const blockers = parts.filter((p) => p.tier === 1).map((p) => p.key);
        return {
            level: 1,
            name: 'Silver',
            description: 'Scrum Manager Required',
            characteristics,
            blockers,
            recommendations: RECOMMENDATIONS[1],
            nextLevelThresholds: thresholdsForLevel(1),
        };
    }

    if (level === 3) {
        return {
            level: 3,
            name: 'Platinum',
            description: 'Scrum Manager Optional',
            characteristics,
            blockers: [],
            recommendations: RECOMMENDATIONS[3],
            nextLevelThresholds: null,
        };
    }

    // Gold — metrics not yet in the Platinum band are what block the jump up.
    const blockers = parts.filter((p) => p.tier < 3).map((p) => p.key);
    return {
        level: 2,
        name: 'Gold',
        description: 'Conditional Support',
        characteristics,
        blockers,
        supportModel: 'Shared Scrum Manager, time-bound engagement (1–2 sprints/month)',
        recommendations: RECOMMENDATIONS[2],
        nextLevelThresholds: thresholdsForLevel(2),
    };
};
