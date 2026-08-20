/**
 * Pseudonymous disclosure grantee ids derived from a partner DID/BPN.
 * Frozen derivation: sha256(utf8(did)) as 64-hex; on-chain grant lookups
 * depend on this exact output, and it is the only identity that ever
 * reaches public metadata. Browser-safe.
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

export function granteeIdForDid(did: string): string {
    if (!did) throw new Error('did is required');
    return bytesToHex(sha256(new TextEncoder().encode(did)));
}

/** Accept either a ready 64-hex grantee id or a DID/BPN (derived). */
export function normalizeGrantee(granteeOrDid: string): string {
    const clean = String(granteeOrDid ?? '').trim();
    if (!clean) throw new Error('grantee is required');
    if (/^[0-9a-fA-F]{64}$/.test(clean)) return clean.toLowerCase();
    return granteeIdForDid(clean);
}
