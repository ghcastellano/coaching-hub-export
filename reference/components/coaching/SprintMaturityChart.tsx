import React from 'react';
import SprintMaturityBarChart from '../shared/SprintMaturityBarChart';
import type { RecentSprint } from './portfolio';

interface Props {
    sprints: RecentSprint[];
}

export default function SprintMaturityChart({ sprints }: Props) {
    return <SprintMaturityBarChart sprints={sprints} />;
}
