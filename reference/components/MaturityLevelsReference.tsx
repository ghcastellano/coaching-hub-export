// @ts-nocheck
import React from 'react';
export default function MaturityLevelsReference({ locale = 'en', t }) {
    const isPtBR = locale === 'pt-BR';

    const levels = [
        {
            level: 1,
            name: t ? t('level1Name') : 'Silver',
            desc: t ? t('level1Desc') : 'Scrum Manager Required',
            border: 'border-[#CBD5E1]',
            bg: 'bg-[#F1F5F9]',
            badge: 'bg-[#94A3B8]',
            badgeText: 'text-gray-900',
            title: 'text-[#334155]',
            subtitle: 'text-[#475569]',
            text: 'text-[#475569]',
            divider: 'border-[#CBD5E1]',
            characteristics: [
                {
                    label: isPtBR ? 'Taxa de Acerto do Sprint' : 'Sprint hit rate',
                    value: '75-80%',
                },
                { label: isPtBR ? 'Rollover' : 'Rollover rate', value: '>25%' },
                { label: isPtBR ? 'Retrabalho QA' : 'QA rework rate', value: '>15%' },
                {
                    label: isPtBR ? 'Prontidao do "To Do"' : '"To Do" Readiness',
                    value: isPtBR ? '<25% prontos' : '<25% ready',
                },
            ],
        },
        {
            level: 2,
            name: t ? t('level2Name') : 'Gold',
            desc: t ? t('level2Desc') : 'Conditional Support',
            border: 'border-[#E8D8A0]',
            bg: 'bg-[#FBF7E8]',
            badge: 'bg-[#D4AF37]',
            badgeText: 'text-gray-900',
            title: 'text-[#7A6214]',
            subtitle: 'text-[#8A6D1B]',
            text: 'text-[#7A6214]',
            divider: 'border-[#E8D8A0]',
            characteristics: [
                {
                    label: isPtBR ? 'Taxa de Acerto do Sprint' : 'Sprint hit rate',
                    value: '80-90%',
                },
                { label: isPtBR ? 'Rollover' : 'Rollover rate', value: '15-25%' },
                { label: isPtBR ? 'Retrabalho QA' : 'QA rework rate', value: '7-15%' },
                {
                    label: isPtBR ? 'Prontidao do "To Do"' : '"To Do" Readiness',
                    value: isPtBR ? '25-75% prontos' : '25-75% ready',
                },
            ],
        },
        {
            level: 3,
            name: t ? t('level3Name') : 'Platinum',
            desc: t ? t('level3Desc') : 'Scrum Manager Optional',
            border: 'border-[#A5DDE5]',
            bg: 'bg-[#E6F7FA]',
            badge: 'bg-[#0EA5B7]',
            badgeText: 'text-white',
            title: 'text-[#0A6E7A]',
            subtitle: 'text-[#0C7C8A]',
            text: 'text-[#0A6E7A]',
            divider: 'border-[#A5DDE5]',
            characteristics: [
                {
                    label: isPtBR ? 'Taxa de Acerto do Sprint' : 'Sprint hit rate',
                    value: '>90%',
                },
                { label: isPtBR ? 'Rollover' : 'Rollover rate', value: '<15%' },
                { label: isPtBR ? 'Retrabalho QA' : 'QA rework rate', value: '<7%' },
                {
                    label: isPtBR ? 'Prontidao do "To Do"' : '"To Do" Readiness',
                    value: isPtBR ? '>75% prontos' : '>75% ready',
                },
            ],
        },
    ];

    const subjectiveMeasures = isPtBR
        ? [
              'Injecoes mid-sprint',
              'Engajamento nas dailies',
              'Rotacao de facilitacao',
              'Sinalizacao proativa de bloqueios',
              'Pull vs push de trabalho',
              'Indicadores de seguranca psicologica',
          ]
        : [
              'Mid-sprint injections',
              'Engagement in standups',
              'Rotation of facilitation',
              'Proactive blocker surfacing',
              'Pull vs push work',
              'Psychological safety indicators',
          ];

    return (
        <div className="card mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">
                {isPtBR ? '📖 Referencia de Niveis de Maturidade' : '📖 Maturity Levels Reference'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {levels.map((l) => (
                    <div key={l.level} className={`border-2 ${l.border} rounded-lg p-4 ${l.bg}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <div
                                className={`w-8 h-8 rounded-full ${l.badge} ${l.badgeText} flex items-center justify-center font-bold`}
                            >
                                {l.level}
                            </div>
                            <div>
                                <div className={`font-bold ${l.title}`}>{l.name}</div>
                                <div className={`text-xs ${l.subtitle}`}>{l.desc}</div>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-sm">
                            {l.characteristics.map((c, idx) => (
                                <div key={idx} className="bg-white bg-opacity-50 rounded p-2">
                                    <span className={`font-semibold ${l.title}`}>{c.label}:</span>{' '}
                                    <span className={l.text}>{c.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Subjective measures (full width) */}
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-sm font-semibold text-gray-800 mb-2">
                    {isPtBR ? 'Medidas Subjetivas' : 'Subjective Measures'}
                </div>
                <div className="text-xs text-gray-600 mb-3">
                    {isPtBR
                        ? 'Sinais qualitativos observados durante cerimonias e o dia-a-dia do time.'
                        : 'Qualitative signals observed during ceremonies and day-to-day team work.'}
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                    {subjectiveMeasures.map((item, idx) => (
                        <li key={idx} className="text-sm text-gray-700 flex items-start gap-1.5">
                            <span className="shrink-0 mt-0.5">•</span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
