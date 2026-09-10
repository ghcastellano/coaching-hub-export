# Coaching Hub — Pacote Portavel

Este pacote contem TUDO o que uma equipe (ou uma IA) precisa para reconstruir o modulo **Coaching Hub** — com UI/UX identica — dentro do projeto de destino **Status Pilot** (Next.js 14.2 App Router + TypeScript strict + Tailwind 3.4 + shadcn/ui + Recharts 2.12 + Supabase + OpenAI opcional).

O Coaching Hub e o complemento do Scrum Maturity Dashboard: e onde o Agile Coach registra **o que esta sendo coachado, por que, e o que mudou** por time, e onde a lideranca enxerga um resumo executivo (graduacoes, regressoes, pedidos). E uma rota oculta gateada por allowlist de e-mail.

## O que ele faz (3 telas)

1. **Portfolio** (`/coaching-hub`) — indice de todos os times no programa, agrupados em "Needs attention" / "On track", com barra de distribuicao de maturidade (Silver/Gold/Platinum) e movimento do trimestre.
2. **Team detail** (`/coaching-hub/team/[boardId]`) — layout 2/3 + 1/3: plano de coaching + experimentos + sinais comportamentais (esquerda) e contexto de maturidade com 2 graficos + gate de graduacao (direita).
3. **Leadership summary** (`/coaching-hub/leadership`) — resumo executivo derivado dos dados + botao "Copy as text".

## Estrutura do pacote

```
coaching-hub-package/
├── README.md                         ← este arquivo (comece aqui)
├── PORTING.md                        ← PROMPT MESTRE: passo a passo de reconstrucao
├── DATA_CONTRACT.md                  ← os 9 endpoints (request/response) + types TS
├── CHARTS_CHARTJS_TO_RECHARTS.md     ← os 2 graficos: Chart.js original -> Recharts pronto
├── THEME_TOKENS.md                   ← designTokens -> tema Tailwind/shadcn (HSL)
├── BACKEND_KOA_TO_NEXT_SUPABASE.md   ← controllers Koa -> API routes; lib/; o que stubbar
├── DEPENDENCIES.md                   ← pacotes npm a adicionar no destino
├── supabase/
│   └── schema.sql                    ← DDL idempotente das tabelas coaching_*
└── reference/                        ← copia FIEL dos fontes do modulo original (so leitura)
    ├── components/coaching/*.tsx, *.ts
    ├── components/shared/*.tsx, designTokens.ts
    ├── components/MaturityBadge.tsx, MaturityLevelsReference.tsx
    ├── util/maturity.ts, util/coachingAccess.ts
    ├── services/api.ts
    └── server/controllers/CoachingController.ts, server/config/coaching.ts,
        server/services/{database.ts (coaching fns), JiraService.ts (detectScrumManager)}
```

> **Importante:** os arquivos em `reference/` sao a **fonte de verdade**. Quando este pacote disser "copiar as-is", significa copiar do `reference/` para o destino com no maximo um ajuste de import path. "Traduzir" significa reescrever no idioma do stack de destino (Koa->API route, Chart.js->Recharts, classe Tailwind `.card`->`<Card>`).

## COMO usar com uma IA dentro do Status Pilot (passo a passo)

1. **Coloque o pacote inteiro na raiz do Status Pilot** (ex.: `./coaching-hub-package/`). Os arquivos de `reference/` precisam estar legiveis pela IA.
2. **Abra `PORTING.md` e passe-o como prompt mestre** para a IA do destino. Ele e auto-suficiente: tem a ordem de build e, em cada passo, diz o que copiar-as-is vs traduzir e qual arquivo de `reference/` consultar.
3. **Execute na ordem do PORTING.md** (nao pule etapas — cada uma depende da anterior):
   schema -> data contract/types -> services em `lib/` -> API routes -> componentes UI -> graficos Recharts -> i18n -> wiring na navegacao.
4. **Aplique `supabase/schema.sql`** no projeto Supabase do destino antes de testar as API routes (senao o portfolio volta vazio com `dbEnabled:false`).
5. **Substitua os 3 hardcodes Indeed** (allowlist de e-mail, `SM_CANDIDATES`, `AGILE_COACH`) pelos valores do Status Pilot — ver `BACKEND_KOA_TO_NEXT_SUPABASE.md` secao "Indeed-especifico".
6. **Valide visualmente** contra as descricoes de UI no `PORTING.md` (cada tela tem o layout, classes e copy literais).

## Pre-requisito de dados (LEIA)

O endpoint `/coaching/portfolio` **le** de uma tabela tipo `metrics_history` (`board_id, board_name, maturity_level TEXT, metrics_data JSONB, calculated_at`). O Coaching Hub **nunca escreve** la — quem escreve e o lado Scrum Maturity. Confirme que o Status Pilot ja persiste analises nesse formato; se nao, e preciso portar a tabela + o write path tambem (fora do escopo deste pacote, mas o formato do blob `metrics_data` esta documentado em `DATA_CONTRACT.md` secao 2.8).

## Principios de fidelidade

- **Logica pura intocada:** `util/maturity.ts` e `components/coaching/portfolio.ts` sao framework-agnosticos (sem React, sem Chart.js). Copie-os para `lib/` quase 1:1. Eles sao a **fonte unica** que garante que nivel/numero/cor sejam identicos em toda superficie (API + UI). Nunca duplique essa logica.
- **Charts:** reescrever em Recharts, mas preservando cores exatas, labels de eixo (`L1/L2/L3`, `{v}%`), conteudo de tooltip e o rotulo do nome do tier acima da barra.
- **Cores metalicas (Silver/Gold/Platinum):** sao paleta de marca deliberada, NAO o `primary` do app. Vire tokens explicitos no tema; nao mapeie para shadcn `--primary`.
