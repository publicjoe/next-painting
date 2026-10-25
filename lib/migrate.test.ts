import { describe, expect, it } from 'vitest';
import { migrate } from '@/lib/migrate';
import { MAX_MODEL_COUNT } from '@/lib/validate';
import { seeded } from '@/lib/test-fixtures';

describe('migrate', () => {
  it('accepts the legacy unversioned shape', () => expect(migrate(seeded)).toEqual(seeded));
  it('accepts the v1 envelope', () => expect(migrate({ version: 1, state: seeded })).toEqual(seeded));
  it('rejects an unknown version', () => expect(migrate({ version: 2, state: seeded })).toBeNull());
  it('rejects an invalid v1 payload', () => expect(migrate({ version: 1, state: { categories: [] } })).toBeNull());
  it('rejects an invalid legacy payload', () => expect(migrate({ categories: [], projects: [] })).toBeNull());
  it.each([null, 'x', 7, []])('rejects %j', v => expect(migrate(v)).toBeNull());

  it('lowers a count above the cap instead of rejecting the data', () => {
    const big = { ...seeded, models: seeded.models.map((m, i) => (i === 0 ? { ...m, count: 123456 } : m)) };
    expect(migrate(big)?.models[0].count).toBe(MAX_MODEL_COUNT);
    expect(migrate({ version: 1, state: big })?.models[0].count).toBe(MAX_MODEL_COUNT);
    expect(migrate(big)?.models[1]).toEqual(seeded.models[1]);
  });

  it('still rejects a count that is not a whole number', () => {
    const bad = { ...seeded, models: seeded.models.map((m, i) => (i === 0 ? { ...m, count: 1.5 } : m)) };
    expect(migrate(bad)).toBeNull();
  });
});
