// @ts-nocheck
import React from 'react';
import { LEVEL_CHIP_CLASS } from './shared/designTokens';
export default function MaturityBadge({
    level,
    name,
    description,
    annotation = null, // optional node rendered under the description (e.g. level movement)
    size = 'default',
    locale = 'en',
}) {
    // Metallic tier palette: Silver (L1) / Gold (L2) / Platinum (L3).
    // Dark text on the metallic fills for legibility (white fails contrast on silver/gold).
    const config = {
        1: {
            bg: 'bg-[#94A3B8]',
            ring: 'ring-[#CBD5E1]',
            text: 'text-gray-900',
            subtext: 'text-gray-700',
        },
        2: {
            bg: 'bg-[#D4AF37]',
            ring: 'ring-[#EBD98A]',
            text: 'text-gray-900',
            subtext: 'text-gray-700',
        },
        3: {
            bg: 'bg-[#0EA5B7]',
            ring: 'ring-[#A5DDE5]',
            text: 'text-white',
            subtext: 'text-cyan-50',
        },
    };

    const c = config[level] || config[1];
    const levelLabel = locale === 'pt-BR' ? 'Nivel' : 'Level';

    if (size === 'small') {
        return (
            <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${LEVEL_CHIP_CLASS[level] ?? LEVEL_CHIP_CLASS[1]}`}
            >
                {levelLabel} {level}
            </span>
        );
    }

    return (
        <div className="flex items-center gap-5">
            <div
                className={`w-20 h-20 rounded-2xl ${c.bg} ring-4 ${c.ring} flex items-center justify-center shadow-lg`}
            >
                <span className={`text-3xl font-black ${c.text}`}>{level}</span>
            </div>
            <div>
                <div className="text-xl font-bold text-gray-900">{name}</div>
                <div className="text-sm text-gray-500">{description}</div>
                {annotation}
            </div>
        </div>
    );
}
