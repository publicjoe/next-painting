import { STORAGE_KEY } from '@/lib/migrate';

export const BACKUP_KEY = `${STORAGE_KEY}.bak`;

/**
 * Copy `raw` into storage without overwriting an earlier backup: the first free
 * of `.bak`, `.bak.2`, ... is used, and an identical existing copy is reused.
 * Returns the key holding the copy, or null when it could not be written.
 */
export function keepBackup(raw: string): string | null {
  try {
    for (let n = 1; n <= 20; n++) {
      const key = n === 1 ? BACKUP_KEY : `${BACKUP_KEY}.${n}`;
      const existing = localStorage.getItem(key);
      if (existing === raw) return key;
      if (existing === null) {
        localStorage.setItem(key, raw);
        return key;
      }
    }
  } catch {
    // quota or blocked storage
  }
  return null;
}
