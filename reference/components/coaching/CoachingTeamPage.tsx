// @ts-nocheck
import React from 'react';
import MetricTrendChart from './MetricTrendChart';
import SprintMaturityChart from './SprintMaturityChart';
import MaturityBadge from '../MaturityBadge';
import { behavioralReadiness } from './portfolio';
import { metricTier, tierTextClass, formatPct } from '../../util/maturity';
import {
    LEVEL_META,
    READINESS_META,
    PILLARS,
    PILLAR_LABEL,
    EXPERIMENT_TEMPLATES,
    RUBRIC,
    LevelChip,
    SavedTick,
    SignalSegments,
    fmtMonth,
} from './ui';

const METRICS = [
    { key: 'hitRate', latest: 'hitRate', label: 'Hit Rate' },
    { key: 'rollover', latest: 'rollover', label: 'Rollover' },
    { key: 'rework', latest: 'avgRework', label: 'QA Rework' },
    { key: 'readiness', latest: 'readiness', label: 'Readiness' },
];

// Canonical metrics per pillar (from the maturity docs). Picking the pillar filters
// the metric list to its metrics; "Other" covers behavioral/non-metric experiments.
const METRICS_BY_PILLAR = {
    commitment: ['Sprint Hit Rate', 'Rollover', 'Other'],
    flow: ['QA Rework', 'Cycle Time', 'Other'],
    ownership: ['Backlog Readiness', 'Strategic Alignment', 'Ceremony ownership', 'Other'],
};

// Direction between the last two analyses (each a 6-sprint rolling avg). Neutral
// gray arrow — direction only; the number's color carries the tier meaning.
const arrowFor = (series) => {
    if (!series || series.length < 2) return '';
    const a = series[series.length - 2].value;
    const b = series[series.length - 1].value;
    if (b > a) return '↗';
    if (b < a) return '↘';
    return '→';
};

// Current sprint window ("5/26–6/9") from the latest analyzed sprint, so the
// detail page shows the same dates as the portfolio card. Leading zeros dropped
// to stay compact; empty string when the dates aren't on the metrics blob.
const fmtDay = (iso) => {
    if (!iso) return '';
    const mm = String(iso)
        .slice(0, 10)
        .match(/^(\d{4})-(\d{2})-(\d{2})/);
    return mm ? `${Number(mm[2])}/${Number(mm[3])}` : '';
};
const sprintWindowOf = (sprints) => {
    const s = sprints?.[sprints.length - 1];
    const a = fmtDay(s?.startDate);
    const b = fmtDay(s?.endDate);
    return a && b ? `${a}–${b}` : '';
};

// Module-level so it keeps a STABLE identity across re-renders — defining it inside
// the page component remounted the input on every parent render and wiped what you
// were typing. Uncontrolled (defaultValue) + save on blur.
function CaseField({
    editing,
    value,
    field,
    label,
    placeholder,
    tone,
    savedFlash,
    boardId,
    onCaseSave,
}) {
    return (
        <div>
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {label}
                </span>
                <SavedTick flash={savedFlash} k={`case:${boardId}:${field}`} />
            </div>
            {editing ? (
                <input
                    className="input-field mt-0.5 text-sm"
                    placeholder={placeholder}
                    defaultValue={value || ''}
                    onBlur={(e) => onCaseSave(field, e.target.value, `case:${boardId}:${field}`)}
                />
            ) : (
                <div className={`text-sm ${tone || 'text-gray-700'}`}>{value || '—'}</div>
            )}
        </div>
    );
}

const STATUS_PILL = {
    active: 'bg-primary-50 text-primary-700',
    done: 'bg-green-50 text-green-700',
    dropped: 'bg-gray-100 text-gray-500',
};
const STATUS_ACCENT = {
    active: 'border-l-primary-400',
    done: 'border-l-green-400',
    dropped: 'border-l-gray-300',
};

// One experiment row — title + pillar/metric, a status pill, discreet actions, and
// the outcome as a quiet quoted line. Module-level for a stable identity.
function ExperimentItem({ e, editing, updateExperiment, removeExperiment, savedFlash }) {
    return (
        <li
            className={`rounded-lg border border-l-[3px] border-gray-200 bg-white p-3 ${
                STATUS_ACCENT[e.status] || STATUS_ACCENT.active
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900">{e.behavior}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                        {PILLAR_LABEL[e.pillar] || e.pillar} · {e.metric}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                            STATUS_PILL[e.status] || STATUS_PILL.active
                        }`}
                    >
                        {e.status}
                    </span>
                    {editing && (
                        <div className="flex items-center gap-1">
                            <SavedTick flash={savedFlash} k={`exp:${e.id}`} />
                            {e.status === 'active' && (
                                <>
                                    <button
                                        onClick={() => updateExperiment(e, { status: 'done' })}
                                        className="rounded px-1.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50"
                                    >
                                        Done
                                    </button>
                                    <button
                                        onClick={() => updateExperiment(e, { status: 'dropped' })}
                                        className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                                    >
                                        Drop
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => removeExperiment(e)}
                                className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete experiment"
                                title="Delete"
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {editing ? (
                <input
                    className="input-field mt-2 text-xs"
                    placeholder="Outcome / result — what changed?"
                    defaultValue={e.outcome || ''}
                    onBlur={(ev) => updateExperiment(e, { outcome: ev.target.value })}
                />
            ) : e.outcome ? (
                <div className="mt-2 border-l-2 border-gray-200 pl-2 text-xs text-gray-600">
                    <span className="text-gray-400">Result:</span> {e.outcome}
                </div>
            ) : null}
        </li>
    );
}

export default function CoachingTeamPage({
    board,
    mode,
    setMode,
    onBack,
    caseDraft,
    onCaseSave,
    assessment,
    experiments,
    setSignal,
    saveNote,
    addExperiment,
    updateExperiment,
    removeExperiment,
    toggleCoaching,
    detectSm,
    detecting,
    detectMsg,
    hasCredentials,
    savedFlash,
}) {
    const editing = mode === 'edit';
    const [newPillar, setNewPillar] = React.useState('commitment');
    const [newMetric, setNewMetric] = React.useState(METRICS_BY_PILLAR.commitment[0]);
    const [newBehavior, setNewBehavior] = React.useState('');
    // Pillar drives the metric list; switching pillar resets to its first metric.
    const onPillarChange = (pillar) => {
        setNewPillar(pillar);
        setNewMetric((METRICS_BY_PILLAR[pillar] || ['Other'])[0]);
    };
    const addCustomExperiment = () => {
        const behavior = newBehavior.trim();
        if (!behavior) return;
        addExperiment(board.boardId, {
            pillar: newPillar,
            metric: newMetric,
            behavior,
            hypothesis: '',
        });
        setNewBehavior('');
    };
    const c = caseDraft || {};
    const m = board.metricTrends;
    const latest = board.latestMetrics;
    const signals = assessment?.signals || {};
    const live = behavioralReadiness(signals);
    const readiness = READINESS_META[live.label] || READINESS_META.not_assessed;
    const levelName = board.currentLevel ? LEVEL_META[board.currentLevel].name : null;
    const active = experiments.filter((e) => e.status === 'active');
    const closed = experiments.filter((e) => e.status !== 'active');

    const levelSince = fmtMonth(board.levelSince);
    const prevName = board.previousLevel ? LEVEL_META[board.previousLevel].name : null;
    const levelArrow =
        prevName && board.currentLevel
            ? board.currentLevel > board.previousLevel
                ? `↑ from ${prevName}`
                : `↓ from ${prevName}`
            : null;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="mx-auto max-w-5xl px-6">
                <button onClick={onBack} className="mb-3 text-sm text-primary-600 hover:underline">
                    ← Back to portfolio
                </button>

                {/* Title + its primary action on the same line (Edit acts on THIS team). */}
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-3">
                            <h1 className="text-3xl font-bold text-gray-900">{board.boardName}</h1>
                            <LevelChip level={board.currentLevel} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span>
                                {board.sm
                                    ? `SM: ${board.sm.name}`
                                    : 'Not managed by a Scrum Manager'}
                            </span>
                            {editing && (
                                <>
                                    <button
                                        onClick={() => detectSm(board)}
                                        disabled={!hasCredentials || detecting}
                                        className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                        title="Re-detect the team's Scrum Manager from Jira (use when the SM changed)"
                                    >
                                        {detecting ? 'Checking…' : 'SM changed?'}
                                    </button>
                                    <SavedTick flash={savedFlash} k={`sm:${board.boardId}`} />
                                    {detectMsg && <span>{detectMsg}</span>}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                            onClick={() => setMode(editing ? 'view' : 'edit')}
                            className={editing ? 'btn-primary' : 'btn-ghost'}
                        >
                            {editing ? 'Done' : 'Edit'}
                        </button>
                        {editing && (
                            <span className="text-[11px] text-gray-400">
                                changes save automatically
                            </span>
                        )}
                    </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-3">
                    {/* LEFT — the coaching narrative (the headline) */}
                    <div className="space-y-4 lg:col-span-2">
                        {(() => {
                            const FIELDS = [
                                ['Main gap', 'mainGap', "The team's biggest gap right now", ''],
                                [
                                    'Coaching hypothesis',
                                    'hypothesis',
                                    'The change being tested',
                                    '',
                                ],
                                ['Next step', 'nextStep', 'The next coaching action', ''],
                                [
                                    'Support needed (ask)',
                                    'supportNeeded',
                                    'Where leadership can help',
                                    'text-amber-700',
                                ],
                            ];
                            const anyFilled = FIELDS.some(([, f]) => c[f]) || c.reviewAt;
                            // Read mode with nothing recorded: invite action instead of a wall of "—".
                            if (!editing && !anyFilled) {
                                return (
                                    <div className="card mb-0 p-5 text-sm text-gray-500">
                                        <h3 className="mb-2 text-lg font-bold text-gray-800">
                                            Coaching plan
                                        </h3>
                                        No coaching plan recorded yet —{' '}
                                        <button
                                            onClick={() => setMode('edit')}
                                            className="font-medium text-primary-600 hover:underline"
                                        >
                                            add the gap, hypothesis, next step and ask
                                        </button>
                                        .
                                    </div>
                                );
                            }
                            const shown = editing ? FIELDS : FIELDS.filter(([, f]) => c[f]);
                            // Linear narrative: the gap leads full-width; the
                            // supporting fields follow in a 2-col grid below.
                            const gapField = shown.find(([, f]) => f === 'mainGap');
                            const restFields = shown.filter(([, f]) => f !== 'mainGap');
                            return (
                                <div className="card mb-0 p-5">
                                    <h3 className="mb-3 text-lg font-bold text-gray-800">
                                        Coaching plan
                                    </h3>
                                    {/* Enrollment toggle lives inside the plan (it IS part
                                        of the plan) — was a competing amber banner above. */}
                                    {editing && (
                                        <label className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={!!board.coaching}
                                                onChange={(e) =>
                                                    toggleCoaching(board, e.target.checked)
                                                }
                                            />
                                            This team is being coached by the Agile Coach
                                            <SavedTick
                                                flash={savedFlash}
                                                k={`coaching:${board.boardId}`}
                                            />
                                        </label>
                                    )}
                                    {gapField && (
                                        <div className="mb-3">
                                            <CaseField
                                                editing={editing}
                                                value={c[gapField[1]]}
                                                field={gapField[1]}
                                                label={gapField[0]}
                                                placeholder={gapField[2]}
                                                tone={gapField[3]}
                                                savedFlash={savedFlash}
                                                boardId={board.boardId}
                                                onCaseSave={onCaseSave}
                                            />
                                        </div>
                                    )}
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {restFields.map(([label, field, placeholder, tone]) => (
                                            <CaseField
                                                key={field}
                                                editing={editing}
                                                value={c[field]}
                                                field={field}
                                                label={label}
                                                placeholder={placeholder}
                                                tone={tone}
                                                savedFlash={savedFlash}
                                                boardId={board.boardId}
                                                onCaseSave={onCaseSave}
                                            />
                                        ))}
                                        {(editing || c.reviewAt) && (
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                                        Next SM check-in
                                                    </span>
                                                    <SavedTick
                                                        flash={savedFlash}
                                                        k={`case:${board.boardId}:reviewAt`}
                                                    />
                                                </div>
                                                {editing ? (
                                                    <input
                                                        type="date"
                                                        className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm"
                                                        defaultValue={c.reviewAt || ''}
                                                        onBlur={(e) =>
                                                            onCaseSave(
                                                                'reviewAt',
                                                                e.target.value,
                                                                `case:${board.boardId}:reviewAt`
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <div className="text-sm text-gray-700">
                                                        {c.reviewAt}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Interventions / experiments */}
                        <div className="card mb-0 p-5">
                            <h3 className="mb-2 text-lg font-bold text-gray-800">
                                Interventions &amp; experiments
                            </h3>
                            {active.length === 0 && closed.length === 0 && (
                                <p className="text-sm text-gray-500">
                                    No experiments yet.
                                    {!editing && (
                                        <>
                                            {' '}
                                            <button
                                                onClick={() => setMode('edit')}
                                                className="font-medium text-primary-600 hover:underline"
                                            >
                                                Run one
                                            </button>
                                        </>
                                    )}
                                </p>
                            )}
                            {[
                                { key: 'active', label: 'Active', items: active },
                                { key: 'closed', label: 'Closed', items: closed },
                            ].map((g) =>
                                g.items.length === 0 ? null : (
                                    <div key={g.key} className="mt-2">
                                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                            {g.label}
                                        </div>
                                        <ul className="space-y-2">
                                            {g.items.map((e) => (
                                                <ExperimentItem
                                                    key={e.id}
                                                    e={e}
                                                    editing={editing}
                                                    updateExperiment={updateExperiment}
                                                    removeExperiment={removeExperiment}
                                                    savedFlash={savedFlash}
                                                />
                                            ))}
                                        </ul>
                                    </div>
                                )
                            )}
                            {editing && (
                                <div className="mt-3 space-y-3">
                                    {/* Custom experiment: pick the metric to move + describe it.
                                        Fixed two-row layout — selects on top, input + Add below —
                                        so wider pillar/metric labels never reflow the form. */}
                                    <div className="flex flex-wrap items-end gap-2">
                                        <label className="text-xs text-gray-500">
                                            Pillar
                                            <select
                                                className="mt-0.5 block rounded border border-gray-300 px-2 py-1 text-sm"
                                                value={newPillar}
                                                onChange={(e) => onPillarChange(e.target.value)}
                                            >
                                                {Object.keys(PILLAR_LABEL).map((p) => (
                                                    <option key={p} value={p}>
                                                        {PILLAR_LABEL[p]}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="text-xs text-gray-500">
                                            Metric to move
                                            <select
                                                className="mt-0.5 block rounded border border-gray-300 px-2 py-1 text-sm"
                                                value={newMetric}
                                                onChange={(e) => setNewMetric(e.target.value)}
                                            >
                                                {(METRICS_BY_PILLAR[newPillar] || ['Other']).map(
                                                    (mo) => (
                                                        <option key={mo} value={mo}>
                                                            {mo}
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            className="input-field flex-1 text-sm"
                                            placeholder="Experiment — the behavior to try"
                                            value={newBehavior}
                                            onChange={(e) => setNewBehavior(e.target.value)}
                                            onKeyDown={(e) =>
                                                e.key === 'Enter' && addCustomExperiment()
                                            }
                                        />
                                        <button
                                            onClick={addCustomExperiment}
                                            disabled={!newBehavior.trim()}
                                            className="btn-primary shrink-0"
                                        >
                                            Add
                                        </button>
                                        <SavedTick
                                            flash={savedFlash}
                                            k={`exp-add:${board.boardId}`}
                                        />
                                    </div>
                                    {/* Quick-add suggested templates */}
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-xs text-gray-400">Suggested:</span>
                                        {EXPERIMENT_TEMPLATES.map((tpl, i) => (
                                            <button
                                                key={i}
                                                onClick={() => addExperiment(board.boardId, tpl)}
                                                className="rounded border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                                                title={tpl.hypothesis}
                                            >
                                                + {tpl.metric}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Behavioral signals */}
                        <div className="card mb-0 p-5">
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-800">
                                    Behavioral signals
                                </h3>
                                <span className={`text-sm font-semibold ${readiness.tone}`}>
                                    {readiness.label}
                                    {live.pct != null ? ` · ${live.pct}%` : ''}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {PILLARS.map((p) => (
                                    <div key={p.key}>
                                        <div className="mb-1 text-xs font-semibold text-gray-700">
                                            {p.name}
                                        </div>
                                        <div className="space-y-1">
                                            {p.signals.map((s) => (
                                                <div
                                                    key={s.key}
                                                    className="flex items-center justify-between gap-2"
                                                >
                                                    <span className="text-sm text-gray-600">
                                                        {s.label}
                                                    </span>
                                                    {editing ? (
                                                        <div className="flex items-center gap-2">
                                                            <SavedTick
                                                                flash={savedFlash}
                                                                k={`signal:${board.boardId}:${s.key}`}
                                                            />
                                                            <SignalSegments
                                                                value={signals[s.key]}
                                                                onSelect={(v) =>
                                                                    setSignal(
                                                                        board.boardId,
                                                                        s.key,
                                                                        v
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    ) : (
                                                        <span
                                                            className={`text-xs font-medium ${
                                                                RUBRIC[signals[s.key]]?.tone ||
                                                                'text-gray-400'
                                                            }`}
                                                        >
                                                            {RUBRIC[signals[s.key]]?.label || '—'}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT — maturity context (compact, links out) */}
                    <div className="space-y-4">
                        <div className="card mb-0 p-5">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-lg font-bold text-gray-800">Maturity</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        // Hand the board to the dashboard the same way the board
                                        // combobox does (a one-shot intent it consumes on load),
                                        // then navigate out of the hidden hub to the dashboard.
                                        try {
                                            sessionStorage.setItem(
                                                'scrum-dashboard-open-board-id',
                                                String(board.boardId)
                                            );
                                        } catch {
                                            /* sessionStorage unavailable */
                                        }
                                        window.location.hash = '';
                                    }}
                                    className="text-xs text-primary-600 hover:underline"
                                >
                                    Open in dashboard ↗
                                </button>
                            </div>
                            {board.currentLevel && (
                                <div className="mb-3">
                                    <MaturityBadge
                                        level={board.currentLevel}
                                        name={levelName}
                                        description={levelSince ? `Since ${levelSince}` : ''}
                                        annotation={
                                            levelArrow ? (
                                                <div
                                                    className={`text-xs font-medium ${
                                                        levelArrow.startsWith('↑')
                                                            ? 'text-green-700'
                                                            : 'text-red-600'
                                                    }`}
                                                >
                                                    {levelArrow}
                                                </div>
                                            ) : null
                                        }
                                    />
                                </div>
                            )}
                            {latest ? (
                                <div className="grid grid-cols-2 gap-2 text-center text-sm">
                                    {board.analysisSprintCount > 0 && (
                                        <div className="col-span-2 text-[10px] text-gray-400 -mb-1">
                                            avg. of last {board.analysisSprintCount} analyzed sprint
                                            {board.analysisSprintCount !== 1 ? 's' : ''}
                                            {sprintWindowOf(board.recentSprints)
                                                ? ` · latest ${sprintWindowOf(board.recentSprints)}`
                                                : ''}
                                        </div>
                                    )}
                                    {METRICS.map((mt) => {
                                        const v = latest[mt.latest];
                                        const tier = metricTier(mt.key, v);
                                        return (
                                            <div key={mt.key} className="rounded bg-gray-50 p-2">
                                                <div className="text-[11px] text-gray-500">
                                                    {mt.label}
                                                </div>
                                                <div className={`font-bold ${tierTextClass(tier)}`}>
                                                    {formatPct(v)}{' '}
                                                    <span className="text-gray-400">
                                                        {arrowFor(m[mt.key])}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">Not analyzed yet.</p>
                            )}
                            {board.recentSprints?.length > 0 && (
                                <div className="mt-3">
                                    <SprintMaturityChart sprints={board.recentSprints} />
                                </div>
                            )}
                            {board.recentSprints?.length >= 2 && (
                                <div className="mt-3">
                                    <MetricTrendChart board={board} />
                                </div>
                            )}
                        </div>

                        {/* Graduation gate */}
                        <div className="card mb-0 p-5">
                            <h3 className="mb-2 text-lg font-bold text-gray-800">
                                Graduation gate
                            </h3>
                            <ul className="space-y-1 text-sm">
                                <li className="flex justify-between">
                                    <span className="text-gray-500">Metric level</span>
                                    <span className="font-medium">{levelName || '—'}</span>
                                </li>
                                <li className="flex justify-between">
                                    <span className="text-gray-500">Behavioral readiness</span>
                                    <span className={`font-medium ${readiness.tone}`}>
                                        {readiness.label}
                                        {live.pct != null ? ` ${live.pct}%` : ''}
                                    </span>
                                </li>
                                <li className="flex justify-between">
                                    <span className="text-gray-500">Graduation review</span>
                                    <span className="font-medium">
                                        {board.currentLevel >= 2 &&
                                        live.pct != null &&
                                        live.pct >= 75 ? (
                                            <span className="text-green-700">Ready to review</span>
                                        ) : (
                                            <span className="text-gray-400">Not yet</span>
                                        )}
                                    </span>
                                </li>
                            </ul>
                        </div>

                        {/* Suggested focus */}
                        {board.focus?.length > 0 && (
                            <div className="card mb-0 p-5">
                                <h3 className="mb-2 text-lg font-bold text-gray-800">
                                    Suggested focus
                                </h3>
                                <ul className="space-y-1 text-sm text-gray-600">
                                    {board.focus.map((f, i) => (
                                        <li key={i}>
                                            <span className="font-medium text-gray-800">
                                                {PILLAR_LABEL[f.pillar]}:
                                            </span>{' '}
                                            {f.text}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
