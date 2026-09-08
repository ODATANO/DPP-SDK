/**
 * Named allow-lists for ZK set-membership claims ("value is one of these,
 * without revealing which"). Members are EXACT canonical spellings; the
 * membership circuit hashes the exact string. The catalog is injected by
 * the product profile. Browser-safe.
 */

export interface ClaimSet {
    /** Stable catalog id; stored on proof-log rows and published. */
    id: string;
    label: string;
    /** The provable string field this set applies to. */
    sourceField: string;
    /** Exact-spelling member values (1..MAX_SET_VALUES distinct). */
    values: readonly string[];
}

/** Depth of the canonical set tree (frozen contract constant). */
export const SET_MERKLE_DEPTH = 6;
/** Maximum DISTINCT values per set. */
export const MAX_SET_VALUES = 1 << SET_MERKLE_DEPTH; // 64

/** Throws on duplicate ids, empty sets, duplicate members or oversize sets. */
export function validateClaimSets(sets: readonly ClaimSet[]): void {
    const ids = new Set<string>();
    for (const s of sets) {
        if (ids.has(s.id)) throw new Error(`claim set id ${s.id} is not unique`);
        ids.add(s.id);
        const distinct = new Set(s.values);
        if (distinct.size === 0) throw new Error(`claim set ${s.id} has no members`);
        if (distinct.size !== s.values.length) throw new Error(`claim set ${s.id} has duplicate members`);
        if (distinct.size > MAX_SET_VALUES) throw new Error(`claim set ${s.id} exceeds ${MAX_SET_VALUES} members`);
    }
}

export function claimSetById(sets: readonly ClaimSet[], id: string): ClaimSet | undefined {
    return sets.find((s) => s.id === id);
}

export function claimSetsForField(sets: readonly ClaimSet[], sourceField: string): ClaimSet[] {
    return sets.filter((s) => s.sourceField === sourceField);
}

/** Display label for a set id; falls back to the id (older/foreign rows). */
export function setLabelFor(sets: readonly ClaimSet[], setId: string | null | undefined): string {
    if (!setId) return 'allowed set';
    return claimSetById(sets, setId)?.label ?? setId;
}
