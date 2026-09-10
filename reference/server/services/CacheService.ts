/* eslint-disable */
// Simple in-memory TTL cache ported from Vercel cacheService.js.
// Used by /api/metrics/team + /api/jira/boards/cached.

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export class CacheService {
    private cache = new Map<string, CacheEntry<unknown>>();
    private defaultTTL = 30 * 60 * 1000; // 30 minutes

    generateKey(
        boardId: number | string,
        type: string = 'metrics',
        tenantId?: string | null
    ): string {
        const prefix = tenantId ? `${tenantId}:` : '';
        return `${prefix}${type}:${boardId}`;
    }

    // Preserves the Vercel cache-key pattern: metrics:<tenantId>:<boardId>:<sprintCount>:<sprintIdsJoined>
    generateTeamMetricsKey(
        tenantId: string | null,
        boardId: number | string,
        sprintCount: number,
        sprintIds?: number[] | null
    ): string {
        const ids = sprintIds && sprintIds.length > 0 ? [...sprintIds].sort().join(',') : 'auto';
        return `metrics:${tenantId ?? 'unknown'}:${boardId}:${sprintCount}:${ids}`;
    }

    set<T>(key: string, value: T, ttl: number = this.defaultTTL): void {
        this.cache.set(key, { value, expiresAt: Date.now() + ttl });
    }

    get<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (!cached) return null;
        if (Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return cached.value as T;
    }

    clear(key: string): boolean {
        return this.cache.delete(key);
    }

    clearTenant(tenantId: string): number {
        if (!tenantId) return 0;
        let cleared = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${tenantId}:`) || key.includes(`:${tenantId}:`)) {
                this.cache.delete(key);
                cleared++;
            }
        }
        return cleared;
    }

    clearAll(): void {
        this.cache.clear();
    }

    has(key: string): boolean {
        const e = this.cache.get(key);
        if (!e) return false;
        if (Date.now() > e.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }

    getStats(): { total: number; active: number; expired: number } {
        const now = Date.now();
        let active = 0;
        let expired = 0;
        for (const [, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) expired++;
            else active++;
        }
        return { total: this.cache.size, active, expired };
    }
}

// Singleton for cross-request caching
export const cacheService = new CacheService();
