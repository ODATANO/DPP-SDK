/**
 * HTTP security-header + CORS + correlation-id middleware factory. All policy
 * is passed in; this module reads no environment. Node-only (node:crypto).
 */
import crypto from 'node:crypto';

const CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export type RequestLike = {
    method?: string;
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
    correlationId?: string;
};

export type ResponseLike = {
    setHeader(name: string, value: string): void;
    status(code: number): ResponseLike;
    end(): void;
};

export interface HttpSecurityOptions {
    /** Allowed CORS origins; '*' allows any. Empty = no CORS headers at all. */
    corsOrigins?: readonly string[];
    /** Paths that get CORS handling (prefix match, or a predicate). */
    corsPaths?: readonly string[] | ((path: string) => boolean);
    /** Methods advertised for CORS-managed paths. */
    corsMethods?: string | ((path: string) => string);
    /** Content-Security-Policy value; false disables the header. */
    csp?: string | false;
    /** Strict-Transport-Security value; false disables the header. */
    hsts?: string | false;
}

const DEFAULT_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
].join('; ');

function firstHeader(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v;
}

function allowedOrigin(origin: string | undefined, configured: readonly string[]): string | undefined {
    if (!origin || configured.length === 0) return undefined;
    if (configured.includes('*')) return '*';
    return configured.includes(origin) ? origin : undefined;
}

export function createHttpSecurity(options: HttpSecurityOptions = {}) {
    const origins = options.corsOrigins ?? [];
    const corsPaths = options.corsPaths ?? [];
    const isCorsPath = typeof corsPaths === 'function'
        ? corsPaths
        : (p: string) => corsPaths.some((prefix) => p === prefix || p.startsWith(prefix));
    const methodsFor = typeof options.corsMethods === 'function'
        ? options.corsMethods
        : () => (options.corsMethods as string | undefined) ?? 'GET';
    const csp = options.csp === undefined ? DEFAULT_CSP : options.csp;
    const hsts = options.hsts ?? false;

    return function httpSecurity(req: RequestLike, res: ResponseLike, next: () => void): void {
        const headers = req.headers ?? {};
        const incoming = firstHeader(headers['x-correlation-id']);
        const correlationId = incoming && CORRELATION_ID.test(incoming) ? incoming : crypto.randomUUID();
        req.correlationId = correlationId;
        res.setHeader('X-Correlation-ID', correlationId);

        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '0');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if (csp) res.setHeader('Content-Security-Policy', csp);
        if (hsts) res.setHeader('Strict-Transport-Security', hsts);

        const pathname = String(req.path ?? '');
        if (!isCorsPath(pathname)) { next(); return; }

        const allowOrigin = allowedOrigin(firstHeader(headers.origin), origins);
        if (allowOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowOrigin);
            if (allowOrigin !== '*') res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Methods', methodsFor(pathname));
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Correlation-ID');
            res.setHeader('Access-Control-Max-Age', '86400');
        }
        if (req.method === 'OPTIONS') { res.status(allowOrigin ? 204 : 403).end(); return; }
        next();
    };
}
