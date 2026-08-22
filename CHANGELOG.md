# Changelog

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
