/**
 * Provable-field primitives: value scaling and field-key derivation. Both are
 * part of the frozen leaf contract (VALUE_SCALE 1000, key = blake2b-256 of
 * the field name). Which fields exist is the product profile's business.
 * Browser-safe.
 */
import { blake2b256Hex } from './hash';

export type FieldKind = 'numeric' | 'string';

/** Provable-field scale: raw decimal x1000 -> Uint64 (milli-units). FROZEN. */
export const VALUE_SCALE = 1000;

/** Scale a raw numeric field value to the integer that gets hashed/compared. */
export function scaleValue(raw: number | string): number {
    return Math.round(Number(raw) * VALUE_SCALE);
}

/** Anchor-metadata weight: kg decimal -> integer grams. */
export function weightGramsFromKg(weightKg: number | string): number {
    return Math.round(Number(weightKg) * 1000);
}

/** Canonical 32-byte field id for a provable field name (public label hash). FROZEN. */
export function fieldKeyHex(fieldName: string): string {
    return blake2b256Hex(fieldName);
}
