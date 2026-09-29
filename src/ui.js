/**
 * UI surfaces (§7).
 *
 * The extensions drawer holds settings only. Everything the DM touches during
 * play—hero sheet, review queue, board—sits behind the button; a surface that
 * for a click is a surface that gets opened late.
 */

import { applyProposal, getPath, recordRuling } from './state.js';
import { resolveCitation } from './citations.js';
import { appendTurn } from './board.js';
import {
    BUTTON_SIZE,
    clampPosition,
    clampRecord,
    chromeKey,
    movePanel,
    readGeometry,
    resizePanel,
    writeGeometry,
} from './chrome.js';

/**
 * The button's surfaces, in menu order (§7).
 * @type {{id: string, label: string}[]}
 */
const SURFACES = [
    { id: 'sheet', label: 'Hero sheet' },
    { id: 'queue', label: 'Review queue' },
    { id: 'board', label: 'Board' },
];

/**
 * Renderers the surface modules register as they are built, keyed by surface
 * id. Until one registers, its menu entry opens a panel that says so, because
 * an empty panel and an unbuilt surface read the same from the DM's side.
 * @type {Map<string, (panel: object) => void>}
 */
const surfaceRenderers = new Map();

/**
 * Registers a surface's renderer behind its menu entry. The surface's own
 * module calls this when it exists; the chrome shells the rest.
 * @param {string} id a SURFACES id
 * @param {(panel: object) => void} render receives the panel's empty body
 * @returns {void}
 */
export function registerSurface(id, render) {
    surfaceRenderers.set(id, render);
}

/** The drawer's live controls, and the §6 settings field each one writes. */
const SETTING_FIELDS = [
    { selector: '#sidekick_cadence', setting: 'evaluationCadence' },
    { selector: '#sidekick_budget', setting: 'digestBudgetTokens' },
];

/**
 * The value a settings input commits, or null when it must not commit at all.
 *
 * A drawer that clamps a typo in silence, or ignores one, is the defect this
 * replaces: the DM would see the number she typed and believe it is the number
 * that runs. Refusing keeps every commit visible as either a stored setting or
 * a note naming the range.
 *
 * @param {string|number} raw what the input holds now
 * @param {{min?: number, max?: number}} [bounds] the input's own min/max
 * @returns {number|null} the setting to store, or null to refuse the commit
 */
export function committedSetting(raw, bounds = {}) {
    const { min, max } = bounds;
    const value = Number(String(raw ?? '').trim());
    if (!Number.isInteger(value)) {
        return null;
    }
    if (Number.isFinite(min) && value < min) {
        return null;
    }
    if (Number.isFinite(max) && value > max) {
        return null;
    }
    return value;
}

/**
 * The words a settings input is introduced by, when it must be named.
 */
function settingLabel($input) {
    const text = $input.closest('label').find('span').first().text().trim();
    return text || $input.attr('id') || 'That setting';
}

/**
 * Renders the settings template into the extensions panel, then makes its two
 * live controls real.
 *
 * Both settings are per-chat by §6's hygiene line, so the drawer reads and
 * writes exactly what already runs: the cadence ticker reads
 * state.settings.evaluationCadence on every message, and the digest render reads
 * state.settings.digestBudgetTokens on every generation. CHAT_CHANGED refills
 * the inputs, because the panel outlives the chat it was opened in and showing
 * one chat's cadence while another is open is the same lie in a quieter voice.
 *
 * @param {object} options
 * @param {string} options.folder extension folder, e.g. 'third-party/Sidekick'
 * @param {() => object} options.context getContext
 * @param {() => object|null} options.getState reads this chat's state
 * @param {(state: object) => Promise<void>} options.persist writes this chat's state
 * @returns {Promise<void>}
 */
export async function mountSettings({ folder, context, getState, persist }) {
    if ($('.sidekick-settings').length > 0) {
        return;
    }

    const { renderExtensionTemplateAsync, eventSource, event_types } = context();
    const html = await renderExtensionTemplateAsync(folder, 'settings', {});
    const $drawer = $(html);
    $('#extensions_settings2').append($drawer);

    const $note = $drawer.find('#sidekick-settings-note').hide();
    const note = (text) => {
        if (text) {
            $note.text(text).show();
            return;
        }
        $note.hide();
    };

    const inputs = SETTING_FIELDS.map(({ selector, setting }) => ({
        setting,
        $input: $drawer.find(selector),
    })).filter((entry) => entry.$input.length > 0);

    /** The draft in the template, there for a chat that holds no setting yet. */
    const declared = ($input) => $input.attr('value');

    /** What the active chat has committed, read from the store, not the DOM. */
    const committed = (entry, state) =>
        state?.settings?.[entry.setting] ?? declared(entry.$input);

    const fill = () => {
        const state = getState();
        for (const entry of inputs) {
            entry.$input.val(committed(entry, state));
        }
    };

    const save = async (entry) => {
        const { $input, setting } = entry;
        const state = getState();
        const value = committedSetting($input.val(), {
            min: Number($input.attr('min')),
            max: Number($input.attr('max')),
        });

        if (value === null) {
            $input.val(committed(entry, state));
            note(
                `${settingLabel($input)} must be a whole number from ${$input.attr('min')} to ${$input.attr('max')}.`,
            );
            return;
        }

        if (value === Number(committed(entry, state))) {
            note('');
            return;
        }

        if (!state) {
            $input.val(declared($input));
            note('No chat is open, so there is no hero ledger to save this to.');
            return;
        }

        // A state hand-mangled out of §6 can arrive without its settings; the
        // ticker already reads through it, so the drawer can be the one that
        // restores the object.
        if (!state.settings || typeof state.settings !== 'object') {
            state.settings = {};
        }
        state.settings[setting] = value;

        try {
            await persist(state);
        } catch (error) {
            // Never trust the object just written: read the store back and show
            // the value it really holds.
            const stored = getState()?.settings?.[setting];
            $input.val(stored ?? declared($input));
            note('That could not be saved—the console has the reason.');
            console.error('[Sidekick] could not persist a settings change', error);
            return;
        }

        note('Saved for this chat.');
    };

    for (const entry of inputs) {
        entry.$input.on('change', () => void save(entry));
    }
    eventSource.on(event_types.CHAT_CHANGED, fill);
    fill();
}

/**
 * A press that moves at least this far from where it started is a drag, not a
 * click. Without a threshold every drag would open the menu, which is the
 * standard bug in a drag-on-click control.
 */
const DRAG_THRESHOLD = 4;

/**
 * Where the menu sits around the button: above when there is room, below when
 * there is not, and flipped off the right edge when the button sits near it, so
 * a menu pinned to a corner while its button moved never happens.
 *
 * The menu's size is asked for rather than guessed, because the placement is a
 * geometry question only the laid-out menu can answer. The chosen corner goes
 * through clampPosition, so a viewport too small for either preference still
 * leaves the menu on screen.
 *
 * @param {{x: number, y: number}} button the button's top-left corner
 * @param {{width: number, height: number}} viewport
 * @param {{width: number, height: number}} size the menu's measured size
 * @returns {{x: number, y: number}} the menu's top-left corner, clamped
 */
export function menuPlacement(button, viewport, size) {
    const above = button.y - size.height >= 0;
    const top = above ? button.y - size.height : button.y + BUTTON_SIZE.height;
    const fits = button.x + size.width <= viewport.width;
    const left = fits ? button.x : button.x + BUTTON_SIZE.width - size.width;
    return clampPosition(left, top, size, viewport);
}

/**
 * Mounts the chrome: the button, the one control that is always in front of the
 * DM, and the panel behind it.
 *
 * The button drags. A press past DRAG_THRESHOLD moves it and takes pointer
 * capture on that first move rather than on the press, so a plain tap never
 * establishes capture and the click path—mouse, touch and the keyboard's Enter
 * and Space—stays exactly what it was. The click a drag ends with is eaten by a
 * flag, and the resting position is clamped and written once, on pointerup: a
 * storage write per frame is waste, and a mid-drag persist that gets abandoned
 * leaves the record off the last resting place.
 *
 * The menu opens against the button's live position rather than a hardcoded
 * corner (menuPlacement), and the marker counts what is waiting, because a queue
 * she cannot see is a queue she forgets.
 *
 * Idempotent: APP_READY can fire again after a reconnect, and a second button
 * would stack on the first. Outside clicks are decided in the capture phase
 * so a synchronous repaint can never detach the event target before this
 * listener sees it.
 *
 * @param {object} [options]
 * @param {() => void} [options.onScan] runs a scan because the DM asked
 * @param {() => object|null} [options.getState] reads this chat's queue, for the
 *     marker
 * @returns {void}
 */
export function mountChrome({ onScan, getState } = {}) {
    if ($('.sidekick-button').length > 0) {
        return;
    }

    const button = $('<button>', {
        class: 'sidekick-button',
        type: 'button',
        title: 'Sidekick',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
    }).text('S');

    // Waiting on you, where she can see it without opening anything: how many
    // proposals hold a ruling, and nothing at all when none do.
    const marker = $('<span>', { class: 'sidekick-marker', hidden: true });
    button.append(marker);

    const menu = $('<ul>', {
        class: 'sidekick-menu',
        role: 'menu',
        hidden: true,
    });

    const panel = $('<div>', {
        class: 'sidekick-panel',
        role: 'region',
        hidden: true,
    });

    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
    const storage = {
        getStored: () => localStorage.getItem(chromeKey()),
        setStored: (key, value) => localStorage.setItem(key, value),
    };

    // Read once at mount, already clamped against the browser as it is now: a
    // window that shrank while Sidekick was closed never leaves the control
    // off-screen.
    let geometry = readGeometry({ ...storage, viewport: viewport() });
    const place = (at) => {
        button.css({ left: `${at.x}px`, top: `${at.y}px`, right: 'auto', bottom: 'auto' });
    };
    place(geometry.button);

    const placePanel = (rect) => {
        panel.css({
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.w}px`,
            height: `${rect.h}px`,
        });
    };
    placePanel(geometry.panel);

    const showMarker = () => {
        const waiting = getState?.()?.queue?.length ?? 0;
        marker.text(waiting > 0 ? String(waiting) : '');
        marker.prop('hidden', waiting === 0);
    };

    let menuOpen = false;
    const setMenu = (open) => {
        menuOpen = open;
        menu.prop('hidden', !open);
        button.attr('aria-expanded', String(open));
        if (!open) {
            return;
        }

        // Read in the same synchronous turn the menu is unhidden, so nothing
        // flashes at a corner the measurement disagrees with.
        showMarker();
        const at = menuPlacement(geometry.button, viewport(), {
            width: menu[0].offsetWidth,
            height: menu[0].offsetHeight,
        });
        menu.css({ left: `${at.x}px`, top: `${at.y}px`, right: 'auto', bottom: 'auto' });
    };

    const openSurface = (surface) => {
        setMenu(false);
        panel.empty();

        const strip = $('<div>', { class: 'sidekick-panel-strip' });
        strip.append($('<strong>').text(surface.label));
        strip.append($('<button>', {
            type: 'button',
            class: 'sidekick-panel-close',
            'aria-label': 'Close',
        }).text('×').on('click', () => panel.prop('hidden', true)));
        panel.append(strip);

        const body = $('<div>', { class: 'sidekick-panel-body' });
        const render = surfaceRenderers.get(surface.id);
        if (render) {
            render(body);
        } else {
            body.append($('<p>', { class: 'sidekick-panel-empty' })
                .text(`${surface.label} is not built yet.`));
        }
        panel.append(body);
        panel.append($('<div>', { class: 'sidekick-panel-grip', 'aria-hidden': 'true' }));
        panel.prop('hidden', false);
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

    // The one thing the menu does rather than shows: a scan on demand.
    //
    // It used to be a typed command, which is a completion-era affordance—nobody
    // types to run a pass when the button is already in front of them. The cadence
    // ticker stays the automatic path; this is the manual one.
    const scan = $('<button>', {
        type: 'button',
        role: 'menuitem',
        'data-action': 'scan',
    }).text('Run a scan');
    scan.on('click', () => {
        setMenu(false);
        onScan?.();
    });
    menu.append($('<li>').append(scan));

    // The gesture. Capture is taken on the first move past the threshold rather
    // than on the press, so a tap never establishes it; the click a drag ends
    // with is eaten here rather than opening the menu over the new position.
    let press = null;
    let eatClick = false;
    button.on('pointerdown', (event) => {
        press = {
            x: event.clientX,
            y: event.clientY,
            from: geometry.button,
            dragging: false,
        };
        eatClick = false;
    });
    button.on('pointermove', (event) => {
        if (!press) {
            return;
        }
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        if (!press.dragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
                return;
            }
            press.dragging = true;
            button[0].setPointerCapture?.(event.pointerId);
        }
        const at = clampPosition(press.from.x + dx, press.from.y + dy, BUTTON_SIZE, viewport());
        place(at);
        geometry = { ...geometry, button: at };
    });
    const rest = () => {
        if (press?.dragging) {
            // Persisted once, here: a write per frame is waste, and one left
            // mid-drag leaves the record off the resting place.
            eatClick = true;
            writeGeometry(geometry, storage);
        }
        press = null;
    };
    button.on('pointerup', rest);
    button.on('pointercancel', rest);

    // The panel's two gestures: the strip drags it, the grip resizes it. They are
    // delegated from the panel because openSurface rebuilds the strip and the grip
    // every time a surface opens, and a handler bound to the old element would
    // go with it. Same shape as the button's—a threshold, one write at rest—
    // except that capture is taken on the press. The button waits for the first
    // move to keep its click path clean; the strip and the grip have no click to
    // protect, and a fast first move can jump clean off a 20px strip, in which
    // case a listener that had not captured yet would never see the drag begin.
    // The close button sits in the strip and is left out, so closing is never the
    // start of a drag.
    const panelGestures = {
        '.sidekick-panel-strip': movePanel,
        '.sidekick-panel-grip': resizePanel,
    };
    let panelPress = null;
    for (const [selector, gesture] of Object.entries(panelGestures)) {
        panel.on('pointerdown', selector, (event) => {
            if (event.button !== 0 || $(event.target).closest('.sidekick-panel-close').length > 0) {
                return;
            }
            panelPress = {
                gesture,
                x: event.clientX,
                y: event.clientY,
                from: geometry.panel,
                dragging: false,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
        });
    }
    panel.on('pointermove', (event) => {
        if (!panelPress) {
            return;
        }
        const dx = event.clientX - panelPress.x;
        const dy = event.clientY - panelPress.y;
        if (!panelPress.dragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
                return;
            }
            panelPress.dragging = true;
        }
        const rect = panelPress.gesture(panelPress.from, dx, dy, viewport());
        placePanel(rect);
        geometry = { ...geometry, panel: rect };
    });
    const restPanel = () => {
        if (panelPress?.dragging) {
            writeGeometry(geometry, storage);
        }
        panelPress = null;
    };
    panel.on('pointerup pointercancel', restPanel);

    button.on('click', () => {
        if (eatClick) {
            eatClick = false;
            return;
        }
        setMenu(!menuOpen);
    });

    document.addEventListener('click', (event) => {
        if (button[0].contains(event.target) || menu[0].contains(event.target)) {
            return;
        }
        setMenu(false);
    }, true);

    // The marker's two reads. A new chat has its own queue, so a count left over
    // from the last one names the wrong number, and the menu opening is the other
    // moment the count is actually looked at. Between them it can be stale—a
    // scan landing while she reads the board does not repaint it—which is the
    // named residual; the fallback, if live testing shows it bothers her, is to
    // move the count onto the menu's Review queue row.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, showMarker);
    showMarker();

    window.addEventListener('resize', () => {
        geometry = clampRecord(geometry, viewport());
        place(geometry.button);
        placePanel(geometry.panel);
        writeGeometry(geometry, storage);
    });

    $('body').append(button, menu, panel);
}

/**
 * Registers the review queue behind the button's Review queue entry.
 *
 * Every action re-reads the state and re-finds the entry by id: the store
 * holds the state by reference, so nothing captured when the panel was drawn
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
 * Draws the pending queue into a panel body, or says so when nothing waits.
 * @param {object} body jQuery panel body
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>}} deps
 * @returns {void}
 */
function drawQueue(body, deps) {
    body.empty();

    const state = deps.getState();
    const entries = state?.queue ?? [];
    if (entries.length === 0) {
        body.append($('<p>', { class: 'sidekick-panel-empty' })
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
 * The queue entry as it stands right now, or null when it is gone. Every action
 * re-reads rather than trusting the draw: the store holds state by reference, so a
 * ruling handed down elsewhere can remove the entry underneath one already on
 * screen.
 * @param {{getState: () => object|null}} deps
 * @param {object} entry the entry as drawn
 * @returns {{state: object|null, live: object|null}}
 */
function liveEntry(deps, entry) {
    const state = deps.getState();
    const live = (state?.queue ?? []).find((item) => item.id === entry.id) ?? null;
    return { state, live };
}

/**
 * The edit affordance for one proposal: her summary, and one from/to pair per
 * change, so an edit reaches the content and not only the label. §3 says the word
 * that enters the record is always the DM's; until now the queue could apply the
 * scan's phrasing whole or lose the entry, and nothing in between.
 *
 * Per change rather than one blob, because the paths are unrelated and a single
 * field would invite cross-contamination. The path itself is not editable:
 * applyProposal addresses the ledger by it, and she came to reword a value, not
 * to move one.
 *
 * `read` is the only way out of the panel. It returns strings, and an emptied
 * `from` is left ambiguous on purpose—`editedProposal` decides what it means,
 * because the difference between "no catch" and "must equal nothing" is exactly
 * the provenance gate.
 *
 * @param {object} entry a PendingChange
 * @returns {{panel: object, read: () => {summary: string, changes: Array<{from: string, to: string}>}}}
 */
function editPanel(entry) {
    const panel = $('<div>', { class: 'sidekick-editor', hidden: true });

    panel.append($('<label>', { class: 'sidekick-editor-label' })
        .text('Summary—how you would say it'));

    const summary = $('<input>', {
        type: 'text',
        class: 'sidekick-edit',
        value: entry.summary || '',
    });
    panel.append(summary);

    const fields = [];
    for (const change of entry.changes ?? []) {
        const row = $('<div>', { class: 'sidekick-edit-change' });

        row.append($('<span>', { class: 'sidekick-edit-path' }).text(change.path));

        const pair = $('<div>', { class: 'sidekick-edit-fields' });
        const from = $('<input>', {
            type: 'text',
            class: 'sidekick-edit-from',
            value: change.from || '',
            placeholder: 'from: what it reads now',
            // `from` is the provenance catch, so its affordance says what it is
            // rather than leaving an unexplained box beside the change.
            title: 'What the current value has to read for this change to be allowed',
        });
        const to = $('<input>', {
            type: 'text',
            class: 'sidekick-edit-to',
            value: change.to ?? '',
            placeholder: 'to: what you want it to say',
            title: 'What you want it to say instead',
        });
        pair.append(from, to);
        row.append(pair);
        panel.append(row);
        fields.push({ from, to });
    }

    return {
        panel,
        read: () => ({
            summary: String(summary.val()).trim(),
            changes: fields.map(({ from, to }) => ({
                from: String(from.val()).trim(),
                to: String(to.val()).trim(),
            })),
        }),
    };
}

/**
 * Her edits as the proposal they become.
 *
 * An emptied `from` means no catch: §6 makes the field optional and the read line
 * already shows an absent one as "(nothing)", so the mapping has to be explicit
 * rather than inherited from the field, or a cleared box would claim "this must equal
 * the empty string" and refuse a change she meant to free.
 *
 * @param {object} live the queue entry as it stands
 * @param {{summary: string, changes: Array<{from: string, to: string}>}|null} read
 * @returns {{proposal: object, edit: string}}
 */
export function editedProposal(live, read) {
    if (!read) {
        return { proposal: live, edit: '' };
    }
    const original = String(live.summary ?? '').trim();
    const rewrote = [];
    const changes = (live.changes ?? []).map((change, i) => {
        const field = read.changes[i];
        if (!field) {
            return change;
        }

        const from = field.from ? field.from : undefined;
        if (from !== change.from || field.to !== (change.to ?? '')) {
            rewrote.push(change.path);
        }
        return { ...change, from, to: field.to };
    });

    // §6 records `edit` as a string: how the DM reworded it. Her own words when she
    // wrote some, and otherwise a naming of the field she rewrote, because a ruling
    // that says only "edited" teaches §3's feedback loop nothing about what the
    // scan got wrong.
    //
    // The panel pre-fills the summary with the entry's own, so a read's summary is
    // blank only when she deleted it. Comparing it against what the field was
    // filled with is what keeps an untouched panel from claiming she reworded a
    // proposal she merely looked at.
    const herWords = read.summary && read.summary !== original ? read.summary : '';
    const edit = herWords || (rewrote.length > 0 ? `reworded ${rewrote.join(', ')}` : '');
    return {
        proposal: { ...live, summary: read.summary || live.summary || '', changes },
        edit,
    };
}

/**
 * Which of her edits will not apply as intended, named before she clicks.
 *
 * applyProposal skips a `from` mismatch with a bare `continue`, which is silence a
 * background pass can afford. She is sitting at the queue, so a change that would be
 * skipped is a change she believes she made; and a `from` she cleared is a change
 * that will apply with its catch off. Both are the same getPath comparison the gate
 * itself makes, run first.
 *
 * @param {object} state
 * @param {object} live
 * @param {{summary: string, changes: Array<{from: string, to: string}>}} read
 * @returns {string[]}
 */
export function brokenEdits(state, live, read) {
    const reasons = [];

    (live.changes ?? []).forEach((change, i) => {
        const field = read.changes[i];
        if (!field) {
            return;
        }

        if (!field.from) {
            if (change.from !== undefined) {
                reasons.push(`${change.path} lost its from check`);
            }
        } else if (getPath(state, change.path) !== field.from) {
            reasons.push(`${change.path} no longer reads what from says`);
        }

        if (!field.to) {
            // `to` carries no gate at all, and a blank one would write a hole in
            // her ledger that reads as a decision.
            reasons.push(`${change.path} would be emptied`);
        }
    });

    return reasons;
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
    for (const citation of entry.evidence ?? []) {
        // §6's locator, resolved where it is used: the index that was filed
        // may have moved since, and the chat is read live rather than trusted.
        const chip = resolveChip(citation);
        if (chip?.dead) {
            evidence.append(goneChip(chip.dead));
        } else if (chip) {
            evidence.append(jumpChip(String(chip.index), chip.index));
        }
    }
    root.append(evidence);

    const { panel, read } = editPanel(entry);
    root.append(panel);

    // Where an edit that will not apply as intended says so, before the click
    // that would lose it.
    const note = $('<p>', { class: 'sidekick-note', hidden: true });
    root.append(note);

    // Set once an Apply has been held back, so the second click is hers to make.
    let armed = false;
    const apply = $('<button>', { type: 'button' }).text('Apply');
    apply.on('click', () => {
        // One extra click for the changes the provenance gate will refuse, or
        // admit with its catch off. The background pass can afford silence; she
        // is sitting at the queue, and a change she believes she made is not.
        if (!panel.prop('hidden') && !armed) {
            const { state, live } = liveEntry(deps, entry);
            if (state && live) {
                const reasons = brokenEdits(state, live, read());
                if (reasons.length > 0) {
                    armed = true;
                    apply.text('Apply anyway');
                    note.text(reasons.join('; '));
                    note.prop('hidden', false);
                    return;
                }
            }
        }
        void rule('apply', entry, { panel, read }, root, deps);
    });

    const actions = $('<div>', { class: 'sidekick-actions' });
    actions.append($('<button>', { type: 'button' }).text('Edit').on('click', () => {
        const show = panel.prop('hidden');
        panel.prop('hidden', !show);
        // Closing the panel disarms, so the next edit starts from a clean slate
        // rather than an Apply she half-armed two edits ago.
        armed = false;
        apply.text('Apply');
        note.prop('hidden', true);
        if (show) {
            panel.find('input').first().trigger('focus');
        }
    }));
    actions.append(apply);
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
 * disk, and the panel redrawn. Every step re-reads the live state.
 * @param {'apply'|'dismiss'} kind
 * @param {object} entry the entry as drawn
 * @param {object|null} editor the edit panel ({panel, read}), when one was opened
 * @param {object} root the drawn entry element
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>}} deps
 * @returns {Promise<void>}
 */
async function rule(kind, entry, editor, root, deps) {
    const { persist } = deps;
    const { state, live } = liveEntry(deps, entry);
    if (!state) {
        return;
    }
    if (!live) {
        drawQueue(root.parent(), deps);
        return;
    }

    // Read the panel only while it is open. A closed panel means she ruled on the
    // proposal as the scan wrote it, and reading fields she is not looking at
    // would invent edits she never made.
    const read = editor && !editor.panel.prop('hidden') ? editor.read() : null;
    const at = Date.now();

    if (kind === 'dismiss') {
        recordRuling(state, {
            proposalId: live.id,
            summary: live.summary || '',
            action: 'dismissed',
            at,
        });
    } else {
        // §3: the word that enters the record is always the DM's. It now reaches the
        // content and not only the label—her wording rides into changes[].to, so the
        // ChangeEvent reads as she wrote it; §6 keeps that wording on the ruling as
        // `edit` (a string: how the DM reworded it) with action 'edited'.
        const { proposal, edit } = editedProposal(live, read);
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
 * citations resolve to, so no translation is needed.
 * @param {number} index chat-array index, resolved through resolveCitation by the
 *     caller, so a healed index is what gets jumped rather than the stored one
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

/** §6 hygiene: the chat is read at use time, never held across a turn. */
const liveChat = () => SillyTavern.getContext().chat ?? [];

/**
 * Where a citation lands now, or the honest answer that it lands nowhere.
 *
 * Resolved when a surface renders, because the two events that break a
 * locator—a deletion shifting every later index, a swipe rewriting a message's
 * date—are not things the surfaces can watch for. The DM meets the answer
 * where the claim is, not in a log she never reads.
 *
 * @param {number|{index: number, send_date?: number}} citation
 * @returns {{index: number}|{dead: string}|null} null when there is no
 *     citation to show at all; `dead` is the wording the chip carries
 */
function resolveChip(citation) {
    if (citation === undefined || citation === null) {
        return null;
    }

    const { status, index, reason } = resolveCitation(liveChat(), citation);
    if (status === 'stale') {
        return { dead: reason === 'rerolled' ? 're-rolled' : 'message gone' };
    }
    return { index };
}

/** A chip that jumps. The label is the caller's; the index is the resolved one. */
function jumpChip(text, index) {
    return $('<button>', {
        type: 'button',
        class: 'sidekick-jump',
        'aria-label': `Jump to message ${index}`,
    }).text(text).on('click', () => {
        jumpToMessage(index);
    });
}

/** A chip that cannot jump, and says which way it failed. */
function goneChip(reason) {
    return $('<button>', {
        type: 'button',
        class: 'sidekick-jump sidekick-gone',
        disabled: true,
        'aria-label': `cited ${reason}`,
    }).text(reason);
}

/**
 * Registers the hero sheet behind the button's Hero sheet entry.
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
 * Draws the hero, the powers and the arc into a panel body. A section with
 * nothing in it says nothing at all, and a sheet with no sections at all says so.
 * @param {object} body jQuery panel body
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
        body.append($('<p>', { class: 'sidekick-panel-empty' })
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
        const chip = resolveChip(crossing.msgId);
        if (chip?.dead) {
            row.append(goneChip(chip.dead));
        } else if (chip) {
            row.append(jumpChip(`#${chip.index}`, chip.index));
        }
        section.append(row);
    }

    return section;
}

/**
 * Registers the discussion board behind the button's Board entry.
 *
 * Unlike the sheet, the board writes: every change goes through applyProposal
 * on an explicit click, straight to history tagged origin 'discussion', and never
 * through the review queue. §3's two sentences stay apart—the queue is where
 * Sidekick suggests, the board is where the DM thinks—and routing her own thought
 * back through the queue would make her rule on herself.
 *
 * @param {object} options
 * @param {() => object|null} options.getState reads the live state
 * @param {(state: object) => Promise<void>} options.persist files the ledger
 * @param {() => object} options.loadBoard reads this chat's board
 * @param {(board: object, captured?: object) => Promise<boolean>} options.saveBoard
 *     files the board, returning false when the chat moved underneath it
 * @param {(state: object, board: object) => Promise<object>} options.runTurn one
 *     generation, already wired to generateRaw
 * @returns {void}
 */
export function mountBoard({ getState, persist, loadBoard, saveBoard, runTurn }) {
    registerSurface('board', (body) => {
        drawBoard(body, { getState, persist, loadBoard, saveBoard, runTurn });
    });
}

/**
 * Draws this chat's board: the turns that have happened, then a way to say
 * something. The panel redraws when it opens; a turn is appended or replaced in
 * place afterwards, so the DM keeps her scroll.
 *
 * @param {object} body jQuery panel body
 * @param {object} deps
 * @returns {void}
 */
function drawBoard(body, deps) {
    body.empty();

    const board = deps.loadBoard();
    const log = $('<div>', { class: 'sidekick-log' });
    const note = $('<p>', { class: 'sidekick-note', hidden: true });

    // The board is the one surface whose body is a column that fills the panel:
    // the log takes the height she sized and the composer stays at the bottom.
    body.addClass('sidekick-panel-board');

    if (board.turns.length === 0) {
        log.append($('<p>', { class: 'sidekick-panel-empty' })
            .text('The board is empty—say what you are thinking about.'));
    } else {
        // A snapshot: applying a change replaces the turn element it sits in.
        for (const turn of [...board.turns]) {
            log.append(boardTurn(turn, deps));
        }
    }

    body.append(log);
    body.append(note);
    body.append(boardComposer(log, note, deps));
}

/**
 * One turn of the conversation, and the Apply affordance when the board offered
 * a change. Nothing about the tool runs on its own: the button is the only
 * path, and it is wired to applyProposal by the click handler below.
 *
 * @param {object} turn
 * @param {object} deps
 * @returns {object} the turn element
 */
function boardTurn(turn, deps) {
    const root = $('<div>', { class: `sidekick-turn sidekick-turn-${turn.role}` });
    root.append($('<div>', { class: 'sidekick-turn-text' }).text(turn.text || '(nothing said)'));

    if (turn.applied) {
        // A partial landing names itself on the mark: 'applied' alone would
        // claim the whole tool call went through (applyOutcome sets the label).
        root.append($('<span>', { class: 'sidekick-applied' })
            .text(turn.appliedLabel ?? 'applied'));
        return root;
    }

    if (!turn.tool) {
        return root;
    }

    const summary = String(turn.tool.arguments?.summary ?? '').trim();
    root.append($('<button>', {
        type: 'button',
        class: 'sidekick-apply',
        title: summary ? `Apply: ${summary}` : 'Apply a change',
    }).text('Apply').on('click', () => {
        void applyBoardChange(turn, root, deps);
    }));

    return root;
}

/**
 * What the Apply affordance says once the click has done its work.
 *
 * Pure, and exported for a test, because the honesty contract is the whole
 * point of this path: the board is the one surface the DM sits at waiting, so
 * a write must never claim to have landed when it did not—and a partial
 * landing must say how many rather than reading as a clean 'applied'.
 *
 * @param {object} outcome
 * @param {boolean} outcome.thrown applyProposal threw: a path did not resolve
 * @param {number} outcome.applied how many changes produced a ChangeEvent
 * @param {number} outcome.total how many changes the tool call offered
 * @param {boolean} outcome.saved whether the ledger and the board both filed
 * @returns {{chip?: string, applied?: boolean, label?: string}} a `chip` names
 *     the outcome on the button in place; `applied` marks the turn, and a
 *     `label` names a partial landing on that mark
 */
export function applyOutcome({ thrown, applied, total, saved }) {
    if (thrown) {
        // setPath throws on a dead path segment, and applyProposal mutates as
        // it goes, so whatever landed before the throw exists in memory only
        // and nothing is filed. The chip names the failure rather than leaving
        // itself enabled, still reading 'Apply'.
        return { chip: 'failed—a path did not resolve' };
    }

    if (applied === 0) {
        // The provenance gate refused every change: a from that no longer
        // matches what is stored. Nothing reached the ledger, so there is
        // nothing to have failed to save.
        return { chip: 'nothing landed' };
    }

    if (!saved) {
        // The ledger or the board failed to file. The turn keeps its
        // affordance instead of rendering 'applied' over a write nobody can
        // find after a reload.
        return { chip: 'could not be saved' };
    }

    if (applied < total) {
        // A from mismatch skips one change and applies the rest. The landed
        // ones are durable; the mark says how many, because 'applied' would
        // claim the whole call went through.
        return { applied: true, label: `${applied} of ${total} landed` };
    }

    return { applied: true };
}

/**
 * Names an outcome on a turn's chip, in place: the affordance stays where the
 * DM left it, and a write she is waiting on never vanishes without a word.
 *
 * @param {object} root the turn's element
 * @param {string} text what the affordance now says
 * @returns {void}
 */
function markApply(root, text) {
    root.find('.sidekick-apply').prop('disabled', true).text(text);
}

/**
 * Applies one board turn's change: through applyProposal, so the provenance gate
 * still applies, straight to history tagged origin 'discussion', and filed in the
 * same synchronous turn as the click so no chat switch can open under it.
 *
 * The click says what happened. §7 owns the scan's quietness because nobody is
 * watching, but the board is a surface she sits at waiting—so a throw, a refusal,
 * a failed write and a partial landing each name themselves on the chip
 * (applyOutcome), and only a write that both landed and filed marks the turn
 * applied.
 *
 * @param {object} turn the turn as drawn
 * @param {object} root the turn's element
 * @param {object} deps
 * @returns {Promise<void>}
 */
async function applyBoardChange(turn, root, deps) {
    const state = deps.getState();
    if (!state) {
        markApply(root, 'no hero state yet');
        return;
    }

    // Captured in the same synchronous turn as the click, exactly as the
    // composer does: without it, a chat switch mid-write files this chat's
    // board into whichever chat is now open.
    const captured = SillyTavern.getContext().chatMetadata;
    const changes = turn.tool.arguments?.changes ?? [];

    // evidence is [] because a discussion cites no message—the board holds no
    // chat index, which is the same fork and delete safety that keeps its
    // conversation untethered from the chat.
    let applied = null;
    try {
        applied = applyProposal(state, {
            origin: 'discussion',
            summary: String(turn.tool.arguments?.summary ?? '').trim(),
            evidence: [],
            changes,
        }, { at: Date.now() });
    } catch (error) {
        console.error('[Sidekick] the board change failed', error);
    }

    let saved = false;
    if (applied !== null && applied.length > 0) {
        // The board is read again rather than drawn from the panel's copy: the
        // store holds the turns by reference, and a chat switch may have
        // happened since this panel drew. The turn is the same object when it
        // is still there.
        const board = deps.loadBoard();
        try {
            await deps.persist(state);
            saved = await deps.saveBoard(board, captured);
        } catch (error) {
            console.error('[Sidekick] could not persist the board change', error);
        }
    }

    const outcome = applyOutcome({
        thrown: applied === null,
        applied: applied?.length ?? 0,
        total: changes.length,
        saved,
    });

    if (outcome.chip) {
        markApply(root, outcome.chip);
        return;
    }

    turn.applied = true;
    if (outcome.label) {
        // The label rides along in the store—isTurn keeps fields it does not
        // know—so a redraw after a reload still says how many landed.
        turn.appliedLabel = outcome.label;
    }

    root.replaceWith(boardTurn(turn, deps));
}

/**
 * The way the DM talks to the board: a box and a send button.
 *
 * Her line is filed before the generation starts and the reply after it, each
 * guarded against a chat switch, because a board turn is a quiet generation
 * that can run for seconds and CHAT_CHANGED reassigns chatMetadata while it
 * does. The metadata identity is captured in the same synchronous turn as the
 * click, exactly as the scan's persist guard does.
 *
 * @param {object} log the log turns are appended to
 * @param {object} note where a failure is said out loud
 * @param {object} deps
 * @returns {object} the composer element
 */
function boardComposer(log, note, deps) {
    const form = $('<div>', { class: 'sidekick-composer' });
    const input = $('<textarea>', {
        class: 'sidekick-input',
        rows: 2,
        placeholder: 'Think out loud…',
        'aria-label': 'Message the board',
    });
    const send = $('<button>', { type: 'button', class: 'sidekick-send' }).text('Send');

    const say = (message) => {
        note.text(message).prop('hidden', message === '');
    };

    const busy = (value) => {
        send.prop('disabled', value);
        input.prop('disabled', value);
    };

    const submit = async () => {
        const text = String(input.val()).trim();
        if (text === '') {
            return;
        }

        const captured = SillyTavern.getContext().chatMetadata;
        input.val('');
        say('');

        const live = deps.loadBoard();
        appendTurn(live, { role: 'dm', text, at: Date.now() });
        log.append(boardTurn(live.turns[live.turns.length - 1], deps));

        let filed;
        try {
            filed = await deps.saveBoard(live, captured);
        } catch {
            // A rejection rather than a refusal: today's wiring already turns a
            // save failure into false inside saveBoardState, so this holds the
            // contract if that ever stops being true.
            say('Your turn is shown here once and could not be filed.');
            return;
        }

        if (!filed) {
            say('The chat changed—your turn was not filed.');
            return;
        }

        busy(true);
        let reply;
        try {
            reply = await deps.runTurn(deps.getState(), live);
        } catch (error) {
            say(`The board could not answer: ${error instanceof Error ? error.message : error}`);
            busy(false);
            return;
        }
        busy(false);

        let rejected = false;
        let replyFiled = true;
        try {
            replyFiled = await deps.saveBoard(live, captured);
        } catch {
            rejected = true;
        }

        log.append(boardTurn(reply, deps));
        if (rejected) {
            say('The reply is shown here once and could not be filed.');
        } else if (!replyFiled) {
            say('The chat changed—the reply is shown here once and was not filed.');
        }
    };

    send.on('click', () => {
        void submit();
    });

    input.on('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
        }
    });

    form.append(input).append(send);
    return form;
}
