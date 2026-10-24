import { describe, expect, it } from 'vitest';
import { isAppState, MAX_MODEL_COUNT } from '@/lib/validate';
import { seeded } from '@/lib/test-fixtures';

const clone = () => structuredClone(seeded);
const withModel = (patch: Record<string, unknown>) => {
  const s = clone();
  return { ...s, models: [{ ...s.models[0], ...patch }, ...s.models.slice(1)] };
};

describe('isAppState', () => {
  it('accepts the maximum model count and rejects one above it', () => {
    expect(isAppState(withModel({ count: MAX_MODEL_COUNT }))).toBe(true);
    expect(isAppState(withModel({ count: MAX_MODEL_COUNT + 1 }))).toBe(false);
  });

  it('accepts a valid state and an empty one', () => {
    expect(isAppState(seeded)).toBe(true);
    expect(isAppState({ categories: [], projects: [], models: [] })).toBe(true);
  });

  it.each([
    ['null', null],
    ['number', 42],
    ['empty object', {}],
    ['missing models', { categories: [], projects: [] }],
    ['non-array categories', { categories: 1, projects: [], models: [] }],
  ])('rejects %s', (_n, v) => expect(isAppState(v)).toBe(false));

  it('rejects a null model', () => {
    const s = clone();
    expect(isAppState({ ...s, models: [null] })).toBe(false);
  });

  it('rejects a null category or project', () => {
    expect(isAppState({ ...clone(), categories: [null] })).toBe(false);
    expect(isAppState({ ...clone(), projects: [null] })).toBe(false);
  });

  it("rejects a '__proto__' id", () => {
    expect(isAppState(withModel({ id: '__proto__' }))).toBe(false);
    const s = clone();
    s.categories[0].id = '__proto__';
    expect(isAppState(s)).toBe(false);
  });

  it.each([['string', '2'], ['zero', 0], ['negative', -1], ['fraction', 1.5], ['NaN', NaN]])(
    'rejects a %s count',
    (_n, count) => expect(isAppState(withModel({ count }))).toBe(false),
  );

  it('rejects a non-boolean status', () => {
    expect(isAppState(withModel({ painted: 'yes' }))).toBe(false);
  });

  it('rejects a missing name', () => {
    const s = clone();
    delete (s.categories[0] as Partial<{ name: string }>).name;
    expect(isAppState(s)).toBe(false);
    expect(isAppState(withModel({ name: undefined }))).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const s = clone();
    s.categories[1].id = 'c1';
    expect(isAppState(s)).toBe(false);
    const m = clone();
    m.models[1].id = 'm1';
    expect(isAppState(m)).toBe(false);
  });

  it('rejects orphans', () => {
    const p = clone();
    p.projects[0].categoryId = 'missing';
    expect(isAppState(p)).toBe(false);
    expect(isAppState(withModel({ projectId: 'missing' }))).toBe(false);
  });
});
