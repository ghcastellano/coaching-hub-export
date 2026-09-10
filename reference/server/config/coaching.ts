// People who can be running a team — SM detection cross-references this list and
// only confirms a Scrum Manager who appears here. Server-owned (not sent by the
// client) so names are not shipped in the frontend bundle. Override via env
// SM_CANDIDATES (comma-separated) per deployment. Names must match the Jira
// display name; add spelling variants as needed.
const DEFAULT_SM_CANDIDATES = [
    'Gabriel Aquilano',
    'Gustavo Castellano',
    'Maricel Luna',
    'Ricardo Londoño',
    'Ricardo Londono',
    'Victor Carvalho',
];

const parsedCandidates = (process.env.SM_CANDIDATES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Fall back to the defaults when the env var is absent OR parses to an empty list
// (blank/whitespace/comma-only) — an empty list would silently disable detection.
export const SM_CANDIDATES: string[] =
    parsedCandidates.length > 0 ? parsedCandidates : DEFAULT_SM_CANDIDATES;
