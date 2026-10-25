/**
 * Namespaced ids for drag and drop. dnd-kit needs ids that are unique across
 * every draggable and droppable in one context, but categories and projects
 * only guarantee uniqueness within their own type, so each id carries a prefix.
 */
export type DndKind = 'cat' | 'proj' | 'list' | 'hdr';

const KINDS: readonly string[] = ['cat', 'proj', 'list', 'hdr'];

export const dndId = (kind: DndKind, id: string): string => `${kind}:${id}`;

/** Splits on the first colon only, so ids may contain colons. Null for anything unrecognised. */
export function parseDndId(value: unknown): { kind: DndKind; id: string } | null {
  if (typeof value !== 'string') return null;
  const colon = value.indexOf(':');
  if (colon === -1) return null;
  const kind = value.slice(0, colon);
  const id = value.slice(colon + 1);
  if (!KINDS.includes(kind) || id === '') return null;
  return { kind: kind as DndKind, id };
}
