// Thin adapter — forwards board.recentSprints to the shared line chart.
import React from 'react';
import MetricTrendLineChart from '../shared/MetricTrendLineChart';
import type { PortfolioBoard } from './portfolio';

export default function MetricTrendChart({ board }: { board: PortfolioBoard }) {
    return <MetricTrendLineChart sprints={board.recentSprints ?? []} />;
}
