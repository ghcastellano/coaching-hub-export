// Single-tenant application.
//
// The product is single-tenant (Indeed). Multi-tenancy was removed; the
// `tenant_id` columns remain in the schema (no DB migration) but are always
// bound to this one constant so existing rows stay visible and composite-PK
// upserts keep matching. Override only if the data lives under a different
// tenant value than the default.
export const TENANT = process.env.APP_TENANT_ID ?? 'indeed.atlassian.net';
