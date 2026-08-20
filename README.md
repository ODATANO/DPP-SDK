# @odatano/dpp-sdk

Chain-agnostic TypeScript SDK for **EU Battery Regulation (2023/1542, Annex
XIII) Digital Product Passports**: canonical payload hashing, encryption,
disclosure tiers, provable-field handling and the battery domain model.

It is the shared core of the ODATANO passport applications, which anchor
the same passport content on different chains (Midnight and Cardano). A
passport anchored by one must verify against data produced by the other, so
everything that has to behave identically on both sides lives in this
package, and a golden-vector test suite recorded from the live applications
fails the build if any output ever changes.

The SDK contains **no chain code**: no wallet, no transaction building, no
network calls. It also reads no environment; encryption keys and app
specifics are passed in by the caller.

## Install

```bash
npm install @odatano/dpp-sdk
```

Node.js >= 22. Import per subpath (there is a root barrel, but subpath
imports keep bundles small):

```ts
import { hashPayload } from '@odatano/dpp-sdk/hash';
import { payloadFromDb } from '@odatano/dpp-sdk/payload';
import { encryptPayload, masterKeyFromHex } from '@odatano/dpp-sdk/cipher';
import { redactPassport } from '@odatano/dpp-sdk/tier';
```

## Quick start

```ts
import { payloadFromDb } from '@odatano/dpp-sdk/payload';
import { hashPayload } from '@odatano/dpp-sdk/hash';
import { encryptPayload, masterKeyFromHex } from '@odatano/dpp-sdk/cipher';

// 1. Project database rows into the canonical passport payload.
const payload = payloadFromDb({
  passport: row, batteries, recycledMaterials, diligenceDocs, attributes,
});

// 2. Hash it: this 32-byte value is what gets anchored on-chain.
const { canonicalPayload, payloadHash } = hashPayload(payload);

// 3. Encrypt the full content for off-chain storage; only the hash is public.
const cipher = encryptPayload(canonicalPayload, passportId, masterKeyFromHex(keyHex));
```

Anyone holding the same rows reproduces the same `payloadHash`, on any
chain, in any app, which is the whole point.

## Subpaths and main exports

| Subpath | Main exports |
|---|---|
| `hash` | `canonicalize`, `blake2b256Hex`, `blake2b256Bytes`, `hashPayload` |
| `payload` | `payloadFromDb`, `PAYLOAD_VERSION`, `PayloadInputs` |
| `cipher` | `encryptPayload`, `decryptPayload`, `masterKeyFromHex`, `assertEncryptionKey` (Node only) |
| `tier` | `Tier`, `maxTier`, `levelToTier`, `redactPassport`, `redactBattery`, `redactRecycled`, `attributeVisible` |
| `fields` | `PROVABLE_FIELDS`, `VALUE_SCALE`, `scaleValue`, `fieldKeyHex`, `fieldValuesFor`, hex helpers |
| `merkle` | `buildTree` (pluggable node hash), `proofFor`, `verifyProof`, `MERKLE_DEPTH` |
| `grantee` | `granteeIdForDid`, `normalizeGrantee` |
| `http` | security-header and correlation-id helpers (Node only) |
| `battery/lifecycle` | `validateTransition`, `parseBatteryStatus`, `encodeBatteryStatus`, `dppStatusFor` |
| `battery/attributes` | telemetry attribute allowlist + encoders (`DYNAMIC_ATTRIBUTES`, `encodeDynamicValue`, `decodeDynamicValue`) |
| `battery/guide-defaults` | DIN DKE SPEC 99100 default attribute sets per battery category, `hashableAttributes` |
| `battery/guide-document` | official guide-format document builder (`buildGuideDocument`) |
| `battery/bms-simulator` | deterministic degradation-curve telemetry simulator |
| `battery/diligence` | due-diligence upload validation (mime/size/path guards) |
| `battery/token` / `battery/store` | DPP Life Cycle API document store + token helpers |
| `battery/claim-sets` | published membership allow-lists (`CLAIM_SETS`, `claimSetById`) |
| `battery/claim-cart` | `buildClaimCart`: validate/normalize/dedupe N ZK claims for one proof transaction |
| `battery/stuck-rows` | crash-recovery sweep planning for interrupted anchor pipelines |
| `integrations/catenax` | Catena-X CX-0143 aspect + verifiable-credential envelopes (chain evidence injected) |
| `integrations/s4` | S/4HANA material-document mapper (Node only) |

Subpaths not marked "Node only" are dependency-light and bundle for the
browser.

## Stability

The on-chain anchors of already-issued passports depend on this package's
outputs staying exactly as they are: the payload projection, the canonical
serialization, the hash and the cipher wire format are frozen and pinned by
the golden-vector tests. Any change to them is a breaking release and means
re-anchoring existing passports. Details of the formats live in the source
of `payload.ts`, `hash.ts` and `cipher.ts`, next to the code that enforces
them.

## Development

```bash
npm install
npm run typecheck && npm test   # node:test via tsx
npm run build                   # tsup: CJS + ESM + d.ts per subpath
npm run check:consumers         # packs + resolves the tarball under both consumer tsconfig profiles
```

## License

[Apache-2.0](/LICENSE)
