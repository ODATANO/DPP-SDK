/**
 * Product profile: the one object that tells the generic engine what a
 * product family looks like. It drives the canonical payload projection
 * (frozen hash contract, see projectPayload), row redaction per access level
 * and provable-field collection. A profile is data, so a new product family
 * is a new profile, not new engine code. Browser-safe.
 */
import { type AccessLevel, ACCESS_RANK, strip } from './access';
import { type AttributeRow, hashableAttributes, filterAttributes } from './attributes';
import type { FieldKind } from './fields';

export type ColumnKind = 'number' | 'string';

export interface ChildSpec {
    /** Projected columns; numbers are coerced so sqlite and pg rows hash alike. */
    columns: Readonly<Record<string, ColumnKind>>;
    /** Stable sort of the projected rows (columns joined with NUL). */
    sortBy: readonly string[];
    /** Columns stripped for holders below authority. */
    authorityColumns?: readonly string[];
    /** Collection hidden entirely below this level (default legitimateInterest). */
    minLevel?: AccessLevel;
}

export interface FieldSource {
    child: string;
    column: string;
    /** Pick the row whose `column` equals `value` instead of the first row. */
    match?: { column: string; value: string };
}

export interface ProvableFieldSpec {
    name: string;
    kind: FieldKind;
    /** Absent: the value is measured elsewhere and passed to collectFieldValues as `extra`. */
    source?: FieldSource;
}

export interface ProductProfile {
    id: string;
    /** Disjoint hash spaces per projection version. */
    payloadVersion: number;
    /** Payload key -> child spec. `attributes` is reserved. */
    children: Readonly<Record<string, ChildSpec>>;
    /** Ordered panel; leaf index in the content tree = position here. */
    provableFields: readonly ProvableFieldSpec[];
    /** Head-row columns stripped below authority. */
    authorityFields?: readonly string[];
}

/** A head row with expanded children and attribute rows, as apps read it. */
export type ProfileRows = Record<string, unknown> & { attributes?: AttributeRow[] | null };

export function defineProfile(profile: ProductProfile): ProductProfile {
    if ('attributes' in profile.children) throw new Error('profile: "attributes" is a reserved payload key');
    const names = new Set<string>();
    for (const f of profile.provableFields) {
        if (names.has(f.name)) throw new Error(`profile: duplicate provable field ${f.name}`);
        names.add(f.name);
        if (f.source && !(f.source.child in profile.children)) {
            throw new Error(`profile: field ${f.name} reads unknown child ${f.source.child}`);
        }
    }
    return profile;
}

// --- Payload projection (FROZEN byte contract) ------------------------------

function num(v: unknown): number | undefined {
    if (v == null) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
    if (v == null) return undefined;
    const s = String(v);
    return s === '' ? undefined : s;
}

function projectRow(row: Record<string, unknown>, spec: ChildSpec): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [col, kind] of Object.entries(spec.columns)) {
        const v = kind === 'number' ? num(row[col]) : str(row[col]);
        if (v !== undefined) out[col] = v;
    }
    return out;
}

const sortKeyOf = (row: Record<string, unknown>, cols: readonly string[]) =>
    cols.map((c) => String(row[c] ?? '')).join('\0');

/**
 * Canonical payload: payloadVersion, every child projected to its columns
 * (null/undefined/empty dropped, numbers coerced, stable sort), attributes
 * via hashableAttributes. Hash it with hashPayload.
 */
export function projectPayload(profile: ProductProfile, rows: ProfileRows): Record<string, unknown> {
    const out: Record<string, unknown> = { payloadVersion: profile.payloadVersion };
    for (const [key, spec] of Object.entries(profile.children)) {
        const src = Array.isArray(rows[key]) ? (rows[key] as Record<string, unknown>[]) : [];
        out[key] = src
            .map((r) => projectRow(r, spec))
            .sort((a, b) => sortKeyOf(a, spec.sortBy).localeCompare(sortKeyOf(b, spec.sortBy)));
    }
    out.attributes = hashableAttributes(rows.attributes ?? []);
    return out;
}

// --- Redaction ---------------------------------------------------------------

const DEFAULT_MIN_LEVEL: AccessLevel = 'legitimateInterest';

/** Redact one child row in place (direct child reads must not leak to lower levels). */
export function redactChildRow(spec: ChildSpec, row: Record<string, unknown>, level: AccessLevel): void {
    if (ACCESS_RANK[level] < ACCESS_RANK[spec.minLevel ?? DEFAULT_MIN_LEVEL]) { strip(row, Object.keys(row)); return; }
    if (level !== 'authority') strip(row, spec.authorityColumns ?? []);
}

/**
 * Redact a head row with expanded children and attributes in place.
 * `extraAuthorityFields` = the app's chain-specific lineage columns.
 */
export function redactRow(
    profile: ProductProfile,
    row: ProfileRows,
    level: AccessLevel,
    extraAuthorityFields: readonly string[] = [],
): void {
    if (level !== 'authority') strip(row, [...(profile.authorityFields ?? []), ...extraAuthorityFields]);
    for (const [key, spec] of Object.entries(profile.children)) {
        const val = row[key];
        if (!Array.isArray(val)) continue;
        if (ACCESS_RANK[level] < ACCESS_RANK[spec.minLevel ?? DEFAULT_MIN_LEVEL]) { row[key] = []; continue; }
        for (const child of val) redactChildRow(spec, child as Record<string, unknown>, level);
    }
    if (Array.isArray(row.attributes)) row.attributes = filterAttributes(row.attributes, level);
}

// --- Provable fields ---------------------------------------------------------

/** Ordered field names (the leaf order of the content tree). */
export function panelOf(profile: ProductProfile): string[] {
    return profile.provableFields.map((f) => f.name);
}

export function fieldKindOf(profile: ProductProfile, fieldName: string): FieldKind | null {
    return profile.provableFields.find((f) => f.name === fieldName)?.kind ?? null;
}

const present = (v: unknown): v is number | string => v != null && v !== '';

/** Provable-field values of a passport: sourced fields from the rows, the rest from `extra`. */
export function collectFieldValues(
    profile: ProductProfile,
    rows: ProfileRows,
    extra?: Record<string, number | string | null | undefined>,
): Record<string, number | string> {
    const out: Record<string, number | string> = {};
    for (const f of profile.provableFields) {
        if (!f.source) {
            const v = extra?.[f.name];
            if (present(v)) out[f.name] = v;
            continue;
        }
        const list = Array.isArray(rows[f.source.child]) ? (rows[f.source.child] as Record<string, unknown>[]) : [];
        const m = f.source.match;
        const row = m ? list.find((r) => String(r[m.column] ?? '') === m.value) : list[0];
        const v = row?.[f.source.column];
        if (present(v)) out[f.name] = v;
    }
    return out;
}
