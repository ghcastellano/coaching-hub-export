import React from 'react';
import { render, screen } from '@testing-library/react';
import SprintMaturityBarChart from './SprintMaturityBarChart';
import type { RecentSprint } from '../coaching/portfolio';

jest.mock('react-chartjs-2', () => ({
    Bar: ({ data }: any) => (
        <canvas data-testid="bar-chart" data-labels={JSON.stringify(data.labels)} />
    ),
}));

const sprint = (
    name: string,
    level: 1 | 2 | 3,
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

describe('SprintMaturityBarChart', () => {
    it('renders nothing when sprints array is empty', () => {
        const { container } = render(<SprintMaturityBarChart sprints={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders chart with a single sprint', () => {
        render(<SprintMaturityBarChart sprints={[sprint('SEG-S16', 2)]} />);
        expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });

    it('renders chart with multiple sprints', () => {
        render(
            <SprintMaturityBarChart
                sprints={[sprint('SEG-S14', 1), sprint('SEG-S15', 2), sprint('SEG-S16', 3)]}
            />
        );
        expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });

    it('shows the default title "Maturity by sprint"', () => {
        render(<SprintMaturityBarChart sprints={[sprint('SEG-S16', 2)]} />);
        expect(screen.getByText('Maturity by sprint')).toBeTruthy();
    });

    it('shows a custom title when provided', () => {
        render(<SprintMaturityBarChart sprints={[sprint('SEG-S16', 2)]} title="My custom title" />);
        expect(screen.getByText('My custom title')).toBeTruthy();
    });

    it('renders subtitle when provided', () => {
        render(
            <SprintMaturityBarChart
                sprints={[sprint('SEG-S16', 2)]}
                subtitle="By hit rate and rollover"
            />
        );
        expect(screen.getByText('By hit rate and rollover')).toBeTruthy();
    });

    it('does not render subtitle when not provided', () => {
        render(<SprintMaturityBarChart sprints={[sprint('SEG-S16', 2)]} />);
        expect(screen.queryByText(/By hit rate/)).toBeNull();
    });
});
