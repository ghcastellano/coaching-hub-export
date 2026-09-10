import Router from '@koa/router';
import { AppContext } from './app';
import { IndexController } from './controllers/IndexController';
import { TestConnectionController } from './controllers/TestConnectionController';
import { GetBoardsController } from './controllers/GetBoardsController';
import { GetVelocityController } from './controllers/GetVelocityController';
import { GetBacklogHealthController } from './controllers/GetBacklogHealthController';
import { GetFlowMetricsController } from './controllers/GetFlowMetricsController';
import { GetFutureSprintItemsController } from './controllers/GetFutureSprintItemsController';
import { GetSprintsController } from './controllers/GetSprintsController';
import {
    ListSavedBoardsController,
    UpsertSavedBoardsController,
    DeleteSavedBoardController,
} from './controllers/SavedBoardsController';
import {
    DeleteBoardMetricsController,
    GetAllLatestMetricsController,
    GetBoardHistoryController,
    GetHistoricalMetricsController,
    GetMetricsHistoryBoardsController,
} from './controllers/MetricsHistoryController';
import { GetCachedBoardsController } from './controllers/GetCachedBoardsController';
import { GetTeamMetricsController } from './controllers/GetTeamMetricsController';
import { GetStalenessController } from './controllers/GetStalenessController';
import { GetDiagnosticsController } from './controllers/GetDiagnosticsController';
import { PruneHistoryController } from './controllers/PruneHistoryController';
import {
    GetBoardManagersController,
    SaveBoardManagerController,
    DetectScrumManagerController,
    GetAssessmentsController,
    SaveAssessmentController,
    GetExperimentsController,
    SaveExperimentController,
    DeleteExperimentController,
    GetCoachingPortfolioController,
} from './controllers/CoachingController';

export const router = new Router<{}, AppContext>();

router.get('/', IndexController);
router.post('/api/jira/test-connection', TestConnectionController);
router.post('/api/jira/boards', GetBoardsController);
router.post('/api/jira/sprints', GetSprintsController);
router.post('/api/metrics/velocity', GetVelocityController);
router.post('/api/metrics/backlog-health', GetBacklogHealthController);
router.post('/api/metrics/flow', GetFlowMetricsController);
router.post('/api/metrics/future-sprint-items', GetFutureSprintItemsController);
router.post('/api/boards/saved/list', ListSavedBoardsController);
router.post('/api/boards/saved/upsert', UpsertSavedBoardsController);
router.post('/api/boards/saved/delete', DeleteSavedBoardController);
router.post('/api/metrics/team', GetTeamMetricsController);
router.post('/api/metrics/staleness', GetStalenessController);
router.post('/api/diagnostics', GetDiagnosticsController);
router.get('/api/jira/boards/cached', GetCachedBoardsController);
router.get('/api/history/boards', GetMetricsHistoryBoardsController);
router.get('/api/history/all-latest', GetAllLatestMetricsController);
router.get('/api/history/board/:boardId', GetBoardHistoryController);
router.get('/api/history/metrics/:id', GetHistoricalMetricsController);
router.delete('/api/history/board/:boardId', DeleteBoardMetricsController);
router.post('/api/history/prune-keep-latest', PruneHistoryController);
// Coaching Hub
router.get('/api/coaching/portfolio', GetCoachingPortfolioController);
router.get('/api/coaching/board-managers', GetBoardManagersController);
router.post('/api/coaching/board-managers', SaveBoardManagerController);
router.post('/api/coaching/detect-sm', DetectScrumManagerController);
router.get('/api/coaching/assessments', GetAssessmentsController);
router.post('/api/coaching/assessments', SaveAssessmentController);
router.get('/api/coaching/experiments', GetExperimentsController);
router.post('/api/coaching/experiments', SaveExperimentController);
router.delete('/api/coaching/experiments/:id', DeleteExperimentController);
