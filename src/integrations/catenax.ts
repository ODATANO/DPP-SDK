/**
 * Catena-X export envelopes, product- and chain-agnostic. Aspect: a SAMM
 * aspect JSON frame (producer-owned, no redaction). PAC: W3C-VC
 * PredicateAttestationCredential envelope. Aspect URN, profile strings,
 * sections and every chain-specific block are injected by the consumer.
 * Browser-safe: no node builtins, no environment reads.
 */

export interface AspectEnvelope {
    /** SAMM aspect URN, e.g. urn:samm:io.catenax.battery.battery_pass:6.0.0#BatteryPass. */
    aspect: string;
    /** Human profile line, e.g. "EU 2023/1542 Annex XIII, Catena-X CX-0143". */
    profile: string;
    passportId: string;
    /** Head-row fields published verbatim. */
    general: Record<string, unknown>;
    /** Named sections (child collections etc.) published verbatim, in order. */
    sections: Record<string, unknown>;
    /** Chain-specific integrity block (payload hash, anchor refs, tx hashes). */
    integrity: Record<string, unknown>;
}

/** Aspect JSON: aspect, profile, passportId, general, ...sections, integrity. */
export function buildAspectJson(env: AspectEnvelope): string {
    const aspect = {
        aspect: env.aspect,
        profile: env.profile,
        passportId: env.passportId,
        general: env.general,
        ...env.sections,
        integrity: env.integrity,
    };
    return JSON.stringify(aspect, null, 2);
}

export interface PacInput {
    /** Profile line, e.g. "Catena-X CX-0143 Battery Passport". */
    profile: string;
    /** Regulation reference, e.g. "EU 2023/1542 Annex XIII". */
    standard: string;
    passportId: string;
    /** Portable verifiers bind chain-side tokens/claims back via this hash. */
    passportIdHash?: string | null;
    payloadHash?: string | null;
    /** Extra credentialSubject fields (category, model, manufacturer). */
    subject?: Record<string, unknown>;
    /** Chain-specific attestation evidence block, injected verbatim. */
    attestation: Record<string, unknown>;
    /** Chain-specific per-claim evidence entries, injected verbatim. */
    predicateProofs: Array<Record<string, unknown>>;
    /** Credential id prefix (default urn:dpp:). */
    idPrefix?: string;
    /** Injectable for deterministic output; defaults to now. */
    issuanceDate?: string;
}

/** W3C-VC PredicateAttestationCredential (Catena-X PAC profile) envelope. */
export function buildPacJson(input: PacInput): string {
    const credential = {
        '@context': ['https://www.w3.org/ns/credentials/v2', 'https://catena-x.net/schema/pac/v1'],
        type: ['VerifiableCredential', 'PredicateAttestationCredential'],
        id: `${input.idPrefix ?? 'urn:dpp:'}${input.passportId}`,
        profile: input.profile,
        issuanceDate: input.issuanceDate ?? new Date().toISOString(),
        credentialSubject: {
            passportId: input.passportId,
            passportIdHash: input.passportIdHash ?? null,
            standard: input.standard,
            ...(input.subject ?? {}),
            payloadHash: input.payloadHash ?? null,
            attestation: input.attestation,
            predicateProofs: input.predicateProofs,
        },
    };
    return JSON.stringify(credential, null, 2);
}
