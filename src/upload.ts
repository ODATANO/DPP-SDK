/**
 * Validation + hashing for evidence uploads (documents whose bytes stay
 * off-chain; only the sha256 is anchored). Node-only (node:crypto).
 */
import { createHash } from 'node:crypto';

/** Documents only: reports, audits, scans. No active content. */
export const DEFAULT_ALLOWED_MIME_TYPES: readonly string[] = [
    'application/pdf',
    'application/json',
    'text/plain',
    'image/png',
    'image/jpeg',
];

/** 8 MB cap: evidence PDFs, not archives; rows travel through OData + SQLite. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface UploadValidation { ok: boolean; error?: string }

export interface UploadLimits {
    allowedMimeTypes?: readonly string[];
    maxBytes?: number;
}

export function validateUpload(
    fileName: string, mimeType: string, sizeBytes: number, limits: UploadLimits = {},
): UploadValidation {
    const allowed = limits.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
    const maxBytes = limits.maxBytes ?? MAX_UPLOAD_BYTES;
    if (!fileName || fileName.length > 255) return { ok: false, error: 'fileName is required (max 255 chars)' };
    // Path fragments in a display name are always an injection attempt.
    if (/[\\/]|\.\./.test(fileName)) return { ok: false, error: 'fileName must not contain path separators' };
    if (!allowed.includes(mimeType)) {
        return { ok: false, error: `unsupported mimeType '${mimeType}' (allowed: ${allowed.join(', ')})` };
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return { ok: false, error: 'empty upload' };
    if (sizeBytes > maxBytes) {
        return { ok: false, error: `file exceeds the ${maxBytes / (1024 * 1024)} MB limit` };
    }
    return { ok: true };
}

/** Decode a base64 (optionally data-URI prefixed) payload; null on malformed input. */
export function decodeBase64Upload(contentBase64: string): Buffer | null {
    if (!contentBase64) return null;
    const normalized = contentBase64.replace(/^data:[^;]+;base64,/, '');
    try {
        const buf = Buffer.from(normalized, 'base64');
        // Re-encode round-trip guards against silently truncated garbage input.
        if (!buf.length || buf.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) return null;
        return buf;
    } catch { return null; }
}

export function sha256Hex(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}
