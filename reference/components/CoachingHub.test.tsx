import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { IndeedThemeProvider } from '@indeed/ifl-components';
import { getA11yHighlanderResults } from '../util/test-utils';

jest.mock('../services/api', () => ({
    __esModule: true,
    default: {
        getCoachingPortfolio: jest.fn(),
        getAssessments: jest.fn(),
        getExperiments: jest.fn(),
        saveBoardManager: jest.fn(),
        saveAssessment: jest.fn(),
        saveExperiment: jest.fn(),
        deleteExperiment: jest.fn(),
        detectScrumManager: jest.fn(),
    },
}));
import api from '../services/api';
import CoachingHub from './CoachingHub';

// Mock the chart (canvas isn't available in jsdom and it isn't what we assert).
jest.mock('./coaching/MetricTrendChart', () => ({
    __esModule: true,
    default: () => null,
}));

const portfolioFixture = {
    success: true,
    dbEnabled: true,
    period: { days: 90, since: '2026-03-01T00:00:00Z' },
    summary: {
        inCoaching: 2,
        atRisk: 1,
        onDemand: 0,
        graduatedThisPeriod: 0,
        bands: { silver: 1, gold: 1, platinum: 0 },
        leveledUp: 0,
    },
    boards: [
        {
            boardId: 1,
            boardName: 'Team Alpha',
            sm: { name: 'Gabriel Aquilano', role: 'scrum_master' },
            agileCoach: 'coach@indeed.com',
            engagedAt: '2026-04-01T00:00:00Z',
            supportModel: 'monthly',
            coaching: true,
            currentLevel: 2,
            firstLevel: 1,
            levelSeries: [{ at: '2026-03-01T00:00:00Z', level: 2 }],
            metricTrends: { hitRate: [], rollover: [], rework: [], readiness: [] },
            latestMetrics: { hitRate: 85, rollover: 18, readiness: 50, avgRework: 10 },
            behavioral: { pct: 40, label: 'developing', rated: 3, total: 9 },
            experiments: { active: 2, done: 1, dropped: 0 },
            focus: [{ pillar: 'commitment', key: 'focus.commitment' }],
            graduationReady: false,
            status: 'in_coaching',
            graduatedAt: null,
            graduatedThisPeriod: false,
            levelDeltaInPeriod: 1,
        },
        {
            boardId: 2,
            boardName: 'Team Beta',
            sm: { name: 'Maricel Luna', role: 'scrum_master' },
            agileCoach: 'coach@indeed.com',
            engagedAt: '2026-04-01T00:00:00Z',
            supportModel: 'bi_weekly',
            coaching: true,
            currentLevel: 1,
            firstLevel: 2,
            levelSeries: [{ at: '2026-03-01T00:00:00Z', level: 1 }],
            metricTrends: { hitRate: [], rollover: [], rework: [], readiness: [] },
            latestMetrics: { hitRate: 70, rollover: 30, readiness: 20, avgRework: 18 },
            behavioral: { pct: null, label: 'not_assessed', rated: 0, total: 9 },
            experiments: { active: 0, done: 0, dropped: 0 },
            focus: [{ pillar: 'commitment', key: 'focus.commitment' }],
            graduationReady: null,
            status: 'at_risk',
            graduatedAt: null,
            graduatedThisPeriod: false,
            levelDeltaInPeriod: -1,
        },
    ],
};

const renderHub = (props = {}) =>
    render(
        <IndeedThemeProvider>
            <CoachingHub credentials={null} {...props} />
        </IndeedThemeProvider>
    );

beforeEach(() => {
    jest.clearAllMocks();
    // Hash routing is global — reset it so one test's navigation doesn't leak.
    window.location.hash = '#coaching-hub';
    (api.getCoachingPortfolio as jest.Mock).mockResolvedValue(portfolioFixture);
    (api.getAssessments as jest.Mock).mockResolvedValue({ assessments: [] });
    (api.getExperiments as jest.Mock).mockResolvedValue({ experiments: [] });
});

describe('CoachingHub', () => {
    it('renders the program header (maturity bar + movement) from the portfolio', async () => {
        renderHub();
        await screen.findAllByText('Team Alpha');
        expect(screen.getByText(/Coaching Program/)).toBeTruthy();
        expect(screen.getByText('Maturity distribution')).toBeTruthy();
        // Movement strip uses lowercase labels, distinct from the section heading.
        expect(screen.getByText('need attention')).toBeTruthy();
        expect(screen.getByText('leveled up')).toBeTruthy();
        // "Needs attention" still appears as a section heading below.
        expect(screen.getAllByText('Needs attention').length).toBeGreaterThan(0);
    });

    it('groups teams into attention-first sections (Silver/at-risk needs attention)', async () => {
        renderHub();
        await screen.findAllByText('Team Alpha');
        // Team Beta is at_risk → Needs attention; Team Alpha is Gold/in_coaching → On track.
        // Section headers are an h2 title + a count chip (dashboard pillar style).
        expect(screen.getByRole('heading', { level: 2, name: 'Needs attention' })).toBeTruthy();
        expect(screen.getByRole('heading', { level: 2, name: 'On track' })).toBeTruthy();
        // Appears in the program-overview tier panel AND on its team card.
        expect(screen.getAllByText('Team Beta').length).toBeGreaterThan(0);
    });

    it('shows the Scrum Manager on each card', async () => {
        renderHub();
        await screen.findAllByText('Team Alpha');
        expect(screen.getByText(/SM Gabriel Aquilano/)).toBeTruthy();
        expect(screen.getByText(/SM Maricel Luna/)).toBeTruthy();
    });

    it('switches to the Leadership summary view', async () => {
        renderHub();
        await screen.findAllByText('Team Alpha');
        fireEvent.click(screen.getByText('Leadership summary'));
        await screen.findByText(/Leadership summary · this quarter/);
        expect(screen.getByText('Copy as text')).toBeTruthy();
    });

    it('opens the Manage teams modal listing all teams', async () => {
        renderHub();
        await screen.findAllByText('Team Alpha');
        fireEvent.click(screen.getByText('Manage teams'));
        expect(screen.getByText('Teams in the coaching program')).toBeTruthy();
    });

    it('does not detect SMs from Jira on load (no live calls)', async () => {
        renderHub();
        await waitFor(() => expect(api.getCoachingPortfolio).toHaveBeenCalled());
        expect(api.detectScrumManager).not.toHaveBeenCalled();
    });

    describe('Accessibility', () => {
        it('should have no accessibility violations', async () => {
            const { container } = renderHub();
            await screen.findAllByText('Team Alpha');
            const results = await getA11yHighlanderResults(container);
            expect(results).toHaveNoA11yHighlanderViolations();
        });
    });
});
