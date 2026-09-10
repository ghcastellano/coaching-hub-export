// @ts-nocheck
// Shared display maps + small presentational widgets for the Coaching Hub index
// and the team detail page. English-only copy (no i18n).
import React from 'react';
import {
    LEVEL_NAMES,
    LEVEL_CHIP_CLASS,
    STATUS_META,
    READINESS_META,
    RUBRIC,
    RUBRIC_CYCLE,
    tierPanelClass,
} from '../shared/designTokens';

// Color/status tokens live in shared/designTokens.ts (single source with the
// dashboard); re-exported here so existing coaching imports keep working.
export { STATUS_META, READINESS_META, RUBRIC, RUBRIC_CYCLE };

export const STATUS_ORDER = ['at_risk', 'in_coaching', 'on_demand'];

export const SUPPORT_LABEL = {
    bi_weekly: 'Bi-weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    none: '—',
};

export const LEVEL_META = {
    1: { name: LEVEL_NAMES[1], chip: LEVEL_CHIP_CLASS[1] },
    2: { name: LEVEL_NAMES[2], chip: LEVEL_CHIP_CLASS[2] },
    3: { name: LEVEL_NAMES[3], chip: LEVEL_CHIP_CLASS[3] },
};

export const PILLARS = [
    {
        key: 'commitment',
        name: 'Commitment Reliability',
        signals: [
            { key: 'scope_churn', label: 'Scope churn under control' },
            { key: 'planning_realism', label: 'Realistic sprint commitments' },
        ],
    },
    {
        key: 'flow',
        name: 'Flow & Quality',
        signals: [
            { key: 'ceremonies_effective', label: 'Effective ceremonies' },
            { key: 'dod_discipline', label: "DoD discipline (clean 'Done')" },
        ],
    },
    {
        key: 'ownership',
        name: 'Team Ownership & Execution',
        signals: [
            { key: 'rotating_facilitation', label: 'Facilitation rotates across the team' },
            { key: 'pull_not_push', label: 'Work is pulled, not assigned' },
            { key: 'impediments_self', label: 'Impediments resolved by the team' },
            { key: 'psych_safety', label: 'Psychological safety' },
            { key: 'team_stability', label: 'Stable team membership' },
        ],
    },
];
export const PILLAR_LABEL = {
    commitment: 'Commitment Reliability',
    flow: 'Flow & Quality',
    ownership: 'Team Ownership',
};

export const EXPERIMENT_TEMPLATES = [
    {
        pillar: 'commitment',
        metric: 'Sprint Hit Rate / Rollover',
        behavior: 'Tighten scope at planning to "yesterday\'s weather"',
        hypothesis: 'Improve hit rate by committing to recent average velocity.',
    },
    {
        pillar: 'flow',
        metric: 'QA Rework',
        behavior: 'Integrate Dev+QA on the DoD; earlier test involvement',
        hypothesis: 'Reduce QA rework by tightening the DoD in one area.',
    },
    {
        pillar: 'ownership',
        metric: 'Ceremony ownership',
        behavior: 'Rotate facilitation across the team',
        hypothesis: 'Improve ownership by rotating who runs standup/retro.',
    },
    {
        pillar: 'ownership',
        metric: 'Backlog Readiness',
        behavior: 'AC + estimates before work starts',
        hypothesis: 'Raise readiness by refining items one sprint ahead.',
    },
];

export const fmtMonth = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;

// The journey's focus list reuses focusAreas, which expects a metrics_data blob;
// rebuild the minimal shape from the flattened latestMetrics.
export const toMetricsData = (m) =>
    m
        ? {
              aggregated: { avgSprintHitRate: m.hitRate, avgRolloverRate: m.rollover },
              backlogHealth: { overallScore: m.readiness },
              flowQuality: { reworkBySprint: [{ reworkRate: m.avgRework }] },
          }
        : null;

// ── Small shared widgets ──────────────────────────────────────────────────────

export const TIER_DESC = {
    1: 'Scrum Manager required',
    2: 'Conditional support',
    3: 'Graduation candidates',
};

// Compact tier distribution strip (Silver/Gold/Platinum counts) — the program's
// headline number, shared by the Portfolio hero card and the Leadership summary.
// One number per panel: the count; tier identity comes from panel color + name.
export function TierStrip({ boards }) {
    const byLevel = { 1: 0, 2: 0, 3: 0 };
    for (const b of boards || []) {
        if (byLevel[b.currentLevel] != null) byLevel[b.currentLevel] += 1;
    }
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((lvl) => {
                const p = tierPanelClass(lvl);
                return (
                    <div
                        key={lvl}
                        className={`flex items-center gap-3 border-2 ${p.border} rounded-lg p-3 ${p.bg}`}
                    >
                        <div className="min-w-0">
                            <div className={`font-bold ${p.title}`}>{LEVEL_NAMES[lvl]}</div>
                            <div className={`text-xs ${p.subtitle}`}>{TIER_DESC[lvl]}</div>
                        </div>
                        <div className={`ml-auto pl-3 text-3xl font-bold ${p.title}`}>
                            {byLevel[lvl]}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function Segmented({ value, onChange, options }) {
    return (
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
            {options.map((o, i) => {
                const active = o.key === value;
                return (
                    <button
                        key={o.key}
                        onClick={() => onChange(o.key)}
                        className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                            i > 0 ? 'border-l border-gray-300' : ''
                        } ${active ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

export function SavedTick({ flash, k }) {
    if (!flash || flash.key !== k) return null;
    return flash.ok ? (
        <span className="text-xs font-medium text-green-600">✓ saved</span>
    ) : (
        <span className="text-xs font-medium text-red-600">⚠ not saved</span>
    );
}

export function LevelChip({ level, previousLevel = null }) {
    if (!level) return <span className="text-xs text-gray-400">Not analyzed</span>;
    const m = LEVEL_META[level];
    const prev = previousLevel ? LEVEL_META[previousLevel] : null;
    const arrow =
        prev && level > previousLevel ? (
            <span className="ml-1 whitespace-nowrap text-green-600">↑ {prev.name}</span>
        ) : prev && level < previousLevel ? (
            <span className="ml-1 whitespace-nowrap text-amber-600">↓ {prev.name}</span>
        ) : null;
    return (
        <span
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.chip}`}
        >
            {m.name}
            {arrow}
        </span>
    );
}

export function TrendArrow({ first, current }) {
    if (first == null || current == null) return null;
    if (current > first)
        return (
            <span className="font-bold text-green-600" title="Improving">
                ↗
            </span>
        );
    if (current < first)
        return (
            <span className="font-bold text-red-600" title="Regressing">
                ↘
            </span>
        );
    return (
        <span className="font-bold text-gray-400" title="Stable">
            →
        </span>
    );
}

export function SignalSegments({ value, onSelect }) {
    return (
        <div className="inline-flex overflow-hidden rounded-md border border-gray-200">
            {RUBRIC_CYCLE.map((key, i) => {
                const cfg = RUBRIC[key];
                const active = key === value;
                return (
                    <button
                        key={key}
                        onClick={() => onSelect(key)}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                            i > 0 ? 'border-l border-gray-200' : ''
                        } ${active ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        style={active ? { backgroundColor: cfg.dot } : undefined}
                    >
                        {cfg.label}
                    </button>
                );
            })}
        </div>
    );
}
