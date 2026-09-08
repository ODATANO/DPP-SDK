/**
 * S/4HANA material-document (API_MATERIAL_DOCUMENT_SRV, OData V2) to
 * passport-input mapping, wrapped in a CloudEvent envelope. Product data
 * comes from an injected product master keyed by Material number; its head
 * fields and child collections are copied verbatim, so the mapper is
 * product-neutral. PURE module: no fetch, no clock, no randomness.
 */

import crypto from 'node:crypto';

// --- S/4 OData V2 shapes (the subset the mapping reads) ----------------------

export interface S4MaterialDocumentItem {
    MaterialDocumentYear: string;
    MaterialDocument: string;
    MaterialDocumentItem: string;
    Material: string;
    Plant?: string;
    Batch?: string;
    Supplier?: string;
    GoodsMovementType: string;            // '101' = goods receipt
    QuantityInEntryUnit?: string | number;
    EntryUnit?: string;
    ManufactureDate?: string | null;      // V2 '/Date(ms)/' or ISO
    GoodsMovementIsCancelled?: boolean;
}

export interface S4MaterialDocumentHeader {
    MaterialDocumentYear: string;
    MaterialDocument: string;
    PostingDate?: string | null;          // V2 '/Date(ms)/' or ISO
    DocumentDate?: string | null;
    to_MaterialDocumentItem?: { results: S4MaterialDocumentItem[] } | S4MaterialDocumentItem[];
}

// --- Product master (the non-ERP regulatory side) ----------------------------

export interface ProductMasterEntry {
    /** Optional when S/4 product enrichment supplies the description instead. */
    model?: string;
    /** Optional when S/4 product enrichment supplies the net weight instead. */
    weightKg?: number;
    /** Head-row columns copied verbatim onto the passport input (manufacturerId, category, ...). */
    head: Record<string, unknown>;
    /** Child collections copied verbatim; the serial-bearing child gets the serial injected. */
    children: Record<string, Array<Record<string, unknown>>>;
}

/** Keyed by S/4 Material number, exactly as it appears on the document item. */
export type ProductMaster = Record<string, ProductMasterEntry>;

export interface MappingOptions {
    /** Passport id prefix (e.g. BAT); ids stay short for the EU registry's 50-char UPI cap. */
    idPrefix: string;
    /** Where the per-item serial number is injected (first row of that child). */
    serial?: { child: string; column: string };
}

// --- Output shapes -----------------------------------------------------------

/** Flat passport input: fixed head, then the master's head fields and children. */
export type PassportInput = {
    passportId: string;
    model: string;
    manufactureDate: string;              // YYYY-MM-DD
    weightKg: number;
} & Record<string, unknown>;

export const DEFAULT_ERP_EVENT_TYPE = 'com.odatano.erp.goodsreceipt.created';

export interface ErpCloudEvent {
    specversion: '1.0';
    id: string;
    source: string;
    type: string;
    time: string;
    data: PassportInput;
}

// --- Helpers -----------------------------------------------------------------

/** Parse an OData V2 '/Date(ms)/' or ISO date into 'YYYY-MM-DD'; null for absent/invalid input. */
export function parseS4Date(value: string | null | undefined): string | null {
    if (!value) return null;
    const m = /\/Date\((-?\d+)(?:[+-]\d+)?\)\//.exec(value);
    const d = m ? new Date(Number(m[1])) : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

/** Normalize the V2 `{ results: [...] }` envelope (V4 arrays pass through). */
export function itemsOf(header: S4MaterialDocumentHeader): S4MaterialDocumentItem[] {
    const nav = header.to_MaterialDocumentItem;
    if (!nav) return [];
    return Array.isArray(nav) ? nav : (nav.results ?? []);
}

export interface GoodsReceiptDocItem {
    header: S4MaterialDocumentHeader;
    item: S4MaterialDocumentItem;
}

/** Flatten headers to (header, item) pairs for the wanted movement types (default '101'), dropping cancelled items. */
export function goodsReceiptItems(
    headers: S4MaterialDocumentHeader[],
    movementTypes: readonly string[] = ['101']
): GoodsReceiptDocItem[] {
    const wanted = new Set(movementTypes);
    const out: GoodsReceiptDocItem[] = [];
    for (const header of headers) {
        for (const item of itemsOf(header)) {
            if (!wanted.has(item.GoodsMovementType)) continue;
            if (item.GoodsMovementIsCancelled) continue;
            out.push({ header, item });
        }
    }
    return out;
}

const sanitizeId = (s: string): string =>
    s.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 18);

/** Deterministic passport id per document item, so re-polls are idempotent no-ops. */
export function passportIdFor(item: S4MaterialDocumentItem, idPrefix: string): string {
    return `${idPrefix}-${sanitizeId(item.Material)}-${sanitizeId(item.MaterialDocument)}${sanitizeId(item.MaterialDocumentItem)}`;
}

/** Stable per-document-item key for the bridge's seen-state. */
export function docItemKey(item: S4MaterialDocumentItem): string {
    return `${item.MaterialDocumentYear}/${item.MaterialDocument}/${item.MaterialDocumentItem}`;
}

/** Serial number per item: batch when present, else document + item. */
export function serialNumberFor(item: S4MaterialDocumentItem): string {
    return item.Batch
        ? `SN-${sanitizeId(item.Batch)}`
        : `SN-${sanitizeId(item.MaterialDocument)}-${sanitizeId(item.MaterialDocumentItem)}`;
}

// --- S/4 product-master enrichment (API_PRODUCT_SRV) -------------------------

/** The subset of A_Product / A_ProductDescription the enrichment reads. */
export interface S4ProductData {
    NetWeight?: string | number | null;
    GrossWeight?: string | number | null;
    WeightUnit?: string | null;
    description?: string | null;          // A_ProductDescription.ProductDescription
}

const parseWeightKg = (value: string | number | null | undefined, unit: string | null | undefined): number | null => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const u = String(unit ?? '').toUpperCase();
    if (u === 'KG' || u === 'KGM') return n;
    if (u === 'G' || u === 'GRM') return n / 1000;
    return null;
};

/** Overlay live S/4 product data on a configured entry; S/4 wins where present,
 * configured values remain the fallback. */
export function applyProductData(entry: ProductMasterEntry, product?: S4ProductData | null): ProductMasterEntry {
    if (!product) return entry;
    const weight = parseWeightKg(product.NetWeight, product.WeightUnit)
        ?? parseWeightKg(product.GrossWeight, product.WeightUnit);
    return {
        ...entry,
        weightKg: weight ?? entry.weightKg,
        model: entry.model ?? (product.description || undefined)
    };
}

// --- Mapping -----------------------------------------------------------------

/** Map one goods-receipt document item to the flat passport input.
 * Throws when the material has no product-master entry. */
export function materialDocumentToPassportInput(
    { header, item }: GoodsReceiptDocItem,
    master: ProductMaster,
    opts: MappingOptions
): PassportInput {
    const entry = master[item.Material];
    if (!entry) throw new Error(`no product-master entry for material '${item.Material}'`);
    if (entry.model == null || entry.weightKg == null) {
        throw new Error(`product-master entry '${item.Material}' is missing model/weightKg (set them or enable S/4 product enrichment)`);
    }

    const manufactureDate =
        parseS4Date(item.ManufactureDate) ??
        parseS4Date(header.PostingDate) ??
        parseS4Date(header.DocumentDate);
    if (!manufactureDate) {
        throw new Error(`document ${docItemKey(item)} has no usable manufacture/posting date`);
    }

    const children: Record<string, Array<Record<string, unknown>>> = {};
    for (const [key, rows] of Object.entries(entry.children)) children[key] = rows.map((r) => ({ ...r }));
    if (opts.serial) {
        const rows = (children[opts.serial.child] ??= [{}]);
        rows[0] = { [opts.serial.column]: serialNumberFor(item), ...rows[0] };
    }

    return {
        ...entry.head,
        passportId: passportIdFor(item, opts.idPrefix),
        model: entry.model,
        manufactureDate,
        weightKg: entry.weightKg,
        ...children,
    };
}

/** One row of a cockpit's goods-receipt list. */
export interface GoodsReceiptListRow {
    docKey: string;
    material: string;
    postingDate: string | null;
    passportId: string;
    status: 'ready' | 'exists' | 'unmapped';
    model: string | null;
    weightKg: number | null;
    /** The master's head fields for ready rows (category etc.). */
    head: Record<string, unknown> | null;
    passportJson: string | null;    // ready rows carry the exact passport input
}

/** Flatten fetched documents into cockpit list rows: 'ready' carries a serialized
 * passport input, 'exists' = id already has a passport, 'unmapped' = not in the master. */
export function buildReceiptRows(
    headers: S4MaterialDocumentHeader[],
    master: ProductMaster,
    existingIds: ReadonlySet<string>,
    opts: MappingOptions,
    movementTypes?: readonly string[]
): GoodsReceiptListRow[] {
    return goodsReceiptItems(headers, movementTypes).map((r) => {
        const base = {
            docKey: docItemKey(r.item),
            material: r.item.Material,
            postingDate: parseS4Date(r.header.PostingDate) ?? parseS4Date(r.header.DocumentDate),
            passportId: passportIdFor(r.item, opts.idPrefix)
        };
        try {
            const input = materialDocumentToPassportInput(r, master, opts);
            return {
                ...base,
                status: existingIds.has(base.passportId) ? 'exists' as const : 'ready' as const,
                model: input.model,
                weightKg: input.weightKg,
                head: master[r.item.Material].head,
                passportJson: JSON.stringify(input)
            };
        } catch {
            return { ...base, status: 'unmapped' as const, model: null, weightKg: null, head: null, passportJson: null };
        }
    });
}

/** Wrap a passport input in the webhook's CloudEvent envelope. */
export function toCloudEvent(
    data: PassportInput,
    opts: { source: string; id: string; time: string; type?: string }
): ErpCloudEvent {
    return {
        specversion: '1.0',
        id: opts.id,
        source: opts.source,
        type: opts.type ?? DEFAULT_ERP_EVENT_TYPE,
        time: opts.time,
        data
    };
}

/** HMAC signature the webhook expects in its signature header. */
export function signErpEventBody(rawBody: Buffer | string, secret: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}
