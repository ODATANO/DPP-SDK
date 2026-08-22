/**
 * Generic Merkle tree walk over precomputed leaves with a pluggable node
 * hasher. Leaf/node hash primitives are chain vocabulary and stay with the
 * consumer; structure, sibling walk and proof shape are shared. The walk is
 * depth-derived: pass 16 leaves for a depth-4 tree, 32 for depth-5.
 * Browser-safe: no node builtins, no environment reads.
 */
import { fromHex32, toHex } from './fields';

/** DEFAULT tree depth (16-slot panel), not a limit. Use depthForWidth for others. */
export const MERKLE_DEPTH = 4;
/** Leaf count of the default depth. */
export const LEAF_COUNT = 1 << MERKLE_DEPTH; // 16
/** Alias of LEAF_COUNT in width vocabulary. */
export const DEFAULT_SLOT_WIDTH = LEAF_COUNT;

/**
 * Widths NIGHTGATE's attestation vaults accept: 16 is `attestation-vault`,
 * 32 is `attestation-vault-32` 
 * Cross-root proofs only relate documents of the SAME width.
 */
export const VAULT_SLOT_WIDTHS = [8, 16, 32] as const;

/** Tree depth of a slot width (16 -> 4, 32 -> 5). Throws on non-powers of two. */
export function depthForWidth(width: number): number {
    if (!Number.isInteger(width) || width < 2 || width > 1024 || (width & (width - 1)) !== 0) {
        throw new Error(`slot width must be a power of two in 2..1024, got ${width}`);
    }
    return Math.log2(width);
}

/** Slot width of a tree depth (4 -> 16, 5 -> 32). */
export function widthForDepth(depth: number): number {
    if (!Number.isInteger(depth) || depth < 1 || depth > 10) {
        throw new Error(`tree depth must be an integer in 1..10, got ${depth}`);
    }
    return 1 << depth;
}

/**
 * Pad an ordered slot layer (leaves, schema descriptors, openings) to the
 * full width, calling `filler` for every padding index. Overflow THROWS
 * instead of dropping the tail: a registry that outgrew its width would
 * otherwise silently stop anchoring its last fields.
 */
export function padToWidth<T>(items: readonly T[], width: number, filler: (index: number) => T): T[] {
    depthForWidth(width);
    if (items.length > width) {
        throw new Error(`${items.length} entries do not fit a ${width}-slot tree`);
    }
    const out: T[] = [];
    for (let i = 0; i < width; i++) out.push(i < items.length ? items[i] : filler(i));
    return out;
}

export type NodeHash = (left: Uint8Array, right: Uint8Array) => Uint8Array;

export interface MerkleTree {
    /** levels[0] = leaves, levels[depth] = [root]. */
    levels: Uint8Array[][];
    rootHex: string;
}

export interface InclusionPath {
    siblings: string[]; // log2(width) x 64-hex
    dirs: boolean[];    // log2(width) booleans (true = node is the LEFT child)
}

/** Build all levels bottom-up from a power-of-two leaf layer. */
export function buildTree(leaves: Uint8Array[], nodeHash: NodeHash): MerkleTree {
    const n = leaves.length;
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`leaf count must be a power of two, got ${n}`);
    const levels: Uint8Array[][] = [leaves];
    while (levels[levels.length - 1].length > 1) {
        const prev = levels[levels.length - 1];
        const next: Uint8Array[] = [];
        for (let i = 0; i < prev.length; i += 2) {
            next.push(nodeHash(prev[i], prev[i + 1]));
        }
        levels.push(next);
    }
    return { levels, rootHex: toHex(levels[levels.length - 1][0]) };
}

/** Sibling/direction inclusion path of one leaf, read from the built levels. */
export function proofFor(levels: Uint8Array[][], leafIndex: number): InclusionPath {
    const depth = levels.length - 1;
    if (leafIndex < 0 || leafIndex >= levels[0].length) throw new Error(`leaf index out of range: ${leafIndex}`);
    const siblings: string[] = [];
    const dirs: boolean[] = [];
    let node = leafIndex;
    for (let d = 0; d < depth; d++) {
        const isLeft = node % 2 === 0;
        const siblingIdx = isLeft ? node + 1 : node - 1;
        siblings.push(toHex(levels[d][siblingIdx]));
        dirs.push(isLeft);
        node = Math.floor(node / 2);
    }
    return { siblings, dirs };
}

/** Verifier side: fold a leaf hash up an inclusion path and compare with the root. */
export function verifyProof(leaf: Uint8Array, path: InclusionPath, rootHex: string, nodeHash: NodeHash): boolean {
    if (path.siblings.length !== path.dirs.length || path.siblings.length === 0) return false;
    let node = leaf;
    for (let d = 0; d < path.siblings.length; d++) {
        const sibling = fromHex32(path.siblings[d]);
        node = path.dirs[d] ? nodeHash(node, sibling) : nodeHash(sibling, node);
    }
    return toHex(node) === rootHex.replace(/^0x/, '').toLowerCase();
}
