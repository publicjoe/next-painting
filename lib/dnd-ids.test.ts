import { describe, expect, it } from 'vitest';
import { dndId, parseDndId, type DndKind } from './dnd-ids';

describe('dnd ids', () => {
  it.each(['cat', 'proj', 'list', 'hdr'] as DndKind[])('round-trips a %s id', kind => {
    expect(parseDndId(dndId(kind, 'abc'))).toEqual({ kind, id: 'abc' });
  });

  it('round-trips ids containing colons and the id __proto__', () => {
    expect(parseDndId(dndId('proj', 'a:b:c'))).toEqual({ kind: 'proj', id: 'a:b:c' });
    expect(parseDndId(dndId('cat', '__proto__'))).toEqual({ kind: 'cat', id: '__proto__' });
  });

  it('namespaces the same id differently per kind', () => {
    expect(dndId('cat', '1')).not.toBe(dndId('proj', '1'));
  });

  it.each(['x:1', '', 'cat:', 'cat', ':1', 'CAT:1'])('rejects %j', value => {
    expect(parseDndId(value)).toBeNull();
  });

  it.each([42, null, undefined, {}, ['cat:1']])('rejects non-string %j', value => {
    expect(parseDndId(value)).toBeNull();
  });
});
