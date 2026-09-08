/**
 * Generic status lifecycle: named states, allowed transitions, one initial
 * state. A profile declares its instance; the engine validates moves. A
 * status that rides in the anchored payload needs a re-anchor on change.
 * Browser-safe.
 */

export type TransitionResult = { ok: true } | { ok: false; error: string };

export interface LifecycleSpec<S extends string> {
    /** Noun used in error messages, e.g. "battery status". */
    noun: string;
    states: readonly S[];
    initial: S;
    transitions: Readonly<Record<S, readonly S[]>>;
}

export interface Lifecycle<S extends string> extends LifecycleSpec<S> {
    is(v: unknown): v is S;
    isTerminal(state: S): boolean;
    /** Unknown `from` is treated as the initial state. */
    validateTransition(from: unknown, to: unknown): TransitionResult;
}

export function defineLifecycle<S extends string>(spec: LifecycleSpec<S>): Lifecycle<S> {
    const states = spec.states as readonly string[];
    if (!states.includes(spec.initial)) throw new Error(`lifecycle: initial state ${spec.initial} is not a state`);
    for (const s of spec.states) {
        for (const t of spec.transitions[s] ?? []) {
            if (!states.includes(t)) throw new Error(`lifecycle: transition ${s} -> ${t} targets an unknown state`);
        }
    }
    const is = (v: unknown): v is S => typeof v === 'string' && states.includes(v);
    return {
        ...spec,
        is,
        isTerminal: (state) => (spec.transitions[state] ?? []).length === 0,
        validateTransition(from, to) {
            if (!is(to)) {
                return { ok: false, error: `unknown ${spec.noun} '${String(to)}' (allowed: ${spec.states.join(', ')})` };
            }
            const current: S = is(from) ? from : spec.initial;
            if (current === to) return { ok: false, error: `${spec.noun} is already '${current}'` };
            const allowed = spec.transitions[current] ?? [];
            if (!allowed.includes(to)) {
                return {
                    ok: false,
                    error: `illegal ${spec.noun} transition '${current}' -> '${to}'` +
                        (allowed.length ? ` (allowed: ${allowed.join(', ')})` : ` ('${current}' is terminal)`),
                };
            }
            return { ok: true };
        },
    };
}
