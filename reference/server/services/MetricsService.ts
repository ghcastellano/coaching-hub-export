/* eslint-disable */
// Metrics service ported from Vercel server/src/services/metricsService.js.
// Preserves EXACT algorithm/thresholds — screens must match Vercel output.
// Types are intentionally loose (any) — speed over type purity.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { determineMaturityLevel as classifyMaturity } from '../../util/maturity';

const parseISO = (s: string): Date => new Date(s);
const differenceInHours = (a: Date, b: Date): number =>
    (a.getTime() - b.getTime()) / (1000 * 60 * 60);
const differenceInDays = (a: Date, b: Date): number =>
    (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);

export class MetricsService {
    storyPointsField: string = 'customfield_10061';
    private _loggedStatuses = false;

    setStoryPointsField(fieldId: string): void {
        if (fieldId) {
            this.storyPointsField = fieldId;
        }
    }

    static ROLLOVER_LABELS: string[] = [
        'external-blockers',
        'late-discovery',
        'resource-constraints',
        'internal-blockers',
        'req-gap',
        'dev-qa-spill',
    ];

    static ROLLOVER_LABEL_NAMES: Record<string, string> = {
        'external-blockers': 'External Blockers',
        'late-discovery': 'Late Discovery',
        'resource-constraints': 'Resource Constraints',
        'internal-blockers': 'Internal Blockers',
        'req-gap': 'Requirement Gap',
        'dev-qa-spill': 'Dev/QA Spill',
    };

    static buildStatusCategoryMap(issues: any[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const issue of issues) {
            const statusName = issue.fields?.status?.name;
            const category = issue.fields?.status?.statusCategory?.key;
            if (statusName && category) map.set(statusName, category);
        }
        return map;
    }

    static wasCompletedAtTime(
        issue: any,
        targetDate: Date | null,
        statusCategoryMap: Map<string, string>
    ): boolean {
        if (issue._completedInSprintReport !== undefined) {
            return issue._completedInSprintReport;
        }

        if (!targetDate || isNaN(targetDate.getTime())) {
            return issue.fields?.status?.statusCategory?.key === 'done';
        }

        if (!issue.changelog) {
            const statusDone = issue.fields?.status?.statusCategory?.key === 'done';
            const resolutionDate = issue.fields?.resolutiondate
                ? new Date(issue.fields.resolutiondate)
                : null;
            return statusDone && !!(resolutionDate && resolutionDate <= targetDate);
        }

        const histories = issue.changelog?.histories || [];
        const sorted = [...histories].sort(
            (a: any, b: any) => new Date(a.created).getTime() - new Date(b.created).getTime()
        );

        let statusAtTime: string | null = null;
        for (const history of sorted) {
            if (new Date(history.created) > targetDate) break;
            for (const item of history.items) {
                if (item.field === 'status') statusAtTime = item.toString;
            }
        }

        if (statusAtTime === null) {
            for (const history of sorted) {
                for (const item of history.items) {
                    if (item.field === 'status') {
                        statusAtTime = item.fromString;
                        break;
                    }
                }
                if (statusAtTime !== null) break;
            }
        }

        if (statusAtTime === null) {
            return issue.fields?.status?.statusCategory?.key === 'done';
        }

        const category = statusCategoryMap.get(statusAtTime);
        if (category) return category === 'done';

        const lower = statusAtTime.toLowerCase();
        return ['done', 'closed', 'resolved', 'complete', 'completed'].some((s) =>
            lower.includes(s)
        );
    }

    calculateSprintGoalAttainment(
        sprint: any,
        issues: any[]
    ): { percentage: number; committedPoints: number; completedPoints: number } {
        const storyPointsField = this.storyPointsField;
        const sprintEnd = new Date(sprint.completeDate || sprint.endDate);
        const statusCategoryMap = MetricsService.buildStatusCategoryMap(issues);

        let committedPoints = 0;
        let completedPoints = 0;

        issues.forEach((issue) => {
            if (issue.fields.issuetype?.subtask) return;
            const points = issue.fields[storyPointsField] || 0;
            if (points > 0) {
                committedPoints += points;
                if (MetricsService.wasCompletedAtTime(issue, sprintEnd, statusCategoryMap)) {
                    completedPoints += points;
                }
            }
        });

        return {
            percentage: committedPoints > 0 ? (completedPoints / committedPoints) * 100 : 0,
            committedPoints,
            completedPoints,
        };
    }

    calculateRolloverRate(
        sprintIssues: any[],
        nextSprintIssues: any[] | undefined,
        sprintName: string = '',
        sprint: any = null
    ): { rate: number; issues: any[]; reasonBreakdown: Record<string, number> } {
        if (!nextSprintIssues || nextSprintIssues.length === 0) {
            return { rate: 0, issues: [], reasonBreakdown: {} };
        }

        const parentIssues = sprintIssues.filter((i) => !i.fields?.issuetype?.subtask);
        const parentNextIssues = nextSprintIssues.filter((i) => !i.fields?.issuetype?.subtask);

        const currentSprintKeys = new Set(parentIssues.map((i) => i.key));
        const candidateIssues = parentNextIssues.filter((issue) =>
            currentSprintKeys.has(issue.key)
        );

        const statusCategoryMap = MetricsService.buildStatusCategoryMap(sprintIssues);
        const sprintEnd = sprint ? new Date(sprint.completeDate || sprint.endDate) : null;

        const reasonBreakdown: Record<string, number> = {};
        const issueDetails: any[] = [];

        for (const issue of candidateIssues) {
            const originalIssue = parentIssues.find((i) => i.key === issue.key) || issue;

            if (MetricsService.wasCompletedAtTime(originalIssue, sprintEnd, statusCategoryMap)) {
                continue;
            }

            const allLabels = issue.fields?.labels || [];
            const rolloverReasons = allLabels.filter((l: string) =>
                MetricsService.ROLLOVER_LABELS.includes(l)
            );
            for (const reason of rolloverReasons) {
                reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
            }

            let addedMidSprint = originalIssue._addedMidSprint === true;
            if (!addedMidSprint && sprint?.startDate) {
                const createdStr = originalIssue.fields?.created;
                if (createdStr) {
                    addedMidSprint = new Date(createdStr) > new Date(sprint.startDate);
                }
            }

            issueDetails.push({
                key: issue.key,
                summary: issue.fields?.summary || '',
                status: issue.fields?.status?.name || 'unknown',
                type: issue.fields?.issuetype?.name || 'unknown',
                reasons: rolloverReasons,
                addedMidSprint,
            });
        }

        const rate =
            parentIssues.length > 0 ? (issueDetails.length / parentIssues.length) * 100 : 0;
        return { rate, issues: issueDetails, reasonBreakdown };
    }

    calculateSprintHitRate(issues: any[], sprintEndDate: string | null = null): number {
        const parentIssues = issues.filter((i) => !i.fields.issuetype?.subtask);
        const total = parentIssues.length;
        const sprintEnd = sprintEndDate ? new Date(sprintEndDate) : null;
        const statusCategoryMap = MetricsService.buildStatusCategoryMap(issues);
        const completed = parentIssues.filter((i) =>
            MetricsService.wasCompletedAtTime(i, sprintEnd, statusCategoryMap)
        ).length;
        return total > 0 ? (completed / total) * 100 : 0;
    }

    calculateMidSprintAdditions(
        issues: any[],
        sprintStartDate: string
    ): {
        count: number;
        percentage: number;
        issues: any[];
    } {
        const sprintStart = parseISO(sprintStartDate);
        const parentIssues = issues.filter((i) => !i.fields.issuetype?.subtask);

        const addedDuringSprint = parentIssues.filter((issue) => {
            const created = parseISO(issue.fields.created);
            return created > sprintStart;
        });

        const issueDetails = addedDuringSprint.map((issue) => ({
            key: issue.key,
            summary: issue.fields?.summary || '',
            status: issue.fields?.status?.name || 'unknown',
            type: issue.fields?.issuetype?.name || 'unknown',
            created: issue.fields.created,
        }));

        return {
            count: addedDuringSprint.length,
            percentage:
                parentIssues.length > 0
                    ? (addedDuringSprint.length / parentIssues.length) * 100
                    : 0,
            issues: issueDetails,
        };
    }

    calculateCycleTime(issue: any, changelog: any[]): number | null {
        let startTime: Date | null = null;
        let endTime: Date | null = null;

        if (!this._loggedStatuses) {
            this._loggedStatuses = true;
        }

        for (const change of changelog) {
            for (const item of change.items) {
                if (item.field === 'Sprint' && item.toString && !item.fromString) {
                    startTime = parseISO(change.created);
                    break;
                }
                if (item.field === 'Sprint' && item.toString) {
                    if (!startTime) startTime = parseISO(change.created);
                }
            }
            if (startTime) break;
        }

        if (!startTime) {
            const inProgressNames = ['in progress', 'development', 'doing'];
            for (const change of changelog) {
                for (const item of change.items) {
                    if (item.field === 'status') {
                        const statusLower = (item.toString || '').toLowerCase();
                        if (inProgressNames.some((s) => statusLower.includes(s))) {
                            startTime = parseISO(change.created);
                            break;
                        }
                    }
                }
                if (startTime) break;
            }
        }

        const doneNames = ['closed', 'done', 'resolved', 'complete', 'completed'];
        if (startTime) {
            for (const change of changelog) {
                const changeDate = parseISO(change.created);
                if (changeDate < startTime) continue;
                for (const item of change.items) {
                    if (item.field === 'status') {
                        const statusLower = (item.toString || '').toLowerCase();
                        if (doneNames.some((s) => statusLower.includes(s))) {
                            endTime = changeDate;
                            break;
                        }
                    }
                }
                if (endTime) break;
            }
        }

        if (startTime && endTime) {
            return differenceInHours(endTime, startTime) / 24;
        }
        return null;
    }

    calculateLeadTime(issue: any): number | null {
        if (issue.fields.resolutiondate) {
            const created = parseISO(issue.fields.created);
            const resolved = parseISO(issue.fields.resolutiondate);
            return differenceInHours(resolved, created) / 24;
        }
        return null;
    }

    calculateBacklogHealth(issues: any[]): {
        withAcceptanceCriteria: number;
        withEstimates: number;
        overallScore: number;
        missingAC: any[];
        missingEstimates: any[];
        totalItems: number;
        futureSprintItems?: any;
    } {
        const parentIssues = issues.filter((i) => !i.fields?.issuetype?.subtask);

        // Use Jira's statusCategory instead of matching status names.
        // Every Jira status maps to one of 3 canonical categories regardless of
        // how the team named it: "new" (To Do), "indeterminate" (In Progress),
        // "done" (Done). This works for any workflow without hardcoding names.
        //
        // Fallback to a name-based negative filter when statusCategory is absent
        // (e.g. older Jira versions or boards where the field wasn't fetched).
        const IN_FLIGHT_OR_DONE_KEYWORDS = [
            'in progress', 'in review', 'in development', 'in testing', 'in qa',
            'done', 'closed', 'resolved', 'released', 'deployed', 'complete',
            'cancelled', 'canceled', "won't do", 'wont do', 'duplicate',
        ];

        const backlogIssues = parentIssues.filter((i) => {
            const categoryKey = i.fields?.status?.statusCategory?.key;
            if (categoryKey) {
                // "new" = To Do category in Jira's model
                return categoryKey === 'new';
            }
            // Fallback: exclude statuses that are clearly in-flight or done
            const s = (i.fields?.status?.name || '').toLowerCase();
            return !IN_FLIGHT_OR_DONE_KEYWORDS.some((x) => s.includes(x));
        });

        let withAcceptanceCriteria = 0;
        let withEstimates = 0;
        const storyPointsField = this.storyPointsField;
        const missingAC: any[] = [];
        const missingEstimates: any[] = [];

        const makeDetail = (issue: any) => ({
            key: issue.key,
            summary: issue.fields?.summary || '',
            type: issue.fields?.issuetype?.name || 'unknown',
            status: issue.fields?.status?.name || 'unknown',
        });

        const acHeadingPatterns = [
            /acceptance\s*criteria\s*[:;\-\n]?\s*([\s\S]{20,})/i,
            /\bAC\b\s*[:;\-\n]\s*([\s\S]{20,})/,
            /\bacc\s*criteria\s*[:;\-\n]?\s*([\s\S]{20,})/i,
            /\bDoD\b\s*[:;\-\n]\s*([\s\S]{20,})/,
            /\bdefinition\s*of\s*done\s*[:;\-\n]?\s*([\s\S]{20,})/i,
        ];
        const acContentPatterns = [
            /\bgiven\b[\s\S]{5,}\bwhen\b[\s\S]{5,}\bthen\b/i,
            /\bexpected\s*result[\s\S]{10,}/i,
            /\bexpected\s*outcome[\s\S]{10,}/i,
            /\bexpected\s*behavio\w*[\s\S]{10,}/i,
        ];

        const hasAcceptanceCriteria = (description: any): boolean => {
            if (!description) return false;
            let textContent: string =
                typeof description === 'object' ? JSON.stringify(description) : String(description);
            if (acHeadingPatterns.some((p) => p.test(textContent))) return true;
            if (acContentPatterns.some((p) => p.test(textContent))) return true;
            return false;
        };

        backlogIssues.forEach((issue) => {
            const desc = issue.fields.description;
            const descText = typeof desc === 'object' ? JSON.stringify(desc) : desc;
            if (hasAcceptanceCriteria(descText)) {
                withAcceptanceCriteria++;
            } else {
                missingAC.push(makeDetail(issue));
            }
            // Valor numérico (inclusive 0 explícito) conta como estimado;
            // só campo vazio (null/undefined) é "missing estimate".
            if (typeof issue.fields[storyPointsField] === 'number') {
                withEstimates++;
            } else {
                missingEstimates.push(makeDetail(issue));
            }
        });

        const total = backlogIssues.length;
        if (total === 0) {
            return {
                withAcceptanceCriteria: 0,
                withEstimates: 0,
                overallScore: 0,
                missingAC: [],
                missingEstimates: [],
                totalItems: 0,
            };
        }

        return {
            withAcceptanceCriteria: (withAcceptanceCriteria / total) * 100,
            withEstimates: (withEstimates / total) * 100,
            overallScore: ((withAcceptanceCriteria + withEstimates) / (total * 2)) * 100,
            missingAC,
            missingEstimates,
            totalItems: total,
        };
    }

    calculateDefectDistribution(issues: any[]): {
        preMerge: number;
        inQA: number;
        postRelease: number;
        total: number;
    } {
        const bugs = issues.filter(
            (i) => i.fields.issuetype?.name === 'Bug' && !i.fields.issuetype?.subtask
        );
        let preMerge = 0;
        let inQA = 0;
        let postRelease = 0;
        bugs.forEach((bug) => {
            const labels = bug.fields.labels || [];
            if (labels.includes('pre-merge') || labels.includes('code-review')) preMerge++;
            else if (labels.includes('qa') || labels.includes('testing')) inQA++;
            else postRelease++;
        });
        return { preMerge, inQA, postRelease, total: bugs.length };
    }

    calculateWIPAging(issues: any[], changelog: Record<string, any[]>): any[] {
        const wipIssues = issues.filter(
            (i) =>
                !i.fields.issuetype?.subtask &&
                i.fields.status?.statusCategory?.key === 'indeterminate'
        );
        return wipIssues.map((issue) => {
            let inProgressDate: Date | null = null;
            const issueChangelog = changelog[issue.key] || [];
            for (const change of issueChangelog) {
                for (const item of change.items) {
                    if (item.field === 'status' && item.toString === 'In Progress') {
                        inProgressDate = parseISO(change.created);
                        break;
                    }
                }
                if (inProgressDate) break;
            }
            const startDate = inProgressDate || parseISO(issue.fields.created);
            const daysInProgress = Math.floor(differenceInDays(new Date(), startDate));
            return {
                key: issue.key,
                summary: issue.fields.summary,
                daysInProgress,
            };
        });
    }

    // Delegates to the shared util so server, Dashboard and Coaching Hub all
    // classify through ONE 4-variable weakest-link model (hit rate, rollover,
    // QA rework, backlog readiness). The call site already passes all four.
    determineMaturityLevel(metrics: {
        rolloverRate?: number;
        sprintHitRate?: number;
        qaReworkRate?: number;
        sprintGoalAttainment?: number;
        backlogHealth?: { overallScore?: number };
        midSprintAdditions?: number;
    }): any {
        const {
            rolloverRate = 0,
            sprintHitRate,
            qaReworkRate,
            backlogHealth = { overallScore: 0 },
        } = metrics || {};
        return classifyMaturity({
            rolloverRatePct: rolloverRate,
            backlogReadinessPct: backlogHealth?.overallScore ?? 0,
            sprintHitRatePct: sprintHitRate,
            qaReworkRatePct: qaReworkRate,
        });
    }

    calculateFlowQuality(
        sprintIssuesMap: Map<number, any[]>,
        sprintMetrics: any[],
        recentSprints: any[]
    ): any {
        const allIssuesMap = new Map<string, any>();
        const sprintIssuesBySprintId = new Map<number, any[]>();

        for (const sprint of recentSprints) {
            const issues = sprintIssuesMap.get(sprint.id) || [];
            const parentIssues = issues.filter((i: any) => !i.fields.issuetype?.subtask);
            sprintIssuesBySprintId.set(sprint.id, parentIssues);
            for (const issue of parentIssues) allIssuesMap.set(issue.key, issue);
        }

        const isExcludedType = (t: string) => t.toLowerCase() === 'task';
        const cycleTimeByType: Record<string, number[]> = {};
        const cycleTimeItems: Record<string, any[]> = {};

        for (const issue of allIssuesMap.values()) {
            const type = issue.fields.issuetype?.name || 'Other';
            if (isExcludedType(type)) continue;
            const histories = issue.changelog?.histories || [];
            const ct = histories.length > 0 ? this.calculateCycleTime(issue, histories) : null;
            if (ct === null || ct <= 0) continue;
            if (!cycleTimeByType[type]) {
                cycleTimeByType[type] = [];
                cycleTimeItems[type] = [];
            }
            cycleTimeByType[type].push(ct);
            cycleTimeItems[type].push({ key: issue.key, days: ct });
        }

        const leadTimeAvgByType: Record<string, number> = {};
        for (const [type, times] of Object.entries(cycleTimeByType)) {
            leadTimeAvgByType[type] =
                times.length > 0
                    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
                    : 0;
        }

        const leadTimeByTypeBySprint = recentSprints.map((sprint) => {
            const issues = sprintIssuesBySprintId.get(sprint.id) || [];
            const byType: Record<string, number[]> = {};
            for (const issue of issues) {
                const type = issue.fields.issuetype?.name || 'Other';
                if (isExcludedType(type)) continue;
                const histories = issue.changelog?.histories || [];
                const ct = histories.length > 0 ? this.calculateCycleTime(issue, histories) : null;
                if (ct === null || ct <= 0) continue;
                if (!byType[type]) byType[type] = [];
                byType[type].push(ct);
            }
            const avgs: Record<string, number> = {};
            for (const [type, times] of Object.entries(byType)) {
                avgs[type] =
                    Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
            }
            return { sprint: sprint.name, ...avgs };
        });

        const lastSprint = recentSprints[recentSprints.length - 1];
        const lastSprintIssues = lastSprint ? sprintIssuesBySprintId.get(lastSprint.id) || [] : [];
        const wipAging = lastSprintIssues
            .filter((i: any) => i.fields.status?.statusCategory?.key === 'indeterminate')
            .map((issue: any) => {
                const created = new Date(issue.fields.created);
                const daysInProgress = Math.round(
                    (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
                );
                return {
                    key: issue.key,
                    summary: issue.fields.summary,
                    type: issue.fields.issuetype?.name || 'Unknown',
                    daysInProgress,
                    assignee: issue.fields.assignee?.displayName || 'Unassigned',
                    status: issue.fields.status?.name || 'Unknown',
                };
            })
            .sort((a: any, b: any) => b.daysInProgress - a.daysInProgress);

        const totalDefects = { preMerge: 0, inQA: 0, postRelease: 0, total: 0 };
        const defectsBySprint = sprintMetrics.map((sm: any) => {
            const d = sm.defectDistribution || { preMerge: 0, inQA: 0, postRelease: 0, total: 0 };
            totalDefects.preMerge += d.preMerge;
            totalDefects.inQA += d.inQA;
            totalDefects.postRelease += d.postRelease;
            totalDefects.total += d.total;
            return { sprint: sm.sprintName, ...d };
        });

        const qaStatuses = [
            'qa',
            'testing',
            'in qa',
            'code review',
            'review',
            'in review',
            'ready for qa',
            'pending review',
            'pending verification',
            'pending merge',
            'pending closure',
        ];
        const devStatuses = ['in progress', 'development', 'doing', 'to do', 'open', 'reopened'];

        let totalReworkIssues = 0;
        let totalIssueCount = 0;
        const reworkBySprint: any[] = [];
        for (const sprint of recentSprints) {
            const issues = sprintIssuesBySprintId.get(sprint.id) || [];
            let reworkCount = 0;
            const reworkDetails: any[] = [];

            for (const issue of issues) {
                const histories = issue.changelog?.histories || [];
                let wasInQA = false;
                let sentBack = false;
                for (const history of histories) {
                    for (const item of history.items) {
                        if (item.field === 'status') {
                            const fromLower = (item.fromString || '').toLowerCase();
                            const toLower = (item.toString || '').toLowerCase();
                            if (
                                qaStatuses.some((s) => fromLower.includes(s)) ||
                                qaStatuses.some((s) => toLower.includes(s))
                            ) {
                                wasInQA = true;
                            }
                            if (
                                wasInQA &&
                                qaStatuses.some((s) => fromLower.includes(s)) &&
                                devStatuses.some((s) => toLower.includes(s))
                            ) {
                                sentBack = true;
                                break;
                            }
                        }
                    }
                    if (sentBack) break;
                }
                if (sentBack) {
                    reworkCount++;
                    reworkDetails.push({
                        key: issue.key,
                        summary: issue.fields?.summary || '',
                        type: issue.fields?.issuetype?.name || 'Unknown',
                    });
                }
            }

            totalIssueCount += issues.length;
            totalReworkIssues += reworkCount;
            reworkBySprint.push({
                sprint: sprint.name,
                reworkCount,
                totalIssues: issues.length,
                reworkRate:
                    issues.length > 0 ? Math.round((reworkCount / issues.length) * 1000) / 10 : 0,
                reworkDetails,
            });
        }

        let stableLeadTime = true;
        if (leadTimeByTypeBySprint.length >= 3) {
            const recent = leadTimeByTypeBySprint.slice(-2);
            const earlier = leadTimeByTypeBySprint.slice(-4, -2);
            const avgRecent = this._avgLeadTimeFromSprint(recent);
            const avgEarlier = this._avgLeadTimeFromSprint(earlier);
            if (avgEarlier > 0 && avgRecent > avgEarlier * 1.2) stableLeadTime = false;
        }

        const earlyDefectDetection =
            totalDefects.total === 0 ||
            totalDefects.preMerge + totalDefects.inQA >= totalDefects.postRelease;

        const reworkRate = totalIssueCount > 0 ? (totalReworkIssues / totalIssueCount) * 100 : 0;
        const minimalRework = reworkRate < 15;

        return {
            leadTimeByType: leadTimeAvgByType,
            leadTimeByTypeBySprint,
            wipAging,
            defects: { total: totalDefects, bySprint: defectsBySprint },
            reworkRate: Math.round(reworkRate * 10) / 10,
            reworkBySprint,
            healthySignals: { stableLeadTime, earlyDefectDetection, minimalRework },
        };
    }

    _avgLeadTimeFromSprint(entries: any[]): number {
        let sum = 0;
        let count = 0;
        for (const e of entries) {
            for (const [key, val] of Object.entries(e)) {
                if (key !== 'sprint' && typeof val === 'number') {
                    sum += val;
                    count++;
                }
            }
        }
        return count > 0 ? sum / count : 0;
    }

    aggregateSprintMetrics(sprintMetrics: any[]): any {
        if (sprintMetrics.length === 0) return null;
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        return {
            avgRolloverRate: avg(sprintMetrics.map((s) => s.rolloverRate || 0)),
            avgSprintGoalAttainment: avg(sprintMetrics.map((s) => s.sprintGoalAttainment || 0)),
            avgSprintHitRate: avg(sprintMetrics.map((s) => s.sprintHitRate || 0)),
            avgSprintHitRatePoints: avg(
                sprintMetrics.map((s) => s.sprintHitRatePoints || s.sprintHitRate || 0)
            ),
            avgMidSprintAdditions: avg(
                sprintMetrics.map((s) => s.midSprintAdditions?.percentage || 0)
            ),
            totalSprints: sprintMetrics.length,
        };
    }
}
