# Product profiles

A profile is plain data that tells the engine what one product family looks
like. Everything hashed, redacted or proven flows through it, so a new
product family is a new profile plus optional lifecycle, claim sets and
document profile. No engine code changes.

## 1. The data profile

```ts
import { defineProfile } from '@odatano/dpp-sdk/profile';

export const TYRE = defineProfile({
  id: 'tyre',
  payloadVersion: 1,
  children: {
    compounds: {
      columns: { name: 'string', naturalRubberPct: 'number', supplier: 'string' },
      sortBy: ['name'],
      authorityColumns: ['supplier'],
    },
    tests: {
      columns: { standard: 'string', reportSha256: 'string' },
      sortBy: ['standard', 'reportSha256'],
      minLevel: 'authority',
    },
  },
  provableFields: [
    { name: 'rollingResistanceClass', kind: 'string' },
    { name: 'abrasionMgPerKm', kind: 'numeric' },
    { name: 'naturalRubberPct', kind: 'numeric',
      source: { child: 'compounds', column: 'naturalRubberPct', match: { column: 'name', value: 'tread' } } },
  ],
  authorityFields: ['plantCode'],
});
```

Rules the engine enforces:

- `attributes` is a reserved payload key; attribute rows always ride along.
- Column kinds are `number` (coerced via `Number()`, NaN dropped) or
  `string` (empty dropped). Null and undefined never enter the payload.
- `sortBy` columns are joined with NUL and compared with `localeCompare`.
- The panel order is frozen once anchored: leaf index = position.
- Fields without a `source` are measured values passed to
  `collectFieldValues(profile, rows, extra)`.

## 2. Access

Levels are `public` < `legitimateInterest` < `authority`. A child hides
entirely below its `minLevel` (default `legitimateInterest`) and loses its
`authorityColumns` below `authority`. Attribute rows carry their own
`accessClass`; rows with an unknown class only reach authority.

Apps map their own role names (consumer, recycler, inspector, ...) onto
these three levels; the SDK never learns the role names.

## 3. Lifecycle

```ts
import { defineLifecycle } from '@odatano/dpp-sdk/lifecycle';

export const TYRE_LIFECYCLE = defineLifecycle({
  noun: 'tyre status',
  states: ['new', 'inService', 'retreaded', 'endOfLife'] as const,
  initial: 'new',
  transitions: { new: ['inService'], inService: ['retreaded', 'endOfLife'], retreaded: ['inService', 'endOfLife'], endOfLife: [] },
});
```

If the status rides in the payload (as an attribute row), a transition means
a re-anchor.

## 4. Claim sets

```ts
import { validateClaimSets, type ClaimSet } from '@odatano/dpp-sdk/claim-sets';

export const TYRE_CLAIM_SETS: readonly ClaimSet[] = [
  { id: 'rr-efficient', label: 'Rolling resistance A or B', sourceField: 'rollingResistanceClass', values: ['A', 'B'] },
];
validateClaimSets(TYRE_CLAIM_SETS);
```

Member spellings become part of on-chain set roots. Never reword a value.
`buildClaimCart` takes `panelOf(profile)` and the catalog as options.

## 5. Document profile (Life Cycle API adapters)

```ts
import type { DocumentProfile } from '@odatano/dpp-sdk/store';

export const TYRE_DOCUMENT: DocumentProfile = {
  identifiersSection: 'Identification',
  dppIdAttribute: 'dppId',
  productIdAttribute: 'gtin',
  statusAttribute: 'Status',
  statusValueKey: 'value',
  lastUpdateAttribute: 'updatedAt',
  access: { supplier: 'legitimateInterest', testReports: 'authority' },
  idPrefix: 'urn:tyre:',
};
```

`rootKey` is optional; the battery guide uses `Battery_Passport`.

## 6. Pin it

Once the first passport of the family is anchored, record its inputs,
canonical payload and hash as golden vectors in the family's test suite.
From then on any change to the profile's columns, panel order or
`payloadVersion` is a breaking change with a re-anchor round.

## The battery profile as reference

`battery/profile` is exactly this recipe applied to Annex XIII:
three children (`batteries`, `recycledMaterials`, `diligenceDocs`), a
13-slot panel, `payloadVersion: 2`, plus `battery/lifecycle`,
`battery/claim-sets` and `battery/document`. Its golden vectors live in
`test/fixtures/golden-vectors.json`.
