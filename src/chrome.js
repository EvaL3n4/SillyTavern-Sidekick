/**
 * The chrome's geometry: where the button sits, and where the panel sits and
 * how big it is. Pure and DOM-free like the other §6-facing modules, because
 * this is the one part of a draggable, resizable surface that node can reach.
 *
 * Everything the DM drags is a rectangle that must stay inside a viewport it
 * did not choose, must survive the browser being resized underneath it, and
 * must not throw on whatever the last session left in storage. Those are all
 * pure problems, so they live here; the pointer listeners stay in src/ui.js.
 *
 * Storage is injected rather than touched: `readGeometry({ getStored })` takes
 * whatever the browser offers, so the suite drives every branch with fakes and
 * no jsdom. The key carries its own version, so a future shape bump is a new
 * key rather than a migration nobody wrote.
 */

/** The record's shape version, stored inside the record as well as the key. */
const VERSION = 2;

/**
 * The key the chrome's geometry is stored under. It carries its own version, so
 * a shape bump reads as a missing record rather than as half of one: the old key
 * is simply never found, which is why no migration has to be written.
 *
 * @returns {string}
 */
export function chromeKey() {
    return `sidekick_chrome_v${VERSION}`;
}

/**
 * The button's footprint, which is what clamps know it by. It has to match
 * `.sidekick-button`'s box in style.css: a clamp that believes a smaller
 * control than the one on screen lets its bottom edge hang off the viewport.
 */
export const BUTTON_SIZE = { width: 48, height: 48 };

/** The panel's smallest usable size: the edit panel's from/to pairs need width. */
export const PANEL_MIN = { width: 280, height: 200 };

/** The panel's opening size, before she has resized it. */
export const PANEL_DEFAULT = { width: 340, height: 420 };

/** The gap the defaults leave between the chrome and the viewport's edges. */
const MARGIN = 24;

/**
 * Only used when the caller has no viewport to give: tests, and read's own
 * fallback. The caller always passes the live one and re-clamps, so a wrong
 * number here moves control, it does not lose it.
 */
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

const isFinite = (value) => Number.isFinite(value);

const isRect = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * True when every named field is a real number. A string, a null, a NaN and a
 * missing key all fail alike, which is the point: junk from an old version
 * reads as absent rather than as a coordinate.
 */
const hasNumbers = (value, fields) => isRect(value) && fields.every((field) => isFinite(value[field]));

/**
 * The record spells a size w/h; a control's footprint spells it width/height.
 * Two spellings of one thing is a trap, so they meet here and nowhere else.
 *
 * @param {{w: number, h: number}} size
 * @returns {{width: number, height: number}}
 */
const asSize = (size) => ({ width: size.w, height: size.h });

/**
 * Where the chrome sits before she has ever moved it: the button above the
 * send form's corner, the panel centred. Both are starting points only.
 *
 * @param {{width: number, height: number}} [viewport]
 * @returns {{v: number, button: {x: number, y: number}, panel: {x: number, y: number, w: number, h: number}}}
 */
export function defaultGeometry(viewport = DEFAULT_VIEWPORT) {
    const { width, height } = viewport;

    return {
        v: VERSION,
        button: {
            x: width - BUTTON_SIZE.width - MARGIN,
            y: height - BUTTON_SIZE.height - MARGIN,
        },
        panel: {
            x: Math.round((width - PANEL_DEFAULT.width) / 2),
            y: Math.round((height - PANEL_DEFAULT.height) / 2),
            w: PANEL_DEFAULT.width,
            h: PANEL_DEFAULT.height,
        },
    };
}

/**
 * Keeps a control of `size` fully inside the viewport. A viewport smaller than
 * the control pins it at 0 rather than throwing: a narrow viewport is a layout
 * problem, not a corruption, and the control must stay reachable either way.
 *
 * @param {number} x
 * @param {number} y
 * @param {{width: number, height: number}} size
 * @param {{width: number, height: number}} viewport
 * @returns {{x: number, y: number}}
 */
export function clampPosition(x, y, size, viewport) {
    if (!isFinite(x) || !isFinite(y) || !hasNumbers(size, ['width', 'height'])
        || !hasNumbers(viewport, ['width', 'height'])) {
        return { x: 0, y: 0 };
    }

    const maxX = Math.max(0, viewport.width - size.width);
    const maxY = Math.max(0, viewport.height - size.height);

    return {
        x: Math.round(Math.min(Math.max(x, 0), maxX)),
        y: Math.round(Math.min(Math.max(y, 0), maxY)),
    };
}

/**
 * Pins a size between its minimum and the viewport. `bounds` arrives as a
 * parameter so the minimums stay a layout decision rather than a constant this
 * module invented for every caller.
 *
 * @param {number} w
 * @param {number} h
 * @param {{width: number, height: number}} bounds the minimum
 * @param {{width: number, height: number}} viewport
 * @returns {{w: number, h: number}}
 */
export function clampSize(w, h, bounds = PANEL_MIN, viewport = DEFAULT_VIEWPORT) {
    if (!isFinite(w) || !isFinite(h) || !hasNumbers(bounds, ['width', 'height'])
        || !hasNumbers(viewport, ['width', 'height'])) {
        return { w: PANEL_MIN.width, h: PANEL_MIN.height };
    }

    const minW = Math.min(bounds.width, viewport.width);
    const minH = Math.min(bounds.height, viewport.height);
    const maxW = Math.max(minW, viewport.width);
    const maxH = Math.max(minH, viewport.height);

    return {
        w: Math.round(Math.min(Math.max(w, minW), maxW)),
        h: Math.round(Math.min(Math.max(h, minH), maxH)),
    };
}

/**
 * Re-fits a whole record against the viewport. The panel's size is clamped
 * before its position, because a panel that shrank must not sit at a
 * coordinate its new size makes unreachable.
 *
 * @param {object} record
 * @param {{width: number, height: number}} [viewport]
 * @returns {object} a record of this module's shape
 */
export function clampRecord(record, viewport = DEFAULT_VIEWPORT) {
    const base = normalize(record, viewport) ?? defaultGeometry(viewport);
    const panelSize = clampSize(base.panel.w, base.panel.h, PANEL_MIN, viewport);
    const panelAt = clampPosition(base.panel.x, base.panel.y, asSize(panelSize), viewport);

    return {
        v: VERSION,
        button: clampPosition(base.button.x, base.button.y, BUTTON_SIZE, viewport),
        panel: { ...panelSize, ...panelAt },
    };
}

/**
 * The panel after its head has been dragged (dx, dy) from `from`: same size,
 * new place, held inside the viewport.
 *
 * @param {{x: number, y: number, w: number, h: number}} from the panel at press
 * @param {number} dx
 * @param {number} dy
 * @param {{width: number, height: number}} viewport
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function movePanel(from, dx, dy, viewport) {
    return { ...from, ...clampPosition(from.x + dx, from.y + dy, asSize(from), viewport) };
}

/**
 * The panel after its grip has been dragged (dx, dy) from `from`: same corner,
 * new size, never below PANEL_MIN and never past the viewport's edge.
 *
 * The grip is the bottom-right corner, so the top-left stays where it is and the
 * panel may only grow into the room that corner leaves. clampSize is handed that
 * room in place of the whole viewport, which is what stops a resize from
 * carrying the grip off-screen where it could not be dragged back.
 *
 * @param {{x: number, y: number, w: number, h: number}} from the panel at press
 * @param {number} dx
 * @param {number} dy
 * @param {{width: number, height: number}} viewport
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function resizePanel(from, dx, dy, viewport) {
    const room = { width: viewport?.width - from.x, height: viewport?.height - from.y };
    return { ...from, ...clampSize(from.w + dx, from.h + dy, PANEL_MIN, room) };
}

/**
 * One stored record, field by field.
 *
 * A number this module cannot vouch for falls back to that same field's default and
 * to nothing else: a truncated write costs the one coordinate it lost, not the
 * position she dragged the other half to. A half that is not an object at all
 * cannot be read field by field, so the whole half falls back.
 *
 * @param {unknown} record
 * @param {{width: number, height: number}} [viewport]
 * @returns {object|null}
 */
function normalize(record, viewport = DEFAULT_VIEWPORT) {
    if (!isRect(record) || record.v !== VERSION) {
        return null;
    }

    const fallback = defaultGeometry(viewport);

    return {
        v: VERSION,
        button: fillRect(record.button, fallback.button),
        panel: fillRect(record.panel, fallback.panel),
    };
}

/**
 * Copies the fields `shape` names out of `stored`, substituting the shape's own
 * value for any that is not a real number. Taking the field names from the
 * shape rather than from the stored value is what bounds this: a field nobody
 * knows about is dropped, while a missing one is filled.
 *
 * @param {unknown} stored
 * @param {object} shape the fallback, which also names the fields
 * @returns {object}
 */
function fillRect(stored, shape) {
    const source = isRect(stored) ? stored : {};
    const filled = {};

    for (const field of Object.keys(shape)) {
        filled[field] = isFinite(source[field]) ? source[field] : shape[field];
    }

    return filled;
}

/**
 * Reads the chrome's geometry, or the defaults when nothing usable is stored.
 *
 * Nothing here throws: hand-edited storage, an old version and a truncated
 * write all read as defaults, because the button is how she reaches every
 * other surface and a lost position costs one drag, not a working feature.
 *
 * @param {{getStored?: () => unknown, viewport?: {width: number, height: number}}} [seam]
 * @returns {object} the record, clamped against the viewport when one is given
 */
export function readGeometry({ getStored, viewport } = {}) {
    let raw = null;

    if (typeof getStored === 'function') {
        try {
            raw = getStored();
        } catch {
            raw = null;
        }
    }
    let parsed = null;

    if (typeof raw === 'string') {
        try {
            parsed = normalize(JSON.parse(raw), viewport);
        } catch {
            parsed = null;
        }
    }

    const record = parsed ?? defaultGeometry(viewport);

    return viewport ? clampRecord(record, viewport) : record;
}

/**
 * Writes the record through the injected seam. Best-effort on purpose: a
 * storage that refuses (a private-mode browser, a full quota) must never break
 * a drag in progress, so the throw would tell her less than the position she
 * can see.
 *
 * @param {object} record
 * @param {{setStored?: (key: string, value: string) => void}} [seam]
 * @returns {boolean} true when the record was handed to storage
 */
export function writeGeometry(record, { setStored } = {}) {
    if (typeof setStored !== 'function') {
        return false;
    }

    try {
        const payload = JSON.stringify(normalize(record) ?? defaultGeometry());
        setStored(chromeKey(), payload);
        return true;
    } catch {
        return false;
    }
}
