// Single source of truth for maturity-tier and coaching status colors.
// Dashboard, MaturityBadge and the Coaching Hub all import from here so the
// two sections can never drift visually. Class strings are full literals so
// Tailwind's content scanner picks them up.

export type Tier = 1 | 2 | 3;

export const LEVEL_NAMES: Record<Tier, string> = {
    1: 'Silver',
    2: 'Gold',
    3: 'Platinum',
};

// Pill/chip treatment (light metallic fill + dark text + border).
export const LEVEL_CHIP_CLASS: Record<Tier, string> = {
    1: 'bg-[#E2E8F0] text-[#334155] border-[#CBD5E1]',
    2: 'bg-[#F6EFD4] text-[#7A6214] border-[#E8D8A0]',
    3: 'bg-[#CFEFF4] text-[#0A6E7A] border-[#A5DDE5]',
};

// Subtle card background per tier (used behind support-model / score blocks).
export const TIER_CARD_BG_CLASS: Record<Tier, string> = {
    1: 'bg-[#F1F5F9] border-[#CBD5E1]',
    2: 'bg-[#FBF7E8] border-[#E8D8A0]',
    3: 'bg-[#E6F7FA] border-[#A5DDE5]',
};

// Full tier panel treatment (the "Maturity Levels Reference" look): tinted
// panel + metallic numbered badge + tier-toned typography.
export const TIER_PANEL_CLASS: Record<
    Tier,
    {
        border: string;
        bg: string;
        badge: string;
        badgeText: string;
        title: string;
        subtitle: string;
    }
> = {
    1: {
        border: 'border-[#CBD5E1]',
        bg: 'bg-[#F1F5F9]',
        badge: 'bg-[#94A3B8]',
        badgeText: 'text-gray-900',
        title: 'text-[#334155]',
        subtitle: 'text-[#475569]',
    },
    2: {
        border: 'border-[#E8D8A0]',
        bg: 'bg-[#FBF7E8]',
        badge: 'bg-[#D4AF37]',
        badgeText: 'text-gray-900',
        title: 'text-[#7A6214]',
        subtitle: 'text-[#8A6D1B]',
    },
    3: {
        border: 'border-[#A5DDE5]',
        bg: 'bg-[#E6F7FA]',
        badge: 'bg-[#0EA5B7]',
        badgeText: 'text-white',
        title: 'text-[#0A6E7A]',
        subtitle: 'text-[#0C7C8A]',
    },
};

// Tier-colored top accent for cards (metallic bar, used on team cards).
export const TIER_TOP_ACCENT_CLASS: Record<Tier, string> = {
    1: 'border-t-4 border-t-[#94A3B8]',
    2: 'border-t-4 border-t-[#D4AF37]',
    3: 'border-t-4 border-t-[#0EA5B7]',
};

const asTier = (tier: unknown): Tier => (tier === 3 ? 3 : tier === 2 ? 2 : 1);

export const tierPanelClass = (tier: unknown) => TIER_PANEL_CLASS[asTier(tier)];
export const tierTopAccentClass = (tier: unknown): string => TIER_TOP_ACCENT_CLASS[asTier(tier)];

export const tierPillClass = (tier: unknown): string => LEVEL_CHIP_CLASS[asTier(tier)];
export const tierCardBgClass = (tier: unknown): string => TIER_CARD_BG_CLASS[asTier(tier)];

// ── Coaching Hub status / readiness / rubric tokens ──────────────────────────

export const STATUS_META = {
    at_risk: {
        label: 'At risk',
        blurb: 'Regressed below a level they recently held — re-engage.',
        chip: 'bg-red-100 text-red-700',
    },
    in_coaching: {
        label: 'In coaching',
        blurb: 'Active coaching engagement with the Agile Coach.',
        chip: 'bg-blue-100 text-blue-700',
    },
    on_demand: {
        label: 'On-demand (Platinum)',
        blurb: 'Self-managed — periodic health checks only.',
        chip: 'bg-teal-100 text-teal-700',
    },
} as const;

export const READINESS_META = {
    not_assessed: { label: 'Not assessed', tone: 'text-gray-400' },
    forming: { label: 'Forming', tone: 'text-red-600' },
    developing: { label: 'Developing', tone: 'text-amber-600' },
    ready: { label: 'Ready', tone: 'text-green-700' },
} as const;

export const RUBRIC = {
    not_yet: { label: 'Not yet', dot: '#DC2626', tone: 'text-red-600' },
    emerging: { label: 'Emerging', dot: '#D97706', tone: 'text-amber-600' },
    consistent: { label: 'Consistent', dot: '#16A34A', tone: 'text-green-700' },
} as const;

export const RUBRIC_CYCLE = ['not_yet', 'emerging', 'consistent'] as const;
