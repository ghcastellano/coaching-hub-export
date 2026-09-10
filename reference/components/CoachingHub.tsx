// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import CoachingTeamPage from './coaching/CoachingTeamPage';
import LeadershipSummary from './coaching/LeadershipSummary';
import { LevelChip, READINESS_META, PILLAR_LABEL } from './coaching/ui';
import { behavioralReadiness, summarize } from './coaching/portfolio';
import { tierTopAccentClass } from './shared/designTokens';
import { metricTier, tierTextClass, formatPct } from '../util/maturity';

// ── Hash routing (the team detail is a real, shareable sub-route) ────────────
const parseRoute = () => {
    const h = typeof window !== 'undefined' ? window.location.hash : '';
    const team = h.match(/^#coaching-hub\/team\/(\d+)/);
    if (team) return { kind: 'team', boardId: Number(team[1]) };
    if (h.startsWith('#coaching-hub/leadership')) return { kind: 'leadership' };
    return { kind: 'portfolio' };
};
const go = (hash) => {
    window.location.hash = hash;
};

// Single-coach tool: the connected user is the Agile Coach. Stored on each
// engagement so leadership sees a name (not an email). Configurable later.
const AGILE_COACH = 'Gustavo Castellano';

// A board "needs attention" when it regressed or is still at the foundational
// (Silver) level. Everything else in the program is "on track".
const needsAttention = (b) => b.status === 'at_risk' || b.currentLevel === 1;

// Group teams of the same Scrum Manager together (alphabetical by SM, then board);
// teams with no SM last. Shared by the section grids and the Edit roster.
const sortBySm = (boards) =>
    [...boards].sort((a, b) => {
        const an = a.sm?.name || '';
        const bn = b.sm?.name || '';
        if (!!an !== !!bn) return an ? -1 : 1;
        return an.localeCompare(bn) || (a.boardName || '').localeCompare(b.boardName || '');
    });

function CoachingHub({ credentials }) {
    const [portfolio, setPortfolio] = useState(null);
    const [assessments, setAssessments] = useState({}); // boardId -> { signals, note }
    const [experiments, setExperiments] = useState([]);
    const [cases, setCases] = useState({}); // boardId -> coaching case draft
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mode, setMode] = useState('view'); // 'view' | 'edit' — team page only
    const [showRoster, setShowRoster] = useState(false); // "Manage teams" modal
    const [route, setRoute] = useState(parseRoute());

    const [savedFlash, setSavedFlash] = useState(null);
    const flashTimer = React.useRef(null);
    const flash = (key, ok) => {
        if (!key) return;
        setSavedFlash({ key, ok });
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setSavedFlash(null), ok ? 1800 : 5000);
    };
    const track = (promise, flashKey) =>
        Promise.resolve(promise)
            .then((r) => {
                flash(flashKey, true);
                return r;
            })
            .catch((e) => {
                flash(flashKey, false);
                throw e;
            });

    useEffect(() => {
        const onHash = () => setRoute(parseRoute());
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    useEffect(() => {
        loadAll();
    }, []);

    const loadPortfolio = async () => {
        const res = await api.getCoachingPortfolio().catch(() => null);
        if (res?.success) setPortfolio(res);
        return res;
    };

    const loadAll = async () => {
        setLoading(true);
        setError('');
        try {
            const [pf, assessRes, expRes] = await Promise.all([
                loadPortfolio(),
                api.getAssessments().catch(() => ({ assessments: [] })),
                api.getExperiments().catch(() => ({ experiments: [] })),
            ]);
            const sMap = {};
            for (const s of assessRes.assessments || [])
                sMap[String(s.boardId)] = { signals: s.signals || {}, note: s.note || '' };
            setAssessments(sMap);
            setExperiments(expRes.experiments || []);
            const cMap = {};
            for (const b of pf?.boards || [])
                cMap[String(b.boardId)] = { ...(b.coachingCase || {}) };
            setCases(cMap);
        } catch (err) {
            console.error('Failed to load coaching hub:', err);
            setError('Failed to load the coaching portfolio.');
        } finally {
            setLoading(false);
        }
    };

    // ── Edit writes (optimistic) ─────────────────────────────────────────────
    const toggleCoaching = (board, on) => {
        setPortfolio((prev) =>
            prev
                ? {
                      ...prev,
                      boards: prev.boards.map((b) =>
                          b.boardId === board.boardId ? { ...b, coaching: on } : b
                      ),
                  }
                : prev
        );
        track(
            api.saveBoardManager({
                boardId: board.boardId,
                boardName: board.boardName,
                smName: board.sm?.name ?? null,
                role: board.sm?.role ?? 'scrum_master',
                coaching: on,
                engagedBy: on ? AGILE_COACH : null,
            }),
            `coaching:${board.boardId}`
        )
            .then(loadPortfolio)
            .catch((e) => console.warn('toggleCoaching failed:', e.message));
    };

    const saveCase = (boardId, field, value, flashKey) => {
        setCases((prev) => {
            const next = { ...(prev[String(boardId)] || {}), [field]: value };
            const board = (portfolio?.boards || []).find((b) => b.boardId === boardId);
            track(
                api.saveBoardManager({
                    boardId,
                    boardName: board?.boardName ?? null,
                    smName: board?.sm?.name ?? null,
                    role: board?.sm?.role ?? 'scrum_master',
                    coachingCase: next,
                }),
                flashKey
            ).catch((e) => console.warn('saveCase failed:', e.message));
            return { ...prev, [String(boardId)]: next };
        });
    };

    const setSignal = (boardId, signalKey, value) => {
        setAssessments((prev) => {
            const cur = prev[String(boardId)] || { signals: {}, note: '' };
            const signals = { ...cur.signals, [signalKey]: value };
            track(
                api.saveAssessment(boardId, signals, cur.note || null, credentials?.email || null),
                `signal:${boardId}:${signalKey}`
            ).catch((e) => console.warn('saveAssessment failed:', e.message));
            return { ...prev, [String(boardId)]: { ...cur, signals } };
        });
    };

    const saveNote = (boardId, note) => {
        setAssessments((prev) => {
            const cur = prev[String(boardId)] || { signals: {}, note: '' };
            track(
                api.saveAssessment(
                    boardId,
                    cur.signals || {},
                    note || null,
                    credentials?.email || null
                ),
                `note:${boardId}`
            ).catch((e) => console.warn('saveAssessment(note) failed:', e.message));
            return { ...prev, [String(boardId)]: { ...cur, note } };
        });
    };

    const addExperiment = async (boardId, tpl) => {
        // Guard against accidental duplicates: don't add an experiment whose behavior
        // is already running (active) on this board.
        const dup = experiments.some(
            (e) =>
                String(e.boardId) === String(boardId) &&
                e.status === 'active' &&
                (e.behavior || '').trim() === (tpl.behavior || '').trim()
        );
        if (dup) {
            flash(`exp-add:${boardId}`, true);
            return;
        }
        try {
            const res = await track(
                api.saveExperiment({
                    boardId,
                    pillar: tpl.pillar,
                    metric: tpl.metric,
                    behavior: tpl.behavior,
                    hypothesis: tpl.hypothesis || '',
                    status: 'active',
                    origin: tpl.origin || 'manual',
                }),
                `exp-add:${boardId}`
            );
            if (res.success && res.experiment) {
                setExperiments((prev) => [res.experiment, ...prev]);
                // Re-aggregate the portfolio so the card's "Working on" + counts update live.
                loadPortfolio();
            }
        } catch (e) {
            console.warn('addExperiment failed:', e.message);
        }
    };

    const updateExperiment = async (exp, patch) => {
        const next = { ...exp, ...patch };
        setExperiments((prev) => prev.map((e) => (e.id === exp.id ? next : e)));
        try {
            await track(api.saveExperiment(next), `exp:${exp.id}`);
            loadPortfolio();
        } catch (e) {
            console.warn('updateExperiment failed:', e.message);
        }
    };

    const removeExperiment = async (exp) => {
        setExperiments((prev) => prev.filter((e) => e.id !== exp.id));
        try {
            await track(api.deleteExperiment(exp.id), `exp:${exp.id}`);
            loadPortfolio();
        } catch (e) {
            console.warn('removeExperiment failed:', e.message);
        }
    };

    const [detectingId, setDetectingId] = useState(null);
    const [detectMsgById, setDetectMsgById] = useState({});
    const detectSm = async (board) => {
        if (!credentials) return;
        setDetectingId(board.boardId);
        setDetectMsgById((prev) => ({ ...prev, [board.boardId]: '' }));
        try {
            const res = await api.detectScrumManager(
                credentials.jiraUrl,
                credentials.email,
                credentials.apiToken,
                board.boardId,
                board.boardName
            );
            if (res.success && res.detected?.displayName) {
                const d = res.detected;
                await track(
                    api.saveBoardManager({
                        boardId: board.boardId,
                        boardName: board.boardName,
                        role: 'scrum_master',
                        smName: d.displayName,
                        smAccountId: d.accountId || null,
                    }),
                    `sm:${board.boardId}`
                );
                await loadPortfolio();
                return d;
            }
            setDetectMsgById((prev) => ({
                ...prev,
                [board.boardId]: res.success
                    ? 'No Scrum Manager detected for this team.'
                    : res.error || 'Detection failed.',
            }));
            return null;
        } catch (e) {
            setDetectMsgById((prev) => ({ ...prev, [board.boardId]: e.message }));
            return null;
        } finally {
            setDetectingId(null);
        }
    };

    // useMemo must be declared before any early returns (Rules of Hooks).
    // boards is derived here directly from portfolio to keep the dependency
    // array accurate and allow this hook to precede the loading/error guards.
    const enrichedBoards = useMemo(() => {
        const rawBoards = portfolio?.boards || [];
        return rawBoards.map((b) => {
            // Only recompute behavioral when local signals are actually present;
            // otherwise preserve the server-computed value so a getAssessments()
            // failure (caught as []) doesn't silently overwrite real data.
            const localSignals = assessments[String(b.boardId)]?.signals;
            const localCase = cases[String(b.boardId)] || b.coachingCase || {};
            const localExps = experiments.filter((e) => String(e.boardId) === String(b.boardId));
            const workingOn = [
                ...new Set(
                    localExps
                        .filter((e) => e.status === 'active')
                        .map((e) => e.pillar)
                        .filter(Boolean)
                ),
            ];
            // Recompute only when local signals have rated values (not_yet/emerging/
            // consistent); {} or all-unknown means no real local data yet — preserve server.
            const hasRatedSignals =
                localSignals != null &&
                Object.values(localSignals).some((v) => v && v !== 'unknown');
            return {
                ...b,
                behavioral: hasRatedSignals
                    ? behavioralReadiness(localSignals)
                    : b.behavioral || behavioralReadiness({}),
                coachingCase: localCase,
                workingOn,
            };
        });
    }, [portfolio, assessments, cases, experiments]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
                    <p className="mt-4 text-gray-600">Loading coaching hub…</p>
                </div>
            </div>
        );
    }

    const boards = portfolio?.boards || [];

    // ── Team detail route (dedicated, shareable page) ────────────────────────
    if (route.kind === 'team') {
        const board = boards.find((b) => b.boardId === route.boardId);
        if (!board) {
            return (
                <div className="mx-auto max-w-3xl px-6 py-10 text-center text-gray-500">
                    Team not found.{' '}
                    <button
                        onClick={() => go('#coaching-hub')}
                        className="text-primary-600 underline"
                    >
                        Back to portfolio
                    </button>
                </div>
            );
        }
        return (
            <CoachingTeamPage
                board={board}
                mode={mode}
                setMode={setMode}
                onBack={() => {
                    setMode('view'); // don't carry edit mode back to the portfolio
                    go('#coaching-hub');
                }}
                caseDraft={cases[String(board.boardId)] || board.coachingCase || {}}
                onCaseSave={(field, value, flashKey) =>
                    saveCase(board.boardId, field, value, flashKey)
                }
                assessment={assessments[String(board.boardId)]}
                experiments={experiments.filter((e) => String(e.boardId) === String(board.boardId))}
                setSignal={setSignal}
                saveNote={saveNote}
                addExperiment={addExperiment}
                updateExperiment={updateExperiment}
                removeExperiment={removeExperiment}
                toggleCoaching={toggleCoaching}
                detectSm={detectSm}
                detecting={detectingId === board.boardId}
                detectMsg={detectMsgById[board.boardId] || ''}
                hasCredentials={!!credentials}
                savedFlash={savedFlash}
            />
        );
    }

    const summary = summarize(
        enrichedBoards.map((b) => ({
            status: b.status,
            coaching: b.coaching,
            currentLevel: b.currentLevel,
            graduatedThisPeriod: b.graduatedThisPeriod,
            levelDeltaInPeriod: b.levelDeltaInPeriod,
            leveledUpThisPeriod: b.leveledUpThisPeriod,
        }))
    );
    const inProgram = enrichedBoards.filter((b) => b.status);
    const attention = inProgram.filter(needsAttention);
    const onTrack = inProgram.filter((b) => !needsAttention(b));

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header — mirrors the Scrum Maturity dashboard header scale */}
                <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900">Agile Coaching</h1>
                        <p className="text-sm text-gray-500">
                            What&apos;s being coached, why, and what changed · complements the Scrum
                            Maturity Dashboard
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-5">
                        {/* Navigation tabs */}
                        <nav className="flex gap-4 text-sm font-semibold">
                            {[
                                { k: 'portfolio', label: 'Portfolio', hash: '#coaching-hub' },
                                {
                                    k: 'leadership',
                                    label: 'Leadership summary',
                                    hash: '#coaching-hub/leadership',
                                },
                            ].map((t) => {
                                const active =
                                    t.k ===
                                    (route.kind === 'leadership' ? 'leadership' : 'portfolio');
                                return (
                                    <button
                                        key={t.k}
                                        onClick={() => go(t.hash)}
                                        className={`-mb-px border-b-2 pb-1 transition-colors ${
                                            active
                                                ? 'border-primary-600 text-primary-700'
                                                : 'border-transparent text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                );
                            })}
                        </nav>
                        {route.kind !== 'leadership' && (
                            <button onClick={() => setShowRoster(true)} className="btn-ghost">
                                Manage teams
                            </button>
                        )}
                    </div>
                </div>

                {error && <div className="alert alert-error mb-6">{error}</div>}

                {route.kind === 'leadership' ? (
                    <LeadershipSummary boards={enrichedBoards} />
                ) : (
                    <>
                        <ProgramHeader
                            boards={inProgram}
                            summary={summary}
                            attention={attention.length}
                        />

                        {inProgram.length === 0 ? (
                            <div className="py-16 text-center text-gray-500">
                                No teams in the coaching program yet. Use{' '}
                                <button
                                    onClick={() => setShowRoster(true)}
                                    className="font-semibold text-primary-600 hover:underline"
                                >
                                    Manage teams
                                </button>{' '}
                                to add one.
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <Section
                                    title="Needs attention"
                                    blurb="Regressing or stuck — act here first."
                                    chip="bg-red-100 text-red-700"
                                    boards={attention}
                                    onOpen={(id) => go(`#coaching-hub/team/${id}`)}
                                />
                                <Section
                                    title="On track"
                                    blurb="Improving."
                                    chip="bg-green-100 text-green-700"
                                    boards={onTrack}
                                    onOpen={(id) => go(`#coaching-hub/team/${id}`)}
                                />
                            </div>
                        )}
                        {showRoster && (
                            <RosterModal
                                boards={boards}
                                onToggle={toggleCoaching}
                                onOpen={(id) => {
                                    setShowRoster(false);
                                    go(`#coaching-hub/team/${id}`);
                                }}
                                onClose={() => setShowRoster(false)}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Presentation ──────────────────────────────────────────────────────────────

// Program header: one card that answers "where are the teams" (a stacked maturity
// bar) and "how are they moving" (a movement strip), replacing the old separate
// tier-distribution and KPI-tiles blocks that repeated the same counts.
function ProgramHeader({ boards, summary, attention }) {
    const total = boards.length;
    const denom = total || 1;
    const tiers = [
        {
            label: 'Silver',
            n: summary.bands.silver,
            bar: 'bg-slate-400',
            dot: 'bg-slate-400',
            val: 'text-slate-600',
        },
        {
            label: 'Gold',
            n: summary.bands.gold,
            bar: 'bg-amber-400',
            dot: 'bg-amber-400',
            val: 'text-amber-700',
        },
        {
            label: 'Platinum',
            n: summary.bands.platinum,
            bar: 'bg-teal-400',
            dot: 'bg-teal-400',
            val: 'text-teal-700',
        },
    ];
    const movement = [
        {
            icon: '↑',
            label: 'leveled up',
            n: summary.leveledUp,
            tone: 'text-green-700',
            title: 'Moved up a level this quarter',
        },
        {
            icon: '⚠',
            label: 'need attention',
            n: attention,
            tone: 'text-red-600',
            title: 'Regressing or stuck right now',
        },
        {
            icon: '🎓',
            label: 'graduated',
            n: summary.graduatedThisPeriod,
            tone: 'text-green-700',
            title: 'Reached & held Platinum this quarter',
        },
    ];
    return (
        <div className="card mb-8">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">🎯 Coaching Program</h2>
                <div className="text-sm text-gray-500">
                    <span className="font-semibold text-primary-600">{total}</span> teams in the
                    program
                </div>
            </div>

            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Maturity distribution
            </div>
            <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                {tiers.map((t) =>
                    t.n > 0 ? (
                        <div
                            key={t.label}
                            className={t.bar}
                            style={{ width: `${(t.n / denom) * 100}%` }}
                            title={`${t.label}: ${t.n}`}
                        />
                    ) : null
                )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {tiers.map((t) => (
                    <span key={t.label} className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
                        <span className="text-gray-600">{t.label}</span>
                        <span className={`font-bold ${t.val}`}>{t.n}</span>
                    </span>
                ))}
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-sm">
                {movement.map((mv) => (
                    <span key={mv.label} className="flex items-baseline gap-1.5" title={mv.title}>
                        <span className={`text-lg font-bold ${mv.tone}`}>
                            {mv.icon} {mv.n}
                        </span>
                        <span className="text-gray-600">{mv.label}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function Section({ title, blurb, chip, boards, onOpen }) {
    if (boards.length === 0) return null;
    return (
        <section>
            {/* Dashboard-scale section header. No divider rule: with only two
                short sections, whitespace separates better than a floating line. */}
            <div className="mb-4">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${chip}`}>
                        {boards.length}
                    </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{blurb}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sortBySm(boards).map((b) => (
                    <TeamCard
                        key={b.boardId}
                        b={b}
                        onOpen={onOpen}
                        caseDraft={b.coachingCase || {}}
                    />
                ))}
            </div>
        </section>
    );
}

// Direction of the latest sprint versus the previous one, netted across the
// three core signals (hit rate up, rollover down, rework down all count as
// better). A single read for the card so leadership can see at a glance whether
// a team is moving the right way, independent of its absolute tier.
function sprintTrend(recent) {
    if (!recent || recent.length < 2) return null;
    const prev = recent[recent.length - 2];
    const curr = recent[recent.length - 1];
    const EPS = 1; // ignore sub-1-point wobble as noise
    const score = (delta, betterWhenUp) => {
        if (Math.abs(delta) < EPS) return 0;
        return delta > 0 === betterWhenUp ? 1 : -1;
    };
    const net =
        score(curr.hitRate - prev.hitRate, true) +
        score(curr.rollover - prev.rollover, false) +
        score(curr.rework - prev.rework, false);
    if (net > 0) return { arrow: '↑', label: 'Improving', tone: 'text-green-600' };
    if (net < 0) return { arrow: '↓', label: 'Slipping', tone: 'text-red-600' };
    return { arrow: '→', label: 'Flat', tone: 'text-gray-400' };
}

// "5/26" from an ISO date; the leading zero is dropped to keep the card compact.
const fmtDay = (iso) => {
    if (!iso) return '';
    const m = String(iso)
        .slice(0, 10)
        .match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[2])}/${Number(m[3])}` : '';
};
const sprintWindow = (s) => {
    const a = fmtDay(s?.startDate);
    const b = fmtDay(s?.endDate);
    return a && b ? `${a}–${b}` : '';
};

function TeamCard({ b, onOpen, caseDraft }) {
    // What's ACTUALLY being worked on = pillars of the active experiments; else the
    // coach's recorded gap. No algorithmic "suggested" on the card (that lives on the
    // team page) — the card shows real work only.
    const working = (b.workingOn || []).map((p) => PILLAR_LABEL[p] || p);
    const focusLabel = working.length ? 'Working on' : caseDraft.mainGap ? 'Gap' : null;
    const focusText = working.length ? working.join(', ') : caseDraft.mainGap || null;
    const readiness = READINESS_META[b.behavioral?.label] || READINESS_META.not_assessed;
    const lm = b.latestMetrics;
    const trend = sprintTrend(b.recentSprints);
    const latestWindow = sprintWindow(b.recentSprints?.[b.recentSprints.length - 1]);
    // "New team" = thin sprint history: no analysis yet, or the analysis covers
    // ≤5 sprints (established boards always have the default 6). Flagged so a
    // short history isn't misread as a stuck team. Note: a custom selection of
    // ≤5 sprints on an old board also triggers this — acceptable trade-off.
    const sprintsAnalyzed = b.analysisSprintCount ?? 0;
    const isNewTeam = !lm || (sprintsAnalyzed > 0 && sprintsAnalyzed <= 5);
    return (
        <button
            onClick={() => onOpen(b.boardId)}
            className={`card mb-0 flex h-full flex-col p-5 text-left transition-shadow hover:shadow-lg ${tierTopAccentClass(
                b.currentLevel
            )}`}
        >
            <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate text-lg font-bold text-gray-900">{b.boardName}</h3>
                <LevelChip level={b.currentLevel} previousLevel={b.previousLevel} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                <span>{b.sm ? `SM ${b.sm.name}` : 'Not managed by a Scrum Manager'}</span>
                {isNewTeam && (
                    <span
                        className="rounded border border-gray-200 bg-gray-50 px-1 font-medium text-gray-500"
                        title={
                            sprintsAnalyzed > 0
                                ? `Only ${sprintsAnalyzed} sprint${sprintsAnalyzed === 1 ? '' : 's'} of history — early days for this team`
                                : 'No analysis yet — early days for this team'
                        }
                    >
                        New team
                    </span>
                )}
                {b.graduatedThisPeriod ? (
                    <span className="rounded bg-green-100 px-1 font-semibold text-green-700">
                        Graduated
                    </span>
                ) : (
                    <>
                        {b.status === 'at_risk' && (
                            <span className="rounded bg-red-50 px-1 font-medium text-red-700">
                                At risk
                            </span>
                        )}
                        {b.coaching && (
                            <span className="rounded bg-blue-50 px-1 font-medium text-blue-700">
                                In coaching
                            </span>
                        )}
                        {b.status === 'on_demand' && !b.coaching && (
                            <span className="rounded bg-teal-50 px-1 font-medium text-teal-700">
                                On-demand
                            </span>
                        )}
                    </>
                )}
            </div>
            {focusText && (
                <div className="mt-2 text-sm text-gray-700">
                    <span className="text-gray-500">{focusLabel}:</span> {focusText}
                </div>
            )}
            {/* Mini KPI row — same tier-colored values as the dashboard cards */}
            {lm && (
                <div className="mt-3">
                    {b.analysisSprintCount > 0 && (
                        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                            <span className="truncate">
                                avg. of last {b.analysisSprintCount} sprint
                                {b.analysisSprintCount !== 1 ? 's' : ''} analyzed
                                {latestWindow ? ` · latest ${latestWindow}` : ''}
                            </span>
                            {trend && (
                                <span
                                    className={`flex shrink-0 items-center gap-0.5 font-semibold ${trend.tone}`}
                                    title={`Latest sprint vs the previous one: ${trend.label}`}
                                >
                                    <span aria-hidden="true">{trend.arrow}</span>
                                    {trend.label}
                                </span>
                            )}
                        </div>
                    )}
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                        {[
                            { key: 'hitRate', label: 'Hit Rate', v: lm.hitRate },
                            { key: 'rollover', label: 'Rollover', v: lm.rollover },
                            { key: 'rework', label: 'QA Rework', v: lm.avgRework },
                            { key: 'readiness', label: 'Readiness', v: lm.readiness },
                        ].map((mt) => (
                            <div key={mt.key} className="rounded bg-gray-50 p-2">
                                <div className="text-[10px] text-gray-500">{mt.label}</div>
                                <div
                                    className={`text-sm font-bold ${tierTextClass(
                                        metricTier(mt.key, mt.v)
                                    )}`}
                                >
                                    {formatPct(mt.v)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* Progress signal toward graduation (more useful than "coaching since") */}
            <div className="mt-auto pt-3 text-xs">
                <span className="text-gray-500">Behavioral:</span>{' '}
                <span className={`font-medium ${readiness.tone}`}>
                    {readiness.label}
                    {b.behavioral?.pct != null ? ` · ${b.behavioral.pct}%` : ''}
                </span>
            </div>
        </button>
    );
}

function Switch({ on, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onChange(!on)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                on ? 'bg-primary-600' : 'bg-gray-300'
            }`}
        >
            <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    on ? 'left-[18px]' : 'left-0.5'
                }`}
            />
        </button>
    );
}

// Focused modal to manage which teams are in the program — a clean searchable list
// with switches, grouped (sorted) by Scrum Manager. Replaces the inline amber table.
function RosterModal({ boards, onToggle, onOpen, onClose }) {
    const [q, setQ] = useState('');
    const query = q.trim().toLowerCase();
    const list = sortBySm(boards).filter(
        (b) =>
            !query ||
            (b.boardName || '').toLowerCase().includes(query) ||
            (b.sm?.name || '').toLowerCase().includes(query)
    );
    const inCount = boards.filter((b) => b.coaching).length;
    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl rounded-xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">
                            Teams in the coaching program
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-500">
                            {inCount} in coaching · turning one on stamps the Agile Coach + start
                            date. Leadership only sees teams that are on.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-5">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search team or Scrum Manager…"
                        className="input-field mb-3 text-sm"
                    />
                    <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto pr-6">
                        {list.map((b) => (
                            <li key={b.boardId} className="flex items-center gap-3 py-2">
                                <Switch on={!!b.coaching} onChange={(v) => onToggle(b, v)} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-gray-900">
                                        {b.boardName}
                                    </div>
                                    <div className="truncate text-xs text-gray-500">
                                        {b.sm?.name || 'Not managed by a Scrum Manager'}
                                    </div>
                                </div>
                                <span className="shrink-0">
                                    <LevelChip level={b.currentLevel} />
                                </span>
                                <button
                                    onClick={() => onOpen(b.boardId)}
                                    className="shrink-0 text-xs font-medium text-primary-600 hover:underline"
                                >
                                    Open
                                </button>
                            </li>
                        ))}
                        {list.length === 0 && (
                            <li className="py-6 text-center text-sm text-gray-400">
                                No teams match.
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default CoachingHub;
