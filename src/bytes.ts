/**
 * Byte and hex helpers shared by the tree walk, field keys and leaf encoders.
 * Browser-safe: no node builtins.
 */

export function fromHex32(hex: string): Uint8Array {
    const clean = hex.replace(/^0x/, '');
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
}

export function toHex(u8: Uint8Array): string {
    let out = '';
    for (const b of u8) out += b.toString(16).padStart(2, '0');
    return out;
}

/** Big-endian Uint64 encoding; throws outside 0..2^64-1. */
export function u64be(v: bigint): Uint8Array {
    if (v < 0n || v > 0xffffffffffffffffn) throw new Error(`value out of Uint64 range: ${v}`);
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, v);
    return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}
