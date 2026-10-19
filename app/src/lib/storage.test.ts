import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const backing = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, String(v)),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
};

const { loadStored, saveStored, removeStored } = await import('./storage.ts');

describe('storage', () => {
  it('round-trips values without throwing', () => {
    saveStored('t', { a: 1 });
    assert.deepEqual(loadStored('t', null), { a: 1 });
    removeStored('t');
    assert.equal(loadStored('t', 'fb'), 'fb');
  });
  it('returns fallback on corrupt JSON', () => {
    backing.set('jw4:bad', '{oops');
    assert.equal(loadStored('bad', 'fb'), 'fb');
  });
  it('survives a throwing backend', () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    assert.equal(loadStored('x', 'fb'), 'fb');
    saveStored('x', 1);
    removeStored('x');
  });
});
