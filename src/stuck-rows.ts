/**
 * Pure decision logic for a boot-time sweep over rows stranded in an
 * in-flight state (anchoring/pending) by a server restart. The IO
 * (reading rows, re-verifying on-chain, writing verdicts) stays in the service.
 */

/** Outcome of an app-side chain re-check (the IO stays with the consumer). */
export type ChainVerdict = 'confirmed' | 'failed' | 'unknown';

export interface StuckRow {
    /** How long the row has been sitting in its in-flight state, in ms. */
    ageMs: number;
    /** True when the row carries enough data to re-check the chain. */
    checkable: boolean;
}

export type SweepAction =
    /** Too young to judge: a detached runner of THIS process may still own it. */
    | { kind: 'leave' }
    /** Old enough and re-checkable: ask the chain what really happened. */
    | { kind: 'recheck' }
    /** Old enough and not re-checkable: close it out honestly as failed. */
    | { kind: 'fail'; reason: string };

/**
 * Rows younger than this may still belong to a live detached runner;
 * anything older cannot be in flight in a freshly started process.
 */
export const STUCK_AFTER_MS = 20 * 60_000;

/** What to do with one in-flight row at boot; the caller supplies the age. */
export function sweepAction(row: StuckRow, stuckAfterMs = STUCK_AFTER_MS): SweepAction {
    if (row.ageMs < stuckAfterMs) return { kind: 'leave' };
    if (row.checkable) return { kind: 'recheck' };
    return { kind: 'fail', reason: 'interrupted by a server restart before the transaction was submitted' };
}

/**
 * Final row state for a re-check verdict. `unknown` deliberately maps to
 * `failed`, never `succeeded`: success we cannot prove must not be claimed.
 */
export function verdictToStatus(verdict: ChainVerdict): { status: 'succeeded' | 'failed'; reason?: string } {
    if (verdict === 'confirmed') return { status: 'succeeded' };
    if (verdict === 'failed') {
        return { status: 'failed', reason: 'not found on-chain after a server restart' };
    }
    return { status: 'failed', reason: 'unconfirmed after a server restart (chain state could not be read)' };
}
