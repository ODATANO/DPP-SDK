import { scaleValue } from '../fields';
import type { ClaimSet } from './claim-sets';

/**
 * Chain-agnostic ZK claim-cart plan: validate, normalize and dedupe N claims
 * riding in ONE proof transaction for ONE passport. The app injects the
 * provable panel, claim-set catalog, per-tx cap and an optional exclusivity
 * rule, and owns proving/submission. Dedupe drops EXACT duplicates only;
 * anything else that cannot ride throws with the reason (clean 4xx material).
 */

export interface ThresholdCartClaim {
    /** Absent kind means threshold. */
    kind?: 'threshold';
    sourceField: string;
    predicate: 'lessOrEqual' | 'greaterOrEqual';
    /** RAW value (e.g. 4000 for 4000 kg); the plan scales it x1000. */
    threshold: number | string;
}

export interface MembershipCartClaim {
    kind: 'membership';
    sourceField: string;
    /** Catalog id from the injected claim sets. */
    setId: string;
}

export type CartClaim = ThresholdCartClaim | MembershipCartClaim;

export type PlannedCartClaim =
    | {
        kind: 'threshold';
        sourceField: string;
        predicate: 'lessOrEqual' | 'greaterOrEqual';
        /** Scaled x1000, non-negative integer, as decimal string. */
        thresholdScaled: string;
        /** Normalized dedupe key. */
        key: string;
    }
    | {
        kind: 'membership';
        sourceField: string;
        setId: string;
        /** Exact member spellings from the catalog (for proving + publish). */
        setValues: readonly string[];
        key: string;
    };

export interface ClaimCartOptions {
    /** Field names claims may bind to (the app's provable panel). */
    provableFields: readonly string[];
    /** Published membership catalog (claim-sets.ts shape). */
    claimSets: readonly ClaimSet[];
    /** Maximum claims per transaction (after dedupe). */
    maxClaims: number;
    /** Exclusivity groups: claims mapping to the same non-null group cannot share
     * one transaction; return null for "no constraint". */
    groupOf?: (claim: PlannedCartClaim) => string | null;
}

export interface ClaimCartPlan {
    claims: PlannedCartClaim[];
    /** Exact duplicates dropped from the input (wasted proving time only). */
    dropped: PlannedCartClaim[];
}

function normalizeOne(raw: CartClaim, index: number, opts: ClaimCartOptions): PlannedCartClaim {
    if (!raw || typeof raw !== 'object') throw new Error(`claim ${index}: must be an object`);
    const sourceField = String((raw as { sourceField?: unknown }).sourceField ?? '');
    if (!opts.provableFields.includes(sourceField)) {
        throw new Error(`claim ${index}: "${sourceField}" is not a provable field`);
    }
    if ((raw as MembershipCartClaim).kind === 'membership') {
        const setId = String((raw as MembershipCartClaim).setId ?? '');
        const set = opts.claimSets.find((s) => s.id === setId);
        if (!set) throw new Error(`claim ${index}: unknown claim set "${setId}"`);
        if (set.sourceField !== sourceField) {
            throw new Error(`claim ${index}: claim set "${set.id}" applies to ${set.sourceField}, not ${sourceField}`);
        }
        return { kind: 'membership', sourceField, setId: set.id, setValues: set.values, key: `m|${sourceField}|${set.id}` };
    }
    const claim = raw as ThresholdCartClaim;
    if (claim.kind !== undefined && claim.kind !== 'threshold') {
        throw new Error(`claim ${index}: unknown kind "${String(claim.kind)}"`);
    }
    if (claim.predicate !== 'lessOrEqual' && claim.predicate !== 'greaterOrEqual') {
        throw new Error(`claim ${index}: predicate must be lessOrEqual or greaterOrEqual`);
    }
    if (claim.threshold == null || claim.threshold === '' || Number.isNaN(Number(claim.threshold))) {
        throw new Error(`claim ${index}: threshold must be a number`);
    }
    const thresholdScaled = scaleValue(claim.threshold);
    if (!Number.isSafeInteger(thresholdScaled) || thresholdScaled < 0) {
        throw new Error(`claim ${index}: threshold out of range`);
    }
    return {
        kind: 'threshold', sourceField, predicate: claim.predicate,
        thresholdScaled: String(thresholdScaled),
        key: `t|${sourceField}|${claim.predicate}|${thresholdScaled}`,
    };
}

/** Validate + normalize + dedupe a cart; throws with the reason on any claim
 * that cannot ride. */
export function buildClaimCart(claims: readonly CartClaim[], opts: ClaimCartOptions): ClaimCartPlan {
    if (!Array.isArray(claims) || claims.length === 0) {
        throw new Error('the cart must contain at least one claim');
    }
    const kept: PlannedCartClaim[] = [];
    const dropped: PlannedCartClaim[] = [];
    const seen = new Set<string>();
    for (const [index, raw] of claims.entries()) {
        const claim = normalizeOne(raw, index, opts);
        if (seen.has(claim.key)) { dropped.push(claim); continue; }
        seen.add(claim.key);
        kept.push(claim);
    }
    if (kept.length > opts.maxClaims) {
        throw new Error(`too many claims for one transaction: ${kept.length} distinct, maximum ${opts.maxClaims}`);
    }
    if (opts.groupOf) {
        const byGroup = new Map<string, PlannedCartClaim>();
        for (const claim of kept) {
            const group = opts.groupOf(claim);
            if (group == null) continue;
            const other = byGroup.get(group);
            if (other) {
                throw new Error(
                    `claims "${other.key}" and "${claim.key}" both need the ${group} verifier and cannot share one transaction`
                );
            }
            byGroup.set(group, claim);
        }
    }
    return { claims: kept, dropped };
}
