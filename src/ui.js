/**
 * UI surfaces (§7).
 *
 * The extensions drawer holds settings only. Everything the DM touches during
 * play—hero sheet, review queue, board—sits behind a FAB; a surface that waits
 * for a click is a surface that gets opened late.
 */

/**
 * The FAB's surfaces, in menu order (§7).
 * @type {{id: string, label: string}[]}
 */
const SURFACES = [
    { id: 'hero', label: 'Hero sheet' },
    { id: 'queue', label: 'Review queue' },
    { id: 'board', label: 'Board' },
];

/**
 * Renderers the surface modules register as they are built, keyed by surface
 * id. Until one registers, its menu entry opens a pane that says so, because
 * an empty pane and an unbuilt surface read the same from the DM's side.
 * @type {Map<string, (pane: object) => void>}
 */
const surfaceRenderers = new Map();

/**
 * Registers a surface's renderer behind its menu entry. The surface's own
 * module calls this when it exists; the FAB shells the rest.
 * @param {string} id a SURFACES id
 * @param {(pane: object) => void} render receives the pane's empty body
 * @returns {void}
 */
export function registerSurface(id, render) {
    surfaceRenderers.set(id, render);
}

/**
 * Renders the settings template into the extensions panel.
 * @param {object} options
 * @param {string} options.folder extension folder, e.g. 'third-party/Sidekick'
 * @param {() => object} options.context getContext
 * @returns {Promise<void>}
 */
export async function mountSettings({ folder, context }) {
    const { renderExtensionTemplateAsync } = context();
    const html = await renderExtensionTemplateAsync(folder, 'settings', {});
    $('#extensions_settings2').append(html);
}

/**
 * Mounts the floating action button and the surfaces behind it.
 *
 * Idempotent: APP_READY can fire again after a reconnect, and a second FAB
 * would stack on the first. Outside clicks are decided in the capture phase
 * so a synchronous repaint can never detach the event target before this
 * listener sees it.
 * @returns {void}
 */
export function mountFab() {
    if ($('.sidekick-fab').length > 0) {
        return;
    }

    const button = $('<button>', {
        class: 'sidekick-fab',
        type: 'button',
        title: 'Sidekick',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
    }).text('S');

    const menu = $('<ul>', {
        class: 'sidekick-fab-menu',
        role: 'menu',
        hidden: true,
    });

    const pane = $('<div>', {
        class: 'sidekick-fab-pane',
        role: 'region',
        hidden: true,
    });

    let menuOpen = false;
    const setMenu = (open) => {
        menuOpen = open;
        menu.prop('hidden', !open);
        button.attr('aria-expanded', String(open));
    };

    const openSurface = (surface) => {
        setMenu(false);
        pane.empty();

        const head = $('<div>', { class: 'sidekick-pane-head' });
        head.append($('<strong>').text(surface.label));
        head.append($('<button>', {
            type: 'button',
            class: 'sidekick-pane-close',
            'aria-label': 'Close',
        }).text('×').on('click', () => pane.prop('hidden', true)));
        pane.append(head);

        const body = $('<div>', { class: 'sidekick-pane-body' });
        const render = surfaceRenderers.get(surface.id);
        if (render) {
            render(body);
        } else {
            body.append($('<p>', { class: 'sidekick-pane-empty' })
                .text(`${surface.label} is not built yet.`));
        }
        pane.append(body);
        pane.prop('hidden', false);
    };

    for (const surface of SURFACES) {
        const item = $('<button>', {
            type: 'button',
            role: 'menuitem',
            'data-surface': surface.id,
        }).text(surface.label);
        item.on('click', () => openSurface(surface));
        menu.append($('<li>').append(item));
    }

    button.on('click', () => setMenu(!menuOpen));

    document.addEventListener('click', (event) => {
        if (button[0].contains(event.target) || menu[0].contains(event.target)) {
            return;
        }
        setMenu(false);
    }, true);

    $('body').append(button, menu, pane);
}
