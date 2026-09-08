# Changelog

## 0.3.0

Product-agnostic restructure. The package now describes a product family
through a **profile** and runs one generic engine; the battery domain is
the first profile. **No hashed byte changes**: the golden vectors are
untouched and `projectPayload(BATTERY_PROFILE, rows)` reproduces the v2
payload, hash, field keys and cipher wire format exactly. Everything else
is a clean cut without compatibility shims, so consumers update imports.

- **`profile`** (new): `defineProfile`, `projectPayload`, `redactRow`,
  `redactChildRow`, `collectFieldValues`, `panelOf`, `fieldKindOf`.
  Replaces `payload` (`payloadFromDb`), the redaction half of `tier` and
  the battery panel / `fieldValuesFor` in `fields`.
- **`access`** (new): one vocabulary `public` < `legitimateInterest` <
  `authority` with `canRead` (fail closed on unknown classes), `maxLevel`,
  `levelFromRank`. Replaces `Tier` (consumer/recycler/authority) and the
  store's `roleSees`; apps map their role names onto levels.
- **`attributes`** (new): `AttributeRow`, `hashableAttributes` (moved from
  `battery/guide-defaults`, bytes unchanged), `filterAttributes`,
  `attributesAsOf`, `dedupeUpdates` (moved from `battery/attributes`).
- **`fields`** now holds only the frozen primitives (`VALUE_SCALE`,
  `scaleValue`, `fieldKeyHex`, `weightGramsFromKg`); hex/u64 helpers moved
  to **`bytes`** so `merkle` no longer depends on any panel.
- **`lifecycle`** (new): `defineLifecycle`; `battery/lifecycle` is an
  instance (`BATTERY_LIFECYCLE`) with unchanged messages and helpers.
- **`claim-sets`** (new, generic, catalog injected) and **`claim-cart`**
  (moved from `battery/`). `battery/claim-sets` exports
  `BATTERY_CLAIM_SETS` and `CHEMISTRY_CODES`.
- **`store`** (new, from `battery/store`): `DocumentStore(profile)`,
  `DocumentProfile`, `filterDocument(profile, doc, level)`, `roleLevel`;
  element-path and identifier helpers take the profile. The battery guide
  profile and `GUIDE_ACCESS` live in **`battery/document`**.
- **`upload`** (from `battery/diligence`): `validateUpload` with injectable
  limits, `decodeBase64Upload`, `sha256Hex`.
- **`token`** (from `battery/token`): `createTokenSigner({ secret, prefix })`;
  no environment read.
- **`stuck-rows`** moved to the top level unchanged.
- **`http`**: `createHttpSecurity(options)` factory; no environment read,
  no app-specific CSP or paths baked in.
- **`integrations/catenax`**: aspect URN, profile strings, sections and
  subject fields are injected; `issuanceDate` and `idPrefix` are options.
- **`integrations/s4`**: product master entries carry `head` and `children`
  verbatim; `MappingOptions` (`idPrefix`, `serial`) replace the battery
  constants; `DEFAULT_ERP_EVENT_TYPE` with a per-call override.
- **`battery/profile`** (new): `BATTERY_PROFILE`, `BATTERY_PANEL` and the
  panel slices.
- Removed: `payload`, `tier`, `battery/claim-cart`, `battery/diligence`,
  `battery/store`, `battery/stuck-rows`, `battery/token`.

## 0.2.0

Content trees are width-parameterized. Purely additive: no hashed bytes
change, the golden vectors are untouched, and existing 16-slot consumers
keep their roots byte-identical.

- **`merkle`**: the walk was always depth-derived, now the surface says so.
  New `padToWidth(items, width, filler)` pads an ordered slot layer
  (leaves, schema descriptors, openings) and THROWS on overflow instead of
  dropping the tail, `depthForWidth` / `widthForDepth` convert between the
  two, and `VAULT_SLOT_WIDTHS` names the widths NIGHTGATE's attestation
  vaults accept. `MERKLE_DEPTH` (4) and `LEAF_COUNT` (16) stay as the
  DEFAULT, not a limit, and `DEFAULT_SLOT_WIDTH` aliases the latter in
  width vocabulary.
- The width is part of a root's identity: the same values under 16 and 32
  slots hash to different roots, so a document family picks one width and
  keeps it. Anchoring against NIGHTGATE needs the matching vault lineage
  (`attestation-vault` for 16, `attestation-vault-32` for 32).

## 0.1.0

Initial release: canonical payload projection v2, hashing, AES-256-GCM
payload cipher, field registry, Merkle proofs, disclosure tiers, the
battery domain modules and the Catena-X / S/4HANA integrations, extracted
from NIGHTPASS and DAYPASS so both apps share one byte-identical core.
