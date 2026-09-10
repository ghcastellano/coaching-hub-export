// @ts-nocheck
import React, { useState } from 'react';
import { LEVEL_META, PILLAR_LABEL, TierStrip } from './ui';

// Computed-from-data executive summary for the PMO Director. Wins/at-risk/focus are
// derived from the portfolio; asks are aggregated from each team's "support needed".
// "Copy as text" produces a plain-text block to paste into a leadership update.
export default function LeadershipSummary({ boards }) {
    const [copied, setCopied] = useState(false);
    const inProgram = (boards || []).filter((b) => b.status);

    const lvl = (n) => (n ? LEVEL_META[n].name : '—');

    const improving = inProgram
        .filter((b) => b.graduatedThisPeriod || b.leveledUpThisPeriod)
        .map((b) =>
            b.graduatedThisPeriod
                ? `${b.boardName} graduated to Platinum`
                : `${b.boardName} moved up to ${lvl(b.currentLevel)}`
        );

    // Regressions stay as individual alert lines; "still Silver" teams differ
    // only by name, so they collapse into one grouped line instead of N copies.
    const regressing = inProgram
        .filter((b) => b.status === 'at_risk')
        .map((b) => `${b.boardName} regressing (now ${lvl(b.currentLevel)})`);
    const stillSilver = inProgram
        .filter((b) => b.status !== 'at_risk' && b.currentLevel === 1)
        .map((b) => b.boardName);
    const needsAttention = [
        ...regressing,
        ...(stillSilver.length
            ? [
                  `${stillSilver.length} team${stillSilver.length > 1 ? 's' : ''} still Silver — foundational work: ${stillSilver.join(', ')}`,
              ]
            : []),
    ];

    const focusTally = {};
    for (const b of inProgram) {
        const p = b.focus?.[0]?.pillar;
        if (p) focusTally[p] = (focusTally[p] || 0) + 1;
    }
    const focusLine = Object.keys(focusTally)
        .map((p) => `${PILLAR_LABEL[p]} (${focusTally[p]})`)
        .join(' · ');

    const asks = inProgram
        .filter((b) => b.coachingCase?.supportNeeded)
        .map((b) => `${b.boardName}: ${b.coachingCase.supportNeeded}`);

    const tierCounts = { 1: 0, 2: 0, 3: 0 };
    for (const b of inProgram) {
        if (tierCounts[b.currentLevel] != null) tierCounts[b.currentLevel] += 1;
    }

    const asText = () => {
        const lines = [];
        lines.push('Coaching program — leadership summary');
        lines.push('');
        lines.push(
            `Program: ${inProgram.length} teams — ${tierCounts[1]} Silver · ${tierCounts[2]} Gold · ${tierCounts[3]} Platinum`
        );
        lines.push('');
        lines.push('Wins / improving:');
        (improving.length ? improving : ['—']).forEach((s) => lines.push(`  • ${s}`));
        lines.push('');
        lines.push('Needs attention:');
        (needsAttention.length ? needsAttention : ['—']).forEach((s) => lines.push(`  • ${s}`));
        lines.push('');
        lines.push(`Active focus: ${focusLine || '—'}`);
        lines.push('');
        lines.push('Where leadership can help (asks):');
        (asks.length ? asks : ['—']).forEach((s) => lines.push(`  • ${s}`));
        return lines.join('\n');
    };

    const copy = () => {
        try {
            navigator.clipboard?.writeText(asText());
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            /* clipboard unavailable */
        }
    };

    const Card = ({ title, tone, items, empty }) => (
        <div className="card mb-0 p-5">
            <div className={`mb-1 text-lg font-bold ${tone}`}>{title}</div>
            {items.length ? (
                <ul className="list-disc pl-5 text-sm text-gray-700">
                    {items.map((s, i) => (
                        <li key={i}>{s}</li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-gray-400">{empty}</p>
            )}
        </div>
    );

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">
                    Leadership summary · this quarter
                </h2>
                <button
                    onClick={copy}
                    className="btn-ghost"
                    title="Copy this summary as plain text for a leadership update"
                >
                    {copied ? 'Copied ✓' : 'Copy as text'}
                </button>
            </div>
            {/* Quantitative anchor first: the program's state in one glance,
                before the narrative lists. */}
            <div className="mb-4">
                <TierStrip boards={inProgram} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {/* Relevance-first ordering: when there are no wins, the populated
                    "Needs attention" card leads instead of an empty card. */}
                {improving.length === 0 ? (
                    <>
                        <Card
                            title="Needs attention"
                            tone="text-red-600"
                            items={needsAttention}
                            empty="Nothing flagged."
                        />
                        <Card
                            title="Wins / improving"
                            tone="text-green-700"
                            items={improving}
                            empty="No level movement yet this quarter."
                        />
                    </>
                ) : (
                    <>
                        <Card
                            title="Wins / improving"
                            tone="text-green-700"
                            items={improving}
                            empty="No level movement yet this quarter."
                        />
                        <Card
                            title="Needs attention"
                            tone="text-red-600"
                            items={needsAttention}
                            empty="Nothing flagged."
                        />
                    </>
                )}
                <div className="card mb-0 p-5">
                    <div className="mb-1 text-lg font-bold text-gray-800">Active focus</div>
                    <p className="text-sm text-gray-700">{focusLine || '—'}</p>
                </div>
                <Card
                    title="Where leadership can help (asks)"
                    tone="text-amber-700"
                    items={asks}
                    empty="No open asks."
                />
            </div>
        </div>
    );
}
