export interface UiShellOptions {
  onToggleSimulation?: () => void;
  onRoomModalClosed?: () => void;
}
export interface UiShell {
  openModal(id: string): void;
  closeOnlineModal(modal: Element | null): void;
}
/** Owns global keyboard shortcuts and modal open/close behavior. */
export function initializeUiShell(options: UiShellOptions = {}): UiShell {
  const openModal = (id: string): void => {
    document.getElementById(id)?.classList.add('open');
  };
  const closeOnlineModal = (modal: Element | null): void => {
    if (!modal) return;
    modal.classList.remove('open');
    if (modal.id === 'roomModal') options.onRoomModalClosed?.();
  };
  document.addEventListener('click', (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const closeButton = target.closest('[data-close]');
    if (closeButton) {
      closeOnlineModal(closeButton.closest('.modal'));
      return;
    }
    const backdrop = target.closest('.modal');
    if (backdrop && target === backdrop) closeOnlineModal(backdrop);
  });
  document.addEventListener('keydown', (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      options.onToggleSimulation?.();
    }
  });
  return { openModal, closeOnlineModal };
}
