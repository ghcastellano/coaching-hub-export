# DATA_CONTRACT.md — Contrato de dados do Coaching Hub

Front <-> back, transporte-agnostico. Base path `/api`, rotas em `/api/coaching/*`. Content-Type `application/json`.

## 0. Convencoes de transporte (todos os endpoints)

- **Identidade/auth (origem):** header `x-user-email` em toda request. Servidor gateia contra allowlist. Sem/ fora da allowlist -> `403 { "success": false, "error": "Not authorized to access the Coaching Hub." }`. **No destino: trocar por sessao (`lib/session.ts`).**
- **Envelope:** `{ "success": boolean, ... }`. Erro tratado -> `success:false` + `error:string`.
- **`dbEnabled`:** GETs e portfolio sempre `200` com `dbEnabled:boolean`. DB off em GET -> `success:true` + dados vazios + `dbEnabled:false`. DB off em write -> `200 { "success": false, "error": "db-disabled", "dbEnabled": false }`.
- **Validacao:** `400 { "success": false, "error": "<motivo>" }`. **Erro nao tratado:** `500`.

## 1. Endpoints (request + response)

### 1.1 GET /api/coaching/portfolio
Request: sem body. Response 200:
```json
{
  "success": true, "dbEnabled": true,
  "period": { "days": 90, "since": "2026-03-31T12:00:00.000Z" },
  "boards": [ /* PortfolioBoard[] */ ],
  "summary": { /* Summary */ }
}
```
- `period.since` = now - 90 dias (= `periodStart` de `buildPortfolio`). DB off -> `boards:[]`, `summary: summarize([])`.

### 1.2 GET /api/coaching/board-managers
Response: `{ "success": true, "dbEnabled": true, "assignments": [ /* CoachingAssignment[] */ ] }`.

### 1.3 POST /api/coaching/board-managers  (UPSERT presence-aware)
Request body (`SaveManagerBody`):
```json
{ "boardId": 11195, "boardName": "GTM Demand", "smName": "Gustavo Castellano",
  "smAccountId": "5b10...", "role": "scrum_master", "coaching": true,
  "engagedBy": "Gustavo Castellano", "coachingCase": { /* CoachingCase */ } }
```
- `boardId` obrigatorio (nao-finito -> `400 "boardId is required"`). So as chaves enviadas sao escritas. `coaching:true` carimba `engaged_at` server-side. Response: `{ "success": true }`.

### 1.4 POST /api/coaching/detect-sm
Request body (`DetectSmBody`):
```json
{ "jiraUrl": "https://indeed.atlassian.net", "email": "...", "apiToken": "...",
  "boardId": 11195, "boardName": "GTM Demand", "sprintCount": 3 }
```
- `jiraUrl`,`email`,`apiToken` obrigatorios; `boardId` inteiro>0. Faltou algum -> `400 "jiraUrl, email, apiToken, and a numeric boardId are required"`.
- **No destino:** ler credenciais Jira do server config, NAO do body.
Response 200:
```json
{ "success": true, "matched": true,
  "detected": { "accountId": "5b10...", "displayName": "Gustavo Castellano", "score": 42,
    "isProjectAdmin": true, "candidates": [ { "accountId":"...","displayName":"...","score":42,"isProjectAdmin":true } ] },
  "sampledSprints": 3, "sampledIssues": 57, "dbEnabled": true }
```
- STRICT: `detected` so preenche de candidato presente em `SM_CANDIDATES` (case-insensitive em displayName). Senao `accountId/displayName` undefined, `score:0`, `matched:false`, mas `candidates` mantem top-5.

### 1.5 GET /api/coaching/assessments
Response: `{ "success": true, "dbEnabled": true, "assessments": [ /* CoachingAssessment[] (latest por board) */ ] }`.

### 1.6 POST /api/coaching/assessments  (INSERT-then-prune)
Request body (`SaveAssessmentBody`):
```json
{ "boardId": 11195,
  "signals": { "scope_churn":"consistent","planning_realism":"emerging","ceremonies_effective":"not_yet",
    "dod_discipline":"emerging","rotating_facilitation":"not_yet","pull_not_push":"emerging",
    "impediments_self":"consistent","psych_safety":"consistent","team_stability":"consistent" },
  "note": "...", "author": "user@indeed.com" }
```
- `boardId` obrigatorio. `signals` valores `not_yet|emerging|consistent` (ausente/`unknown`=nao avaliado). Response: `{ "success": true, "assessment": <CoachingAssessment> }`.

### 1.7 GET /api/coaching/experiments
Response: `{ "success": true, "dbEnabled": true, "experiments": [ /* CoachingExperiment[] (created_at DESC) */ ] }`.

### 1.8 POST /api/coaching/experiments  (id presente=UPDATE, ausente=INSERT)
Request body (`SaveExperimentBody`):
```json
{ "id": 12, "boardId": 11195, "pillar": "commitment", "metric": "Sprint Hit Rate / Rollover",
  "behavior": "...", "hypothesis": "...", "outcome": "...", "status": "active",
  "origin": "manual", "startedAt": "2026-05-01", "targetAt": "2026-06-15" }
```
- `boardId` obrigatorio. Em UPDATE, `origin`/`board_id` NAO mudam. Datas `YYYY-MM-DD`. Response: `{ "success": true, "experiment": <CoachingExperiment> }`.

### 1.9 DELETE /api/coaching/experiments/:id
Path param `id` (nao-finito -> `400 "id is required"`). Response: `{ "success": true, "removed": 1 }`.

## 2. Interfaces TypeScript (verbatim)

### 2.1 PortfolioBoard (item principal do portfolio)
```ts
interface PortfolioBoard {
  boardId: number; boardName: string;
  sm: { name: string; role: string } | null;
  agileCoach: string | null; engagedAt: string | null;
  supportModel: 'bi_weekly'|'monthly'|'quarterly'|'none';
  coaching: boolean;
  currentLevel: Level | null; firstLevel: Level | null;
  levelSeries: { at: string; level: Level }[];
  metricTrends: { hitRate: TrendPoint[]; rollover: TrendPoint[]; rework: TrendPoint[]; readiness: TrendPoint[] };
  latestMetrics: Metrics | null;
  behavioral: Readiness;
  experiments: { active: number; done: number; dropped: number };
  workingOn: string[]; focus: CoachingFocus[];
  graduationReady: boolean | null;
  coachingCase: CoachingCaseInput | null;
  levelSince: string | null; previousLevel: Level | null;
  status: 'at_risk'|'in_coaching'|'on_demand'|null;
  graduatedAt: string | null; graduatedThisPeriod: boolean;
  levelDeltaInPeriod: number; leveledUpThisPeriod: boolean;
  recentSprints: RecentSprint[]; analysisSprintCount: number;
}
type Level = 1 | 2 | 3;
interface TrendPoint { at: string; value: number; sprintName?: string; }
interface Metrics { hitRate: number; rollover: number; readiness: number; avgRework: number; }
interface Readiness { pct: number | null; label: ReadinessLabel; rated: number; total: number; }
interface RecentSprint { sprintName: string; level: Level; hitRate: number; rollover: number; rework: number; startDate?: string; endDate?: string; }
interface CoachingFocus { pillar: Pillar; text: string; }
```

### 2.2 Summary
```ts
interface Summary { inCoaching: number; atRisk: number; onDemand: number; graduatedThisPeriod: number; bands: { silver: number; gold: number; platinum: number }; leveledUp: number; }
```

### 2.3 CoachingAssignment
```ts
interface CoachingAssignment { boardId: number; boardName: string|null; smName: string|null; smAccountId: string|null; role: CoachingRole; coaching: boolean; engagedBy: string|null; engagedAt: string|null; coachingCase: CoachingCase|null; detectedSm: DetectedSm|null; detectedAt: string|null; updatedAt: string; }
```
### 2.4 CoachingCase
```ts
interface CoachingCase { mainGap?: string|null; hypothesis?: string|null; nextStep?: string|null; supportNeeded?: string|null; reviewAt?: string|null; stage?: string|null; }
```
### 2.5 DetectedSm
```ts
interface DetectedSm { accountId?: string; displayName?: string; score?: number; isProjectAdmin?: boolean; candidates?: Array<{ accountId?: string; displayName?: string; score: number; isProjectAdmin?: boolean }>; }
```
### 2.6 CoachingAssessment
```ts
interface CoachingAssessment { id: number; boardId: number; signals: Record<string,string>; note: string|null; author: string|null; assessedAt: string; }
```
### 2.7 CoachingExperiment
```ts
interface CoachingExperiment { id: number; boardId: number; pillar: string|null; metric: string|null; behavior: string|null; hypothesis: string|null; outcome: string|null; status: string; origin: string; startedAt: string|null; targetAt: string|null; }
```

### 2.8 Entrada do buildPortfolio + blob metrics_data
```ts
interface BuildPortfolioInput { history: HistoryRowInput[]; assignments: AssignmentInput[]; assessments: AssessmentInput[]; experiments: ExperimentInput[]; periodStart: string; }
interface HistoryRowInput { board_id: number; board_name: string; calculated_at: string; maturity_level: string|null; metrics_data: MetricsData|null; }
interface MetricsData {
  aggregated?: { avgSprintHitRatePoints?: number; avgSprintHitRate?: number; avgRolloverRate?: number; totalSprints?: number };
  backlogHealth?: { overallScore?: number };          // = readiness
  flowQuality?: { reworkBySprint?: Array<{ sprint?: string; reworkRate?: number }> };
  sprintMetrics?: Array<{ sprintName?: string; sprintHitRatePoints?: number; rolloverRate?: number; startDate?: string; endDate?: string }>;
}
```
**metricsOf extrai:** hitRate = `avgSprintHitRatePoints ?? avgSprintHitRate ?? 0`; rollover = `avgRolloverRate ?? 0`; readiness = `backlogHealth.overallScore ?? 0`; avgRework = media de `flowQuality.reworkBySprint[].reworkRate`.

## 3. Enumeracoes canonicas

- **Level** `1|2|3` — 1=Silver, 2=Gold, 3=Platinum. Desc: Silver "Scrum Manager Required", Gold "Conditional Support", Platinum "Scrum Manager Optional".
- **EngagementStatus** `at_risk|in_coaching|on_demand|null`. Ordem UI `['at_risk','in_coaching','on_demand']`.
- **SupportModel** `bi_weekly|monthly|quarterly|none`. Silver->bi_weekly, Gold->monthly, Platinum->quarterly.
- **ReadinessLabel** `not_assessed|forming|developing|ready`. ready>=75, developing>=40, senao forming; 0 avaliados -> not_assessed.
- **CoachingRole** `scrum_master|tech_lead|pm|po|none` (default scrum_master).
- **Pillar** `commitment|flow|ownership`. Labels: Commitment Reliability / Flow & Quality / Team Ownership.
- **Rubric** `not_yet(0)|emerging(1)|consistent(2)`; ausente/`unknown`=0.
- **SIGNAL_KEYS (9):** scope_churn, planning_realism (commitment); ceremonies_effective, dod_discipline (flow); rotating_facilitation, pull_not_push, impediments_self, psych_safety, team_stability (ownership). `pct = round(sum/(9*2)*100)`.
- **Experiment status** `active|done|dropped`; **origin** `manual|suggested`.
- **CoachingCase stage** `discovery|active|monitoring|self_sustained` (TEXT livre).
- **MATURITY_THRESHOLDS (weakest-link):** hitRate Platinum>=90/Silver<80; rollover Platinum<15/Silver>25; rework Platinum<7/Silver>15; readiness Platinum>75/Silver<25. Level = min(tier de cada metrica fornecida).
- **Constantes:** PERIOD_DAYS=90, REGRESSION_WINDOW=4.
- **graduationReady(level,pct)** = `pct>=75 && level>=2`.

## 4. Mapa client->endpoint (de services/api.ts)
`getCoachingPortfolio->GET /portfolio`; `getBoardManagers->GET /board-managers`; `saveBoardManager->POST /board-managers`; `detectScrumManager->POST /detect-sm`; `getAssessments->GET /assessments`; `saveAssessment->POST /assessments`; `getExperiments->GET /experiments`; `saveExperiment->POST /experiments`; `deleteExperiment->DELETE /experiments/:id`. Todos encaminham o header de identidade.
