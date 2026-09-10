// Tenant isolation service — extracts tenant ID from Jira URL / request.
// Ported from Vercel tenantService.js.

import type { ParameterizedContext } from 'koa';

export class TenantService {
    // "https://indeed.atlassian.net/" -> "indeed.atlassian.net"
    static extractTenantId(jiraUrl: string | null | undefined): string | null {
        if (!jiraUrl) return null;
        try {
            const url = new URL(jiraUrl.endsWith('/') ? jiraUrl : jiraUrl + '/');
            return url.hostname.toLowerCase();
        } catch {
            const match = jiraUrl.match(/(?:https?:\/\/)?([^/\s]+)/i);
            return match ? match[1].toLowerCase() : null;
        }
    }

    // Extract tenant from a Koa context (body jiraUrl, ?tenant= query, x-tenant-id header)
    static extractFromContext(ctx: ParameterizedContext): string | null {
        const body = ((ctx.request as any).body ?? {}) as { jiraUrl?: string };
        if (body?.jiraUrl) return TenantService.extractTenantId(body.jiraUrl);
        const q = ctx.query?.tenant;
        if (q) return Array.isArray(q) ? q[0] : q;
        const header = ctx.get('x-tenant-id');
        if (header) return header;
        return null;
    }

    static detectLocale(tenantId: string | null): 'pt-BR' | 'en' {
        if (!tenantId) return 'en';
        const brTenants = ['uolinc.atlassian.net'];
        if (brTenants.includes(tenantId) || tenantId.includes('.com.br')) return 'pt-BR';
        return 'en';
    }
}
