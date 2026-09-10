import React from 'react';
import { render, screen } from '@testing-library/react';
import MetricTrendLineChart from './MetricTrendLineChart';
import type { RecentSprint } from '../coaching/portfolio';

jest.mock('react-chartjs-2', () => ({
    Line: ({ data }: any) => (
        <canvas data-testid="line-chart" data-labels={JSON.stringify(data.labels)} />
    ),
}));

const sprint = (
    name: string,
    level: 1 | 2 | 3 = 2,
    hitRate = 80,
    rollover = 10,
    rework = 5
): RecentSprint => ({
    sprintName: name,
    level,
    hitRate,
    rollover,
    rework,
});

describe('MetricTrendLineChart', () => {
    it('renders nothing when sprints array is empty', () => {
        const { container } = render(<MetricTrendLineChart sprints={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing with only 1 sprint (no trend possible)', () => {
        const { container } = render(<MetricTrendLineChart sprints={[sprint('SEG-S16')]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders chart with exactly 2 sprints', () => {
        render(<MetricTrendLineChart sprints={[sprint('SEG-S15'), sprint('SEG-S16')]} />);
        expect(screen.getByTestId('line-chart')).toBeTruthy();
    });

    it('renders chart with 3 or more sprints', () => {
        render(
            <MetricTrendLineChart
                sprints={[sprint('SEG-S14'), sprint('SEG-S15'), sprint('SEG-S16')]}
            />
        );
        expect(screen.getByTestId('line-chart')).toBeTruthy();
    });

    it('shows the default title "Metrics by sprint"', () => {
        render(<MetricTrendLineChart sprints={[sprint('SEG-S15'), sprint('SEG-S16')]} />);
        expect(screen.getByText('Metrics by sprint')).toBeTruthy();
    });

    it('shows a custom title when provided', () => {
        render(
            <MetricTrendLineChart
                sprints={[sprint('SEG-S15'), sprint('SEG-S16')]}
                title="Trend view"
            />
        );
        expect(screen.getByText('Trend view')).toBeTruthy();
    });

    it('does not truncate long non-board-code sprint names', () => {
        const longName = 'CES - Sprint 3.19.26';
        render(
            <MetricTrendLineChart sprints={[sprint('CES - Sprint 3.5.26'), sprint(longName)]} />
        );
        expect(screen.getByTestId('line-chart')).toBeTruthy();
        const canvas = screen.getByTestId('line-chart');
        const labels = JSON.parse(canvas.getAttribute('data-labels') ?? '[]');
        expect(labels).toContain(longName);
    });
});
