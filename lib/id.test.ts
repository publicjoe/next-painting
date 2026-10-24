import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/id';

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('returns a uuid-shaped id', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('falls back without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {});
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  });
});
