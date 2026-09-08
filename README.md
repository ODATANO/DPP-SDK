# @odatano/dpp-sdk

[![Tests](https://github.com/ODATANO/DPP-SDK/actions/workflows/test.yaml/badge.svg)](https://github.com/ODATANO/DPP-SDK/actions/workflows/test.yaml)
[![codecov](https://codecov.io/gh/ODATANO/DPP-SDK/branch/main/graph/badge.svg)](https://codecov.io/gh/ODATANO/DPP-SDK)
[![npm version](https://img.shields.io/npm/v/@odatano/dpp-sdk?logo=npm)](https://www.npmjs.com/package/@odatano/dpp-sdk)
[![npm downloads](https://img.shields.io/npm/dt/@odatano/dpp-sdk?logo=npm&label=downloads&color=blue)](https://www.npmjs.com/package/@odatano/dpp-sdk)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-yellow)](LICENSE)

Chain-agnostic, product-agnostic TypeScript SDK for **Digital Product
Passports**: canonical payload hashing, encryption, access levels, provable
fields, Merkle content trees, lifecycles and ZK claim planning. A product
family (batteries, textiles, electronics, ...) is described by a **profile**;
the engine does the rest. An EU Battery Regulation (2023/1542, Annex XIII)
profile ships with the package.

It is the shared core of the ODATANO passport applications, which anchor
the same passport content on different chains (Midnight and Cardano). A
passport anchored by one must verify against data produced by the other, so
everything that has to behave identically on both sides lives here, and a
golden-vector suite recorded from the live applications fails the build if
any hashed byte ever changes.

The SDK contains **no chain code**: no wallet, no transaction building, no
network calls. It reads no environment; keys, secrets and policies are
passed in by the caller.

## Install

```bash
npm install @odatano/dpp-sdk
```

Node.js >= 22. Import per subpath (there is a root barrel of the
browser-safe core, but subpath imports keep bundles small).

## Quick start

```ts
import { defineProfile, projectPayload, redactRow, collectFieldValues } from '@odatano/dpp-sdk/profile';
import { hashPayload } from '@odatano/dpp-sdk/hash';
import { encryptPayload, masterKeyFromHex } from '@odatano/dpp-sdk/cipher';

// 1. Describe the product family once.
const TEXTILE = defineProfile({
  id: 'textile',
  payloadVersion: 1,
  children: {
    components: {
      columns: { name: 'string', fibre: 'string', sharePct: 'number', originCountry: 'string' },
      sortBy: ['name'],
      authorityColumns: ['originCountry'],
    },
    audits: { columns: { auditor: 'string', sha256: 'string' }, sortBy: ['sha256'], minLevel: 'authority' },
  },
  provableFields: [
    { name: 'recycledFibrePct', kind: 'numeric',
      source: { child: 'components', column: 'sharePct', match: { column: 'fibre', value: 'rPET' } } },
    { name: 'waterUseLitres', kind: 'numeric' },   // measured, passed in as `extra`
    { name: 'mainFibre', kind: 'string', source: { child: 'components', column: 'fibre' } },
  ],
});

// 2. Project database rows into the canonical payload and hash it.
//    The 32-byte hash is what gets anchored on-chain.
const payload = projectPayload(TEXTILE, { components, audits, attributes });
const { canonicalPayload, payloadHash } = hashPayload(payload);

// 3. Encrypt the full content for off-chain storage; only the hash is public.
const cipher = encryptPayload(canonicalPayload, passportId, masterKeyFromHex(keyHex));

// 4. Serve a row to a caller at an access level.
redactRow(TEXTILE, row, 'legitimateInterest', ['payloadHash', 'anchorTxHash']);

// 5. Provable field values feed the content tree (see merkle).
const values = collectFieldValues(TEXTILE, row, { waterUseLitres: 1200 });
```

Anyone holding the same rows and the same profile reproduces the same
`payloadHash`, on any chain, in any app.

## Concepts

- **Profile** (`profile`): children with typed columns, sort keys and
  authority-only columns; the ordered provable-field panel; head-row
  authority fields. The projection drops null/empty values, coerces numbers
  (sqlite numbers and pg decimal strings hash alike) and sorts rows by a
  stable business key. `payloadVersion` keeps hash spaces disjoint.
- **Access levels** (`access`): `public` < `legitimateInterest` <
  `authority`. A datum carries an access class; unknown or missing classes
  fail closed to authority-only. Apps map their own role names onto these.
- **Attributes** (`attributes`): product-neutral `(section, attribute,
  valueJson, accessClass)` rows, hashed sorted by attribute name, filtered by
  level, reconstructed as of a date.
- **Provable fields** (`fields`, `merkle`): field key = blake2b-256 of the
  name, values scaled x1000 to integers; the leaf index in the content tree
  is the field's position in the profile panel. Leaf and node hashers are
  chain vocabulary and are injected.
- **Lifecycle** (`lifecycle`): a status state machine per product family.
- **Claim sets** (`claim-sets`, `claim-cart`): membership catalogs and the
  per-transaction plan of ZK claims; both take the profile's catalog.
- **Documents** (`store`): a versioned DPP Life Cycle API document store
  driven by a document profile (wrapper key, identifier attributes, access
  classes).

## Subpaths

| Subpath | Main exports |
|---|---|
| `profile` | `defineProfile`, `projectPayload`, `redactRow`, `redactChildRow`, `collectFieldValues`, `panelOf`, `fieldKindOf` |
| `hash` | `canonicalize`, `blake2b256Hex`, `blake2b256Bytes`, `hashPayload` |
| `access` | `AccessLevel`, `canRead`, `maxLevel`, `levelFromRank`, `strip` |
| `attributes` | `AttributeRow`, `hashableAttributes`, `filterAttributes`, `attributesAsOf`, `dedupeUpdates` |
| `fields` | `VALUE_SCALE`, `scaleValue`, `fieldKeyHex`, `weightGramsFromKg` |
| `bytes` | `fromHex32`, `toHex`, `u64be`, `concatBytes` |
| `merkle` | `buildTree` (pluggable node hash), `proofFor`, `verifyProof`, `padToWidth`, `depthForWidth` / `widthForDepth` |
| `lifecycle` | `defineLifecycle` |
| `claim-sets` | `ClaimSet`, `validateClaimSets`, `claimSetById`, `claimSetsForField`, `setLabelFor` |
| `claim-cart` | `buildClaimCart`: validate/normalize/dedupe N ZK claims for one proof transaction |
| `grantee` | `granteeIdForDid`, `normalizeGrantee` |
| `stuck-rows` | crash-recovery sweep planning for interrupted anchor pipelines |
| `cipher` | `encryptPayload`, `decryptPayload`, `masterKeyFromHex`, `assertEncryptionKey` (Node only) |
| `store` | `DocumentStore`, `DocumentProfile`, `filterDocument`, `mergePatch`, element-path helpers (Node only) |
| `upload` | `validateUpload`, `decodeBase64Upload`, `sha256Hex` (Node only) |
| `token` | `createTokenSigner` (Node only) |
| `http` | `createHttpSecurity` middleware factory (Node only) |
| `battery/profile` | `BATTERY_PROFILE`, `BATTERY_PANEL` and the panel slices |
| `battery/lifecycle` | `BATTERY_LIFECYCLE`, `parseBatteryStatus`, `encodeBatteryStatus`, `dppStatusFor` |
| `battery/attributes` | BMS attribute allowlist + guide-shape encoders |
| `battery/guide-defaults` | DIN DKE SPEC 99100 default attribute sets per battery category |
| `battery/guide-document` | guide-format document builder (`buildGuideDocument`) |
| `battery/document` | `BATTERY_DOCUMENT` store profile, `GUIDE_ACCESS` |
| `battery/claim-sets` | `BATTERY_CLAIM_SETS`, `CHEMISTRY_CODES` |
| `battery/bms-simulator` | deterministic degradation-curve telemetry simulator |
| `integrations/catenax` | Catena-X aspect + verifiable-credential envelopes (aspect URN and evidence injected) |
| `integrations/s4` | S/4HANA material-document mapper over an injected product master (Node only) |

Subpaths not marked "Node only" are dependency-light and bundle for the
browser.

## Adding a product family

See [docs/profiles.md](docs/profiles.md). In short: one `defineProfile`
call, optionally a `defineLifecycle`, a claim-set catalog and a document
profile, plus a golden-vector test once the first passport is anchored.

## Content-tree width

The tree walk is depth-derived, so a panel wider than the default 16 slots
needs no fork: pad the ordered slot layer to the width and build.

```ts
import { buildTree, proofFor, padToWidth, depthForWidth } from '@odatano/dpp-sdk/merkle';

const leaves = padToWidth(realLeaves, 32, (i) => emptyLeafFor(i)); // throws if realLeaves is longer
const tree = buildTree(leaves, nodeHash);                          // depth 5, 32 slots
const path = proofFor(tree.levels, slotIndex);                     // 5 siblings, 5 dirs
depthForWidth(32); // 5
```

The width is part of the root's identity: the same values under 16 and 32
slots produce different roots, so a document family picks one width and
keeps it. Anchoring against NIGHTGATE additionally needs the matching vault
lineage (`attestation-vault` for 16, `attestation-vault-32` for 32).

## Stability

The on-chain anchors of already-issued passports depend on the projection,
the canonical serialization, the hash, the field keys and the cipher wire
format staying exactly as they are. These are pinned by the golden-vector
tests; any change there is a breaking release and means re-anchoring. The
module layout and the non-hashed APIs are free to evolve.

## Development

```bash
npm install
npm run typecheck && npm test   # node:test via tsx
npm run build                   # tsup: CJS + ESM + d.ts per subpath
npm run check:consumers         # packs + resolves the tarball under both consumer tsconfig profiles
npm run test:coverage           # lcov report in coverage/ (what CI uploads to Codecov)
```

CI (`.github/workflows/test.yaml`) runs typecheck, tests with coverage,
build and the consumer-resolution probe on Node 22 and 24 for every push
and pull request to `main`.

## License

[Apache-2.0](/LICENSE)
