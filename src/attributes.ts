/**
 * Product-neutral attribute rows: (section, attribute, valueJson, accessClass).
 * hashableAttributes is part of the frozen hash contract (sorted by attribute,
 * accessClass rides in the hash). attributesAsOf reconstructs history in
 * plain JS so no dialect-specific date SQL is needed. Browser-safe.
 */
import { type AccessClass, type AccessLevel, canRead } from './access';

export interface AttributeRow {
    section: string;
    attribute: string;
    valueJson: string;
    accessClass: AccessClass;
}

/** Order-stable projection for the anchored payload hash. FROZEN. */
export function hashableAttributes(rows: AttributeRow[]): AttributeRow[] {
    return [...rows]
        .map(({ section, attribute, valueJson, accessClass }) => ({ section, attribute, valueJson, accessClass }))
        .sort((a, b) => a.attribute.localeCompare(b.attribute));
}

/** Rows a holder of `level` may read; rows without a readable class only reach authority. */
export function filterAttributes<T extends { accessClass?: unknown }>(rows: T[], level: AccessLevel): T[] {
    return rows.filter((a) => canRead(level, a?.accessClass));
}

export interface AttributeUpdate { attribute: string; value: unknown }

/** Last-wins dedupe by attribute name. */
export function dedupeUpdates(updates: AttributeUpdate[]): AttributeUpdate[] {
    const byAttribute = new Map<string, AttributeUpdate>();
    for (const u of updates) byAttribute.set(u.attribute, u);
    return [...byAttribute.values()];
}

export interface CurrentRowLike {
    section: string;
    attribute: string;
    valueJson: string;
    accessClass: string;
}

export interface HistoryRowLike {
    attribute: string;
    valueJson: string;
    version: number;
    validFrom: string | Date;
}

const toIso = (v: string | Date): string => new Date(v).toISOString();

/**
 * Attribute rows as of a date: per attribute the highest version with
 * validFrom <= date (version breaks ties), else the lowest version (creation
 * baseline). lastChangeAt = latest applied non-baseline validFrom.
 */
export function attributesAsOf(
    current: CurrentRowLike[],
    history: HistoryRowLike[],
    asOfIso: string,
): { rows: CurrentRowLike[]; lastChangeAt?: string } {
    const asOf = toIso(asOfIso);
    const byAttribute = new Map<string, HistoryRowLike[]>();
    for (const h of history) {
        const list = byAttribute.get(h.attribute);
        if (list) list.push(h); else byAttribute.set(h.attribute, [h]);
    }
    let lastChangeAt: string | undefined;
    const rows = current.map((row) => {
        const versions = byAttribute.get(row.attribute);
        if (!versions?.length) return row;
        const qualifying = versions.filter((v) => toIso(v.validFrom) <= asOf);
        const chosen = qualifying.length
            ? qualifying.reduce((a, b) => (b.version > a.version ? b : a))
            : versions.reduce((a, b) => (b.version < a.version ? b : a));
        if (chosen.version > 0) {
            const at = toIso(chosen.validFrom);
            if (!lastChangeAt || at > lastChangeAt) lastChangeAt = at;
        }
        return { ...row, valueJson: chosen.valueJson };
    });
    return { rows, lastChangeAt };
}
