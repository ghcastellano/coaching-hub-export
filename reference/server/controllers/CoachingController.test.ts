import * as db from '../services/database';
import { JiraService } from '../services/JiraService';
import {
    GetBoardManagersController,
    SaveBoardManagerController,
    DetectScrumManagerController,
    SaveAssessmentController,
    DeleteExperimentController,
    GetCoachingPortfolioController,
} from './CoachingController';

jest.mock('../services/database');
jest.mock('../services/JiraService', () => ({ JiraService: jest.fn() }));

const mockedDb = db as jest.Mocked<typeof db>;

// Minimal Koa-ish context. Defaults to an allowlisted x-user-email so the access
// guard passes; override `headers` to exercise the 403 path.
const mkCtx = (over: Record<string, unknown> = {}): any => {
    const headers: Record<string, string> = {
        'x-user-email': 'ae_gcastellano@contractor.indeed.com',
        ...((over.headers as Record<string, string>) || {}),
    };
    return {
        query: {},
        request: { body: {} },
        params: {},
        status: 0,
        body: undefined,
        get: (name: string) => headers[name.toLowerCase()],
        ...over,
    };
};

beforeEach(() => {
    jest.clearAllMocks();
    (mockedDb.isDbEnabled as jest.Mock).mockReturnValue(true);
});

describe('access guard', () => {
    it('returns 403 and no data for a caller not on the allowlist', async () => {
        const ctx = mkCtx({ headers: { 'x-user-email': 'intruder@evil.com' } });
        await GetCoachingPortfolioController(ctx);
        expect(ctx.status).toBe(403);
        expect(ctx.body).toMatchObject({ success: false });
        expect(mockedDb.getPortfolioHistory).not.toHaveBeenCalled();
    });

    it('returns 403 when no x-user-email is present', async () => {
        const ctx = mkCtx({ headers: { 'x-user-email': undefined } });
        await GetBoardManagersController(ctx);
        expect(ctx.status).toBe(403);
        expect(mockedDb.getCoachingAssignments).not.toHaveBeenCalled();
    });
});

describe('GetBoardManagersController', () => {
    it('returns an empty list (no DB hit) when the DB is disabled', async () => {
        (mockedDb.isDbEnabled as jest.Mock).mockReturnValue(false);
        const ctx = mkCtx();
        await GetBoardManagersController(ctx);
        expect(ctx.body).toMatchObject({ success: true, assignments: [], dbEnabled: false });
        expect(mockedDb.getCoachingAssignments).not.toHaveBeenCalled();
    });

    it('loads all assignments (single tenant — no tenant arg)', async () => {
        (mockedDb.getCoachingAssignments as jest.Mock).mockResolvedValue([{ boardId: 1 }]);
        const ctx = mkCtx();
        await GetBoardManagersController(ctx);
        expect(mockedDb.getCoachingAssignments).toHaveBeenCalledWith();
        expect(ctx.body).toMatchObject({ success: true, assignments: [{ boardId: 1 }] });
    });
});

describe('GetCoachingPortfolioController', () => {
    it('returns empty boards + a zeroed summary when the DB is disabled', async () => {
        (mockedDb.isDbEnabled as jest.Mock).mockReturnValue(false);
        const ctx = mkCtx();
        await GetCoachingPortfolioController(ctx);
        expect(ctx.status).toBe(200);
        expect(ctx.body).toMatchObject({ success: true, dbEnabled: false, boards: [] });
        expect(ctx.body.summary).toMatchObject({ inCoaching: 0, atRisk: 0, onDemand: 0 });
        expect(ctx.body.period).toMatchObject({ days: expect.any(Number) });
        expect(mockedDb.getPortfolioHistory).not.toHaveBeenCalled();
    });

    it('aggregates DB rows into engagement-status boards + summary', async () => {
        (mockedDb.getPortfolioHistory as jest.Mock).mockResolvedValue([
            {
                board_id: 1,
                board_name: 'CES',
                calculated_at: '2099-01-01T00:00:00Z',
                maturity_level: 'Gold',
                metrics_data: {
                    aggregated: { avgSprintHitRate: 85, avgRolloverRate: 18 },
                    backlogHealth: { overallScore: 50 },
                    flowQuality: { reworkBySprint: [{ reworkRate: 10 }] },
                },
            },
        ]);
        (mockedDb.getCoachingAssignments as jest.Mock).mockResolvedValue([
            {
                boardId: 1,
                boardName: 'CES',
                smName: 'Gabriel',
                role: 'scrum_master',
                coaching: true,
                engagedBy: 'coach@indeed.com',
                engagedAt: '2099-01-01T00:00:00Z',
                detectedSm: null,
            },
        ]);
        (mockedDb.getLatestAssessments as jest.Mock).mockResolvedValue([]);
        (mockedDb.getExperiments as jest.Mock).mockResolvedValue([
            { boardId: 1, status: 'active', pillar: 'commitment' },
        ]);

        const ctx = mkCtx();
        await GetCoachingPortfolioController(ctx);

        expect(mockedDb.getPortfolioHistory).toHaveBeenCalled();
        expect(ctx.status).toBe(200);
        expect(ctx.body.success).toBe(true);
        expect(ctx.body.boards).toHaveLength(1);
        expect(ctx.body.boards[0]).toMatchObject({
            boardId: 1,
            status: 'in_coaching',
            agileCoach: 'coach@indeed.com',
            sm: { name: 'Gabriel', role: 'scrum_master' },
        });
        expect(ctx.body.summary).toMatchObject({ inCoaching: 1 });
    });

    it('500s if a DB read throws', async () => {
        (mockedDb.getPortfolioHistory as jest.Mock).mockRejectedValue(new Error('boom'));
        const ctx = mkCtx();
        await GetCoachingPortfolioController(ctx);
        expect(ctx.status).toBe(500);
        expect(ctx.body).toMatchObject({ success: false });
    });
});

describe('SaveBoardManagerController', () => {
    it('400s without a boardId', async () => {
        const ctx = mkCtx({ request: { body: {} } });
        await SaveBoardManagerController(ctx);
        expect(ctx.status).toBe(400);
        expect(mockedDb.upsertCoachingAssignment).not.toHaveBeenCalled();
    });

    it('reports db-disabled (200) without writing', async () => {
        (mockedDb.isDbEnabled as jest.Mock).mockReturnValue(false);
        const ctx = mkCtx({ request: { body: { boardId: 1 } } });
        await SaveBoardManagerController(ctx);
        expect(ctx.status).toBe(200);
        expect(ctx.body).toMatchObject({ success: false, error: 'db-disabled' });
        expect(mockedDb.upsertCoachingAssignment).not.toHaveBeenCalled();
    });

    it('persists a valid assignment (no tenant arg)', async () => {
        const ctx = mkCtx({
            request: { body: { boardId: 1, role: 'scrum_master', smName: 'Gabriel Aquilano' } },
        });
        await SaveBoardManagerController(ctx);
        expect(mockedDb.upsertCoachingAssignment).toHaveBeenCalledWith(
            expect.objectContaining({
                boardId: 1,
                role: 'scrum_master',
                smName: 'Gabriel Aquilano',
            })
        );
        expect(ctx.body).toEqual({ success: true });
    });
});

describe('DetectScrumManagerController', () => {
    const goodBody = {
        jiraUrl: 'https://indeed.atlassian.net',
        email: 'e',
        apiToken: 't',
        boardId: 5,
    };

    it('400s when credentials or boardId are missing/invalid', async () => {
        const ctx = mkCtx({ request: { body: { jiraUrl: 'x' } } });
        await DetectScrumManagerController(ctx);
        expect(ctx.status).toBe(400);
    });

    it('detects via the server candidate list and persists the suggestion (no tenant arg)', async () => {
        const detectScrumManager = jest.fn().mockResolvedValue({
            ranking: [
                {
                    accountId: 'u1',
                    displayName: 'Gabriel Aquilano',
                    score: 48,
                    isProjectAdmin: true,
                },
                { accountId: 'u2', displayName: 'Someone Else', score: 10 },
            ],
            sampledSprints: 3,
            sampledIssues: 40,
        });
        (JiraService as unknown as jest.Mock).mockImplementation(() => ({ detectScrumManager }));

        const ctx = mkCtx({ request: { body: goodBody } });
        await DetectScrumManagerController(ctx);

        expect(ctx.status).toBe(200);
        expect(ctx.body).toMatchObject({
            success: true,
            matched: true,
            detected: expect.objectContaining({ displayName: 'Gabriel Aquilano', score: 48 }),
        });
        expect(mockedDb.saveDetectedSm).toHaveBeenCalledWith(
            5,
            null,
            expect.objectContaining({ displayName: 'Gabriel Aquilano' })
        );
    });

    it('returns matched:false when no candidate from the server list runs the board', async () => {
        const detectScrumManager = jest.fn().mockResolvedValue({
            ranking: [{ accountId: 'u9', displayName: 'Outsider', score: 30 }],
            sampledSprints: 3,
            sampledIssues: 20,
        });
        (JiraService as unknown as jest.Mock).mockImplementation(() => ({ detectScrumManager }));

        const ctx = mkCtx({ request: { body: goodBody } });
        await DetectScrumManagerController(ctx);
        expect(ctx.body).toMatchObject({ success: true, matched: false });
    });
});

describe('SaveAssessmentController', () => {
    it('persists signals and returns the saved assessment (no tenant arg)', async () => {
        (mockedDb.saveAssessment as jest.Mock).mockResolvedValue({ id: 1, boardId: 2 });
        const ctx = mkCtx({
            request: {
                body: { boardId: 2, signals: { a: 'consistent' }, note: 'n', author: 'me' },
            },
        });
        await SaveAssessmentController(ctx);
        expect(mockedDb.saveAssessment).toHaveBeenCalledWith(2, { a: 'consistent' }, 'n', 'me');
        expect(ctx.body).toMatchObject({ success: true, assessment: { id: 1 } });
    });
});

describe('DeleteExperimentController', () => {
    it('400s without an id', async () => {
        const ctx = mkCtx({ params: {} });
        await DeleteExperimentController(ctx);
        expect(ctx.status).toBe(400);
    });

    it('deletes an experiment by id (no tenant arg)', async () => {
        (mockedDb.deleteExperiment as jest.Mock).mockResolvedValue(1);
        const ctx = mkCtx({ params: { id: '9' } });
        await DeleteExperimentController(ctx);
        expect(mockedDb.deleteExperiment).toHaveBeenCalledWith(9);
        expect(ctx.body).toMatchObject({ success: true, removed: 1 });
    });
});
