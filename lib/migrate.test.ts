import { describe, expect, it } from 'vitest';
import { migrate, migrateWithReport } from '@/lib/migrate';
import { MAX_MODEL_COUNT, MAX_NAME_LENGTH } from '@/lib/validate';
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

  it('shortens an over-long name instead of rejecting the data, and says so', () => {
    const long = 'x'.repeat(MAX_NAME_LENGTH + 50);
    const data = { ...seeded, categories: seeded.categories.map((c, i) => (i === 0 ? { ...c, name: long } : c)) };
    const result = migrateWithReport(data);
    expect(result?.state.categories[0].name).toHaveLength(MAX_NAME_LENGTH);
    expect(result?.adjusted).toBe(true);
  });

  it('reports no adjustment for data that already fits, and for a lowered count', () => {
    expect(migrateWithReport(seeded)?.adjusted).toBe(false);
    const big = { ...seeded, models: seeded.models.map((m, i) => (i === 0 ? { ...m, count: MAX_MODEL_COUNT + 1 } : m)) };
    expect(migrateWithReport(big)?.adjusted).toBe(true);
  });

  it('is not polluted by __proto__ keys in parsed JSON', () => {
    const parsed = JSON.parse(JSON.stringify(seeded).replace('"name":"Captain"', '"name":"Captain","__proto__":{"polluted":true}'));
    const result = migrateWithReport(parsed);
    expect(result?.state.models[0]).not.toHaveProperty('polluted');
    expect(Object.keys(result!.state.models[0])).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects non-object input, a missing state, and a missing or different version', () => {
    for (const bad of [null, 5, 'x', [], { version: 1 }, { version: 2, state: seeded }, { version: '1', state: seeded }]) {
      expect(migrateWithReport(bad)).toBeNull();
    }
  });

  it('drops unknown properties from items, and leaves the input untouched', () => {
    const data = structuredClone(seeded) as unknown as Record<string, { [k: string]: unknown }[]>;
    data.categories[0].extra = 'x';
    const result = migrateWithReport(data);
    expect(result?.state).toEqual(seeded);
    expect(result?.adjusted).toBe(false);
    expect(data.categories[0].extra).toBe('x');
  });
});
