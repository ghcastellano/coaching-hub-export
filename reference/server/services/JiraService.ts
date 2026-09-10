import axios, { AxiosInstance } from 'axios';

export interface JiraCredentials {
    jiraUrl: string;
    email: string;
    apiToken: string;
}

export interface JiraUser {
    accountId: string;
    displayName: string;
    emailAddress: string;
}

export interface JiraBoard {
    id: number;
    name: string;
    type: string;
    location?: {
        projectId?: number;
        projectKey?: string;
        projectName?: string;
    };
}

interface BoardsResponse {
    values: JiraBoard[];
    total: number;
    isLast?: boolean;
}

export interface JiraSprint {
    id: number;
    name: string;
    state: 'active' | 'closed' | 'future';
    startDate?: string;
    endDate?: string;
    completeDate?: string;
    goal?: string;
}

interface SprintsResponse {
    values: JiraSprint[];
    isLast?: boolean;
}

export interface JiraChangelogItem {
    field: string;
    fromString?: string | null;
    toString?: string | null;
}

export interface JiraChangelogAuthor {
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
}

export interface JiraChangelogHistory {
    id: string;
    created: string;
    author?: JiraChangelogAuthor;
    items: JiraChangelogItem[];
}

export interface SmCandidateScore {
    accountId?: string;
    displayName?: string;
    score: number;
    isProjectAdmin?: boolean;
}

export interface JiraChangelog {
    histories: JiraChangelogHistory[];
}

export interface JiraIssue {
    id: string;
    key: string;
    fields: {
        summary: string;
        status: {
            name: string;
            statusCategory: { key: string; name: string };
        };
        issuetype: { name: string; subtask?: boolean };
        created?: string;
        resolutiondate?: string | null;
        assignee?: { displayName?: string; emailAddress?: string } | null;
        labels?: string[];
        description?: unknown;
        [customField: string]: unknown;
    };
    changelog?: JiraChangelog;
    // Flags set by MetricsService/JiraService during sprint report annotation
    _completedInSprintReport?: boolean;
    _addedMidSprint?: boolean;
}

// Attached to the issue array as a non-enumerable-ish property (for port parity with Vercel)
export interface SprintReportData {
    completedKeys: Set<string>;
    plannedPoints: number;
    committedPoints: number;
    completedPoints: number;
    addedKeys: string[];
}

export interface JiraField {
    id: string;
    name: string;
    schema?: { type?: string };
}

export interface VelocityByIdEntry {
    committed: number;
    completed: number;
}

export interface VelocityChartData {
    sprintsById: Record<string, { completed?: { value: number }; estimated?: { value: number } }>;
}

interface IssuesResponse {
    issues: JiraIssue[];
    total: number;
}

const MAX_BOARD_FETCH_MS = 90_000;
const MAX_BOARDS = 3000;
const PAGE_SIZE = 50;
const PARALLEL_PAGES = 5;
const STORY_POINTS_FIELD = 'customfield_10061'; // Indeed Jira

// SSRF guard: only allow Jira Cloud and explicitly-approved on-prem hosts.
// Without this, a caller could point jiraUrl at http://169.254.169.254 (AWS
// metadata), http://localhost, internal services, etc., and the server would
// happily proxy a Basic-auth request from a trusted internal IP.
const JIRA_HOSTNAME_ALLOWLIST = [
    /^[a-z0-9-]+\.atlassian\.net$/i, // Jira Cloud
];

function validateJiraUrl(jiraUrl: string): URL {
    let url: URL;
    try {
        url = new URL(jiraUrl);
    } catch {
        throw new Error('jiraUrl is not a valid URL');
    }
    if (url.protocol !== 'https:') {
        throw new Error('jiraUrl must use https://');
    }
    const host = url.hostname.toLowerCase();
    if (!JIRA_HOSTNAME_ALLOWLIST.some((re) => re.test(host))) {
        throw new Error(`jiraUrl hostname not in allowlist: ${host}`);
    }
    return url;
}

export class JiraService {
    private api: AxiosInstance;
    public baseUrl: string;
    public auth: string;
    public storyPointsField: string = STORY_POINTS_FIELD;

    constructor(credentials: JiraCredentials) {
        const url = validateJiraUrl(credentials.jiraUrl);
        const baseUrl = `${url.protocol}//${url.hostname}`;
        this.baseUrl = baseUrl;
        const auth = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
        this.auth = auth;

        this.api = axios.create({
            baseURL: baseUrl,
            headers: {
                Authorization: `Basic ${auth}`,
                Accept: 'application/json',
            },
            timeout: 60_000,
            // Don't follow redirects — defends against open-redirect tricks
            // that could otherwise smuggle the Basic-auth header off-domain.
            maxRedirects: 0,
        });
    }

    setStoryPointsField(fieldId: string): void {
        if (fieldId) this.storyPointsField = fieldId;
    }

    async getBoard(boardId: number): Promise<JiraBoard | null> {
        try {
            const res = await this.api.get<JiraBoard>(`/rest/agile/1.0/board/${boardId}`);
            return res.data;
        } catch {
            return null;
        }
    }

    async getFields(): Promise<JiraField[]> {
        try {
            const res = await this.api.get<JiraField[]>('/rest/api/3/field');
            return res.data ?? [];
        } catch (err) {
            console.warn(
                '[JiraService] getFields failed:',
                err instanceof Error ? err.message : err
            );
            return [];
        }
    }

    async detectStoryPointsField(): Promise<string> {
        try {
            const fields = await this.getFields();
            const patterns = [
                /^story\s*points?$/i,
                /^story\s*point\s*estimate$/i,
                /^sp$/i,
                /^estimation$/i,
            ];
            for (const field of fields) {
                if (!field.id.startsWith('customfield_')) continue;
                const name = (field.name || '').trim();
                if (patterns.some((p) => p.test(name))) {
                    return field.id;
                }
            }
            for (const field of fields) {
                if (!field.id.startsWith('customfield_')) continue;
                if (
                    field.schema?.type === 'number' &&
                    /point|story|estim/i.test(field.name || '')
                ) {
                    return field.id;
                }
            }
            return STORY_POINTS_FIELD;
        } catch {
            return STORY_POINTS_FIELD;
        }
    }

    // GreenHopper Sprint Report — authoritative source of plannedPoints/completedPoints (matches Jira UI)
    async getSprintReportData(boardId: number, sprintId: number): Promise<SprintReportData | null> {
        try {
            const res = await this.api.get<any>('/rest/greenhopper/1.0/rapid/charts/sprintreport', {
                params: { rapidViewId: boardId, sprintId },
            });
            const contents = res.data?.contents || {};
            const completedIssues = contents.completedIssues || [];
            const notCompleted = contents.issuesNotCompletedInCurrentSprint || [];
            const puntedIssues = contents.puntedIssues || [];
            const addedKeys = contents.issueKeysAddedDuringSprint || {};

            const completedKeys = new Set<string>(completedIssues.map((i: any) => i.key));
            const getEstimate = (i: any) => i.estimateStatistic?.statFieldValue?.value ?? 0;
            const getCurrentEstimate = (i: any) =>
                i.currentEstimateStatistic?.statFieldValue?.value ?? 0;

            let plannedPoints = 0;
            for (const issue of [...completedIssues, ...notCompleted, ...puntedIssues]) {
                if (!addedKeys[issue.key]) plannedPoints += getEstimate(issue);
            }
            let committedPoints = 0;
            for (const issue of [...completedIssues, ...notCompleted]) {
                committedPoints += getCurrentEstimate(issue);
            }
            const completedPoints = contents.completedIssuesEstimateSum?.value ?? 0;
            const addedKeysList: string[] = Object.keys(addedKeys);
            return {
                completedKeys,
                plannedPoints,
                committedPoints,
                completedPoints,
                addedKeys: addedKeysList,
            };
        } catch (err) {
            console.warn(
                `[JiraService] Sprint Report API unavailable for sprint ${sprintId}: ${err instanceof Error ? err.message : err}`
            );
            return null;
        }
    }

    // Velocity Chart by sprintId — returns {committed, completed} per sprint
    async getVelocityData(boardId: number): Promise<Record<string, VelocityByIdEntry> | null> {
        try {
            const res = await this.api.get<any>('/rest/greenhopper/1.0/rapid/charts/velocity', {
                params: { rapidViewId: boardId },
            });
            const entries = res.data?.velocityStatEntries || {};
            const result: Record<string, VelocityByIdEntry> = {};
            for (const [sid, vals] of Object.entries<any>(entries)) {
                result[sid] = {
                    committed: vals.estimated?.value ?? 0,
                    completed: vals.completed?.value ?? 0,
                };
            }
            return result;
        } catch (err) {
            console.warn(
                '[JiraService] Velocity Chart unavailable:',
                err instanceof Error ? err.message : err
            );
            return null;
        }
    }

    // Fetch all issues for a sprint with *all* fields + Sprint Report annotation + changelogs.
    // Matches Vercel jiraService.getSprintIssues(sprintId, boardId).
    async getSprintIssuesFull(
        boardId: number,
        sprintId: number
    ): Promise<JiraIssue[] & { _sprintReportData?: Omit<SprintReportData, 'completedKeys'> }> {
        const res = await this.api.get<IssuesResponse>(
            `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`,
            {
                params: { maxResults: 1000, fields: '*all' },
            }
        );
        const issues = (res.data.issues ?? []) as JiraIssue[] & {
            _sprintReportData?: Omit<SprintReportData, 'completedKeys'>;
        };

        // Sprint Report annotation
        let sprintReportData: SprintReportData | null = null;
        if (issues.length > 0) {
            sprintReportData = await this.getSprintReportData(boardId, sprintId);
        }

        if (sprintReportData) {
            const addedSet = new Set(sprintReportData.addedKeys);
            for (const issue of issues) {
                issue._completedInSprintReport = sprintReportData.completedKeys.has(issue.key);
                issue._addedMidSprint = addedSet.has(issue.key);
            }
            issues._sprintReportData = {
                plannedPoints: sprintReportData.plannedPoints,
                committedPoints: sprintReportData.committedPoints,
                completedPoints: sprintReportData.completedPoints,
                addedKeys: sprintReportData.addedKeys,
            };
        }

        // Enrich all issues with changelog (needed for cycle time / rollover completion checks)
        await this._enrichWithChangelogs(issues);
        return issues;
    }

    private async _enrichWithChangelogs(issues: JiraIssue[]): Promise<void> {
        if (issues.length === 0) return;
        try {
            const keys = issues.map((i) => i.key);
            const changelogMap = new Map<string, JiraChangelog>();

            for (let i = 0; i < keys.length; i += 50) {
                const batch = keys.slice(i, i + 50);
                const jql = `key in (${batch.join(',')})`;
                try {
                    const resp = await this.api.post<IssuesResponse>('/rest/api/3/search/jql', {
                        jql,
                        fields: ['summary'],
                        expand: 'changelog',
                        maxResults: batch.length,
                    });
                    for (const issue of resp.data.issues ?? []) {
                        if (issue.changelog?.histories && issue.changelog.histories.length > 0) {
                            changelogMap.set(issue.key, issue.changelog);
                        }
                    }
                } catch (err) {
                    console.warn(
                        `[JiraService] changelog chunk failed:`,
                        err instanceof Error ? err.message : err
                    );
                }
            }

            for (const issue of issues) {
                const cl = changelogMap.get(issue.key);
                if (cl) issue.changelog = cl;
            }
        } catch (err) {
            console.warn(
                '[JiraService] enrichWithChangelogs failed:',
                err instanceof Error ? err.message : err
            );
        }
    }

    // For future-sprint item fetch — uses agile API directly without sprint report
    async getSprintIssuesRaw(
        boardId: number,
        sprintId: number,
        fields?: string
    ): Promise<JiraIssue[]> {
        const fieldList =
            fields ?? `summary,issuetype,status,assignee,description,${this.storyPointsField}`;
        const res = await this.api.get<IssuesResponse>(
            `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`,
            { params: { maxResults: 1000, fields: fieldList } }
        );
        return res.data.issues ?? [];
    }

    async getBacklogIssuesFull(boardId: number, maxResults: number = 500): Promise<JiraIssue[]> {
        const res = await this.api.get<IssuesResponse>(`/rest/agile/1.0/board/${boardId}/backlog`, {
            params: { maxResults, fields: '*all' },
        });
        return res.data.issues ?? [];
    }

    async getCurrentUser(): Promise<JiraUser> {
        const res = await this.api.get<JiraUser>('/rest/api/3/myself');
        return res.data;
    }

    private fetchBoardsPage(startAt: number, type?: string) {
        const params: Record<string, string | number> = { startAt, maxResults: PAGE_SIZE };
        if (type) params.type = type;
        return this.api.get<BoardsResponse>('/rest/agile/1.0/board', { params });
    }

    async getBoards(type?: string): Promise<JiraBoard[]> {
        const startTime = Date.now();

        // Page 0: serial, to discover total
        const firstRes = await this.fetchBoardsPage(0, type);
        const firstValues = firstRes.data.values ?? [];
        const total = Math.min(firstRes.data.total ?? firstValues.length, MAX_BOARDS);
        console.log(
            `[JiraService] Total boards reported: ${total}, fetched first page: ${firstValues.length}`
        );

        let boards: JiraBoard[] = [...firstValues];

        // Remaining pages: in parallel batches
        const remainingStartAts: number[] = [];
        for (let s = PAGE_SIZE; s < total; s += PAGE_SIZE) remainingStartAts.push(s);

        for (let i = 0; i < remainingStartAts.length; i += PARALLEL_PAGES) {
            if (Date.now() - startTime > MAX_BOARD_FETCH_MS) {
                console.warn(`[JiraService] Timed out at ${boards.length}/${total}`);
                break;
            }

            const batch = remainingStartAts.slice(i, i + PARALLEL_PAGES);
            const responses = await Promise.all(batch.map((s) => this.fetchBoardsPage(s, type)));
            for (const res of responses) {
                const vals = res.data.values ?? [];
                boards = boards.concat(vals);
            }
            console.log(`[JiraService] Batched fetch: ${boards.length}/${total}`);
        }

        console.log(`[JiraService] Done: ${boards.length} boards in ${Date.now() - startTime}ms`);
        boards.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return boards;
    }

    async getSprints(
        boardId: number,
        state: 'active' | 'closed' | 'future' = 'closed'
    ): Promise<JiraSprint[]> {
        let all: JiraSprint[] = [];
        let startAt = 0;
        let fetched = 0;

        do {
            const res = await this.api.get<SprintsResponse>(
                `/rest/agile/1.0/board/${boardId}/sprint`,
                { params: { state, startAt, maxResults: PAGE_SIZE } }
            );
            const values = res.data.values ?? [];
            fetched = values.length;
            if (fetched > 0) all = all.concat(values);
            startAt += fetched;
            if (res.data.isLast) break;
        } while (fetched > 0);

        // Sort by start date ascending (oldest first)
        all.sort((a, b) => {
            const da = a.startDate ? new Date(a.startDate).getTime() : 0;
            const db = b.startDate ? new Date(b.startDate).getTime() : 0;
            return da - db;
        });

        return all;
    }

    async getSprintIssues(boardId: number, sprintId: number): Promise<JiraIssue[]> {
        const res = await this.api.get<IssuesResponse>(
            `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`,
            {
                params: {
                    maxResults: 1000,
                    fields: `summary,status,issuetype,created,resolutiondate,assignee,labels,${STORY_POINTS_FIELD}`,
                },
            }
        );
        return (res.data.issues ?? []).filter(isCountableIssueType);
    }

    async getIssuesWithChangelog(issueKeys: string[]): Promise<JiraIssue[]> {
        if (issueKeys.length === 0) return [];
        const CHUNK = 50;
        const results: JiraIssue[] = [];
        for (let i = 0; i < issueKeys.length; i += CHUNK) {
            const chunk = issueKeys.slice(i, i + CHUNK);
            const jql = `key in (${chunk.join(',')})`;
            try {
                // Use POST /search/jql (new Jira Cloud endpoint) — the legacy
                // GET /search endpoint was deprecated and returns 410/empty on
                // modern Jira Cloud tenants, which is why rework metrics were 0.
                const res = await this.api.post<IssuesResponse>('/rest/api/3/search/jql', {
                    jql,
                    expand: 'changelog',
                    maxResults: CHUNK,
                    fields: ['summary', 'status', 'issuetype', 'created', 'resolutiondate'],
                });
                results.push(...(res.data.issues ?? []));
            } catch (err) {
                console.warn(
                    `[JiraService] getIssuesWithChangelog chunk failed:`,
                    err instanceof Error ? err.message : err
                );
            }
        }
        return results;
    }

    // Board → project key/id (location), needed to look up project admins.
    async getBoardProject(
        boardId: number
    ): Promise<{ projectKey?: string; projectId?: number } | null> {
        try {
            const res = await this.api.get<JiraBoard>(`/rest/agile/1.0/board/${boardId}`);
            const loc = res.data?.location;
            if (!loc) return null;
            return { projectKey: loc.projectKey, projectId: loc.projectId };
        } catch (err) {
            console.warn(
                `[JiraService] getBoardProject failed:`,
                err instanceof Error ? err.message : err
            );
            return null;
        }
    }

    // Account IDs of the project's Administrators role — the SM is usually a project admin.
    async getProjectAdminAccountIds(projectKeyOrId: string | number): Promise<Set<string>> {
        const ids = new Set<string>();
        try {
            const rolesRes = await this.api.get<Record<string, string>>(
                `/rest/api/3/project/${projectKeyOrId}/role`
            );
            const roles = rolesRes.data ?? {};
            const adminUrl = Object.entries(roles).find(([name]) => /admin/i.test(name))?.[1];
            if (!adminUrl) return ids;
            const roleRes = await this.api.get<{
                actors?: Array<{ actorUser?: { accountId?: string }; displayName?: string }>;
            }>(adminUrl);
            for (const actor of roleRes.data?.actors ?? []) {
                if (actor.actorUser?.accountId) ids.add(actor.actorUser.accountId);
            }
        } catch (err) {
            console.warn(
                `[JiraService] getProjectAdminAccountIds failed:`,
                err instanceof Error ? err.message : err
            );
        }
        return ids;
    }

    // Infer the Scrum Manager by who most often moves cards through status in the
    // recent closed sprints (the person "running" the board in standups), boosted by
    // project-admin membership (the SM is usually a project admin). Returns a ranking;
    // the caller cross-references a candidate list.
    async detectScrumManager(
        boardId: number,
        sprintCount = 3
    ): Promise<{ ranking: SmCandidateScore[]; sampledSprints: number; sampledIssues: number }> {
        const closed = await this.getSprints(boardId, 'closed');
        const recent = closed.slice(-Math.max(1, sprintCount));

        const keySet = new Set<string>();
        for (const sp of recent) {
            try {
                const issues = await this.getSprintIssues(boardId, sp.id);
                for (const it of issues) keySet.add(it.key);
            } catch (err) {
                console.warn(
                    `[JiraService] detectScrumManager sprint ${sp.id} failed:`,
                    err instanceof Error ? err.message : err
                );
            }
        }

        const keys = Array.from(keySet);
        const withChangelog = await this.getIssuesWithChangelog(keys);

        const tally = new Map<string, SmCandidateScore>();
        for (const issue of withChangelog) {
            for (const h of issue.changelog?.histories ?? []) {
                const movesStatus = (h.items ?? []).some((it) => it.field === 'status');
                if (!movesStatus || !h.author) continue;
                // Skip authors with no stable identity — a synthetic 'unknown' key
                // would otherwise collapse many actors into one and could rank a
                // non-person as the top SM candidate.
                const accountId = h.author.accountId?.trim();
                const displayName = h.author.displayName?.trim();
                if (!accountId && !displayName) continue;
                // Merge under the most stable key (accountId wins). When a candidate
                // was first seen displayName-only and later with an accountId, unify
                // both entries so the score isn't split across two map keys.
                const byAccount = accountId ? tally.get(accountId) : undefined;
                const byName = displayName ? tally.get(displayName) : undefined;
                const cur = byAccount ?? byName ?? { accountId, displayName, score: 0 };
                if (!cur.accountId && accountId) cur.accountId = accountId;
                if (!cur.displayName && displayName) cur.displayName = displayName;
                cur.score += 1;
                // Always key by accountId when available; remove the stale name-only entry.
                if (accountId) {
                    if (byName && !byAccount) tally.delete(displayName!);
                    tally.set(accountId, cur);
                } else {
                    tally.set(displayName!, cur);
                }
            }
        }

        // Secondary signal: the SM is usually a project admin. Annotate movers who are
        // admins and boost them, without letting admin status override real card activity.
        let adminIds = new Set<string>();
        try {
            const project = await this.getBoardProject(boardId);
            const projectRef = project?.projectKey ?? project?.projectId;
            if (projectRef != null) adminIds = await this.getProjectAdminAccountIds(projectRef);
        } catch {
            /* best-effort */
        }
        for (const c of tally.values()) {
            if (c.accountId && adminIds.has(c.accountId)) c.isProjectAdmin = true;
        }

        const weight = (c: SmCandidateScore) => c.score * (c.isProjectAdmin ? 1.25 : 1);
        const ranking = Array.from(tally.values()).sort((a, b) => weight(b) - weight(a));
        return { ranking, sampledSprints: recent.length, sampledIssues: keys.length };
    }

    async getVelocityChart(boardId: number): Promise<number | null> {
        try {
            const res = await this.api.get<{
                velocityStatEntries?: Record<
                    string,
                    { completed?: { value: number }; estimated?: { value: number } }
                >;
            }>('/rest/greenhopper/1.0/rapid/charts/velocity', {
                params: { rapidViewId: boardId },
            });
            const entries = Object.values(res.data.velocityStatEntries ?? {});
            if (entries.length === 0) return null;
            const completed = entries.map((e) => e.completed?.value ?? 0);
            const avg = completed.reduce((a, b) => a + b, 0) / completed.length;
            return Math.round(avg * 10) / 10;
        } catch {
            return null;
        }
    }

    async getBacklogIssues(boardId: number, maxResults: number = 200): Promise<JiraIssue[]> {
        const res = await this.api.get<IssuesResponse>(`/rest/agile/1.0/board/${boardId}/backlog`, {
            params: {
                maxResults,
                fields: `summary,status,issuetype,description,${STORY_POINTS_FIELD}`,
            },
        });
        return (res.data.issues ?? []).filter(isCountableIssueType);
    }
}

export const getStoryPoints = (issue: JiraIssue): number => {
    const raw = issue.fields[STORY_POINTS_FIELD];
    return typeof raw === 'number' ? raw : 0;
};

// Tipos acima do nível de execução (Initiative > Epic > Story/Task/Bug).
// Fazem rollup de trabalho-filho e NÃO contam em velocity nem em cobertura de
// estimativas. Todos os demais tipos (Story, Task, Bug, Request, New Feature,
// customizados) são mantidos.
const EXCLUDED_ISSUE_TYPES = new Set(['initiative', 'epic']);

export const isCountableIssueType = (issue: JiraIssue): boolean =>
    !EXCLUDED_ISSUE_TYPES.has((issue.fields.issuetype?.name ?? '').toLowerCase());

// True quando o campo de story points tem valor numérico — INCLUSIVE 0 explícito
// (task de milestone/não-engenharia intencional). Só campo vazio = missing.
export const hasStoryPointEstimate = (issue: JiraIssue): boolean =>
    typeof issue.fields[STORY_POINTS_FIELD] === 'number';

export const isDone = (issue: JiraIssue): boolean =>
    issue.fields.status?.statusCategory?.key === 'done';
