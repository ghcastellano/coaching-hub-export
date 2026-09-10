import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import type { ChartOptions, Plugin, TooltipItem } from 'chart.js';
import type { RecentSprint } from '../coaching/portfolio';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export const LEVEL_NAME = ['', 'Silver', 'Gold', 'Platinum'];
export const LEVEL_COLOR = [
    '',
    'rgb(148, 163, 184)', // Silver
    'rgb(212, 175, 55)', // Gold
    'rgb(14, 165, 183)', // Platinum
];

// Darker tier tones for canvas TEXT — the bar fill colors are too light for
// crisp 10px type (they read as blurry).
const LEVEL_LABEL_COLOR = ['', '#475569', '#7A6214', '#0A6E7A'];

export const shortBarLabel = (name: string): string => {
    const m = name.match(/.*?([A-Z]+-\s*S\d+)/i);
    if (m) return m[1];
    return name;
};

interface Props {
    sprints: RecentSprint[];
    title?: string;
    subtitle?: string;
    height?: string;
    rotateLabels?: boolean;
}

export default function SprintMaturityBarChart({
    sprints,
    title = 'Maturity by sprint',
    subtitle,
    height = 'h-36',
    rotateLabels = false,
}: Props) {
    if (!sprints || sprints.length === 0) return null;

    const labels = sprints.map((s) => shortBarLabel(s.sprintName));
    const levels = sprints.map((s) => s.level);
    const colors = levels.map((l) => LEVEL_COLOR[l] ?? LEVEL_COLOR[1]);

    // Draw level names above each bar using a local canvas plugin.
    // Reads from chart.data (live) instead of closure to avoid stale-closure bugs
    // when the chart reuses the plugin instance across renders.
    const levelLabelsPlugin: Plugin<'bar'> = {
        id: 'levelLabels',
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);
            ctx.save();
            ctx.font = '600 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            meta.data.forEach((bar, i) => {
                const level = dataset.data[i] as number;
                const label = LEVEL_NAME[level] ?? '';
                if (!label) return;
                ctx.fillStyle = LEVEL_LABEL_COLOR[level] ?? '#64748b';
                // Integer pixel coords — fractional positions anti-alias the
                // glyphs and make 10px text look blurry.
                ctx.fillText(label, Math.round(bar.x), Math.round(bar.y - 3));
            });
            ctx.restore();
        },
    };

    const data = {
        labels,
        datasets: [
            {
                data: levels,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
            },
        ],
    };

    const options: ChartOptions<'bar'> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 20 } },
        plugins: {
            legend: { display: false },
            datalabels: { display: false },
            tooltip: {
                callbacks: {
                    label: (item: TooltipItem<'bar'>) => {
                        const s = sprints[item.dataIndex];
                        const lvlName = LEVEL_NAME[item.raw as number] ?? '';
                        return [
                            lvlName,
                            `Hit Rate: ${s.hitRate.toFixed(1)}%`,
                            `Rollover: ${s.rollover.toFixed(1)}%`,
                            `QA Rework: ${s.rework.toFixed(1)}%`,
                        ];
                    },
                    title: (items: TooltipItem<'bar'>[]) =>
                        sprints[items[0].dataIndex]?.sprintName ?? '',
                },
            },
        },
        scales: {
            y: {
                min: 0,
                max: 3,
                ticks: {
                    stepSize: 1,
                    callback: (v) => (Number(v) >= 1 && Number(v) <= 3 ? `L${v}` : ''),
                    font: { size: 10 },
                },
                grid: { color: 'rgba(0,0,0,0.05)' },
            },
            x: {
                ticks: {
                    font: { size: 10 },
                    maxRotation: rotateLabels ? 45 : 0,
                },
                grid: { display: false },
            },
        },
    };

    return (
        <div>
            {title && <div className="mb-1 text-xs font-semibold text-gray-600">{title}</div>}
            {subtitle && <div className="text-xs text-gray-400 mb-2">{subtitle}</div>}
            <div className={height}>
                <Bar data={data} options={options} plugins={[levelLabelsPlugin]} />
            </div>
        </div>
    );
}
