import type {
    IA11yHighlanderRequestOptions,
    IA11yHighlanderResponse,
} from '@indeed/a11y-highlander-types';

import { getA11yHighlanderResults as getA11yHighlanderResultsFromLibrary } from '@indeed/a11y-highlander-jest';
import '@indeed/a11y-highlander-jest/extend-expect';

export const getA11yHighlanderResults = (
    html: HTMLElement,
    options: IA11yHighlanderRequestOptions = {}
): Promise<IA11yHighlanderResponse> => {
    return getA11yHighlanderResultsFromLibrary(
        html,
        { name: 'BACKSTAGE-JIRA' }, // @TODO: use your apps' associated JIRA project key },
        { ...options }
    );
};
