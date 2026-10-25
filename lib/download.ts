/** Time the object URL stays valid after the click, so a slow browser can start the download. */
export const REVOKE_DELAY_MS = 1000;

/** Offers `content` to the user as a file download. */
export function downloadFile(content: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Older Firefox only honours a click on an anchor that is in the document
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight after click() can cancel the download in Safari
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
