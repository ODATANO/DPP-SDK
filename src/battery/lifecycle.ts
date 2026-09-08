/**
 * Battery status lifecycle (Annex XIII 4(c)): original -> repurposed |
 * reused | remanufactured -> waste. The status rides in the anchored payload,
 * so a change requires a re-anchor through the single dedicated write action.
 */
import { defineLifecycle } from '../lifecycle';

export const BATTERY_STATUS_VALUES = ['original', 'repurposed', 'reused', 'remanufactured', 'waste'] as const;
export type BatteryStatus = (typeof BATTERY_STATUS_VALUES)[number];

/** waste is terminal; lateral second-life moves are not modeled. */
export const BATTERY_LIFECYCLE = defineLifecycle<BatteryStatus>({
    noun: 'battery status',
    states: BATTERY_STATUS_VALUES,
    initial: 'original',
    transitions: {
        original: ['repurposed', 'reused', 'remanufactured', 'waste'],
        repurposed: ['waste'],
        reused: ['waste'],
        remanufactured: ['waste'],
        waste: [],
    },
});

export const isBatteryStatus = BATTERY_LIFECYCLE.is;
export const validateTransition = BATTERY_LIFECYCLE.validateTransition;

/** Status from a BatteryStatus row's valueJson; defensive default 'original'. */
export function parseBatteryStatus(valueJson: unknown): BatteryStatus {
    try {
        const v = JSON.parse(String(valueJson ?? ''));
        const s = v?.batteryStatusValues;
        return isBatteryStatus(s) ? s : 'original';
    } catch {
        return 'original';
    }
}

/** Guide-shape valueJson for a status; byte-identical to the seeded shape. */
export function encodeBatteryStatus(status: BatteryStatus): string {
    return JSON.stringify({ batteryStatusValues: status });
}

/** DPP document status for a lifecycle state: waste -> Archived, else Active. */
export function dppStatusFor(status: BatteryStatus | undefined): 'Active' | 'Archived' {
    return status === 'waste' ? 'Archived' : 'Active';
}
