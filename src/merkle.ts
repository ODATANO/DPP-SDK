/**
 * Generic fixed-depth Merkle tree walk over precomputed leaves with a
 * pluggable node hasher. Leaf/node hash primitives are chain vocabulary and
 * stay with the consumer; structure, sibling walk and proof shape are shared.
 * Browser-safe: no node builtins, no environment reads.
 */
import { fromHex32, toHex } from './fields';

export const MERKLE_DEPTH = 4;
export const LEAF_COUNT = 1 << MERKLE_DEPTH; // 16

export type NodeHash = (left: Uint8Array, right: Uint8Array) => Uint8Array;

export interface MerkleTree {
    /** levels[0] = leaves, levels[depth] = [root]. */
    levels: Uint8Array[][];
    rootHex: string;
}

export interface InclusionPath {
    siblings: string[]; // depth x 64-hex
    dirs: boolean[];    // depth booleans (true = node is the LEFT child)
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
