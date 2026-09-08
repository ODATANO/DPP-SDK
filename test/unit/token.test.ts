import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenSigner } from '../../src/token';

describe('conformance tokens', () => {
    const signer = createTokenSigner({ secret: 'test-secret' });

    it('round-trips a minted token to its role', () => {
        assert.equal(signer.roleOf(signer.mint('authority')), 'authority');
        assert.equal(signer.roleOf(signer.mint('economic_operator')), 'economic_operator');
    });

    // Before signing, any string SHAPED like a token granted the role it claimed.
    it('rejects a forged self-describing token', () => {
        assert.equal(signer.roleOf('bp.authority.x'), undefined);
        assert.equal(signer.roleOf('bp.economic_operator.11111111-1111-1111-1111-111111111111'), undefined);
    });

    it('rejects a tampered signature or role', () => {
        const token = signer.mint('public');
        const [prefix, role, uuid, sig] = token.split('.');
        assert.equal(signer.roleOf(`${prefix}.authority.${uuid}.${sig}`), undefined, 'role swap must not verify');
        assert.equal(signer.roleOf(`${prefix}.${role}.${uuid}.${'0'.repeat(32)}`), undefined, 'bad signature must not verify');
        assert.equal(signer.roleOf(`${prefix}.${role}.${uuid}`), undefined, 'unsigned must not verify');
    });

    it('rejects junk without throwing', () => {
        for (const junk of ['', 'bearer x', 'bp..', 'bp.a.b.c.d']) {
            assert.equal(signer.roleOf(junk), undefined);
        }
    });

    it('secrets and prefixes isolate signers', () => {
        const other = createTokenSigner({ secret: 'other' });
        assert.equal(other.roleOf(signer.mint('authority')), undefined);
        const tx = createTokenSigner({ secret: 'test-secret', prefix: 'tx' });
        assert.match(tx.mint('public'), /^tx\.public\./);
        assert.equal(signer.roleOf(tx.mint('public')), undefined);
        assert.equal(createTokenSigner().roleOf(signer.mint('public')), undefined, 'random per-process secret');
        assert.throws(() => createTokenSigner({ prefix: 'Bad.' }), /prefix/);
        assert.throws(() => signer.mint('Bad Role'), /role/);
    });
});
