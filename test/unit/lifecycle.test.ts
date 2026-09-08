import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defineLifecycle } from '../../src/lifecycle';

const GARMENT = defineLifecycle({
    noun: 'garment status',
    states: ['new', 'inUse', 'repaired', 'resold', 'recycled'] as const,
    initial: 'new',
    transitions: {
        new: ['inUse'],
        inUse: ['repaired', 'resold', 'recycled'],
        repaired: ['inUse', 'recycled'],
        resold: ['inUse', 'recycled'],
        recycled: [],
    },
});

describe('defineLifecycle', () => {
    it('validates transitions, treats unknown from as initial, reports terminal states', () => {
        assert.equal(GARMENT.validateTransition('new', 'inUse').ok, true);
        assert.equal(GARMENT.validateTransition(undefined, 'inUse').ok, true);
        assert.equal(GARMENT.validateTransition('repaired', 'inUse').ok, true);
        assert.equal(GARMENT.validateTransition('new', 'resold').ok, false);
        assert.match((GARMENT.validateTransition('new', 'resold') as any).error, /allowed: inUse/);
        assert.match((GARMENT.validateTransition('recycled', 'inUse') as any).error, /terminal/);
        assert.match((GARMENT.validateTransition('inUse', 'inUse') as any).error, /already/);
        assert.match((GARMENT.validateTransition('inUse', 'burned') as any).error, /unknown garment status/);
        assert.equal(GARMENT.isTerminal('recycled'), true);
        assert.equal(GARMENT.isTerminal('new'), false);
        assert.equal(GARMENT.is('resold'), true);
        assert.equal(GARMENT.is('nope'), false);
    });

    it('rejects inconsistent specs at definition time', () => {
        assert.throws(() => defineLifecycle({ noun: 'x', states: ['a'], initial: 'b' as 'a', transitions: { a: [] } }), /initial/);
        assert.throws(() => defineLifecycle({ noun: 'x', states: ['a'], initial: 'a', transitions: { a: ['zz' as 'a'] } }), /unknown state/);
    });
});
