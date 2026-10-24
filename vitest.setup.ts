// jsdom does not implement HTMLDialogElement.showModal()/close(). Minimal
// stand-ins so ConfirmDialog can be tested: they toggle `open` and fire
// `close`. They do NOT model the top layer, inertness or focus trapping, which
// are platform behaviour and not asserted in unit tests.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
