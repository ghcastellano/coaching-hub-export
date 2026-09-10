# THEME_TOKENS.md — designTokens -> tema Tailwind/shadcn (Status Pilot)

Origem: `src/components/shared/designTokens.ts` (UI/badge/status/rubric) + cores de chart inline nos arquivos de grafico + paleta `primary` (sky) em `tailwind.config.js` + primitivos `.card/.btn-*/.input-field` em `globals.css`. Destino: Tailwind 3.4 + shadcn (CSS vars HSL, darkMode:class) + Recharts (precisa de hex cru).

## 1. Paleta metalica Silver/Gold/Platinum (a marca do hub)

Esta e a paleta deliberada de tiers — **NAO e o `primary` do app**. Mantenha como cores literais.

| Tier | Nome | Bar fill (chart) | Texto dark | Chip bg/text/border | Card bg/border | Metric text |
|---|---|---|---|---|---|---|
| 1 | Silver | `#94A3B8` | `#475569` | `#E2E8F0`/`#334155`/`#CBD5E1` | `#F1F5F9`/`#CBD5E1` | `#475569` |
| 2 | Gold | `#D4AF37` | `#7A6214` | `#F6EFD4`/`#7A6214`/`#E8D8A0` | `#FBF7E8`/`#E8D8A0` | `#7A6214` |
| 3 | Platinum | `#0EA5B7` | `#0A6E7A` | `#CFEFF4`/`#0A6E7A`/`#A5DDE5` | `#E6F7FA`/`#A5DDE5` | `#0891B2` |

(Platinum panel badgeText = `text-white`; Silver/Gold = `text-gray-900`.)

### 1.1 tailwind.config.ts — grupo `maturity` + `metric`
```ts
extend: {
  colors: {
    maturity: {
      silver:   { DEFAULT:'#94A3B8', text:'#475569', chipBg:'#E2E8F0', chipText:'#334155', border:'#CBD5E1', cardBg:'#F1F5F9' },
      gold:     { DEFAULT:'#D4AF37', text:'#7A6214', chipBg:'#F6EFD4', chipText:'#7A6214', border:'#E8D8A0', cardBg:'#FBF7E8' },
      platinum: { DEFAULT:'#0EA5B7', text:'#0A6E7A', chipBg:'#CFEFF4', chipText:'#0A6E7A', border:'#A5DDE5', cardBg:'#E6F7FA', metricText:'#0891B2' },
    },
    metric: { hit:'#2563EB', rollover:'#DC2626', rework:'#D97706' },
  },
}
```

### 1.2 lib/coaching/maturity-hex.ts — para Recharts (hex cru)
```ts
export const MATURITY_HEX       = { 1:'#94A3B8', 2:'#D4AF37', 3:'#0EA5B7' };
export const MATURITY_LABEL_HEX = { 1:'#475569', 2:'#7A6214', 3:'#0A6E7A' };
export const SERIES_HEX         = { hitRate:'#2563EB', rollover:'#DC2626', rework:'#D97706' };
```

### 1.3 Maps de classe Tailwind (copiar as-is de designTokens — funcionam no Tailwind 3.4)
```ts
export const LEVEL_NAMES = { 1:'Silver', 2:'Gold', 3:'Platinum' };
export const LEVEL_CHIP_CLASS = {
  1: 'bg-[#E2E8F0] text-[#334155] border-[#CBD5E1]',
  2: 'bg-[#F6EFD4] text-[#7A6214] border-[#E8D8A0]',
  3: 'bg-[#CFEFF4] text-[#0A6E7A] border-[#A5DDE5]',
};
export const TIER_CARD_BG_CLASS = {
  1: 'bg-[#F1F5F9] border-[#CBD5E1]', 2: 'bg-[#FBF7E8] border-[#E8D8A0]', 3: 'bg-[#E6F7FA] border-[#A5DDE5]',
};
export const TIER_TOP_ACCENT_CLASS = {
  1: 'border-t-4 border-t-[#94A3B8]', 2: 'border-t-4 border-t-[#D4AF37]', 3: 'border-t-4 border-t-[#0EA5B7]',
};
export const TIER_PANEL_CLASS = {
  1: { border:'border-[#CBD5E1]', bg:'bg-[#F1F5F9]', badge:'bg-[#94A3B8]', badgeText:'text-gray-900', title:'text-[#334155]', subtitle:'text-[#475569]' },
  2: { border:'border-[#E8D8A0]', bg:'bg-[#FBF7E8]', badge:'bg-[#D4AF37]', badgeText:'text-gray-900', title:'text-[#7A6214]', subtitle:'text-[#8A6D1B]' },
  3: { border:'border-[#A5DDE5]', bg:'bg-[#E6F7FA]', badge:'bg-[#0EA5B7]', badgeText:'text-white',     title:'text-[#0A6E7A]', subtitle:'text-[#0C7C8A]' },
};
// helpers: asTier(x)=x===3?3:x===2?2:1; tierPanelClass/tierTopAccentClass/tierPillClass/tierCardBgClass
```
**Gotcha (scanner):** se esses maps virarem objetos dinamicos, garanta que as classes apareçam como literais em arquivo escaneado OU adicione ao `safelist` do tailwind.config. Na origem elas sao full-string justamente por isso.

## 2. Status / readiness / rubric (copiar as-is; usa palette default do Tailwind)
```ts
export const STATUS_META = {
  at_risk:     { label:'At risk',              blurb:'Regressed below a level they recently held — re-engage.', chip:'bg-red-100 text-red-700' },
  in_coaching: { label:'In coaching',          blurb:'Active coaching engagement with the Agile Coach.',         chip:'bg-blue-100 text-blue-700' },
  on_demand:   { label:'On-demand (Platinum)', blurb:'Self-managed — periodic health checks only.',              chip:'bg-teal-100 text-teal-700' },
};
export const READINESS_META = {
  not_assessed:{ label:'Not assessed', tone:'text-gray-400'  }, forming:{ label:'Forming', tone:'text-red-600' },
  developing:  { label:'Developing',   tone:'text-amber-600' }, ready:  { label:'Ready',   tone:'text-green-700' },
};
export const RUBRIC = {
  not_yet:   { label:'Not yet',    dot:'#DC2626', tone:'text-red-600'   },
  emerging:  { label:'Emerging',   dot:'#D97706', tone:'text-amber-600' },
  consistent:{ label:'Consistent', dot:'#16A34A', tone:'text-green-700' },
};
export const RUBRIC_CYCLE = ['not_yet','emerging','consistent'];
```

## 3. Metric-tier text (de maturity.ts) — copiar as-is
```ts
// tierTextClass: 3 -> 'text-[#0891B2]'; 2 -> 'text-[#7A6214]'; 1 -> 'text-[#475569]'
```

## 4. Primitivos -> shadcn

| Origem (`globals.css`) | Destino (Status Pilot) |
|---|---|
| `.card` (`bg-white rounded-lg shadow-md p-6 mb-6`) | `<Card>` shadcn (note: hub usa `mb-0` para anular margem) |
| `.btn-primary` (`bg-primary-600`) | `<Button>` (variant default) |
| `.btn-secondary` (`bg-gray-200`) | `<Button variant="secondary">` |
| `.btn-ghost` (transparent + border) | `<Button variant="ghost">` |
| `.input-field` (border + focus ring) | `<Input>` |
| `.alert-error` | bloco `bg-destructive/10 text-destructive border` |
| paleta `primary` (sky: 600 `#0284c7`, 700 `#0369a1`, 50 `#f0f9ff`) | token `--primary` HSL do shadcn (`bg-primary`, `text-primary-foreground`) |

**Gotcha:** o hub usa `bg-primary-50/600/700`, `text-primary-700`, `border-primary-600`. Mapeie cada um para a familia primary do destino. As tabs ativas usam `border-b-2 border-primary-600 text-primary-700`.

## 5. Chrome dos charts -> shadcn HSL (auto-tema)
- titulo `text-gray-600` -> `text-muted-foreground`; subtitulo `text-gray-400` -> `text-muted-foreground/70`.
- grid `rgba(0,0,0,0.05)` -> em dark, `stroke="hsl(var(--border))"`.
- tooltip custom -> `bg-popover text-popover-foreground border`.

## 6. Dark mode (Status Pilot suporta darkMode:class + next-themes)
A paleta metalica e pra fundo claro; Platinum `#0EA5B7` tem baixo contraste em card escuro. Para dark, clareie o texto dos tiers (Silver `#CBD5E1`, Gold `#E8D8A0`, Platinum `#67E8F9`) mantendo os fills das barras. Use variant `dark:` nas classes literais ou duas entradas nos HEX maps por tema.
