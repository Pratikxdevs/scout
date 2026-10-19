import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SALARY_FLOORS, salaryCompact, salaryPlus, salaryFloorOf } from './salary.ts';

describe('SALARY_FLOORS', () => {
  it('is ordered, positive, and $k-scale', () => {
    assert.ok(SALARY_FLOORS.length >= 2);
    for (let i = 1; i < SALARY_FLOORS.length; i++) {
      assert.ok(SALARY_FLOORS[i] > SALARY_FLOORS[i - 1], 'floors are strictly ascending');
    }
    for (const f of SALARY_FLOORS) {
      assert.ok(Number.isInteger(f) && f > 0 && f < 1000, `${f} is a sane $k floor`);
    }
  });

  it('labels derive from the one list', () => {
    assert.equal(salaryCompact(80), '$80k');
    assert.equal(salaryPlus(200), '$200k+');
    assert.equal(SALARY_FLOORS.map(salaryPlus)[0], '$80k+');
  });
});

describe('salaryFloorOf', () => {
  it('round-trips only known floors', () => {
    for (const f of SALARY_FLOORS) {
      assert.equal(salaryFloorOf(salaryPlus(f)), f);
      assert.equal(salaryFloorOf(salaryCompact(f)), f);
    }
    assert.equal(salaryFloorOf('$125k+'), null, 'unknown floors are not claimed');
    assert.equal(salaryFloorOf(''), null);
    assert.equal(salaryFloorOf('   '), null);
    assert.equal(salaryFloorOf('$abc'), null);
    assert.equal(salaryFloorOf('$0k'), null, 'zero is not a floor');
    assert.equal(salaryFloorOf('$150K+'), 150, 'case-insensitive');
  });
});
