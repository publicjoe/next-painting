import { describe, expect, it } from 'vitest';
import { migrate } from '@/lib/migrate';
import { seeded } from '@/lib/test-fixtures';

describe('migrate', () => {
  it('accepts the legacy unversioned shape', () => expect(migrate(seeded)).toEqual(seeded));
  it('accepts the v1 envelope', () => expect(migrate({ version: 1, state: seeded })).toEqual(seeded));
  it('rejects an unknown version', () => expect(migrate({ version: 2, state: seeded })).toBeNull());
  it('rejects an invalid v1 payload', () => expect(migrate({ version: 1, state: { categories: [] } })).toBeNull());
  it('rejects an invalid legacy payload', () => expect(migrate({ categories: [], projects: [] })).toBeNull());
  it.each([null, 'x', 7, []])('rejects %j', v => expect(migrate(v)).toBeNull());
});
