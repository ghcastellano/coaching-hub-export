# DEPENDENCIES.md — Pacotes npm

## Ja existem no Status Pilot (reutilizar, nada a adicionar)
- `react` 18.3, `react-dom` — todos os componentes (hooks useState/useEffect/useMemo/useRef).
- `next` 14.2 — App Router, API routes.
- `recharts` 2.12 — os 2 graficos portados (Bar + Line).
- `tailwindcss` 3.4 + `tailwindcss-animate` + `class-variance-authority` + `clsx` + `tailwind-merge` — primitivos e classes.
- shadcn/ui (`components/ui/`: button, card, badge, input, select, tabs) + `@radix-ui/*` — substituem `.card/.btn-*/.input-field` e selects/tabs do hub.
- `lucide-react` — icones (substituir emojis 🎯/🔒/✓/⚠/↗ por icones se desejado, ou manter os caracteres como na origem).
- `next-themes` — dark/light (a paleta metalica precisa de variantes dark, ver THEME_TOKENS.md secao 6).
- `@supabase/supabase-js` 2.45 — data access coaching (`lib/coaching/db.ts`, service_role server-only).
- `pg` — ja presente para scripts (se preferir driver cru em vez de supabase-js em algum ponto).

## NAO adicionar (eram da origem, ficam para tras)
- `chart.js` + `react-chartjs-2` — **substituidos por Recharts**. NAO instalar.
- `axios` — substituido por `fetch` nativo (lib/coaching/client.ts).
- `@koa/router`, `koa-bodyparser`, `@indeed/daemon` — substituidos por API routes Next.
- `@indeed/ifl-components` — so usado em testes da origem (IndeedThemeProvider). Ignorar.

## Opcional (so se for usar a feature de IA)
- `openai` (SDK, modelo gpt-4o) — o Coaching Hub original **nao** usa IA. Se o Status Pilot quiser uma camada de IA sobre o snapshot de metricas, seguir o padrao grounded do destino (IA recebe so o snapshot deterministico de `buildPortfolio`, nunca toca o banco, cache por hash + rate-limit via `lib/cache.ts`/`lib/rate-limit.ts`). Nao e requisito do porte 1:1.

## Resumo
Para um porte 1:1, **zero novas dependencias** se o Status Pilot ja tem recharts + shadcn + supabase-js (todos listados no stack de destino). O trabalho e tradução, nao instalacao.
