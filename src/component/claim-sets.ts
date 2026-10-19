/**
 * Component membership catalog. Member spellings are part of the on-chain
 * set roots; never reword a value.
 */
import { type ClaimSet, validateClaimSets } from '../claim-sets';

/** Material grades accepted for pressure-retaining and structural parts (ASME II / EN designations). */
export const APPROVED_MATERIAL_GRADES = [
    'SA-508 Gr.3 Cl.1', 'SA-533 Type B Cl.1', 'SA-516 Gr.70', 'SA-182 F316L', 'SA-312 TP304L',
    'SA-376 TP316', 'SB-166 N06690', 'SB-407 N08810', 'X6CrNiNb18-10', 'X2CrNiMo17-12-2',
] as const;

/** Austenitic stainless and nickel-base grades out of the approved list. */
export const AUSTENITIC_GRADES = [
    'SA-182 F316L', 'SA-312 TP304L', 'SA-376 TP316', 'SB-166 N06690', 'SB-407 N08810',
    'X6CrNiNb18-10', 'X2CrNiMo17-12-2',
] as const;

/** Entries of the operator's qualified supplier list; the id is the public handle, the name stays private. */
export const QUALIFIED_SUPPLIER_IDS = [
    'QSL-0007', 'QSL-0012', 'QSL-0031', 'QSL-0045', 'QSL-0058', 'QSL-0063', 'QSL-0077', 'QSL-0082',
] as const;

/** Non-destructive test methods accepted for qualification (ISO 9712 method symbols). */
export const APPROVED_TEST_METHODS = ['UT', 'RT', 'PT', 'MT', 'VT', 'ET', 'LT'] as const;

export const COMPONENT_CLAIM_SETS: readonly ClaimSet[] = [
    {
        id: 'grade-approved',
        label: 'Approved material grades',
        sourceField: 'materialGrade',
        values: APPROVED_MATERIAL_GRADES,
    },
    {
        id: 'grade-austenitic',
        label: 'Austenitic and nickel-base grades',
        sourceField: 'materialGrade',
        values: AUSTENITIC_GRADES,
    },
    {
        id: 'supplier-qualified',
        label: 'Qualified supplier list',
        sourceField: 'supplierId',
        values: QUALIFIED_SUPPLIER_IDS,
    },
    {
        id: 'ndt-approved',
        label: 'Approved non-destructive test methods',
        sourceField: 'testMethod',
        values: APPROVED_TEST_METHODS,
    },
];
validateClaimSets(COMPONENT_CLAIM_SETS);
