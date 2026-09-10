# CHARTS_CHARTJS_TO_RECHARTS.md — Os 2 graficos do Coaching Hub

Origem: Chart.js v4 via react-chartjs-2, em `src/components/shared/`. Destino: Recharts 2.12. Os adapters finos (`coaching/SprintMaturityChart.tsx`, `coaching/MetricTrendChart.tsx`) preservam a API de props.

## Shape de entrada (ambos)
```ts
interface RecentSprint {
  sprintName: string; level: 1|2|3;
  hitRate: number; rollover: number; rework: number;  // percentuais 0-100, 1 decimal
  startDate?: string; endDate?: string;               // so usados na caption, nao nos charts
}
```
Ambos recebem `sprints: RecentSprint[]` (tipicamente 1-3). `MetricTrendChart` recebe `{ board }` e repassa `board.recentSprints`. **NAO trocar para `board.metricTrends`.**

## Helpers a copiar AS-IS (puros, testados)
```ts
export const LEVEL_NAME  = ['', 'Silver', 'Gold', 'Platinum'];
export const LEVEL_COLOR = ['', 'rgb(148, 163, 184)', 'rgb(212, 175, 55)', 'rgb(14, 165, 183)']; // L1/L2/L3
const LEVEL_LABEL_COLOR  = ['', '#475569', '#7A6214', '#0A6E7A']; // tom escuro do rotulo na barra
export const SERIES = [
  { key: 'hitRate',  label: 'Hit Rate',  color: '#2563EB' },
  { key: 'rollover', label: 'Rollover',  color: '#DC2626' },
  { key: 'rework',   label: 'QA Rework', color: '#D97706' },
];
// shortBarLabel: regex /.*?([A-Z]+-\s*S\d+)/i -> 'SEG-S16'; senao nome completo
// shortLineLabel: vazio -> '—'; regex /\]\s*([A-Za-z][A-Za-z0-9-]*S?\d+)/i -> token apos ']'; senao nome completo
```

---

## CHART A — SprintMaturityBarChart (Bar, altura = nivel 1-3)

**Original (Chart.js):** 1 dataset, cor por barra via array `backgroundColor`, `borderRadius:4`, Y `min:0,max:3` ticks `L1/L2/L3`, `animation:false`, `layout.padding.top:20`, legenda oculta. Plugin canvas `levelLabels` (`afterDatasetsDraw`) desenha o NOME do tier acima de cada barra (`600 10px sans-serif`, cor `LEVEL_LABEL_COLOR`, posicao `(bar.x, bar.y-3)`). Tooltip multi-linha: titulo = `sprintName` completo; linhas = `[LevelName, "Hit Rate: x%", "Rollover: x%", "QA Rework: x%"]` (`.toFixed(1)`).

**Recharts equivalente (pronto):**
```tsx
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const LEVEL_HEX = { 1: 'rgb(148,163,184)', 2: 'rgb(212,175,55)', 3: 'rgb(14,165,183)' };
const LABEL_HEX = { 1: '#475569', 2: '#7A6214', 3: '#0A6E7A' };

function LevelNameLabel({ x, y, width, value, payload }: any) {
  const level = payload?.level ?? value;
  return (
    <text x={x + width / 2} y={y - 3} textAnchor="middle" fontSize={10}
          fontWeight={600} fill={LABEL_HEX[level] ?? '#64748b'}>
      {LEVEL_NAME[level]}
    </text>
  );
}

function MaturityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded border bg-popover px-2 py-1 text-xs text-popover-foreground shadow">
      <div className="font-semibold">{r.fullName}</div>
      <div>{LEVEL_NAME[r.level]}</div>
      <div>Hit Rate: {r.hitRate.toFixed(1)}%</div>
      <div>Rollover: {r.rollover.toFixed(1)}%</div>
      <div>QA Rework: {r.rework.toFixed(1)}%</div>
    </div>
  );
}

export default function SprintMaturityBarChart({ sprints, title = 'Maturity by sprint', subtitle, height = 'h-36', rotateLabels = false }: any) {
  if (!sprints || sprints.length === 0) return null;
  const rows = sprints.map((s: any) => ({
    name: shortBarLabel(s.sprintName), fullName: s.sprintName, level: s.level,
    hitRate: s.hitRate, rollover: s.rollover, rework: s.rework,
  }));
  return (
    <div>
      {title && <div className="mb-1 text-xs font-semibold text-muted-foreground">{title}</div>}
      {subtitle && <div className="mb-2 text-xs text-muted-foreground/70">{subtitle}</div>}
      <div className={height} style={{ height: 144 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="name" tickLine={false} axisLine={false}
                   tick={{ fontSize: 10 }} angle={rotateLabels ? -45 : 0} textAnchor={rotateLabels ? 'end' : 'middle'} />
            <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={{ fontSize: 10 }} width={28}
                   tickFormatter={(v) => (v >= 1 && v <= 3 ? `L${v}` : '')} />
            <Tooltip content={<MaturityTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Bar dataKey="level" radius={4} isAnimationActive={false} label={<LevelNameLabel />}>
              {rows.map((r: any, i: number) => <Cell key={i} fill={LEVEL_HEX[r.level] ?? LEVEL_HEX[1]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```
**Mapeamentos:** cor por barra -> `<Cell>` (Recharts nao aceita array em fill). `borderRadius:4`->`radius={4}`. Plugin canvas -> `label={<LevelNameLabel/>}` SVG. `animation:false`->`isAnimationActive={false}`. `layout.padding.top:20`->`margin.top:20`. Tooltip multi-linha -> `content` custom lendo `fullName`. Legenda oculta -> omitir `<Legend>`. **Height:** Recharts precisa de altura em px no wrapper (`style={{ height: 144 }}` para `h-36`).

---

## CHART B — MetricTrendLineChart (Line, 3 series)

**Original (Chart.js):** 3 series (`SERIES`), Y `0-100` formatter `{v}%`, `tension:0.3`, `pointRadius:3`, `borderWidth:2`, legenda bottom (`boxWidth:12`, font 11), tooltip `mode:'index'` `{label}: {v}%`. Renderiza so com `>=2` sprints.

**Recharts equivalente (pronto):**
```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function MetricTrendLineChart({ sprints, title = 'Metrics by sprint', height = 'h-44' }: any) {
  if (!sprints || sprints.length < 2) return null;
  const rows = sprints.map((s: any) => ({
    name: shortLineLabel(s.sprintName), hitRate: s.hitRate, rollover: s.rollover, rework: s.rework,
  }));
  return (
    <div>
      {title && <div className="mb-1 text-xs font-semibold text-muted-foreground">{title}</div>}
      <div className={height} style={{ height: 176 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="name" interval={0} tick={{ fontSize: 10 }} angle={0} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={36} />
            <Tooltip formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]} />
            <Legend verticalAlign="bottom" iconSize={12} wrapperStyle={{ fontSize: 11 }} />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                    stroke={s.color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```
**Mapeamentos:** 3 `<Line>` com `name={s.label}` (legenda/tooltip leem "Hit Rate" etc.) e `dataKey={s.key}`. `tension:0.3`->`type="monotone"`. `pointRadius:3`->`dot={{ r:3 }}`. `borderWidth:2`->`strokeWidth={2}`. `mode:'index'` ja e default (tooltip compartilhado). `autoSkip:false`->`interval={0}`. Legenda bottom -> `<Legend verticalAlign="bottom">`. Height `h-44`=176px.

---

## Adapters finos (preservar)
```tsx
// components/coaching/charts/SprintMaturityChart.tsx
export default function SprintMaturityChart({ sprints }: { sprints: RecentSprint[] }) {
  return <SprintMaturityBarChart sprints={sprints} />;
}
// components/coaching/charts/MetricTrendChart.tsx
export default function MetricTrendChart({ board }: { board: PortfolioBoard }) {
  return <MetricTrendLineChart sprints={board.recentSprints ?? []} />;
}
```

## Render site (CoachingTeamPage)
```tsx
{board.recentSprints?.length > 0 && (<div className="mt-3"><SprintMaturityChart sprints={board.recentSprints} /></div>)}
{board.recentSprints?.length >= 2 && (<div className="mt-3"><MetricTrendChart board={board} /></div>)}
```

## Gotchas
1. Nenhum dos dois usa `chartjs-plugin-datalabels`. O rotulo na barra e plugin canvas custom -> em Recharts e label render-prop SVG.
2. `MetricTrendChart` plota `recentSprints` (ultimos 3 sprints), nao `metricTrends`. Preservar.
3. Cor por barra exige `<Cell>`; nao ha `backgroundColor: array` em Recharts.
4. Wrapper precisa de altura px resolvida (`style={{ height }}`); Tailwind `h-36`/`h-44` no div tambem funciona se o pai tem altura.
5. Guards: Bar >=1 sprint, Line >=2. Helpers de label sao testados — copie verbatim e mantenha os testes.
