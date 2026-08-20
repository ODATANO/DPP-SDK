/**
 * Signed bearer tokens for the DPP conformance harness (pure).
 * Format: bp.<role>.<uuid>.<sig>. The HMAC signature is what stops any
 * string shaped like `bp.authority.x` from granting a role.
 */

import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Set DPP_API_TOKEN_SECRET to keep issued tokens valid across restarts;
 * otherwise a per-process secret invalidates them on restart (safe default).
 */
const TOKEN_SECRET = process.env.DPP_API_TOKEN_SECRET?.trim() || randomUUID();

function signTokenBody(body: string): string {
    return createHmac('sha256', TOKEN_SECRET).update(body).digest('hex').slice(0, 32);
}

/** Mint `bp.<role>.<uuid>.<sig>`. */
export function mintDppToken(role: string): string {
    const body = `bp.${role}.${randomUUID()}`;
    return `${body}.${signTokenBody(body)}`;
}

/** Role carried by a validly signed token, else undefined. Constant-time compare. */
export function roleFromSignedToken(raw: string): string | undefined {
    const m = /^(bp\.([a-z_]+)\.[0-9a-f-]+)\.([0-9a-f]{32})$/.exec(raw);
    if (!m) return undefined;
    const expected = Buffer.from(signTokenBody(m[1]), 'utf8');
    const given = Buffer.from(m[3], 'utf8');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
    return m[2];
}
