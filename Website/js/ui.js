/** Owns global keyboard shortcuts and modal open/close behavior. */
export function initializeUiShell(options = {}) {
    const openModal = (id) => {
        document.getElementById(id)?.classList.add('open');
    };
    const closeOnlineModal = (modal) => {
        if (!modal)
            return;
        modal.classList.remove('open');
        if (modal.id === 'roomModal')
            options.onRoomModalClosed?.();
    };
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element))
            return;
        const closeButton = target.closest('[data-close]');
        if (closeButton) {
            closeOnlineModal(closeButton.closest('.modal'));
            return;
        }
        const backdrop = target.closest('.modal');
        if (backdrop && target === backdrop)
            closeOnlineModal(backdrop);
    });
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement &&
            (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable))
            return;
        if (event.code === 'Space') {
            event.preventDefault();
            options.onToggleSimulation?.();
        }
    });
    return { openModal, closeOnlineModal };
}
