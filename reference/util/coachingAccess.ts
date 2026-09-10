// Access allowlist for the Coaching Hub. The hub surfaces named-employee coaching
// data, so it is restricted to a small set of people. Shared by the client (route
// guard) and the server (API guard) so the two never drift.
//
// NOTE: identity here is the email the user logged in with (Jira email). The app
// has no SSO-verified identity, so this stops navigation/accidental access and
// rejects non-allowed emails at the API, but is not cryptographically tamper-proof.
// True enforcement needs the app behind Indeed SSO.
export const COACHING_ALLOWLIST: ReadonlySet<string> = new Set([
    'ae_vcarvalho@contractor.indeed.com',
    'ae_gcastellano@contractor.indeed.com',
    'ae_gpbalestra@contractor.indeed.com',
    'ae_mcastaneda@contractor.indeed.com',
    'agi_rlondono@contractor.indeed.com',
    'ksuarez@indeed.com',
    'lizd@indeed.com',
]);

export function isAllowedCoachingEmail(email?: string | null): boolean {
    return !!email && COACHING_ALLOWLIST.has(email.trim().toLowerCase());
}
