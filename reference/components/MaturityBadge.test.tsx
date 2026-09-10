import React from 'react';
import { render, screen } from '@testing-library/react';
import MaturityBadge from './MaturityBadge';
import { getA11yHighlanderResults } from '../util/test-utils';

describe('MaturityBadge', () => {
    it('renders the full badge with level, name and description', () => {
        render(<MaturityBadge level={2} name="Gold" description="Conditional Support" />);
        expect(screen.getByText('2')).toBeTruthy();
        expect(screen.getByText('Gold')).toBeTruthy();
        expect(screen.getByText('Conditional Support')).toBeTruthy();
    });

    it('renders the compact "Level N" pill in small size', () => {
        render(<MaturityBadge level={3} name="Platinum" description="x" size="small" />);
        expect(screen.getByText('Level 3')).toBeTruthy();
    });

    it('localizes the small label to pt-BR', () => {
        render(
            <MaturityBadge level={1} name="Silver" description="x" size="small" locale="pt-BR" />
        );
        expect(screen.getByText('Nivel 1')).toBeTruthy();
    });

    it('falls back to level 1 styling for an unknown level', () => {
        // should not throw and still renders the number
        render(<MaturityBadge level={99} name="Mystery" description="x" />);
        expect(screen.getByText('99')).toBeTruthy();
    });

    it('has no accessibility violations', async () => {
        const { container } = render(
            <MaturityBadge level={2} name="Gold" description="Conditional Support" />
        );
        const results = await getA11yHighlanderResults(container);
        expect(results).toHaveNoA11yHighlanderViolations();
    });
});
