import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAspectJson, buildPacJson } from '../../src/integrations/catenax';

describe('Catena-X envelopes', () => {
    it('aspect frame carries injected aspect, sections and integrity in order', () => {
        const json = buildAspectJson({
            aspect: 'urn:samm:io.catenax.textile.textile_pass:1.0.0#TextilePass',
            profile: 'ESPR textiles',
            passportId: 'TX-1',
            general: { brand: 'Acme', category: 'jacket' },
            sections: { components: [{ name: 'shell' }], careLabels: [{ code: 'wash30' }] },
            integrity: { payloadHash: 'ab'.repeat(32), chain: 'cardano' },
        });
        const doc = JSON.parse(json);
        assert.deepEqual(Object.keys(doc), ['aspect', 'profile', 'passportId', 'general', 'components', 'careLabels', 'integrity']);
        assert.equal(doc.general.brand, 'Acme');
        assert.equal(doc.integrity.chain, 'cardano');
    });

    it('PAC credential is a VC with the injected subject and evidence blocks', () => {
        const json = buildPacJson({
            profile: 'Catena-X CX-0143 Battery Passport',
            standard: 'EU 2023/1542 Annex XIII',
            passportId: 'BAT-1',
            passportIdHash: 'cd'.repeat(32),
            payloadHash: 'ef'.repeat(32),
            subject: { batteryCategory: 'EV', model: 'PowerCell' },
            attestation: { txHash: 'tx' },
            predicateProofs: [{ field: 'capacityKwh', predicate: 'greaterOrEqual' }],
            issuanceDate: '2026-09-08T00:00:00Z',
        });
        const vc = JSON.parse(json);
        assert.deepEqual(vc.type, ['VerifiableCredential', 'PredicateAttestationCredential']);
        assert.equal(vc.id, 'urn:dpp:BAT-1');
        assert.equal(vc.issuanceDate, '2026-09-08T00:00:00Z');
        assert.equal(vc.credentialSubject.model, 'PowerCell');
        assert.equal(vc.credentialSubject.standard, 'EU 2023/1542 Annex XIII');
        assert.equal(vc.credentialSubject.predicateProofs.length, 1);
        assert.equal(JSON.parse(buildPacJson({
            profile: 'p', standard: 's', passportId: 'X', attestation: {}, predicateProofs: [], idPrefix: 'urn:bpass:',
        })).id, 'urn:bpass:X');
    });
});
