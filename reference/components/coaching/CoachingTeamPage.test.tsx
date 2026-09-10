import React from 'react';
import { render, screen } from '@testing-library/react';
import { IndeedThemeProvider } from '@indeed/ifl-components';
import { getA11yHighlanderResults } from '../../util/test-utils';
import CoachingTeamPage from './CoachingTeamPage';

// Chart needs canvas (unavailable in jsdom) and isn't what we assert here.
jest.mock('./MetricTrendChart', () => ({ __esModule: true, default: () => null }));

const board = {
    boardId: 1,
    boardName: 'CES Scrum Board',
    sm: { name: 'Gabriel Aquilano', role: 'scrum_master' },
    agileCoach: 'Gustavo Castellano',
    engagedAt: '2026-04-01T00:00:00Z',
    supportModel: 'monthly',
    coaching: true,
    currentLevel: 2,
    firstLevel: 1,
    levelSince: '2026-03-01T00:00:00Z',
    previousLevel: 1,
    metricTrends: { hitRate: [], rollover: [], rework: [], readiness: [] },
    latestMetrics: { hitRate: 85, rollover: 18, readiness: 50, avgRework: 9.1 },
    behavioral: { pct: 40, label: 'developing', rated: 3, total: 9 },
    experiments: { active: 1, done: 1, dropped: 0 },
    workingOn: ['flow'],
    focus: [{ pillar: 'commitment', text: 'Tighten planning to cut rollover and lift hit rate.' }],
    graduationReady: false,
    status: 'in_coaching',
    graduatedAt: null,
    graduatedThisPeriod: false,
    levelDeltaInPeriod: 1,
};

const noop = () => {};
const renderPage = (over = {}) =>
    render(
        <IndeedThemeProvider>
            <CoachingTeamPage
                board={board}
                mode="view"
                setMode={noop}
                onBack={noop}
                caseDraft={{ mainGap: 'Mid-sprint scope churn' }}
                onCaseSave={noop}
                assessment={{ signals: {}, note: '' }}
                experiments={[]}
                setSignal={noop}
                saveNote={noop}
                addExperiment={noop}
                updateExperiment={noop}
                removeExperiment={noop}
                toggleCoaching={noop}
                detectSm={noop}
                detecting={false}
                detectMsg=""
                hasCredentials={false}
                savedFlash={null}
                {...over}
            />
        </IndeedThemeProvider>
    );

describe('CoachingTeamPage', () => {
    it('renders the team, the coach name, and the QA Rework value (avgRework, 1 decimal)', () => {
        renderPage();
        expect(screen.getByText('CES Scrum Board')).toBeTruthy();
        expect(screen.getByText('QA Rework')).toBeTruthy();
        // avgRework=9.1 must render (was the field-name bug that showed "—")
        expect(screen.getByText(/9\.1%/)).toBeTruthy();
        // level tenure context now lives in the MaturityBadge description
        expect(screen.getByText(/Since /)).toBeTruthy();
    });

    it('shows the coaching narrative read-only in View mode (no inputs)', () => {
        const { container } = renderPage();
        expect(screen.getByText('Mid-sprint scope churn')).toBeTruthy();
        expect(container.querySelectorAll('input').length).toBe(0);
    });

    describe('Accessibility', () => {
        it('should have no accessibility violations', async () => {
            const { container } = renderPage();
            const results = await getA11yHighlanderResults(container);
            expect(results).toHaveNoA11yHighlanderViolations();
        });
    });
});
