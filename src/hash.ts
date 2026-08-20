/**
 * Canonical JSON + blake2b-256 hashing: the anchoring hash scheme shared by
 * every consumer. FROZEN: pinned by the golden-vector suite; never change a
 * byte of this scheme without a major version bump, existing on-chain anchors
 * depend on it. Browser-safe: no node builtins, no environment reads.
 */
import { blake2b } from '@noble/hashes/blake2';
import { bytesToHex } from '@noble/hashes/utils';

const utf8 = new TextEncoder();

/** Recursively sort object keys so the same logical payload always hashes equal. */
export function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value as Record<string, unknown>).sort()
                .map(k => [k, sortKeys((value as Record<string, unknown>)[k])])
        );
    }
    return value;
}

/** Deterministic canonical JSON string of a payload. */
export function canonicalize(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

/** blake2b-256 hex of a UTF-8 string (the on-chain hashing scheme). */
export function blake2b256Hex(input: string): string {
    return bytesToHex(blake2b(utf8.encode(input), { dkLen: 32 }));
}

/** blake2b-256 over raw bytes. */
export function blake2b256Bytes(input: Uint8Array): Uint8Array {
    return blake2b(input, { dkLen: 32 });
}

/** Canonicalize + hash a payload object into { canonicalPayload, payloadHash }. */
export function hashPayload(payload: unknown): { canonicalPayload: string; payloadHash: string } {
    const canonicalPayload = canonicalize(payload);
    return { canonicalPayload, payloadHash: blake2b256Hex(canonicalPayload) };
}
