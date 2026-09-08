/**
 * Access vocabulary shared by every product family: a datum carries an
 * AccessClass (the minimum level that may read it), a caller holds an
 * AccessLevel. Unknown or missing classes fail closed to authority-only.
 * Browser-safe.
 */

export const ACCESS_LEVELS = ['public', 'legitimateInterest', 'authority'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
/** Classification of a datum: the lowest level allowed to read it. */
export type AccessClass = AccessLevel;

export const ACCESS_RANK: Record<AccessLevel, number> = { public: 0, legitimateInterest: 1, authority: 2 };

export function isAccessLevel(v: unknown): v is AccessLevel {
    return typeof v === 'string' && (ACCESS_LEVELS as readonly string[]).includes(v);
}

export function maxLevel(a: AccessLevel, b: AccessLevel): AccessLevel {
    return ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;
}

/** Numeric grant level (0/1/2, as stored on disclosure grants) to access level. */
export function levelFromRank(rank: number): AccessLevel {
    return rank >= 2 ? 'authority' : rank === 1 ? 'legitimateInterest' : 'public';
}

/** Whether a holder of `level` may read a datum of class `cls`. Fail closed on unknown classes. */
export function canRead(level: AccessLevel, cls: unknown): boolean {
    if (!isAccessLevel(cls)) return level === 'authority';
    return ACCESS_RANK[level] >= ACCESS_RANK[cls];
}

/** Delete a set of keys from a row in place. */
export function strip(row: Record<string, unknown>, keys: readonly string[]): void {
    for (const k of keys) delete row[k];
}
