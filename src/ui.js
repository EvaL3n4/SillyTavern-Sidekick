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
        // carries the DM's own wording; §6 records the wording on the ruling as
        // `edit` (a string: how the DM reworded it) with action 'edited'
        const summary = edit || live.summary || '';
        const proposal = edit ? { ...live, summary } : live;
        const applied = applyProposal(state, proposal, { at });
        // 'stale' is a fourth action word beyond §6's union, on purpose: every
        // change was provenance-gated, so 'applied' would train the scan on a
        // change that never landed
        const action = edit ? 'edited' : applied.length > 0 ? 'applied' : 'stale';
        recordRuling(state, {
            proposalId: live.id,
            // §6: the proposal's own summary, frozen at ruling time, so the
            // ruling outlives the queue entry it judged
            summary: live.summary || '',
            action,
            at,
            ...(edit ? { edit } : {}),
        });
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

/**
 * Registers the hero sheet behind the FAB's Hero sheet entry.
 *
 * Read-only on purpose: §3 lets nothing touch state without an explicit DM
 * action, and the review queue owns every mutation path. This is the ledger as
 * the DM reads it mid-play.
 *
 * @param {object} options
 * @param {() => object|null} options.getState reads the live state
 * @returns {void}
 */
export function mountSheet({ getState }) {
    registerSurface('sheet', (body) => {
        drawSheet(body, getState());
    });
}

/**
 * Draws the hero, the powers and the arc into a pane body. A section with
 * nothing in it says nothing at all, and a sheet with no sections at all says so.
 * @param {object} body jQuery pane body
 * @param {object|null} state the live state
 * @returns {void}
 */
function drawSheet(body, state) {
    body.empty();

    const sections = [
        heroSection(state?.hero),
        powersSection(state?.powers),
        arcSection(state?.arc),
    ].filter(Boolean);

    if (sections.length === 0) {
        body.append($('<p>', { class: 'sidekick-pane-empty' })
            .text('The hero sheet is empty until the campaign has a hero.'));
        return;
    }

    for (const section of sections) {
        body.append(section);
    }
}

/**
 * One titled block of the sheet.
 * @param {string} title
 * @returns {object} the section element
 */
function sectionOf(title) {
    return $('<div>', { class: 'sidekick-section' })
        .append($('<h3>').text(title));
}

/**
 * One quiet label-value row.
 * @param {string} label
 * @param {string} value
 * @returns {object} the row element
 */
function labelRow(label, value) {
    const row = $('<div>', { class: 'sidekick-field' });
    row.append($('<span>', { class: 'sidekick-quiet' }).text(`${label}: `));
    row.append($('<span>').text(value));
    return row;
}

/**
 * Dates read at a glance, the way a DM would say them.
 * @param {number} at epoch milliseconds
 * @returns {string}
 */
function dayOf(at) {
    const date = new Date(at);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '';
}

/**
 * The hero header: name, codename in parentheses, the status quo beneath.
 * @param {object|undefined} hero
 * @returns {object|null} the section, or null when the hero is unwritten
 */
function heroSection(hero) {
    const name = hero?.name || '';
    const codename = hero?.codename || '';
    const statusQuo = hero?.statusQuo || '';
    if (!name && !codename && !statusQuo) {
        return null;
    }

    const section = sectionOf('The hero');
    const title = $('<div>', { class: 'sidekick-field' });
    if (name) {
        title.append($('<strong>').text(name));
    }
    if (codename) {
        title.append($('<span>', { class: 'sidekick-quiet' })
            .text(name ? `—${codename}` : codename));
    }
    section.append(title);

    if (statusQuo) {
        section.append($('<div>', { class: 'sidekick-field sidekick-quiet' })
            .text(statusQuo));
    }
    return section;
}

/**
 * Every power as capability, limits and costs—the three parts that stop a
 * model from treating a power as pure upside (§2).
 * @param {object[]|undefined} powers
 * @returns {object|null} the section
 */
function powersSection(powers) {
    const list = (powers ?? []).filter((power) => power?.name || power?.capability);
    if (list.length === 0) {
        return null;
    }

    const section = sectionOf('What she can do');
    for (const power of list) {
        const title = $('<div>', { class: 'sidekick-field' });
        title.append($('<strong>').text(power.name || power.capability));
        if (power.stage) {
            title.append($('<span>', { class: 'sidekick-quiet' }).text(`—${power.stage}`));
        }
        section.append(title);

        if (power.capability) {
            section.append($('<div>', { class: 'sidekick-field' }).text(power.capability));
        }
        section.append(labelRow("Won't", joined(power.limits)));
        section.append(labelRow('Costs', joined(power.costs)));
    }
    return section;
}

/**
 * Joins a list for one row, and says so when nothing is written down—an empty
 * limits list is something the DM wants to notice, not a row that vanishes.
 * @param {string[]|undefined} values
 * @returns {string}
 */
function joined(values) {
    const items = (values ?? []).filter((item) => item && String(item).trim());
    return items.length > 0 ? items.join('; ') : 'none written';
}

/**
 * The arc: where the hero is, what they are carrying, what they have crossed.
 * @param {object|undefined} arc
 * @returns {object|null} the section
 */
function arcSection(arc) {
    const phase = arc?.phase || '';
    const threads = (arc?.threads ?? []).filter((thread) => thread?.text);
    const pressures = (arc?.pressures ?? []).filter((pressure) => pressure?.text);
    const crossings = (arc?.linesCrossed ?? []).filter((crossing) => crossing?.line);
    if (!phase && threads.length === 0 && pressures.length === 0 && crossings.length === 0) {
        return null;
    }

    const section = sectionOf('Where the hero is');
    if (phase) {
        section.append($('<div>', { class: 'sidekick-field' }).text(phase));
    }

    for (const thread of threads) {
        const row = $('<div>', { class: 'sidekick-field' });
        row.append($('<span>').text(thread.text));
        const day = thread.lastTouched ? dayOf(thread.lastTouched) : '';
        if (day) {
            row.append($('<span>', { class: 'sidekick-quiet' }).text(`—${day}`));
        }
        section.append(row);
    }

    for (const pressure of pressures) {
        const row = $('<div>', { class: 'sidekick-field' });
        row.append($('<span>').text(pressure.text));
        if (pressure.denialCount > 0) {
            row.append($('<span>', { class: 'sidekick-quiet' })
                .text(`—denied ${pressure.denialCount} ${pressure.denialCount === 1 ? 'time' : 'times'}`));
        }
        section.append(row);
    }

    for (const crossing of crossings) {
        const row = $('<div>', { class: 'sidekick-field' });
        row.append($('<span>').text(`${crossing.line} → ${crossing.provides}, at ${crossing.cost}`));
        if (Number.isInteger(crossing.msgId) && crossing.msgId >= 0) {
            row.append($('<button>', {
                type: 'button',
                class: 'sidekick-jump',
                'aria-label': `Jump to message ${crossing.msgId}`,
            }).text(`#${crossing.msgId}`).on('click', () => {
                jumpToMessage(crossing.msgId);
            }));
        }
        section.append(row);
    }

    return section;
}
