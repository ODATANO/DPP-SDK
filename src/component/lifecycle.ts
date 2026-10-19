/**
 * Component status lifecycle: manufactured -> qualified -> installed ->
 * inService -> retired. A part under counterfeit or damage suspicion goes to
 * quarantined and either returns to qualified or is retired. The status rides
 * in the anchored payload, so a change requires a re-anchor.
 */
import { defineLifecycle } from '../lifecycle';

export const COMPONENT_STATUS_VALUES = [
    'manufactured', 'qualified', 'installed', 'inService', 'quarantined', 'retired',
] as const;
export type ComponentStatus = (typeof COMPONENT_STATUS_VALUES)[number];

export const COMPONENT_LIFECYCLE = defineLifecycle<ComponentStatus>({
    noun: 'component status',
    states: COMPONENT_STATUS_VALUES,
    initial: 'manufactured',
    transitions: {
        manufactured: ['qualified', 'quarantined', 'retired'],
        qualified: ['installed', 'quarantined', 'retired'],
        installed: ['inService', 'quarantined', 'retired'],
        inService: ['quarantined', 'retired'],
        quarantined: ['qualified', 'retired'],
        retired: [],
    },
});

export const isComponentStatus = COMPONENT_LIFECYCLE.is;

/** Status from a ComponentStatus attribute's valueJson; defensive default 'manufactured'. */
export function parseComponentStatus(valueJson: unknown): ComponentStatus {
    try {
        const v = JSON.parse(String(valueJson ?? ''));
        return isComponentStatus(v) ? v : 'manufactured';
    } catch {
        return 'manufactured';
    }
}

/** valueJson of a status attribute row: the bare JSON string. */
export function encodeComponentStatus(status: ComponentStatus): string {
    return JSON.stringify(status);
}
