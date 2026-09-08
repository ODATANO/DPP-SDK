import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, decodeBase64Upload, sha256Hex, MAX_UPLOAD_BYTES } from '../../src/upload';

describe('validateUpload', () => {
    it('accepts a pdf within the size cap', () => {
        assert.deepEqual(validateUpload('report.pdf', 'application/pdf', 1024), { ok: true });
    });
    it('rejects unsupported mime types', () => {
        assert.equal(validateUpload('x.exe', 'application/x-msdownload', 10).ok, false);
        assert.equal(validateUpload('x.html', 'text/html', 10).ok, false);
    });
    it('rejects path separators in the file name', () => {
        assert.equal(validateUpload('../../etc/passwd', 'application/pdf', 10).ok, false);
        assert.equal(validateUpload('a\\b.pdf', 'application/pdf', 10).ok, false);
    });
    it('rejects empty and oversized uploads', () => {
        assert.equal(validateUpload('a.pdf', 'application/pdf', 0).ok, false);
        assert.equal(validateUpload('a.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1).ok, false);
    });
});

describe('decodeBase64Upload', () => {
    it('round-trips plain base64 and data-url prefixed input', () => {
        const b64 = Buffer.from('hello dpp').toString('base64');
        assert.equal(decodeBase64Upload(b64)?.toString(), 'hello dpp');
        assert.equal(decodeBase64Upload(`data:application/pdf;base64,${b64}`)?.toString(), 'hello dpp');
    });
    it('rejects empty and malformed input', () => {
        assert.equal(decodeBase64Upload(''), null);
        assert.equal(decodeBase64Upload('not@@base64!!'), null);
    });
});

describe('sha256Hex', () => {
    it('matches the known vector for "abc"', () => {
        assert.equal(sha256Hex(Buffer.from('abc')),
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});
