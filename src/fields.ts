/**
 * Provable-field registry, value scaling and field-key derivation.
 * Leaf index in the content-root tree = position in PROVABLE_FIELDS; changing
 * the registry changes the content root (and schema id), forcing a re-anchor.
 * Extend it in ONE batch with a re-anchor round, never field by field.
 * Browser-safe: no node builtins, no environment reads.
 */
import { blake2b256Hex } from './hash';

/** Provable scalar fields read directly from the (first) Battery. */
export const BATTERY_PROVABLE_FIELDS = [
    'carbonFootprintKgCO2', 'capacityKwh', 'recycledContentPct',
    'cycleLife', 'roundTripEfficiencyPct', 'leadContentPpm'
] as const;

/** Per-material recycled-content fields from RecycledMaterials rows.
 * Frozen key convention: `recycled<Material>Pct` (material code Co|Li|Ni). */
export const RECYCLED_MATERIAL_FIELDS = ['recycledCoPct', 'recycledLiPct', 'recycledNiPct'] as const;

/** Dynamic (measured) fields from the guide attribute rows, named exactly like
 * the official guide attributes. Only "changed / unchanged" is ever proven;
 * the legitimate-interest values themselves never become public. */
export const DYNAMIC_PROVABLE_FIELDS = [
    'CapacityFade', 'RemainingCapacity', 'NumberOfFullChargingAndDischargingCycles'
] as const;

/** Provable STRING fields read from the (first) Battery. Their leaves carry
 * the blake2b-256 digest of the EXACT string. */
export const BATTERY_STRING_FIELDS = ['cellChemistry'] as const;
export const STRING_PROVABLE_FIELDS = [...BATTERY_STRING_FIELDS] as const;

/** Ordered provable-field registry (the full 13-slot panel). String fields sit
 * AFTER all numeric fields; slots may be absent, but the ORDER is frozen shared vocabulary. */
export const PROVABLE_FIELDS = [
    ...BATTERY_PROVABLE_FIELDS, ...RECYCLED_MATERIAL_FIELDS, ...DYNAMIC_PROVABLE_FIELDS,
    ...STRING_PROVABLE_FIELDS
] as const;

/** Leaf encoding for a provable field, or null when the field is unknown. */
export function provableFieldKind(fieldName: string): 'numeric' | 'string' | null {
    if ((STRING_PROVABLE_FIELDS as readonly string[]).includes(fieldName)) return 'string';
    if ((PROVABLE_FIELDS as readonly string[]).includes(fieldName)) return 'numeric';
    return null;
}

/** Provable-field scale: raw decimal x1000 -> Uint64 (milli-units). */
export const VALUE_SCALE = 1000;

/** Scale a raw numeric field value to the Uint64 integer that gets hashed/compared. */
export function scaleValue(raw: number | string): number {
    return Math.round(Number(raw) * VALUE_SCALE);
}

/** Point-1 weight for anchor metadata: kg decimal -> integer grams. */
export function weightGramsFromKg(weightKg: number | string): number {
    return Math.round(Number(weightKg) * 1000);
}

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

export function u64be(v: bigint): Uint8Array {
    if (v < 0n || v > 0xffffffffffffffffn) throw new Error(`value out of Uint64 range: ${v}`);
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, v);
    return out;
}

/** Canonical 32-byte field id for a provable field name (public label hash). */
export function fieldKeyHex(fieldName: string): string {
    return blake2b256Hex(fieldName);
}

/** Collect the provable-field values of a passport: first Battery's scalars and
 * strings, per-material recycled percentages, plus optional extra values. */
export function fieldValuesFor(p: {
    batteries?: Array<Record<string, unknown>> | null;
    recycledMaterials?: Array<{ material?: string | null; recycledPercentage?: number | string | null }> | null;
}, extra?: Record<string, number | string | null | undefined>): Record<string, number | string> {
    const out: Record<string, number | string> = {};
    const battery = p.batteries?.[0];
    if (battery) {
        for (const f of [...BATTERY_PROVABLE_FIELDS, ...BATTERY_STRING_FIELDS]) {
            const v = battery[f];
            if (v != null && v !== '') out[f] = v as number | string;
        }
    }
    for (const rm of p.recycledMaterials ?? []) {
        const key = `recycled${String(rm.material ?? '')}Pct`;
        if ((RECYCLED_MATERIAL_FIELDS as readonly string[]).includes(key) && rm.recycledPercentage != null) {
            out[key] = rm.recycledPercentage;
        }
    }
    for (const [k, v] of Object.entries(extra ?? {})) {
        if (v != null && v !== '') out[k] = v;
    }
    return out;
}
