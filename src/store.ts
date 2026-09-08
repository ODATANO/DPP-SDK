/**
 * Versioned DPP document store + pure document helpers for a DPP Life Cycle
 * API adapter (BatteryPass-Ready v1.1 shape, product-neutral). The document
 * profile names the wrapper key, identifier attributes and access classes.
 * Deliberately process-local: conformance executors seed state per scenario.
 */
import { type AccessClass, type AccessLevel, canRead } from './access';

export type DppStatus = 'draft' | 'active' | 'archived' | 'deleted';

export interface DppVersion {
    dppId: string;
    productId: string;
    version: number;
    status: DppStatus;
    document: unknown;
    validFrom: string; // ISO timestamp when this version became current
}

/** Role names a Life Cycle API test adapter issues credentials for. */
export type DppRole = 'public' | 'legitimate_interest' | 'authority' | 'commission';

export function roleLevel(role: DppRole): AccessLevel {
    if (role === 'authority' || role === 'commission') return 'authority';
    if (role === 'legitimate_interest') return 'legitimateInterest';
    return 'public';
}

export interface DocumentProfile {
    /** Optional wrapper key around the document body (e.g. Battery_Passport). */
    rootKey?: string;
    /** Section holding the identifier attributes. */
    identifiersSection: string;
    dppIdAttribute: string;
    productIdAttribute: string;
    operatorIdAttribute?: string;
    /** Status attribute and the key of its value object, e.g. DPPStatus / dppStatusValue. */
    statusAttribute: string;
    statusValueKey: string;
    lastUpdateAttribute: string;
    /** Attribute name -> access class; unlisted attributes are public. A
     * listed attribute is filtered with its whole substructure. */
    access: Readonly<Record<string, AccessClass>>;
    /** Prefix for generated ids when a document declares none. */
    idPrefix?: string;
}

/** Deep-filter a document for an access level. */
export function filterDocument(profile: DocumentProfile, doc: unknown, level: AccessLevel): unknown {
    if (Array.isArray(doc)) return doc.map((d) => filterDocument(profile, d, level));
    if (!doc || typeof doc !== 'object') return doc;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
        const cls = profile.access[k];
        if (cls && !canRead(level, cls)) continue;
        out[k] = filterDocument(profile, v, level);
    }
    return out;
}

/** RFC 7396 JSON merge patch (null deletes, objects merge, rest replaces). */
export function mergePatch(target: unknown, patch: unknown): unknown {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
    const base: Record<string, unknown> =
        target && typeof target === 'object' && !Array.isArray(target)
            ? { ...(target as Record<string, unknown>) }
            : {};
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
        if (v === null) delete base[k];
        else base[k] = mergePatch(base[k], v);
    }
    return base;
}

/** Split an element path ('/', '.' or ':' separated); JSONPath noise ('$', '*') dropped. */
export function splitElementPath(elementPath: string): string[] {
    const decoded = decodeURIComponent(elementPath);
    return decoded.split(/[/.:]/).map((s) => s.trim()).filter((s) => s && s !== '$' && s !== '*');
}

function hasWrapper(profile: DocumentProfile, doc: unknown): doc is Record<string, unknown> {
    return !!profile.rootKey && !!doc && typeof doc === 'object' && profile.rootKey in (doc as Record<string, unknown>);
}

/** Document body without the optional wrapper. */
export function unwrapDocument(profile: DocumentProfile, doc: unknown): unknown {
    return hasWrapper(profile, doc) ? doc[profile.rootKey!] : doc;
}

/** Path segments without a leading wrapper segment. */
function bodyPath(profile: DocumentProfile, parts: string[]): string[] {
    return profile.rootKey && parts[0] === profile.rootKey ? parts.slice(1) : parts;
}

export function getElement(profile: DocumentProfile, doc: unknown, parts: string[]): unknown {
    let node = unwrapDocument(profile, doc);
    for (const seg of bodyPath(profile, parts)) {
        if (!node || typeof node !== 'object') return undefined;
        node = (node as Record<string, unknown>)[seg];
    }
    return node;
}

/** Set (merge-patch) an element at path; returns a new document. */
export function patchElement(profile: DocumentProfile, doc: unknown, parts: string[], patch: unknown): unknown {
    const segs = bodyPath(profile, parts);
    const root = JSON.parse(JSON.stringify(doc ?? {}));
    let node: Record<string, unknown> = hasWrapper(profile, root) ? (root[profile.rootKey!] as Record<string, unknown>) : root;
    for (const seg of segs.slice(0, -1)) {
        if (typeof node[seg] !== 'object' || node[seg] === null) node[seg] = {};
        node = node[seg] as Record<string, unknown>;
    }
    const leaf = segs[segs.length - 1];
    const merged = mergePatch(node[leaf], patch);
    if (merged === null) delete node[leaf];
    else node[leaf] = merged;
    return root;
}

function identifiersOf(profile: DocumentProfile, doc: unknown): Record<string, unknown> | undefined {
    const body = unwrapDocument(profile, doc) as Record<string, unknown> | undefined;
    return body?.[profile.identifiersSection] as Record<string, unknown> | undefined;
}

function stringIdentifier(profile: DocumentProfile, doc: unknown, attribute: string | undefined): string | undefined {
    if (!attribute) return undefined;
    const v = identifiersOf(profile, doc)?.[attribute];
    return typeof v === 'string' ? v : undefined;
}

export function productIdOf(profile: DocumentProfile, doc: unknown): string | undefined {
    return stringIdentifier(profile, doc, profile.productIdAttribute);
}

export function dppIdOf(profile: DocumentProfile, doc: unknown): string | undefined {
    return stringIdentifier(profile, doc, profile.dppIdAttribute);
}

/** Operator id (needed for the EU Registry registration). */
export function operatorIdOf(profile: DocumentProfile, doc: unknown): string | undefined {
    return stringIdentifier(profile, doc, profile.operatorIdAttribute);
}

export function normalizeStatus(s: unknown): DppStatus | undefined {
    const v = String(s ?? '').toLowerCase();
    return v === 'draft' || v === 'active' || v === 'archived' || v === 'deleted' ? (v as DppStatus) : undefined;
}

/** Status declared inside a document. */
export function statusOf(profile: DocumentProfile, doc: unknown): DppStatus | undefined {
    const s = identifiersOf(profile, doc)?.[profile.statusAttribute] as Record<string, unknown> | undefined;
    return normalizeStatus(s?.[profile.statusValueKey]);
}

/** Stamp the regulation-required last-update timestamp on a deep copy. */
export function touchLastUpdate(profile: DocumentProfile, doc: unknown, at?: string): unknown {
    const copy = JSON.parse(JSON.stringify(doc ?? {}));
    const body = unwrapDocument(profile, copy) as Record<string, unknown> | undefined;
    if (body && typeof body === 'object') {
        const ids = (body[profile.identifiersSection] ??= {}) as Record<string, unknown>;
        ids[profile.lastUpdateAttribute] = (at ?? new Date().toISOString()).replace(/\.\d{3}Z$/, 'Z');
    }
    return copy;
}

function cryptoRandom(): string {
    return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

/** Versioned store keyed by dppId with a productId index. */
export class DocumentStore {
    private byDpp = new Map<string, DppVersion[]>();

    constructor(private readonly profile: DocumentProfile) {}

    clear(): void {
        this.byDpp.clear();
    }

    /** Rehydrate one persisted version row (ordered by version per dppId). */
    loadVersion(row: DppVersion): void {
        const list = this.byDpp.get(row.dppId) ?? [];
        list.push(row);
        list.sort((a, b) => a.version - b.version);
        this.byDpp.set(row.dppId, list);
    }

    /** Insert a fresh DPP as its own chain: an explicit dppId replaces a same-id chain
     * (re-seeding); a colliding document-derived id gets a suffix so passes never merge. */
    insert(opts: { dppId?: string; productId?: string; status?: string; document: unknown; at?: string }): DppVersion {
        const document = opts.document;
        let dppId = opts.dppId;
        if (!dppId) {
            const declared = dppIdOf(this.profile, document) || `${this.profile.idPrefix ?? 'urn:dpp:'}${cryptoRandom()}`;
            dppId = this.byDpp.has(declared) ? `${declared}#${cryptoRandom().slice(0, 8)}` : declared;
        }
        const productId = opts.productId || productIdOf(this.profile, document) || dppId;
        const status = normalizeStatus(opts.status) ?? statusOf(this.profile, document) ?? 'active';
        const row: DppVersion = {
            dppId, productId, version: 1, status, document,
            validFrom: opts.at ?? new Date().toISOString(),
        };
        this.byDpp.set(dppId, [row]);
        return row;
    }

    /** Latest version row for a dppId regardless of status. */
    latest(dppId: string): DppVersion | undefined {
        const list = this.byDpp.get(dppId);
        return list?.[list.length - 1];
    }

    /** Readable current version (undefined when archived/deleted or absent). */
    current(dppId: string): DppVersion | undefined {
        const row = this.latest(dppId);
        if (!row || row.status === 'archived' || row.status === 'deleted') return undefined;
        return row;
    }

    /** Supersede the current version with an updated document (new active version). */
    update(dppId: string, document: unknown, at?: string): DppVersion | undefined {
        const list = this.byDpp.get(dppId);
        const head = list?.[list.length - 1];
        if (!head || head.status === 'archived' || head.status === 'deleted') return undefined;
        const row: DppVersion = {
            dppId, productId: head.productId, version: head.version + 1, status: 'active', document,
            validFrom: at ?? new Date().toISOString(),
        };
        list!.push(row);
        return row;
    }

    /** Soft-delete (kept for audit, never served again via normal reads). */
    delete(dppId: string): DppVersion | undefined {
        const list = this.byDpp.get(dppId);
        const head = list?.[list.length - 1];
        if (!head || head.status === 'deleted') return undefined;
        const row: DppVersion = { ...head, version: head.version + 1, status: 'deleted', validFrom: new Date().toISOString() };
        list!.push(row);
        return row;
    }

    /** Mark the whole DPP active (placing the product on the market). */
    activateByProduct(productId: string): DppVersion | undefined {
        for (const list of this.byDpp.values()) {
            const head = list[list.length - 1];
            if (head.productId === productId && head.status !== 'deleted') {
                if (head.status === 'active') return head;
                const row: DppVersion = { ...head, version: head.version + 1, status: 'active', validFrom: new Date().toISOString() };
                list.push(row);
                return row;
            }
        }
        return undefined;
    }

    /** Current active DPP (latest version) for a product id. */
    activeByProduct(productId: string): DppVersion | undefined {
        for (const list of this.byDpp.values()) {
            const head = list[list.length - 1];
            if (head.productId === productId && head.status === 'active') return head;
        }
        return undefined;
    }

    /** The version that was current for a product id at a given date. */
    byProductAndDate(productId: string, date: string): DppVersion | undefined {
        const t = Date.parse(date);
        if (Number.isNaN(t)) return undefined;
        let best: DppVersion | undefined;
        for (const list of this.byDpp.values()) {
            for (const row of list) {
                if (row.productId !== productId || row.status === 'deleted') continue;
                const from = Date.parse(row.validFrom);
                if (from <= t && (!best || from >= Date.parse(best.validFrom))) best = row;
            }
        }
        return best;
    }
}
