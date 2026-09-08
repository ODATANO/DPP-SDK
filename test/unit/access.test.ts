import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maxLevel, levelFromRank, canRead, isAccessLevel } from '../../src/access';
import { filterAttributes } from '../../src/attributes';

describe('access vocabulary', () => {
    it('maxLevel and levelFromRank', () => {
        assert.equal(maxLevel('public', 'legitimateInterest'), 'legitimateInterest');
        assert.equal(maxLevel('authority', 'legitimateInterest'), 'authority');
        assert.equal(levelFromRank(0), 'public');
        assert.equal(levelFromRank(1), 'legitimateInterest');
        assert.equal(levelFromRank(2), 'authority');
        assert.equal(levelFromRank(7), 'authority');
    });

    it('canRead follows the ladder and fails closed on unknown classes', () => {
        assert.equal(canRead('public', 'public'), true);
        assert.equal(canRead('public', 'legitimateInterest'), false);
        assert.equal(canRead('legitimateInterest', 'legitimateInterest'), true);
        assert.equal(canRead('legitimateInterest', 'authority'), false);
        assert.equal(canRead('authority', 'authority'), true);
        assert.equal(canRead('legitimateInterest', undefined), false);
        assert.equal(canRead('legitimateInterest', 'weird'), false);
        assert.equal(canRead('authority', 'weird'), true);
        assert.equal(isAccessLevel('commission'), false);
    });

    it('filterAttributes keeps readable rows only', () => {
        const rows = [
            { attribute: 'A', accessClass: 'public' },
            { attribute: 'B', accessClass: 'legitimateInterest' },
            { attribute: 'C', accessClass: 'authority' },
            { attribute: 'D' },
        ];
        assert.deepEqual(filterAttributes(rows, 'public').map((r) => r.attribute), ['A']);
        assert.deepEqual(filterAttributes(rows, 'legitimateInterest').map((r) => r.attribute), ['A', 'B']);
        assert.deepEqual(filterAttributes(rows, 'authority').map((r) => r.attribute), ['A', 'B', 'C', 'D']);
    });
});
