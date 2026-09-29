/**
 * UI surfaces (§7).
 *
 * The extensions drawer holds settings only. Everything the DM touches during
 * play—hero sheet, review queue, board—sits behind a FAB; a surface that waits
 * for a click is a surface that gets opened late.
 */

import { applyProposal, recordRuling } from './state.js';
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

/**
 * Registers the review queue behind the FAB's Review queue entry.
 *
 * Every action re-reads the state and re-finds the entry by id: the store
 * holds the state by reference, so nothing captured when the pane was drawn
 * can be assumed to still be the object the ledger refers to. Persisting after
 * a mutation is this module's job for the same reason.
 *
 * @param {object} options
 * @param {() => object|null} options.getState reads the live state
 * @param {(state: object) => Promise<void>} options.persist persists a mutated state
 * @returns {void}
 */
export function mountQueue({ getState, persist }) {
    registerSurface('queue', (body) => {
        drawQueue(body, { getState, persist });
    });
}

/**
 * Draws the pending queue into a pane body, or says so when nothing waits.
 * @param {object} body jQuery pane body
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>}} deps
 * @returns {void}
 */
function drawQueue(body, deps) {
    body.empty();

    const state = deps.getState();
    const entries = state?.queue ?? [];
    if (entries.length === 0) {
        body.append($('<p>', { class: 'sidekick-pane-empty' })
            .text('Nothing is waiting for a ruling.'));
        return;
    }

    // A snapshot: each action redraws the body it sits in, so the loop
    // cannot walk the live array.
    for (const entry of [...entries]) {
        body.append(proposalBody(entry, deps));
    }
}

/**
 * One proposal: what it says, what it would change, what it cites, and the
 * three rulings the DM can hand down.
 * @param {object} entry a PendingChange
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>}} deps
 * @returns {object} the entry element
 */
function proposalBody(entry, deps) {
    const root = $('<div>', { class: 'sidekick-proposal' });

    root.append($('<div>', { class: 'sidekick-summary' })
        .append($('<strong>').text(entry.summary || '(no summary)')));

    for (const change of entry.changes ?? []) {
        root.append($('<div>', { class: 'sidekick-diff' })
            .text(`${change.path}: ${change.from || '(nothing)'} → ${change.to}`));
    }

    const evidence = $('<div>', { class: 'sidekick-evidence' });
    evidence.append($('<span>').text('evidence: '));
    for (const index of entry.evidence ?? []) {
        evidence.append($('<button>', {
            type: 'button',
            class: 'sidekick-jump',
            'aria-label': `Jump to message ${index}`,
        }).text(String(index)).on('click', () => {
            jumpToMessage(index);
        }));
    }
    root.append(evidence);

    const editor = $('<input>', {
        type: 'text',
        class: 'sidekick-edit',
        hidden: true,
        value: entry.summary || '',
    });
    root.append(editor);

    const actions = $('<div>', { class: 'sidekick-actions' });
    actions.append($('<button>', { type: 'button' }).text('Edit').on('click', () => {
        const show = editor.prop('hidden');
        editor.prop('hidden', !show);
        if (show) {
            editor.trigger('focus');
        }
    }));
    actions.append($('<button>', { type: 'button' }).text('Apply')
        .on('click', () => {
            void rule('apply', entry, editor, root, deps);
        }));
    actions.append($('<button>', { type: 'button' }).text('Dismiss')
        .on('click', () => {
            void rule('dismiss', entry, null, root, deps);
        }));
    root.append(actions);

    return root;
}

/**
 * Carries out one ruling: the change through applyProposal (provenance-gated),
 * the ruling through recordRuling, the entry out of the queue, the state to
 * disk, and the pane redrawn. Every step re-reads the live state.
 * @param {'apply'|'dismiss'} kind
 * @param {object} entry the entry as drawn
 * @param {object|null} editor the edit input, when one was opened
 * @param {object} root the drawn entry element
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>}} deps
 * @returns {Promise<void>}
 */
async function rule(kind, entry, editor, root, deps) {
    const { getState, persist } = deps;
    const state = getState();
    if (!state) {
        return;
    }

    const live = (state.queue ?? []).find((item) => item.id === entry.id);
    if (!live) {
        drawQueue(root.parent(), deps);
        return;
    }

    const edit = editor && !editor.prop('hidden') ? String(editor.val()).trim() : '';
    const at = Date.now();

    if (kind === 'dismiss') {
        recordRuling(state, {
            proposalId: live.id,
            summary: live.summary || '',
            action: 'dismissed',
            at,
        });
    } else {
        // an edit is applied as the proposal's new summary, so the ChangeEvent
        // and the ruling both carry the DM's own wording
        const summary = edit || live.summary || '';
        const proposal = edit ? { ...live, summary } : live;
        const applied = applyProposal(state, proposal, { at });
        const ruling = {
            proposalId: live.id,
            summary,
            action: applied.length > 0 ? 'applied' : 'stale',
            at,
        };
        if (edit) {
            ruling.edit = { from: live.summary || '', to: edit };
        }
        recordRuling(state, ruling);
    }

    state.queue = state.queue.filter((item) => item.id !== live.id);

    try {
        await persist(state);
    } catch (error) {
        console.error('[Sidekick] could not persist the ruling', error);
    }

    drawQueue(root.parent(), deps);
}

/**
 * Scrolls a cited message into view. SillyTavern renders each chat message as
 * `.mes[mesid="N"]` with N the message's index in the chat array
 * (script.js's own message lookups use exactly this), which is what §6's
 * evidence stores, so no translation is needed.
 * @param {number} index chat-array index from a proposal's evidence
 * @returns {void}
 */
function jumpToMessage(index) {
    const target = document.querySelector(`#chat .mes[mesid="${index}"]`);
    if (!target) {
        return;
    }

    for (const node of document.querySelectorAll('.sidekick-flash')) {
        node.classList.remove('sidekick-flash');
    }
    target.classList.add('sidekick-flash');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
