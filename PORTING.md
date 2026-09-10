# PORTING.md — Prompt Mestre: reconstruir o Coaching Hub no Status Pilot

> **Para a IA do destino:** siga este documento na ordem. Cada passo diz o que copiar-as-is (do `reference/`) vs traduzir, e o gotcha a evitar. Ao terminar, voce tera um Coaching Hub identico em UI/UX ao original, rodando em Next.js 14 App Router + Tailwind/shadcn + Recharts + Supabase.

## 0. Visao geral

- **Stack origem:** TypeScript + React 18 + Koa + Chart.js + Aurora Postgres (pg). Componentes do hub tem `// @ts-nocheck` (props sem tipos).
- **Stack destino:** Next.js 14.2 App Router (TS strict), Tailwind 3.4 + shadcn/ui + Recharts 2.12 + Supabase (`@supabase/supabase-js` service_role so no servidor).
- **3 rotas:** Portfolio (`/coaching-hub`), Team (`/coaching-hub/team/[boardId]`), Leadership (`/coaching-hub/leadership`). Rota OCULTA (fora do nav) — preservar essa semantica.
- **Gate de acesso:** allowlist de e-mail (origem usa header `x-user-email`, NAO SSO). Trocar pela sessao do Status Pilot (`lib/session.ts`).
- **Fonte unica de verdade:** `lib/maturity.ts` + `lib/coaching/portfolio.ts` (logica pura, sem React) — usados por API e UI. Nunca diverge.

## Ordem de build (NAO pule)

```
1. Schema (Supabase)         -> supabase/schema.sql
2. Contrato + types          -> lib/coaching/types.ts
3. Logica pura (lib)         -> lib/maturity.ts, lib/coaching/portfolio.ts
4. Data access (lib)         -> lib/coaching/db.ts, lib/coaching/access.ts, lib/coaching/detect-sm.ts
5. API routes                -> app/api/coaching/**/route.ts (9 handlers)
6. Client fetchers           -> lib/coaching/client.ts (substitui services/api.ts)
7. Tokens de tema            -> tailwind.config.ts + app/globals.css + lib/coaching/maturity-hex.ts
8. Componentes UI            -> components/coaching/** (traduzir .card/.btn -> shadcn)
9. Graficos Recharts         -> components/coaching/charts/*
10. i18n (opcional)          -> EN-only original; pt-BR e NOVO (confirmar)
11. Wiring nas rotas         -> app/coaching-hub/**/page.tsx + gate
```

---

## Passo 1 — Schema (Supabase)

**Acao:** copiar `supabase/schema.sql` deste pacote para `supabase/schema.sql` do destino e aplicar. E idempotente (`IF NOT EXISTS`).

- **Drop:** coluna `tenant_id` e PK composta `(tenant_id, board_id)` -> PK simples `(board_id)`. Drop os GRANTs Aurora (`scrum-maturity-dash-rw`).
- **Se Status Pilot for multi-workspace:** adicione `workspace_id TEXT NOT NULL` em cada tabela e PK `(workspace_id, board_id)`.
- **Pre-requisito:** o portfolio le de `metrics_history` (ja deve existir no destino). Ver README "Pre-requisito de dados".

---

## Passo 2 — Contrato + types

**Acao:** criar `lib/coaching/types.ts` transcrevendo as interfaces de `DATA_CONTRACT.md` secao 2 (PortfolioBoard, Summary, CoachingAssignment, CoachingCase, DetectedSm, CoachingAssessment, CoachingExperiment, e os tipos de apoio Level/LevelPoint/TrendPoint/Metrics/Readiness/RecentSprint). Como o destino e strict, esses types substituem o `@ts-nocheck` da origem — derive props dos componentes a partir de `PortfolioBoard`.

**Copiar-as-is:** os enums/unioes (Level, EngagementStatus, SupportModel, ReadinessLabel, CoachingRole, Pillar, SIGNAL_KEYS) — ver `DATA_CONTRACT.md` secao 3.

---

## Passo 3 — Logica pura (lib)

**Copiar-as-is** (apenas trocar import paths):

- `reference/util/maturity.ts` -> `lib/maturity.ts`. Exporta `MATURITY_THRESHOLDS`, `metricTier`, `tierTextClass`, `formatPct`, `coachingFocus`, `determineMaturityLevel`, `nextLevelTarget`, `RECOMMENDATIONS`, tipos. Sem React, sem dependencias externas. **Copia literal.**
- `reference/components/coaching/portfolio.ts` -> `lib/coaching/portfolio.ts`. Exporta `behavioralReadiness`, `summarize`, `buildPortfolio`, `classifyEngagement`, `supportModelFor`, `graduationReady`, `SIGNAL_KEYS`, `PERIOD_DAYS=90`, `REGRESSION_WINDOW=4`, e todos os types. So ajustar o import de `../../util/maturity` para `../maturity`.

**Gotcha:** `behavioralReadiness` e `summarize` rodam no client (CoachingHub, CoachingTeamPage); `buildPortfolio` roda no servidor (API route portfolio). O mesmo arquivo serve os dois — em Next isso e ok desde que nao importe nada server-only. Mantenha-o puro.

---

## Passo 4 — Data access (lib, server-only)

**Traduzir** `reference/server/services/database.ts` (apenas as funcoes coaching) -> `lib/coaching/db.ts` usando `@supabase/supabase-js` com service_role (de `lib/supabase.ts`). Ver `BACKEND_KOA_TO_NEXT_SUPABASE.md` para o mapeamento SQL->Supabase de cada funcao:
`getCoachingAssignments`, `upsertCoachingAssignment` (presence-aware!), `saveDetectedSm`, `getLatestAssessments`, `saveAssessment` (insert-then-prune), `getExperiments`, `saveExperiment` (insert/update por id), `deleteExperiment`, `getPortfolioHistory(perBoard=30)`.

- **Drop o argumento `tenant_id`** em todas (ou troque por `workspace_id`).
- **Gotcha (upsert presence-aware):** `upsertCoachingAssignment` so escreve as chaves enviadas — um save parcial NAO pode desligar `coaching` nem apagar `sm_name`. Reproduza com merge do row existente antes do upsert.
- **Gotcha (engaged_at):** quando `coaching` vira `true`, carimbe `engaged_at = COALESCE(existing, now())` (preserva a 1a data de inicio).

**Traduzir** `reference/util/coachingAccess.ts` -> `lib/coaching/access.ts`: substituir a allowlist de e-mail + header `x-user-email` pela sessao do Status Pilot (`lib/session.ts`). Manter mecanismo (allowlist), trocar os 7 e-mails Indeed por config/env do destino.

**Traduzir** `JiraService.detectScrumManager` (`reference/server/services/JiraService.ts` linhas 579-649) -> `lib/coaching/detect-sm.ts` sobre `lib/jira.ts` do destino. Ver `BACKEND_KOA_TO_NEXT_SUPABASE.md` secao detect-sm. **Indeed-especifico:** `customfield_10061` (story points) -> tornar configuravel via env; `SM_CANDIDATES` (`reference/server/config/coaching.ts`) -> manter mecanismo, trocar nomes.

---

## Passo 5 — API routes

**Traduzir** cada handler de `reference/server/controllers/CoachingController.ts` para uma rota App Router. Mapeamento (ver `DATA_CONTRACT.md` para request/response exatos):

| Rota | Verbos | Controller origem |
|---|---|---|
| `app/api/coaching/portfolio/route.ts` | GET | GetCoachingPortfolioController |
| `app/api/coaching/board-managers/route.ts` | GET, POST | Get/SaveBoardManagerController |
| `app/api/coaching/detect-sm/route.ts` | POST | DetectScrumManagerController |
| `app/api/coaching/assessments/route.ts` | GET, POST | Get/SaveAssessmentController |
| `app/api/coaching/experiments/route.ts` | GET, POST | Get/SaveExperimentController |
| `app/api/coaching/experiments/[id]/route.ts` | DELETE | DeleteExperimentController |

- **Auth no topo de cada handler:** chame o helper de `lib/coaching/access.ts` (substitui `denyCoachingAccess`). Sem acesso -> `403 { success:false, error:'Not authorized to access the Coaching Hub.' }`.
- **Envelope identico:** `{ success, ... , dbEnabled }`. DB off em GET -> `200 success:true` com arrays vazios + `dbEnabled:false`. DB off em writes -> `200 { success:false, error:'db-disabled', dbEnabled:false }`. Ver `DATA_CONTRACT.md` secao 0.
- **Traducao Koa->Next:** `ctx.request.body` -> `await req.json()`; `ctx.params.id` -> segmento dinamico; `ctx.get('x-user-email')` -> sessao; `ctx.body/ctx.status` -> `NextResponse.json(body, { status })`.
- **Gotcha (server-only secrets):** a allowlist, `SM_CANDIDATES` e a service_role key NUNCA podem ir para o bundle client. Mantenha-os em modulos importados so por route handlers (sem `'use client'`).

---

## Passo 6 — Client fetchers

**Traduzir** os 8 metodos coaching de `reference/services/api.ts` (Axios singleton) -> `lib/coaching/client.ts` com `fetch`. Mesma assinatura, mesmas rotas. No App Router, prefira Server Components fazendo fetch direto da lib quando possivel; para os writes otimistas (CoachingHub), use Client Components chamando esses fetchers. Encaminhe o header de identidade conforme o modelo de sessao do destino.

---

## Passo 7 — Tokens de tema

Ver `THEME_TOKENS.md` (mapeamento completo com codigo). Resumo:

1. **Adicione o grupo de cor `maturity` + `metric`** em `tailwind.config.ts` (Silver/Gold/Platinum + series dos graficos). Mantenha como cores literais — NAO sao o `primary` do app.
2. **Crie `lib/coaching/maturity-hex.ts`** exportando `MATURITY_HEX`, `MATURITY_LABEL_HEX`, `SERIES_HEX` (Recharts precisa de hex cru, nao classe Tailwind).
3. **Mapeie os primitivos** `.card`->`<Card>`, `.btn-primary`->`<Button>`, `.btn-ghost`->`<Button variant="ghost">`, `.btn-secondary`->`<Button variant="secondary">`, `.input-field`->`<Input>`, `.alert-error`-> bloco vermelho.
4. **`primary-600/700/50`** do hub -> token `primary` HSL do shadcn. As classes hex metalicas (`bg-[#E2E8F0]` etc.) das chips/badges podem ir as-is (Tailwind 3.4 aceita arbitrary values) OU virar utilidades `maturity-*`.

**Gotcha (Tailwind scanner):** na origem os tokens sao strings literais full-class para o scanner ver. No destino, se voce extrair para um map dinamico, garanta que as classes apareçam como literais em algum arquivo escaneado, ou use `safelist` no tailwind.config.

---

## Passo 8 — Componentes UI

**Traduzir** (remover `@ts-nocheck`, tipar via `PortfolioBoard`, trocar `.card`/`.btn`/`.input-field` por shadcn, trocar hash-routing por `useRouter`/`Link`):

- `reference/components/CoachingHub.tsx` -> `components/coaching/CoachingHub.tsx` (raiz: ProgramHeader, Section, TeamCard, Switch, RosterModal locais). Hash routing -> rotas reais. `sessionStorage['scrum-dashboard-open-board-id']` mantem-se (interop com dashboard).
- `reference/components/coaching/CoachingTeamPage.tsx` -> idem (CaseField uncontrolled com save no blur — preservar para nao perder digitacao).
- `reference/components/coaching/LeadershipSummary.tsx` -> idem (`navigator.clipboard` no "Copy as text").
- `reference/components/coaching/CoachingAccessDenied.tsx` -> idem (folha).
- `reference/components/coaching/ui.tsx` -> `components/coaching/ui.tsx` (LEVEL_META, PILLARS, PILLAR_LABEL, EXPERIMENT_TEMPLATES, RUBRIC, LevelChip, SavedTick, SignalSegments, TierStrip, fmtMonth). Re-exporta tokens de designTokens.
- `reference/components/MaturityBadge.tsx` -> `components/coaching/MaturityBadge.tsx`.

**Copiar-as-is (logica/tokens):** `reference/components/shared/designTokens.ts` -> `lib/coaching/design-tokens.ts` (so dados, sem React). Os widgets de `ui.tsx` que consomem esses tokens ficam em componentes.

**Gotcha (Rules of Hooks):** o `enrichedBoards` (useMemo) em CoachingHub fica ANTES de qualquer early return. Nunca coloque useMemo/useEffect/useState depois de um `return` condicional. Idem nos demais.

**Gotcha (nao sobrescrever server data):** o `enrichedBoards` so recomputa `behavioral` se houver `localSignals` reais (!= 'unknown'); senao preserva o valor do servidor. Preserve essa regra.

**Layout/copy literais:** ver descricoes por tela abaixo.

### Portfolio (CoachingHub)
- `min-h-screen bg-gray-50 p-6` -> `mx-auto max-w-7xl`. Header `h1 text-4xl font-bold` "Agile Coaching" + subtitulo. Nav tabs Portfolio/Leadership summary (ativo `border-b-2 border-primary-600 text-primary-700`) + botao "Manage teams".
- **ProgramHeader:** card "🎯 Coaching Program"; barra empilhada `flex h-3 rounded-full bg-gray-100` (Silver `bg-slate-400`, Gold `bg-amber-400`, Platinum `bg-teal-400`); movimento ↑ leveled up / ⚠ need attention / 🎓 graduated.
- **Sections:** "Needs attention" (chip `bg-red-100 text-red-700`) e "On track" (chip `bg-green-100 text-green-700`). Grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.
- **TeamCard:** `card flex h-full flex-col p-5` + `tierTopAccentClass(level)` (borda topo metalica). Titulo + LevelChip; "SM {name}"; badges; "Working on"/"Gap"; mini-KPI `grid grid-cols-4` (Hit Rate/Rollover/QA Rework/Readiness com `tierTextClass`); trend ↑/↓/→; "Behavioral: {label} · {pct}%".
- **Classificacao:** at_risk OU currentLevel===1 -> "Needs attention"; resto -> "On track".

### Team detail (CoachingTeamPage)
- `max-w-5xl px-6`. Grid `lg:grid-cols-3`: esquerda `lg:col-span-2` (Coaching plan / Interventions & experiments / Behavioral signals), direita (Maturity com badge + KPIs + 2 charts / Graduation gate / Suggested focus).
- Charts: `<SprintMaturityChart>` se `recentSprints.length>0`; `<MetricTrendChart>` se `>=2`.
- Bug historico a PRESERVAR: KPI "QA Rework" usa `avgRework` (mostra 9.1%), nao `rework`.

### Leadership
- "Leadership summary · this quarter" + botao "Copy as text"/"Copied ✓". TierStrip + grid `md:grid-cols-2` de Cards (Wins/improving, Needs attention, Active focus, Where leadership can help (asks)). Boards com `status===null` sao ocultados.

---

## Passo 9 — Graficos Recharts

Ver `CHARTS_CHARTJS_TO_RECHARTS.md` com o codigo Recharts pronto dos dois charts. Resumo:

- **SprintMaturityBarChart** (Chart.js Bar + plugin canvas) -> `BarChart` com `<Cell>` por barra (cor por tier), `domain={[0,3]}`, tick `L{v}`, rotulo do nome do tier acima da barra via label render-prop SVG (substitui o plugin `afterDatasetsDraw`), tooltip custom multi-linha com nome completo do sprint.
- **MetricTrendLineChart** (Chart.js Line) -> `LineChart` com 3 `<Line type="monotone">` (Hit Rate `#2563EB`, Rollover `#DC2626`, QA Rework `#D97706`), `domain={[0,100]}`, tick `{v}%`, legenda bottom.
- **Guards:** Bar renderiza com >=1 sprint; Line so com >=2.
- **Helpers** `shortBarLabel`, `shortLineLabel`, `LEVEL_NAME`, `LEVEL_COLOR`, `SERIES` -> copiar as-is (puros, testados).
- **Adapters finos** `MetricTrendChart` (recebe `board`, passa `board.recentSprints`) e `SprintMaturityChart` (recebe `sprints`) -> preservar a API de props. **Gotcha:** `MetricTrendChart` plota `recentSprints`, NAO `metricTrends` — nao troque.

---

## Passo 10 — i18n (opcional)

O hub e **EN-only** na origem (nenhuma string vem de i18n.ts). Apenas niveis/bandas/pilares/medidas-subjetivas tem pt-BR original. Se o destino precisar de pt-BR no hub, use a tabela do INVENTARIO 5 secao 5 (marcada `[NOVO]` onde e proposta) — **confirme com o usuario** antes de tratar como canonico. Pilar 1 = "Commitment Reliability" (NAO "Delivery Predictability").

---

## Passo 11 — Wiring na navegacao

- Crie `app/coaching-hub/page.tsx` (Portfolio), `app/coaching-hub/leadership/page.tsx`, `app/coaching-hub/team/[boardId]/page.tsx`.
- **Gate:** em cada page (ou num layout `app/coaching-hub/layout.tsx`), verifique a sessao via `lib/coaching/access.ts`; se nao autorizado, renderize `<CoachingAccessDenied email={...} />`.
- **NAO** exponha o hub no nav principal (rota oculta por design). Acesso so por URL direta.
- `go()`/`parseRoute`/listener `hashchange` da origem -> `useRouter().push()` e segmentos de rota.

---

## Checklist final de fidelidade

- [ ] Cores metalicas exatas (Silver `#94A3B8`, Gold `#D4AF37`, Platinum `#0EA5B7`; texto dark `#475569`/`#7A6214`/`#0A6E7A`).
- [ ] Charts: eixos `L1/L2/L3` e `{v}%`, tooltips multi-linha, rotulo do tier acima da barra.
- [ ] Envelopes de API identicos (`success`/`dbEnabled`/`db-disabled`).
- [ ] `buildPortfolio`/`determineMaturityLevel`/`behavioralReadiness` copiados as-is (numeros identicos).
- [ ] CaseField salva no blur (uncontrolled); hooks antes de early returns.
- [ ] Hub fora do nav; gate por sessao; 3 hardcodes Indeed substituidos.
