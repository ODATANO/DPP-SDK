/**
 * Signed bearer tokens for conformance harnesses: <prefix>.<role>.<uuid>.<sig>.
 * The HMAC signature is what stops any string shaped like `bp.authority.x`
 * from granting a role. The secret is injected; a per-process random secret
 * invalidates tokens on restart, which is the safe default. Node-only.
 */
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

export interface TokenSigner {
    mint(role: string): string;
    /** Role carried by a validly signed token, else undefined. Constant-time compare. */
    roleOf(raw: string): string | undefined;
}

export function createTokenSigner(opts: { secret?: string; prefix?: string } = {}): TokenSigner {
    const secret = opts.secret?.trim() || randomUUID();
    const prefix = opts.prefix ?? 'bp';
    if (!/^[a-z0-9]+$/.test(prefix)) throw new Error('token prefix must be lowercase alphanumeric');
    const sign = (body: string) => createHmac('sha256', secret).update(body).digest('hex').slice(0, 32);
    const shape = new RegExp(`^(${prefix}\\.([a-z_]+)\\.[0-9a-f-]+)\\.([0-9a-f]{32})$`);
    return {
        mint(role) {
            if (!/^[a-z_]+$/.test(role)) throw new Error('token role must be lowercase letters or underscores');
            const body = `${prefix}.${role}.${randomUUID()}`;
            return `${body}.${sign(body)}`;
        },
        roleOf(raw) {
            const m = shape.exec(raw);
            if (!m) return undefined;
            const expected = Buffer.from(sign(m[1]), 'utf8');
            const given = Buffer.from(m[3], 'utf8');
            if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
            return m[2];
        },
    };
}
