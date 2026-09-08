/**
 * Battery membership catalog. Member spellings are part of the on-chain set
 * roots on both chains; never reword a value.
 */
import { type ClaimSet, validateClaimSets } from '../claim-sets';

/** The official guide chemistry enum (canonical spellings). */
export const CHEMISTRY_CODES = [
    'Li-ion LCO', 'Li-ion LFP', 'Li-ion LMO', 'Li-ion NCA', 'Li-ion NMC',
    'Li-metal', 'Na-ion', 'Ni-Cd', 'Ni-MH', 'Pb',
] as const;

export const BATTERY_CLAIM_SETS: readonly ClaimSet[] = [
    {
        id: 'chemistry-known',
        label: 'Recognized cell chemistries',
        sourceField: 'cellChemistry',
        values: CHEMISTRY_CODES,
    },
    {
        id: 'chemistry-cobalt-free',
        label: 'Cobalt-free chemistries',
        sourceField: 'cellChemistry',
        values: ['Li-ion LFP', 'Li-ion LMO', 'Na-ion', 'Ni-Cd', 'Pb'],
    },
];
validateClaimSets(BATTERY_CLAIM_SETS);
