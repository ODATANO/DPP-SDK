/**
 * Annex XIII disclosure tiers and row redaction as pure functions.
 * consumer = Point 1 public metadata only; recycler adds legitimate-interest
 * fields; authority sees everything. Chain-specific authority-only lineage
 * columns are injected by the caller. Browser-safe.
 */

export type Tier = 'consumer' | 'recycler' | 'authority';

export const TIER_RANK: Record<Tier, number> = { consumer: 0, recycler: 1, authority: 2 };

export function maxTier(a: Tier, b: Tier): Tier {
    return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** Disclosure-grant level (0/1/2) -> tier. */
export function levelToTier(level: number): Tier {
    return level >= 2 ? 'authority' : level === 1 ? 'recycler' : 'consumer';
}

/** Delete a set of keys from a row in place. */
export function strip(row: Record<string, unknown>, keys: readonly string[]): void {
    for (const k of keys) delete row[k];
}

/** Which longlist access classes a tier may read (guide-format attribute rows). */
export function attributeVisible(accessClass: unknown, tier: Tier): boolean {
    if (accessClass === 'authority') return tier === 'authority';
    if (accessClass === 'legitimateInterest') return tier !== 'consumer';
    return true; // public (also rows with no class yet)
}

/** Authority-only columns on the child entities (supplier identity, CO2). */
export const BATTERY_AUTHORITY_FIELDS = ['carbonFootprintKgCO2', 'supplierName'] as const;
export const RECYCLED_AUTHORITY_FIELDS = ['sourceSupplierName'] as const;

/** Consumers see nothing at all: DIRECT child reads (GET /Batteries) must not
 * leak Points 2/3 fields to anonymous callers. Non-authority loses the authority columns. */
export function redactBattery(row: Record<string, unknown>, tier: Tier): void {
    if (tier === 'consumer') { strip(row, Object.keys(row)); return; }
    if (tier !== 'authority') strip(row, BATTERY_AUTHORITY_FIELDS);
}

/** sourceSupplierName (supplier identity) is authority-only; consumers see nothing. */
export function redactRecycled(row: Record<string, unknown>, tier: Tier): void {
    if (tier === 'consumer') { strip(row, Object.keys(row)); return; }
    if (tier !== 'authority') strip(row, RECYCLED_AUTHORITY_FIELDS);
}

/** Redact one Passports row (and expanded children) for a tier.
 * `authorityFields` = the app's beyond-Point-1 lineage columns. */
export function redactPassport(
    row: Record<string, unknown>,
    tier: Tier,
    authorityFields: readonly string[]
): void {
    if (tier !== 'authority') strip(row, authorityFields);

    for (const child of ['batteries', 'recycledMaterials', 'diligenceDocs'] as const) {
        const val = row[child];
        if (!Array.isArray(val)) continue;
        if (tier === 'consumer') { row[child] = []; continue; }
    }
    if (Array.isArray(row.batteries)) row.batteries.forEach((b) => redactBattery(b, tier));
    if (Array.isArray(row.recycledMaterials)) row.recycledMaterials.forEach((m) => redactRecycled(m, tier));
    if (tier !== 'authority') row.diligenceDocs = [];
    // Fail closed: an attribute row whose accessClass was not selected cannot
    // be classified and is only served to authority.
    if (Array.isArray(row.attributes)) {
        row.attributes = row.attributes.filter((a) => {
            const cls = (a as Record<string, unknown>)?.accessClass;
            return typeof cls === 'string' ? attributeVisible(cls, tier) : tier === 'authority';
        });
    }
}
