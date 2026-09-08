import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHttpSecurity } from '../../src/http';

function response() {
    const headers: Record<string, string> = {};
    return {
        headers,
        statusCode: 200,
        ended: false,
        setHeader(name: string, value: string) { headers[name] = value; },
        status(code: number) { this.statusCode = code; return this; },
        end() { this.ended = true; }
    };
}

describe('createHttpSecurity', () => {
    it('sets security headers with the default CSP and no CORS on unmanaged routes', () => {
        const mw = createHttpSecurity();
        const req: any = { method: 'GET', path: '/app/index.html', headers: {} };
        const res = response();
        let nextCalled = false;
        mw(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
        assert.match(res.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
        assert.equal(res.headers['Strict-Transport-Security'], undefined);
        assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
        assert.match(req.correlationId, /^[0-9a-f-]{36}$/i);
    });

    it('honours csp/hsts options and a caller-supplied correlation id', () => {
        const mw = createHttpSecurity({ csp: "default-src 'self' https://ui5.sap.com", hsts: 'max-age=1' });
        const req: any = { method: 'GET', path: '/x', headers: { 'x-correlation-id': 'request-42' } };
        const res = response();
        mw(req, res, () => undefined);
        assert.match(res.headers['Content-Security-Policy'], /ui5\.sap\.com/);
        assert.equal(res.headers['Strict-Transport-Security'], 'max-age=1');
        assert.equal(res.headers['X-Correlation-ID'], 'request-42');
        const off = response();
        createHttpSecurity({ csp: false })({ path: '/x', headers: {} }, off, () => undefined);
        assert.equal(off.headers['Content-Security-Policy'], undefined);
    });

    it('allows configured origins only on managed paths', () => {
        const mw = createHttpSecurity({
            corsOrigins: ['https://wallet.example'],
            corsPaths: ['/contract-manifest', '/zk-config/', '/api/v1/'],
            corsMethods: (p) => (p.startsWith('/api/v1/') ? 'GET, POST' : 'GET'),
        });
        const req: any = { method: 'GET', path: '/contract-manifest', headers: { origin: 'https://wallet.example' } };
        const res = response();
        mw(req, res, () => undefined);
        assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://wallet.example');
        assert.equal(res.headers.Vary, 'Origin');
        assert.equal(res.headers['Access-Control-Allow-Methods'], 'GET');

        const api = response();
        mw({ method: 'GET', path: '/api/v1/passports', headers: { origin: 'https://wallet.example' } }, api, () => undefined);
        assert.equal(api.headers['Access-Control-Allow-Methods'], 'GET, POST');

        const denied = response();
        mw(
            { method: 'OPTIONS', path: '/zk-config/vault/keys/proof.prover', headers: { origin: 'https://evil.example' } },
            denied,
            () => assert.fail('managed preflight must be completed by the middleware')
        );
        assert.equal(denied.statusCode, 403);
        assert.equal(denied.ended, true);

        const unrelated = response();
        let nextCalled = false;
        mw({ method: 'OPTIONS', path: '/orders', headers: { origin: 'https://evil.example' } }, unrelated, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(unrelated.ended, false);
    });

    it('wildcard origin skips Vary', () => {
        const mw = createHttpSecurity({ corsOrigins: ['*'], corsPaths: (p) => p.startsWith('/pub') });
        const res = response();
        mw({ method: 'GET', path: '/pub/x', headers: { origin: 'https://any.example' } }, res, () => undefined);
        assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
        assert.equal(res.headers.Vary, undefined);
    });
});
