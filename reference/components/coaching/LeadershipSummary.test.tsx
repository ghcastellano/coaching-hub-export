import React from 'react';
import { render, screen } from '@testing-library/react';
import { IndeedThemeProvider } from '@indeed/ifl-components';
import { getA11yHighlanderResults } from '../../util/test-utils';
import LeadershipSummary from './LeadershipSummary';

const board = (over = {}) => ({
    boardId: 1,
    boardName: 'Team',
    status: 'in_coaching',
    currentLevel: 2,
    firstLevel: 1,
    graduatedThisPeriod: false,
    levelDeltaInPeriod: 0,
    leveledUpThisPeriod: false,
    focus: [{ pillar: 'commitment', key: 'focus.commitment' }],
    coachingCase: null,
    ...over,
});

const renderSummary = (boards: any[]) =>
    render(
        <IndeedThemeProvider>
            <LeadershipSummary boards={boards} />
        </IndeedThemeProvider>
    );

describe('LeadershipSummary', () => {
    it('computes wins, needs-attention, and asks from the portfolio', () => {
        renderSummary([
            board({
                boardId: 1,
                boardName: 'Graduated Team',
                status: 'on_demand',
                currentLevel: 3,
                graduatedThisPeriod: true,
            }),
            board({ boardId: 2, boardName: 'Risky Team', status: 'at_risk', currentLevel: 1 }),
            board({
                boardId: 3,
                boardName: 'Asking Team',
                status: 'in_coaching',
                coachingCase: { supportNeeded: 'Protect PO refinement time' },
            }),
            // out-of-program board must be ignored
            board({ boardId: 4, boardName: 'Hidden', status: null }),
        ]);

        expect(screen.getByText(/Graduated Team graduated to Platinum/)).toBeTruthy();
        expect(screen.getByText(/Risky Team regressing/)).toBeTruthy();
        expect(screen.getByText(/Asking Team: Protect PO refinement time/)).toBeTruthy();
        expect(screen.getByText('Copy as text')).toBeTruthy();
        // the hidden (out-of-program) board never appears
        expect(screen.queryByText(/Hidden/)).toBeNull();
    });

    it('shows empty-state copy when there is nothing to report', () => {
        renderSummary([board({ status: 'on_demand', currentLevel: 3 })]);
        expect(screen.getByText('No level movement yet this quarter.')).toBeTruthy();
        expect(screen.getByText('No open asks.')).toBeTruthy();
    });

    describe('Accessibility', () => {
        it('should have no accessibility violations', async () => {
            const { container } = renderSummary([board({ status: 'at_risk', currentLevel: 1 })]);
            const results = await getA11yHighlanderResults(container);
            expect(results).toHaveNoA11yHighlanderViolations();
        });
    });
});
