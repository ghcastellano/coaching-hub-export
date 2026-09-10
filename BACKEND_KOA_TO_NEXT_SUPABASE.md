# BACKEND_KOA_TO_NEXT_SUPABASE.md — Backend: Koa -> Next.js API routes + Supabase

Origem: Koa (`@koa/router`, `koa-bodyparser`) sob `@indeed/daemon`, Jira REST v3 + Agile 1.0 + Greenhopper, Aurora Postgres via `pg`, single-tenant. Destino: API routes serverless (`app/api/coaching/**/route.ts`) + logica em `lib/` + Supabase (service_role so no servidor).

## 1. Controllers Koa -> API routes

`src/server/controllers/CoachingController.ts` tem 9 handlers + guards. Mapeamento:

| Controller | Rota destino | Verbo |
|---|---|---|
| GetCoachingPortfolioController | `app/api/coaching/portfolio/route.ts` | GET |
| GetBoardManagersController | `app/api/coaching/board-managers/route.ts` | GET |
| SaveBoardManagerController | (mesmo arquivo) | POST |
| DetectScrumManagerController | `app/api/coaching/detect-sm/route.ts` | POST |
| GetAssessmentsController | `app/api/coaching/assessments/route.ts` | GET |
| SaveAssessmentController | (mesmo arquivo) | POST |
| GetExperimentsController | `app/api/coaching/experiments/route.ts` | GET |
| SaveExperimentController | (mesmo arquivo) | POST |
| DeleteExperimentController | `app/api/coaching/experiments/[id]/route.ts` | DELETE |

**Traducao mecanica Koa->Next:**
- `ctx.request.body` -> `await req.json()`
- `ctx.params.id` -> segmento dinamico `[id]` (`params.id`)
- `ctx.get('x-user-email')` -> sessao do destino (`lib/session.ts`)
- `ctx.body = x; ctx.status = n` -> `return NextResponse.json(x, { status: n })`
- Guards (`denyCoachingAccess`, `dbDisabled`) -> helpers chamados no topo de cada handler.

## 2. Logica -> lib/

- `src/components/coaching/portfolio.ts` -> `lib/coaching/portfolio.ts` (PURO — copiar as-is, so trocar import de maturity). Contem `buildPortfolio` (server), `summarize`/`behavioralReadiness` (tambem client).
- `src/util/maturity.ts` -> `lib/maturity.ts` (PURO — copiar as-is). `determineMaturityLevel`, `coachingFocus`, thresholds.
- `src/server/services/database.ts` (so funcoes coaching) -> `lib/coaching/db.ts` (traduzir para Supabase).
- `src/util/coachingAccess.ts` -> `lib/coaching/access.ts` (substituir allowlist por sessao).
- `JiraService.detectScrumManager` -> `lib/coaching/detect-sm.ts` (sobre `lib/jira.ts` do destino).

## 3. Data access: SQL (pg/Aurora) -> Supabase

Drop o argumento `tenant_id` em todas (ou troque por `workspace_id`). Funcoes:

| Funcao | SQL origem | Supabase destino |
|---|---|---|
| `getCoachingAssignments` | SELECT * coaching_scrum_managers WHERE tenant_id=$1 | `.from('coaching_scrum_managers').select('*')` |
| `upsertCoachingAssignment` | UPSERT dinamico ON CONFLICT (tenant_id,board_id), SET so chaves presentes; `engaged_at=COALESCE(existing,now())` quando coaching on | ler row -> merge so das chaves enviadas -> `.upsert(merged, { onConflict:'board_id' })`. **Presence-aware: nunca apagar campos omitidos.** |
| `saveDetectedSm` | UPSERT so board_name/detected_sm/detected_at/updated_at | `.upsert` parcial (preserva campos humanos) |
| `getLatestAssessments` | DISTINCT ON (board_id) ORDER BY board_id, assessed_at DESC | sem DISTINCT ON no PostgREST: ordenar por assessed_at DESC e dedup por board_id em JS, OU criar uma view/RPC |
| `saveAssessment` | INSERT RETURNING + DELETE older for board | `.insert(...).select().single()` depois `.delete().eq('board_id',id).neq('id',newId)` |
| `getExperiments` | SELECT * ORDER BY created_at DESC | `.select('*').order('created_at',{ascending:false})` |
| `saveExperiment` | UPDATE se id senao INSERT (origin/board_id nao mudam no UPDATE) | branch por presenca de id; `.update().eq('id',id)` ou `.insert()`; ambos `.select().single()` |
| `deleteExperiment` | DELETE WHERE tenant_id,id RETURNING count | `.delete().eq('id',id)`; `removed = count` |
| `getPortfolioHistory(perBoard=30)` | ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY calculated_at DESC), rn<=30, oldest->newest | RPC/view com window function (PostgREST nao faz window direto), OU buscar por board e limitar 30 em JS |

**Gotchas Supabase:** `DISTINCT ON` e window functions nao tem equivalente direto no PostgREST — use RPC (funcao SQL) ou processe em JS. `isDbEnabled()` = checar se o client Supabase esta configurado (URL+service key presentes).

## 4. Indeed-especifico — o que trocar/stubbar

| Item | Origem | No destino |
|---|---|---|
| **Auth de coaching** | header `x-user-email` (NAO SSO) + `COACHING_ALLOWLIST` (7 e-mails Indeed hardcoded em `coachingAccess.ts`) | substituir por `lib/session.ts` do Status Pilot + allowlist via env/DB. Manter mecanismo (gate no topo de cada handler -> 403 com a mesma mensagem). |
| **tenant_id / TENANT** | constante `process.env.APP_TENANT_ID ?? 'indeed.atlassian.net'`; toda query escopada; PK `(tenant_id, board_id)` | single-instance: drop `tenant_id`, PK vira `(board_id)`. Multi-workspace: `workspace_id` + PK `(workspace_id, board_id)`. |
| **SM_CANDIDATES** | `server/config/coaching.ts`: Gabriel Aquilano, Gustavo Castellano, Maricel Luna, Ricardo Londoño/Londono, Victor Carvalho (env `SM_CANDIDATES`) | manter mecanismo (filtro STRICT por displayName case-insensitive), trocar nomes pelos do destino via env. |
| **AGILE_COACH** | hardcode `'Gustavo Castellano'` em CoachingHub | parametrizar (env/config). |
| **customfield_10061** | story points Jira hardcoded em JiraService | tornar configuravel via env (`STORY_POINTS_FIELD`). |
| **Jira creds no body** | `detect-sm` recebe `{jiraUrl,email,apiToken}` no body | ler do server config (`lib/jira.ts`), nao do body. |
| **Aurora SSL / DB_DDL_USER / GRANTs** | verify-ca + CA bundle, pool DDL privilegiado, `GRANT ... TO "scrum-maturity-dash-rw"` | drop tudo. Supabase usa service_role key (server-only) + `schema.sql` idempotente. |
| **CacheService** | in-memory TTL — **NAO usado por coaching** | ignorar (existe `lib/cache.ts` no destino para outras coisas). |

## 5. detect-sm (algoritmo Jira) — `JiraService.detectScrumManager` (linhas 579-649)

Tally de autores de transicoes de `status` no changelog dos ultimos `sprintCount` sprints fechados; boost de project admins x1.25; ranking por score ponderado. Chamadas Jira:
- Agile `GET /rest/agile/1.0/board/{id}/sprint?state=closed` (paginado)
- Agile `GET /rest/agile/1.0/board/{id}/sprint/{sprintId}/issue` (fields incl. `customfield_10061`)
- REST v3 `POST /rest/api/3/search/jql` (`expand:changelog`, chunks de 50)
- Agile `GET /rest/agile/1.0/board/{id}` (board -> project location)
- REST v3 `GET /rest/api/3/project/{key}/role` + admin role URL (project admins)

Auth = Basic (email:apiToken base64). SSRF guard: so `*.atlassian.net`, https, sem redirects. **No destino:** portar sobre `lib/jira.ts`; ler creds do server config; tornar story-points field configuravel; manter SSRF guard.

Retorna `SmCandidateScore[]` (`{accountId?, displayName?, score, isProjectAdmin?}`). Controller filtra STRICT contra `SM_CANDIDATES` e persiste a tentativa (incl. "no match") via `saveDetectedSm` para nao re-detectar a cada load.

## 6. Envelopes (preservar identicos)
Sucesso `200 { success:true, ..., dbEnabled }`. Validacao `400 { success:false, error }`. Nao autorizado `403 { success:false, error:'Not authorized to access the Coaching Hub.' }`. DB off (write) `200 { success:false, error:'db-disabled', dbEnabled:false }`. DB off (GET) `200 { success:true, <dados vazios>, dbEnabled:false }`. Erro `500 { success:false, error }`.

Mensagens de erro literais: `Not authorized to access the Coaching Hub.`, `db-disabled`, `boardId is required`, `jiraUrl, email, apiToken, and a numeric boardId are required`, `id is required`, `Unknown error`.
