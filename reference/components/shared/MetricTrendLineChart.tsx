import React from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
} from 'chart.js';
import type { ChartOptions, TooltipItem } from 'chart.js';
import type { RecentSprint } from '../coaching/portfolio';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export const shortLineLabel = (name: string): string => {
    if (!name) return '—';
    // "[5/12 - 5/26] SEG-S16" → "SEG-S16" (board-code style only)
    const m = name.match(/\]\s*([A-Za-z][A-Za-z0-9-]*S?\d+)/i);
    if (m) return m[1].trim();
    return name;
};

const SERIES: { key: keyof RecentSprint; label: string; color: string }[] = [
    { key: 'hitRate', label: 'Hit Rate', color: '#2563EB' },
    { key: 'rollover', label: 'Rollover', color: '#DC2626' },
    { key: 'rework', label: 'QA Rework', color: '#D97706' },
];

interface Props {
    sprints: RecentSprint[];
    title?: string;
    height?: string;
}

export default function MetricTrendLineChart({
    sprints,
    title = 'Metrics by sprint',
    height = 'h-44',
}: Props) {
    if (!sprints || sprints.length < 2) return null;

    const labels = sprints.map((s) => shortLineLabel(s.sprintName));

    const data = {
        labels,
        datasets: SERIES.map((s) => ({
            label: s.label,
            data: sprints.map((sp) => sp[s.key] as number),
            borderColor: s.color,
            backgroundColor: s.color,
            tension: 0.3,
            pointRadius: 3,
            borderWidth: 2,
        })),
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                position: 'bottom',
                labels: { boxWidth: 12, font: { size: 11 } },
            },
            tooltip: {
                callbacks: {
                    label: (c: TooltipItem<'line'>) =>
                        `${c.dataset.label}: ${(c.parsed.y as number).toFixed(1)}%`,
                },
            },
            datalabels: { display: false },
        },
        scales: {
            y: {
                min: 0,
                max: 100,
                ticks: {
                    callback: (v) => `${v}%`,
                    font: { size: 10 },
                },
            },
            x: { ticks: { font: { size: 10 }, autoSkip: false, maxRotation: 0 } },
        },
    };

    return (
        <div>
            {title && <div className="mb-1 text-xs font-semibold text-gray-600">{title}</div>}
            <div className={height}>
                <Line data={data} options={options} aria-label={title} />
            </div>
        </div>
    );
}
