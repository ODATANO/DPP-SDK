/**
 * Named allow-lists for ZK set-membership claims ("value is one of these,
 * without revealing which"). Single source of truth for prove lanes, pickers
 * and publish payloads. Members are the EXACT canonical spellings; the
 * membership circuit hashes the exact string. Dependency-free on purpose.
 */

export interface ClaimSet {
    /** Stable catalog id; stored on proof-log rows and published. */
    id: string;
    /** Human label rendered next to the ∈ chip. */
    label: string;
    /** The provable string field this set applies to. */
    sourceField: string;
    /** Exact-spelling member values (1..64 distinct). */
    values: readonly string[];
}

/** Depth of the canonical set tree (frozen contract constant). */
export const SET_MERKLE_DEPTH = 6;
/** Maximum DISTINCT values per set (depth-6 tree). */
export const MAX_SET_VALUES = 1 << SET_MERKLE_DEPTH; // 64

/** The official guide chemistry enum (canonical spellings). */
const CHEMISTRY_CODES = [
    'Li-ion LCO', 'Li-ion LFP', 'Li-ion LMO', 'Li-ion NCA', 'Li-ion NMC',
    'Li-metal', 'Na-ion', 'Ni-Cd', 'Ni-MH', 'Pb',
] as const;

export const CLAIM_SETS: readonly ClaimSet[] = [
    {
        id: 'chemistry-known',
        label: 'Recognized cell chemistries',
        sourceField: 'cellChemistry',
        values: CHEMISTRY_CODES,
    },
    {
        id: 'chemistry-cobalt-free',
        label: 'Cobalt-free chemistries',
        sourceField: 'cellChemistry',
        values: ['Li-ion LFP', 'Li-ion LMO', 'Na-ion', 'Ni-Cd', 'Pb'],
    },
] as const;

export function claimSetById(id: string): ClaimSet | undefined {
    return CLAIM_SETS.find((s) => s.id === id);
}

export function claimSetsForField(sourceField: string): ClaimSet[] {
    return CLAIM_SETS.filter((s) => s.sourceField === sourceField);
}

/** Display label for a set id; falls back to the id (older/foreign rows). */
export function setLabelFor(setId: string | null | undefined): string {
    if (!setId) return 'allowed set';
    return claimSetById(setId)?.label ?? setId;
}
