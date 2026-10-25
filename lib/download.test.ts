// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, REVOKE_DELAY_MS } from './download';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('downloadFile', () => {
  it('clicks a temporary link, then revokes the URL after a delay and leaves nothing in the page', () => {
    vi.useFakeTimers();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true });
    let inDocumentWhenClicked = false;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      inDocumentWhenClicked = document.body.contains(this);
    });
    try {
      downloadFile('{"a":1}', 'x.json');
      const clicked = click.mock.contexts[0] as HTMLAnchorElement;
      expect(clicked.download).toBe('x.json');
      expect(clicked.href).toBe('blob:test');
      expect(inDocumentWhenClicked).toBe(true);
      expect(document.body.contains(clicked)).toBe(false);
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(REVOKE_DELAY_MS);
      expect(revoke).toHaveBeenCalledWith('blob:test');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { value: original.create, configurable: true, writable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: original.revoke, configurable: true, writable: true });
    }
  });
});
