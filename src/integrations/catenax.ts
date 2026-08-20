/**
 * Catena-X export envelopes, chain-agnostic. Aspect: CX-0143 BatteryPass
 * JSON frame (producer-owned, no redaction). PAC: W3C-VC
 * PredicateAttestationCredential envelope. All chain-specific blocks
 * (integrity, attestation, predicateProofs) are injected verbatim by the
 * consumer. Browser-safe: no node builtins, no environment reads.
 */

export interface AspectRows {
    passport: Record<string, any>;
    cells: Array<Record<string, any>>;
    recycled: Array<Record<string, any>>;
    diligence: Array<Record<string, any>>;
    /** Chain-specific integrity block (payload hash, anchor refs, tx hashes). */
    integrity: Record<string, unknown>;
}

/** CX-0143 battery-passport aspect JSON (full structured, producer-owned). */
export function buildAspectJson(rows: AspectRows): string {
    const p = rows.passport;
    const aspect = {
        aspect: 'urn:samm:io.catenax.battery.battery_pass:6.0.0#BatteryPass',
        profile: 'EU 2023/1542 Annex XIII · Catena-X CX-0143',
        passportId: p.passportId,
        general: {
            manufacturerId: p.manufacturerId,
            batteryCategory: p.batteryCategory,
            model: p.model,
            manufactureDate: p.manufactureDate,
            weightKg: p.weightKg,
            performanceClass: p.performanceClass,
            qrCodeUrl: p.qrCodeUrl
        },
        cells: rows.cells,
        recycledContent: rows.recycled,
        dueDiligence: rows.diligence,
        integrity: rows.integrity
    };
    return JSON.stringify(aspect, null, 2);
}

export interface PacInput {
    passport: Record<string, any>;
    /** Chain-specific attestation evidence block, injected verbatim. */
    attestation: Record<string, unknown>;
    /** Chain-specific per-claim evidence entries, injected verbatim. */
    predicateProofs: Array<Record<string, unknown>>;
}

/** W3C-VC PredicateAttestationCredential (Catena-X PAC profile) envelope. */
export function buildPacJson(input: PacInput): string {
    const p = input.passport;
    const credential = {
        '@context': ['https://www.w3.org/ns/credentials/v2', 'https://catena-x.net/schema/pac/v1'],
        type: ['VerifiableCredential', 'PredicateAttestationCredential'],
        id: `urn:bpass:${p.passportId}`,
        profile: 'Catena-X CX-0143 Battery Passport',
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
            passportId: p.passportId,
            // Portable verifiers bind chain-side tokens/claims back via this hash.
            passportIdHash: p.passportIdHash ?? null,
            standard: 'EU 2023/1542 Annex XIII',
            batteryCategory: p.batteryCategory,
            model: p.model,
            manufacturerId: p.manufacturerId,
            payloadHash: p.payloadHash,
            attestation: input.attestation,
            predicateProofs: input.predicateProofs
        }
    };
    return JSON.stringify(credential, null, 2);
}
