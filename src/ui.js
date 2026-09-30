/**
 * UI surfaces (§7).
 *
 * The extensions drawer holds settings only. Everything the DM touches during
 * play—hero sheet, review queue, board—sits behind the button; a surface that
 * for a click is a surface that gets opened late.
 */

import { applyProposal, getPath, recordRuling, removeAt } from './state.js';
import { fingerprintCitations, resolveCitation } from './citations.js';
import { labelChange } from './labels.js';
import { bornWithMessage, createHandLog, entryPath } from './handwriting.js';
import { clearOld, oldReason, partitionQueue, waitingCount } from './shelf.js';
import { isEmptyRow, sheetGroups } from './sheet.js';
import { appendTurn } from './board.js';
import {
    BUTTON_SIZE,
    clampPosition,
    clampRecord,
    chromeKey,
    movePanel,
    readGeometry,
    readTab,
    resizePanel,
    tabKey,
    writeGeometry,
    writeTab,
} from './chrome.js';

/**
 * The panel's surfaces, in tab order (§7). The labels are the tabs' names.
 * @type {{id: string, label: string}[]}
 */
const SURFACES = [
    { id: 'sheet', label: 'Sheet' },
    { id: 'queue', label: 'Queue' },
    { id: 'board', label: 'Board' },
];

/**
 * Renderers the surface modules register as they are built, keyed by surface
 * id. Until one registers, its tab opens a body that says so, because an empty
 * panel and an unbuilt surface read the same from the DM's side.
 * @type {Map<string, (panel: object) => void>}
 */
const surfaceRenderers = new Map();

/**
 * Registers a surface's renderer behind its tab. The surface's own module calls
 * this when it exists; the chrome shells the rest.
 * @param {string} id a SURFACES id
 * @param {(panel: object) => void} render receives the panel's empty body
 * @returns {void}
 */
export function registerSurface(id, render) {
    surfaceRenderers.set(id, render);
}

/**
 * What she has written by hand this session, and which of those rulings a further
 * edit would still amend (§7, Her hand is a ruling). One log for the page: the panel
 * closing, the tab changing and the chat changing all close it, so an edit never
 * amends a ruling from somewhere she has since left.
 */
const handLog = createHandLog();

/** How many messages the open chat holds: the clock a proposal ages by (§7, Shelf life). */
const chatLength = () => SillyTavern.getContext().chat?.length ?? 0;

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
 * click. Without a threshold every drag would open the panel, which is the
 * standard bug in a drag-on-click control.
 */
const DRAG_THRESHOLD = 4;

/**
 * The chrome's own repaint, reachable from outside mountChrome because two things
 * that live elsewhere change what it shows: a ruling in the Queue, and a pass in
 * index.js that files something. Null until the chrome is mounted.
 * @type {{repaintMarkers: () => void, refresh: () => void}|null}
 */
let chromeHooks = null;

/**
 * Brings the chrome up to date with a queue that changed somewhere it cannot see:
 * repaints both markers, and redraws the Queue tab when it is the one open.
 *
 * The redraw is what makes a scan run from the Queue tab show its result there,
 * and it is careful in two ways. It keeps the scroll position, because a pass can
 * land while she is reading, and it stands down while an edit panel is open,
 * because a redraw would throw away the wording she is in the middle of typing.
 * The marker still counts the new proposals then, and the list catches up the
 * next time the tab is drawn.
 *
 * @returns {void}
 */
export function refreshChrome() {
    chromeHooks?.refresh();
}

/**
 * Mounts the chrome: the button, the one control that is always in front of the
 * DM, and the panel behind it.
 *
 * The button drags. It takes pointer capture on the press, since a flick can
 * leave a 48px disc in one move, and a press then moves it once it passes
 * DRAG_THRESHOLD, so a plain tap still moves nothing and the click path—mouse,
 * touch and the keyboard's Enter and Space—stays what it was. The click a drag
 * ends with is eaten by a flag, and the resting position is clamped and written
 * once, on pointerup: a storage write per frame is waste, and a mid-drag persist
 * that gets abandoned leaves the record off the last resting place.
 *
 * A click opens the panel on the tab she used last, and the button steps aside
 * until the panel closes: two pieces of chrome for one job is one too many, and
 * it ends the button ever sitting over the panel's grip. The marker counts what is
 * waiting, on the button and on the Queue tab, because a queue she cannot see is a
 * queue she forgets. Nothing announces an arrival and nothing switches her tab: a
 * rising number is the new item.
 *
 * Idempotent: APP_READY can fire again after a reconnect, and a second button
 * would stack on the first.
 *
 * @param {object} [options]
 * @param {() => object|null} [options.getState] reads this chat's queue, for the
 *     markers
 * @returns {void}
 */
export function mountChrome({ getState } = {}) {
    if ($('.sidekick-button').length > 0) {
        return;
    }

    // No text: the glyph is drawn by style.css, so the name a screen reader gives
    // the button is the label it carries.
    const button = $('<button>', {
        class: 'sidekick-button',
        type: 'button',
        title: 'Sidekick',
        'aria-label': 'Sidekick',
        'aria-controls': 'sidekick_panel',
        'aria-expanded': 'false',
    });

    // Waiting on you, where she can see it without opening anything: how many
    // proposals hold a ruling, and nothing at all when none do.
    const marker = $('<span>', { class: 'sidekick-marker', hidden: true });
    button.append(marker);

    // The panel is built once. Its strip is the grab handle and holds the close
    // control; the tabs are their own row beneath it, so a panel dragged to its
    // minimum still has a real handle and no interactive child starts a drag.
    const panel = $('<div>', {
        id: 'sidekick_panel',
        class: 'sidekick-panel',
        role: 'region',
        'aria-label': 'Sidekick',
        hidden: true,
    });
    const strip = $('<div>', { class: 'sidekick-panel-strip' });
    const close = $('<button>', {
        type: 'button',
        class: 'sidekick-panel-close',
        'aria-label': 'Close',
    }).text('×');
    strip.append(close);
    const tabs = $('<div>', {
        class: 'sidekick-panel-tabs',
        role: 'tablist',
        'aria-label': 'Surfaces',
    });
    const body = $('<div>', { class: 'sidekick-panel-body', role: 'tabpanel' });
    const grip = $('<div>', { class: 'sidekick-panel-grip', 'aria-hidden': 'true' });
    panel.append(strip, tabs, body, grip);

    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
    const storage = {
        getStored: () => localStorage.getItem(chromeKey()),
        setStored: (key, value) => localStorage.setItem(key, value),
    };

    // Measure the button's anchor and the host's top bar and send form. Any
    // element that is missing reads as undefined, and chrome.js supplies a fallback.
    const hostLayout = () => {
        const sheld = document.querySelector('#sheld')?.getBoundingClientRect();
        const form = document.querySelector('#form_sheld')?.getBoundingClientRect();
        const characters = document.querySelector('#rightNavDrawerIcon')?.getBoundingClientRect();
        return {
            column: sheld ? { right: sheld.right } : undefined,
            characters: characters?.width > 0 && characters?.height > 0
                ? { right: characters.right, bottom: characters.bottom } : undefined,
            top: sheld?.top,
            bottom: form?.height,
        };
    };

    // Read once at mount, already clamped against the browser as it is now: a
    // window that shrank while Sidekick was closed never leaves the control
    // off-screen.
    let geometry = readGeometry({ ...storage, viewport: viewport(), host: hostLayout() });
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

    // The Queue tab carries its own, smaller marker: the same count, where she is
    // when she is looking at what it counts.
    const tabMarker = $('<span>', { class: 'sidekick-marker sidekick-marker-tab', hidden: true });

    const paintMarkers = () => {
        // Only what is not old: the marker means something is waiting on her, and an
        // old proposal is not urgent (§7, Shelf life).
        const waiting = waitingCount(getState?.() ?? null, chatLength());
        for (const one of [marker, tabMarker]) {
            one.text(waiting > 0 ? String(waiting) : '');
            one.prop('hidden', waiting === 0);
        }
    };

    const ids = SURFACES.map((surface) => surface.id);
    const tabStorage = {
        getStored: () => localStorage.getItem(tabKey()),
        setStored: (key, value) => localStorage.setItem(key, value),
    };
    const tabButtons = new Map();
    let active = readTab({ ...tabStorage, ids });

    const markSelected = () => {
        for (const [id, tab] of tabButtons) {
            const selected = id === active;
            tab.attr({ 'aria-selected': String(selected), tabindex: selected ? '0' : '-1' });
        }
    };

    const renderActive = () => {
        // A fresh class list every time: the Board marks its own body, and that
        // mark must not follow her to the next tab.
        body.empty().attr('class', 'sidekick-panel-body');
        body.attr('aria-labelledby', `sidekick_tab_${active}`);

        const render = surfaceRenderers.get(active);
        if (render) {
            render(body);
            return;
        }
        const surface = SURFACES.find((one) => one.id === active);
        body.append($('<p>', { class: 'sidekick-panel-empty' })
            .text(`${surface.label} is not built yet.`));
    };

    const select = (id) => {
        handLog.close();
        active = id;
        writeTab(id, tabStorage);
        markSelected();
        renderActive();
    };

    // Left and Right walk the tabs, wrapping; Home and End jump to the ends.
    const moveTab = (event, id) => {
        let next;
        if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = ids.length - 1;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const step = event.key === 'ArrowLeft' ? -1 : 1;
            next = (ids.indexOf(id) + step + ids.length) % ids.length;
        } else {
            return;
        }
        event.preventDefault();
        select(ids[next]);
        tabButtons.get(ids[next])[0].focus();
    };

    for (const surface of SURFACES) {
        const tab = $('<button>', {
            type: 'button',
            role: 'tab',
            class: 'sidekick-tab',
            id: `sidekick_tab_${surface.id}`,
            'aria-controls': 'sidekick_panel',
            'data-surface': surface.id,
        }).text(surface.label);
        if (surface.id === 'queue') {
            tab.append(tabMarker);
        }
        tab.on('click', () => select(surface.id));
        tab.on('keydown', (event) => moveTab(event, surface.id));
        tabs.append(tab);
        tabButtons.set(surface.id, tab);
    }

    // The button and the panel take turns: one is on screen at a time.
    const openPanel = () => {
        // A panel she has never placed has no place of its own: it opens where
        // the layout is now, which is not where it was at mount if she has since
        // changed SillyTavern's chat width.
        if (!geometry.panelSet) {
            geometry = clampRecord(geometry, viewport(), hostLayout());
            placePanel(geometry.panel);
        }
        markSelected();
        renderActive();
        paintMarkers();
        panel.prop('hidden', false);
        button.prop('hidden', true).attr('aria-expanded', 'true');
        tabButtons.get(active)[0].focus();
    };
    const closePanel = () => {
        panel.prop('hidden', true);
        button.prop('hidden', false).attr('aria-expanded', 'false');
        // Moving focus commits a field she was in the middle of, so the log closes
        // after that, and the commit lands in the ruling it belongs to.
        button[0].focus();
        handLog.close();
    };
    close.on('click', closePanel);

    chromeHooks = {
        repaintMarkers: paintMarkers,
        refresh: () => {
            paintMarkers();
            if (panel.prop('hidden') || active !== 'queue') {
                return;
            }
            const editing = body.find('.sidekick-editor').filter((_, el) => !el.hidden).length > 0;
            if (editing) {
                return;
            }
            const top = body.prop('scrollTop');
            renderActive();
            body.prop('scrollTop', top);
        },
    };

    // The gesture. Capture is taken on the press: the disc is 48px, so a quick
    // flick can carry the pointer off it in a single move, before any
    // capture-on-first-move would land, and the drag would never start. Capture
    // on the button itself leaves the click where it was; the click a drag ends
    // with is eaten here rather than opening the panel over the new position.
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
        button[0].setPointerCapture?.(event.pointerId);
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

    // The panel's two gestures: the strip drags it, the grip resizes it. Same
    // shape as the button's—a threshold, one write at rest—except that capture is
    // taken on the press. The button waits for the first move to keep its click
    // path clean; the strip and the grip have no click to protect, and a fast
    // first move can jump clean off a 20px strip, in which case a listener that
    // had not captured yet would never see the drag begin. A button inside a
    // handle (the close control) is left out, so pressing it is never the start
    // of a drag.
    let panelPress = null;
    for (const [handle, gesture] of [[strip, movePanel], [grip, resizePanel]]) {
        handle.on('pointerdown', (event) => {
            if (event.button !== 0 || $(event.target).closest('button').length > 0) {
                return;
            }
            panelPress = {
                gesture,
                x: event.clientX,
                y: event.clientY,
                from: geometry.panel,
                dragging: false,
            };
            handle[0].setPointerCapture?.(event.pointerId);
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
            // Only now is the panel hers: until a drag or a resize it is the
            // default of the day, and is stored as such.
            geometry = { ...geometry, panelSet: true };
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
        openPanel();
    });

    // The marker's reads. A new chat has its own queue, so a count left over from
    // the last one names the wrong number; a ruling repaints it through drawQueue,
    // and a pass that files something repaints it through refreshChrome. Nothing
    // is left to go stale, which retires the residual the button's badge carried.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, paintMarkers);
    eventSource.on(event_types.CHAT_CHANGED, () => handLog.close());
    // A proposal ages as the chat grows, so the count is read again when it does.
    for (const name of ['MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_DELETED']) {
        if (event_types[name]) {
            eventSource.on(event_types[name], paintMarkers);
        }
    }
    paintMarkers();

    window.addEventListener('resize', () => {
        geometry = clampRecord(geometry, viewport(), hostLayout());
        place(geometry.button);
        placePanel(geometry.panel);
        writeGeometry(geometry, storage);
    });

    $('body').append(button, panel);
}

/**
 * Registers the review queue as the Queue tab's surface.
 *
 * Every action re-reads the state and re-finds the entry by id: the store
 * holds the state by reference, so nothing captured when the panel was drawn
 * can be assumed to still be the object the ledger refers to. Persisting after
 * a mutation is this module's job for the same reason.
 *
 * @param {object} options
 * @param {() => object|null} options.getState reads the live state
 * @param {(state: object) => Promise<void>} options.persist persists a mutated state
 * @param {() => Promise<void>|void} [options.onScan] runs a scan because the DM
 *     asked; the Queue carries the control, since scanning fills the queue
 * @returns {void}
 */
export function mountQueue({ getState, persist, onScan }) {
    registerSurface('queue', (body) => {
        drawQueue(body, { getState, persist, onScan });
    });
}

/**
 * The manual trigger, at the top of the Queue: scanning fills the queue, so the
 * control sits where its result lands. It is disabled while it runs, so a second
 * click cannot ask a guard that would only drop it. The outcome itself is still
 * the toast the scan raises, and a failure of the trigger is logged rather than
 * left to reject unseen.
 *
 * It used to be a typed command, which is a completion-era affordance—nobody
 * types to run a pass when the control is already in front of them. The cadence
 * ticker stays the automatic path; this is the manual one.
 *
 * @param {() => Promise<void>|void} onScan
 * @returns {object} the control's row
 */
function scanControl(onScan) {
    const run = $('<button>', { type: 'button', class: 'sidekick-scan-run' })
        .text('Run a scan');

    run.on('click', async () => {
        run.prop('disabled', true).text('Scanning…');
        try {
            await onScan();
        } catch (error) {
            console.error('[Sidekick] the scan trigger failed', error);
        } finally {
            run.prop('disabled', false).text('Run a scan');
        }
    });

    return $('<div>', { class: 'sidekick-scan' }).append(run);
}

/**
 * Draws the pending queue into a panel body, or says so when nothing waits.
 * @param {object} body jQuery panel body
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>, onScan?: () => Promise<void>|void}} deps
 * @returns {void}
 */
function drawQueue(body, deps) {
    body.empty();

    // Every path that changes the queue ends in a redraw, so this is the one place
    // the markers can be told without each caller having to remember to.
    chromeHooks?.repaintMarkers();

    if (deps.onScan) {
        body.append(scanControl(deps.onScan));
    }

    const state = deps.getState();
    const { current, old } = partitionQueue(state?.queue, chatLength());
    if (current.length === 0) {
        body.append($('<p>', { class: 'sidekick-panel-empty' })
            .text('Nothing is waiting for a ruling.'));
    }

    // A snapshot: each action redraws the body it sits in, so the loop
    // cannot walk the live array.
    for (const entry of [...current]) {
        body.append(proposalBody(entry, deps));
    }

    // Old proposals stay, marked and set below the current ones; nothing leaves the
    // queue unless she rules on it or clears them (§7, Shelf life).
    if (old.length > 0) {
        const head = $('<div>', { class: 'sidekick-old' });
        head.append($('<span>', { class: 'sidekick-old-label' }).text(`Old · ${old.length}`));
        const clear = $('<button>', { type: 'button', class: 'sidekick-clear-old' }).text('Clear old');
        clear.on('click', () => void clearOldByHand(deps, body));
        head.append(clear);
        body.append(head);
        for (const entry of [...old]) {
            body.append(proposalBody(entry, deps));
        }
    }
}

/**
 * Clears every old proposal in one action, as `stale` rulings (she decided nothing,
 * so the scan learns nothing from them), and redraws.
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>}} deps
 * @param {object} body the panel body to redraw into
 * @returns {Promise<void>}
 */
async function clearOldByHand(deps, body) {
    const state = deps.getState();
    if (state && clearOld(state, chatLength()) > 0) {
        try {
            await deps.persist(state);
        } catch (error) {
            console.error('[Sidekick] could not persist clearing the old proposals', error);
        }
    }
    drawQueue(body, deps);
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
 * field would invite cross-contamination. The path itself is not editable, and is
 * not shown: applyProposal addresses the ledger by it, and she came to reword a
 * value, not to move one, so each change wears the label §7 gives its field.
 *
 * `read` is the only way out of the panel. It returns strings, and an emptied
 * `from` is left ambiguous on purpose—`editedProposal` decides what it means,
 * because the difference between "no catch" and "must equal nothing" is exactly
 * the provenance gate.
 *
 * @param {object} entry a PendingChange
 * @param {object|null} state the ledger, which names a power for its label
 * @returns {{panel: object, read: () => {summary: string, changes: Array<{from: string, to: string}>}}}
 */
function editPanel(entry, state) {
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

        row.append($('<span>', { class: 'sidekick-edit-path' })
            .text(labelChange(state, change, entry.changes)));

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

        // She reads these, so a field goes by its label and not its path (§7).
        const name = labelChange(state, change, live.changes);
        if (!field.from) {
            if (change.from !== undefined) {
                reasons.push(`${name} lost its from check`);
            }
        } else if (getPath(state, change.path) !== field.from) {
            reasons.push(`${name} no longer reads what from says`);
        }

        if (!field.to) {
            // `to` carries no gate at all, and a blank one would write a hole in
            // her ledger that reads as a decision.
            reasons.push(`${name} would be emptied`);
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

    // An old proposal is marked, and says why (§7, Shelf life).
    const reason = oldReason(entry, chatLength());
    if (reason) {
        root.addClass('sidekick-proposal-old');
        root.append($('<div>', { class: 'sidekick-old-note' }).text(reason === 'removed'
            ? 'Something this names has been removed, so it can no longer apply.'
            : 'The chat has moved on since this was filed.'));
    }

    // §7, The Queue's words: a field she can read, the value it replaces struck
    // through, then the new one. The path stays in the record and the console.
    const state = deps.getState();
    for (const change of entry.changes ?? []) {
        const diff = $('<div>', { class: 'sidekick-diff' });
        diff.append($('<span>', { class: 'sidekick-diff-label' })
            .text(labelChange(state, change, entry.changes)));
        if (change.from) {
            diff.append($('<span>', { class: 'sidekick-diff-from' }).text(change.from));
        }
        diff.append($('<span>', { class: 'sidekick-diff-to' }).text(change.to ?? ''));
        root.append(diff);
    }

    // A proposal that begins the ledger from the character card cites no message
    // (§3), so it says where it came from where the evidence would be.
    const evidence = $('<div>', { class: 'sidekick-evidence' });
    const cited = entry.evidence ?? [];
    const fromCard = entry.source === 'card';
    if (fromCard) {
        evidence.append($('<span>').text('from the character card'));
    }
    if (!fromCard || cited.length > 0) {
        evidence.append($('<span>').text(fromCard ? ' · evidence: ' : 'evidence: '));
        for (const citation of cited) {
            // §6's locator, resolved where it is used: the index that was filed
            // may have moved since, and the chat is read live rather than trusted.
            const chip = resolveChip(citation);
            if (chip?.dead) {
                evidence.append(goneChip(chip.dead));
            } else if (chip) {
                evidence.append(jumpChip(String(chip.index), chip.index));
            }
        }
    }
    root.append(evidence);

    // Applying it would recreate what she removed, nameless (§6 Paths), so the one
    // thing left to do with it is to put it away.
    if (reason === 'removed') {
        root.append($('<div>', { class: 'sidekick-actions' }).append(
            $('<button>', { type: 'button' }).text('Dismiss')
                .on('click', () => void rule('dismiss', entry, null, root, deps)),
        ));
        return root;
    }

    const { panel, read } = editPanel(entry, state);
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
            // A proposal whose subject she removed was never a judgement of the
            // scan's work: putting it away decides nothing, so it teaches nothing.
            action: live.orphaned ? 'stale' : 'dismissed',
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
 * Registers the hero sheet as the Sheet tab's surface.
 *
 * It writes, and only on her own hand (§7, Writing by hand): a field she chooses,
 * commits with Enter or by leaving it, goes straight into the ledger and files one
 * `written` ruling. §3's rule that nothing touches state without an explicit DM
 * action still holds; the action is hers, and there is no proposal to rule on.
 *
 * @param {object} options
 * @param {() => object|null} options.getState reads the live state
 * @param {(state: object) => Promise<void>} options.persist files the ledger
 * @returns {void}
 */
export function mountSheet({ getState, persist }) {
    registerSurface('sheet', (body) => {
        drawSheet(body, { getState, persist });
    });
}

/**
 * Draws the Sheet into a panel body: the groups src/sheet.js makes of the ledger,
 * as open sections (§7). A ledger with nothing in it is still drawn, as plus slots;
 * only a chat with no ledger at all has nothing to show.
 * @param {object} body jQuery panel body
 * @param {{getState: () => object|null, persist: (state: object) => Promise<void>}} deps
 * @returns {void}
 */
function drawSheet(body, deps) {
    body.empty();

    const groups = sheetGroups(deps.getState());
    if (groups === null) {
        body.append($('<p>', { class: 'sidekick-panel-empty' })
            .text('Open a chat to see its sheet.'));
        return;
    }

    // Redrawing rebuilds every card, so it keeps her place in the scroll: a write
    // near the bottom must not send her back to the top.
    const ctx = {
        deps,
        redraw: () => {
            const top = body.scrollTop();
            drawSheet(body, deps);
            body.scrollTop(top);
        },
    };

    const sheet = $('<div>', { class: 'sidekick-sheet' });
    const main = $('<div>', { class: 'sidekick-sheet-main' });
    const aside = $('<div>', { class: 'sidekick-sheet-aside' });
    sheet.append(main, aside);
    for (const group of groups) {
        const section = sectionOf(group.title).attr('data-section', group.id);
        for (const card of group.cards) {
            section.append(cardOf(card, ctx));
        }
        if (group.adds) {
            section.append(slotsOf(group.adds.map((add) => ({ noun: add.noun, path: add.path, add: true })), ctx));
        }
        (group.id === 'hero' || group.id === 'powers' ? main : aside).append(section);
    }
    body.append(sheet);
}

/**
 * Writes one field by her hand: the ledger takes it at once, one `written` ruling
 * files (or an open one amends), and the Sheet redraws from what the ledger now
 * holds. The state is read, changed and handed to persist with nothing awaited in
 * between, so a chat change cannot land it in the wrong chat.
 * @param {{deps: object, redraw: () => void}} ctx
 * @param {string} path
 * @param {string} value
 * @returns {Promise<void>}
 */
async function writeByHand(ctx, path, value) {
    const state = ctx.deps.getState();
    if (state) {
        // A thread, pressure or line that this write brings into being is born at
        // the newest message in the chat; anything else carries no citation.
        const { chat } = SillyTavern.getContext();
        const born = bornWithMessage(state, path) && Array.isArray(chat) && chat.length > 0
            ? fingerprintCitations(chat, [chat.length - 1])[0] ?? null
            : null;
        const outcome = handLog.commit(state, path, value, { citation: born });
        if (outcome !== 'unchanged') {
            try {
                await ctx.deps.persist(state);
            } catch (error) {
                console.error('[Sidekick] could not persist what she wrote', error);
            }
        }
    }
    ctx.redraw();
}

/**
 * Removes one entry or list item by her hand. Everything after it shifts up, and a
 * path counts positions, so every open ruling closes.
 * @param {{deps: object, redraw: () => void}} ctx
 * @param {string} path
 * @returns {Promise<void>}
 */
async function removeByHand(ctx, path) {
    const state = ctx.deps.getState();
    if (state && removeAt(state, path)) {
        handLog.close();
        try {
            await ctx.deps.persist(state);
        } catch (error) {
            console.error('[Sidekick] could not persist a removal', error);
        }
        // A removal can orphan queued proposals, which stop counting as waiting.
        chromeHooks?.repaintMarkers();
    }
    ctx.redraw();
}

/**
 * Turns `target` into a text box for one field. Enter or leaving the box commits
 * and Escape cancels; Shift+Enter is a line break. Nothing saves while she types,
 * so half a word never reaches the ledger or the digest (§7).
 *
 * `mode` decides what a blank means: over a filled field it clears it; over an empty
 * slot, a list item or a new entry it is a cancel, since nothing was written.
 * @param {object} target the element whose place the box takes
 * @param {{mode: 'field'|'slot'|'item'|'entry', path: string, value?: string, placeholder: string}} edit
 * @param {{deps: object, redraw: () => void}} ctx
 * @returns {void}
 */
function beginEdit(target, { mode, path, value = '', placeholder }, ctx) {
    const box = $('<textarea>', {
        class: 'sidekick-inline',
        rows: 1,
        placeholder,
        'aria-label': placeholder,
    }).val(value);
    const grow = () => box.css('height', 'auto').css('height', `${box[0].scrollHeight}px`);
    let settled = false;

    const settle = (commit) => {
        if (settled) {
            return;
        }
        settled = true;
        const text = String(box.val()).trim();
        if (!commit || (text === '' && mode !== 'field')) {
            ctx.redraw();
            return;
        }
        const written = mode === 'entry' ? entryPath(ctx.deps.getState(), path, text) : path;
        if (written === null) {
            ctx.redraw();
            return;
        }
        void writeByHand(ctx, written, text);
    };

    box.on('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            settle(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            settle(false);
        }
    });
    box.on('blur', () => settle(true));
    box.on('input', grow);

    const input = $('<label>', { class: 'sidekick-writing' })
        .append($('<span>', { class: 'sidekick-input-label' }).text(placeholder), box);
    if (mode === 'slot' || mode === 'entry') {
        target.replaceWith(input);
    } else {
        target.empty().append(input);
    }
    grow();
    box[0].focus();
    box[0].select();
}

/**
 * The quiet × that removes something, and asks once, in place: it turns into
 * "Remove? yes no" where it stood, and nothing goes until she says yes.
 * @param {string} path what it removes
 * @param {{deps: object, redraw: () => void}} ctx
 * @returns {object} the control
 */
function removeControl(path, ctx) {
    const cross = $('<button>', {
        type: 'button',
        class: 'sidekick-remove',
        'aria-label': 'Remove',
        title: 'Remove',
    }).text('×');
    cross.on('click', (event) => {
        event.stopPropagation();
        const ask = $('<span>', { class: 'sidekick-confirm' }).text('Remove? ');
        const yes = $('<button>', { type: 'button', class: 'sidekick-confirm-yes' }).text('yes');
        const no = $('<button>', { type: 'button', class: 'sidekick-confirm-no' }).text('no');
        yes.on('click', () => void removeByHand(ctx, path));
        // detach, not replaceWith: replaceWith strips the old element's handlers,
        // and the × has to work again when she says no
        no.on('click', () => {
            ask.after(cross);
            ask.remove();
        });
        ask.append(yes, ' ', no);
        cross.after(ask);
        cross.detach();
        yes[0].focus();
    });
    return cross;
}

/**
 * One entry: its heading, prose and labelled fields, grouped by spacing (§7).
 * Lists keep their plus control under their own label, even when empty.
 * @param {object} card a Card from src/sheet.js
 * @param {{deps: object, redraw: () => void}} ctx
 * @returns {object} the card element
 */
function cardOf(card, ctx) {
    const root = $('<div>', { class: 'sidekick-card', 'data-card': card.id });
    if (card.remove) {
        root.append(removeControl(card.remove, ctx));
    }
    // A card with nothing in it is named by its own slot ("+ phase"), so a caption
    // over it would only say the same word twice.
    if (card.caption && !card.rows.every(isEmptyRow)) {
        root.append($('<div>', { class: 'sidekick-card-caption' }).text(card.caption));
    }

    const heading = $('<div>', { class: 'sidekick-entry-heading' });
    const details = $('<div>', { class: 'sidekick-power-details' });
    for (const row of card.rows) {
        if (row.style === 'list') {
            const list = rowOf(row, ctx);
            (card.id.startsWith('power:') ? details : root).append(list);
        } else {
            const field = isEmptyRow(row)
                ? slotsOf([{ noun: row.noun, path: row.path }], ctx)
                : rowOf(row, ctx);
            if (row.style === 'title' || row.style === 'meta') {
                heading.append(field);
                if (!heading.parent().length) {
                    root.append(heading);
                }
            } else {
                root.append($('<div>', { class: 'sidekick-field' }).append(field));
            }
        }
    }
    if (details.children().length) {
        root.append(details);
    }

    const chip = card.cite ? resolveChip(card.cite.citation) : null;
    if (chip?.dead) {
        root.append(goneChip(chip.dead));
    } else if (chip) {
        root.append(jumpChip(`#${chip.index}`, chip.index));
    }
    return root;
}

/**
 * One row that has something written in it. A field she can write is a click, or
 * Enter on the keyboard, away from its text box; a list item also carries its ×.
 * @param {object} row a Row or ListRow from src/sheet.js
 * @param {{deps: object, redraw: () => void}} ctx
 * @returns {object} the row element
 */
function rowOf(row, ctx) {
    if (row.style === 'list') {
        const list = $('<div>', { class: 'sidekick-card-list' });
        list.append($('<div>', { class: 'sidekick-card-label' }).text(row.label));
        for (const item of row.items) {
            const line = $('<div>', { class: 'sidekick-card-item', 'data-path': item.path });
            const text = $('<span>', { class: 'sidekick-editable', tabindex: 0 }).text(item.value);
            editable(text, () => beginEdit(line, { mode: 'item', path: item.path, value: item.value, placeholder: row.noun }, ctx));
            line.append(text, removeControl(item.path, ctx));
            list.append(line);
        }
        list.append(slotsOf([{ noun: row.noun, path: row.addPath }], ctx));
        return list;
    }

    const element = $('<div>', { class: `sidekick-card-${row.style}` });
    if (row.label) {
        element.append($('<span>', { class: 'sidekick-card-label' }).text(row.label));
    }
    const value = $('<span>').text(row.value);
    element.append(value);
    if (row.path) {
        element.attr('data-path', row.path);
        value.addClass('sidekick-editable').attr('tabindex', 0);
        editable(value, () => beginEdit(element, { mode: 'field', path: row.path, value: row.value, placeholder: row.noun }, ctx));
    }
    return element;
}

/**
 * Makes an element open its text box on a click, or on Enter or Space from the
 * keyboard, so a field is as reachable without a pointer as with one.
 * @param {object} element
 * @param {() => void} open
 * @returns {void}
 */
function editable(element, open) {
    element.on('click', open);
    element.on('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
        }
    });
}

/**
 * A line of collapsed slots: each an empty field, drawn as a faint "+ noun". A slot
 * is a real, addressable place (its path is on the element), and choosing one opens
 * its text box in the slot's own place. An entry slot ("+ power") asks for the name
 * first, and the card comes into being under it (§7).
 * @param {{noun: string, path: string, add?: boolean}[]} slots
 * @param {{deps: object, redraw: () => void}} ctx
 * @returns {object} the line element
 */
function slotsOf(slots, ctx) {
    const line = $('<div>', { class: 'sidekick-slots' });
    for (const slot of slots) {
        const button = $('<button>', {
            type: 'button',
            class: 'sidekick-slot',
            'data-path': slot.path,
            ...(slot.add ? { 'data-add': 'entry' } : {}),
        }).text(`+ ${slot.noun}`);
        button.on('click', () => beginEdit(button, {
            mode: slot.add ? 'entry' : 'slot',
            path: slot.path,
            placeholder: slot.add && slot.noun === 'power' ? 'Name the power' : slot.noun,
        }, ctx));
        line.append(button);
    }
    return line;
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
 * Registers the discussion board as the Board tab's surface.
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
