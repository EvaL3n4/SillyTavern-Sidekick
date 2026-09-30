import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    BUTTON_SIZE,
    PANEL_DEFAULT,
    PANEL_MIN,
    panelDefault,
    clampPosition,
    clampRecord,
    clampSize,
    defaultGeometry,
    chromeKey,
    movePanel,
    readGeometry,
    readTab,
    resizePanel,
    tabKey,
    writeGeometry,
    writeTab,
} from '../src/chrome.js';

const VIEWPORT = { width: 1280, height: 800 };
const DEFAULTS = defaultGeometry(VIEWPORT);


/**
 * A store built inline, because the seeded value and the recorded calls both
 * have to be readable from the test that owns them.
 */
function store(seed = null) {
    const state = { value: seed, calls: [] };

    return {
        calls: state.calls,
        getStored: () => state.value,
        setStored: (key, value) => {
            state.value = value;
            state.calls.push([key, value]);
        },
    };
}

describe('chromeKey', () => {
    it('carries the record shape version in the key', () => {
        assert.equal(chromeKey(), 'sidekick_chrome_v2');
        assert.ok(chromeKey().endsWith(`_v${defaultGeometry().v}`));
    });
});

describe('defaultGeometry', () => {
    it('starts below the toolbar inside the chat edge when no anchor is measured', () => {
        assert.deepEqual(defaultGeometry(VIEWPORT).button, { x: 900, y: 47 });
    });

    it('starts below character management on the chat-facing side of the drawer', () => {
        const host = { characters: { right: 1059, bottom: 34 }, column: { right: 1080 }, top: 35 };
        assert.deepEqual(defaultGeometry({ width: 1440, height: 900 }, host).button, { x: 1011, y: 46 });
    });

    it('uses the measured chat edge and toolbar when the character control is absent', () => {
        assert.deepEqual(defaultGeometry(VIEWPORT, { column: { right: 800 }, top: 40 }).button,
            { x: 740, y: 52 });
    });

    it('keeps a missing or invalid anchor on screen even in a tiny viewport', () => {
        assert.deepEqual(defaultGeometry({ width: 30, height: 30 }, null).button, { x: 0, y: 0 });
        assert.deepEqual(defaultGeometry({ width: 600, height: 500 }, {
            characters: { right: NaN, bottom: Infinity }, column: { right: NaN }, top: NaN,
        }).button, { x: 540, y: 47 });
        assert.deepEqual(defaultGeometry(VIEWPORT, {
            characters: { right: 5000, bottom: 5000 },
        }).button, { x: 1232, y: 752 });
    });

    it('preserves saved positions, including the old default, when an anchor moves', () => {
        for (const button of [{ x: 100, y: 200 }, { x: 1208, y: 728 }]) {
            const stored = JSON.stringify({ ...DEFAULTS, button });
            const read = readGeometry({ getStored: () => stored, viewport: VIEWPORT,
                host: { characters: { right: 900, bottom: 35 } } });
            assert.deepEqual(read.button, button);
        }
    });

    it('docks the panel against the right edge, in the gutter', () => {
        assert.deepEqual(defaultGeometry(VIEWPORT).panel, { x: 928, y: 12, w: 340, h: 560 });
    });

    it('starts with a panel she has not placed', () => {
        assert.equal(defaultGeometry(VIEWPORT).panelSet, false);
    });

    it('stamps the record with the version the key names', () => {
        assert.equal(defaultGeometry().v, 2);
        assert.equal(defaultGeometry({ width: 400, height: 300 }).v, 2);
    });

    it('puts the defaults fully inside the viewport it was given', () => {
        // The defaults are only a starting point, but they must not start off-screen
        const small = defaultGeometry({ width: 600, height: 500 });

        assert.deepEqual(
            clampPosition(small.button.x, small.button.y, BUTTON_SIZE, { width: 600, height: 500 }),
            small.button,
        );
    });
});

// Measured in SillyTavern's Bed (§7, Panel size): the chat column is half the
// viewport, centred, under a 35px top bar and above a 39px send form.
const ST = (width) => ({ column: { right: width * 0.75 }, top: 35, bottom: 39 });

describe('panelDefault', () => {
    it('opens at its full size in a gutter that holds it', () => {
        for (const width of [1920, 2560]) {
            const panel = panelDefault({ width, height: 1080 }, ST(width));
            assert.equal(panel.w, 440, String(width));
            assert.equal(panel.h, 560);
        }
    });

    it('docks 12px in from the right edge and 12px under the top bar', () => {
        assert.deepEqual(panelDefault({ width: 1920, height: 1080 }, ST(1920)), { x: 1468, y: 47, w: 440, h: 560 });
    });

    it('fits the gutter it has, down to the docked minimum', () => {
        // gutter 480 -> 456 -> capped at 440; gutter 400 -> 376; below 364 the minimum holds
        assert.equal(panelDefault({ width: 1600, height: 900 }, ST(1600)).w, 376);
        assert.equal(panelDefault({ width: 1440, height: 900 }, ST(1440)).w, 340);
        assert.equal(panelDefault({ width: 1280, height: 800 }, ST(1280)).w, 340);
        assert.equal(panelDefault({ width: 1024, height: 768 }, ST(1024)).w, 340);
    });

    it('overlaps the chat column rather than shrink below the docked minimum', () => {
        const panel = panelDefault({ width: 1280, height: 800 }, ST(1280));
        assert.ok(panel.x < 1280 * 0.75, 'the panel reaches into the column');
    });

    it('follows a chat column she has widened, wherever its edge is', () => {
        assert.equal(panelDefault({ width: 1920, height: 1080 }, { column: { right: 1700 } }).w, 340);
        assert.equal(panelDefault({ width: 1920, height: 1080 }, { column: { right: 1200 } }).w, 440);
    });

    it('assumes SillyTavern\'s centred half-width column when nothing was measured', () => {
        assert.deepEqual(panelDefault({ width: 1920, height: 1080 }), { x: 1468, y: 12, w: 440, h: 560 });
        assert.deepEqual(panelDefault({ width: 1920, height: 1080 }, {}), panelDefault({ width: 1920, height: 1080 }));
        assert.deepEqual(panelDefault({ width: 1920, height: 1080 }, null), panelDefault({ width: 1920, height: 1080 }));
    });

    it('keeps the height inside a short viewport', () => {
        assert.equal(panelDefault({ width: 1920, height: 600 }, ST(1920)).h, 541);
    });

    it('is a bottom sheet across the width where SillyTavern has no gutters', () => {
        const phone = panelDefault({ width: 390, height: 844 }, { top: 35, bottom: 39 });
        assert.deepEqual(phone, { x: 8, y: 254, w: 374, h: 539 });
        assert.equal(phone.y + phone.h, 844 - 39 - 12, 'it stands on the send form');
    });

    it('caps the sheet at the default height on a tall screen', () => {
        assert.equal(panelDefault({ width: 820, height: 1180 }, { top: 35, bottom: 39 }).h, 560);
    });

    it('switches at SillyTavern\'s own breakpoint', () => {
        assert.equal(panelDefault({ width: 1000, height: 800 }, ST(1000)).x, 8);
        assert.notEqual(panelDefault({ width: 1001, height: 800 }, ST(1001)).x, 8);
    });

    it('never puts the sheet above the top bar on a viewport too short for it', () => {
        assert.ok(panelDefault({ width: 400, height: 90 }, { top: 35, bottom: 39 }).y >= 35);
    });
});

describe('clampPosition', () => {
    it('keeps a control dragged past the bottom-right inside', () => {
        assert.deepEqual(clampPosition(5000, 5000, BUTTON_SIZE, VIEWPORT), { x: 1232, y: 752 });
    });

    it('pins a control dragged past the top-left at the origin', () => {
        assert.deepEqual(clampPosition(-100, -100, BUTTON_SIZE, VIEWPORT), { x: 0, y: 0 });
    });

    it('leaves a position that already fits alone', () => {
        assert.deepEqual(clampPosition(300, 200, BUTTON_SIZE, VIEWPORT), { x: 300, y: 200 });
    });

    it('pins at the origin when the viewport is smaller than the control', () => {
        assert.deepEqual(
            clampPosition(10, 10, { width: 200, height: 100 }, { width: 100, height: 50 }),
            { x: 0, y: 0 },
        );
    });

    it('returns the origin rather than throwing on coordinates that are not numbers', () => {
        assert.deepEqual(clampPosition(Number.NaN, 10, BUTTON_SIZE, VIEWPORT), { x: 0, y: 0 });
        assert.deepEqual(clampPosition('10', 10, BUTTON_SIZE, VIEWPORT), { x: 0, y: 0 });
        assert.deepEqual(clampPosition(10, 10, { width: 48 }, VIEWPORT), { x: 0, y: 0 });
        assert.deepEqual(clampPosition(10, 10, BUTTON_SIZE, { width: 1280 }), { x: 0, y: 0 });
    });
});

describe('clampSize', () => {
    it('pins a size below the minimum at the minimum', () => {
        assert.deepEqual(clampSize(100, 100, PANEL_MIN, VIEWPORT), { w: 280, h: 260 });
    });

    it('pins a size above the viewport at the viewport', () => {
        assert.deepEqual(clampSize(5000, 5000, PANEL_MIN, VIEWPORT), { w: 1280, h: 800 });
    });

    it('leaves a size between the minimum and the viewport alone', () => {
        assert.deepEqual(clampSize(400, 300, PANEL_MIN, VIEWPORT), { w: 400, h: 300 });
    });

    it('takes the minimum as a parameter rather than assuming this module', () => {
        assert.deepEqual(clampSize(100, 100, { width: 600, height: 400 }, VIEWPORT), { w: 600, h: 400 });
    });

    it('pins at the minimum when the viewport cannot even fit it', () => {
        assert.deepEqual(clampSize(400, 300, PANEL_MIN, { width: 200, height: 100 }), { w: 200, h: 100 });
    });

    it('falls back to the module minimum on numbers that are not numbers', () => {
        assert.deepEqual(clampSize(Number.NaN, 300, PANEL_MIN, VIEWPORT), { w: 280, h: 260 });
        assert.deepEqual(clampSize(400, '300', PANEL_MIN, VIEWPORT), { w: 280, h: 260 });
        assert.deepEqual(clampSize(400, 300, null, VIEWPORT), { w: 280, h: 260 });
    });

    it('uses the panel minimum and its own viewport when the caller supplies neither', () => {
        assert.deepEqual(clampSize(100, 100), { w: 280, h: 260 });
    });
});

describe('movePanel', () => {
    const panel = { x: 400, y: 200, w: 340, h: 420 };

    it('moves the panel by the drag and leaves its size alone', () => {
        assert.deepEqual(movePanel(panel, 50, -30, VIEWPORT), { x: 450, y: 170, w: 340, h: 420 });
    });

    it('stops the panel at the viewport edges by its own size, not the button\'s', () => {
        assert.deepEqual(movePanel(panel, 5000, 5000, VIEWPORT), { x: 940, y: 380, w: 340, h: 420 });
        assert.deepEqual(movePanel(panel, -5000, -5000, VIEWPORT), { x: 0, y: 0, w: 340, h: 420 });
    });
});

describe('resizePanel', () => {
    const panel = { x: 400, y: 200, w: 340, h: 420 };

    it('grows and shrinks from the bottom-right, holding the top-left corner', () => {
        assert.deepEqual(resizePanel(panel, 60, -40, VIEWPORT), { x: 400, y: 200, w: 400, h: 380 });
    });

    it('never shrinks below the minimum', () => {
        assert.deepEqual(resizePanel(panel, -5000, -5000, VIEWPORT), { x: 400, y: 200, w: 280, h: 260 });
    });

    it('stops at the viewport edge the corner leaves room for, not at the viewport size', () => {
        // 1280 - 400 and 800 - 200: the grip stays on screen, where it can be
        // dragged back.
        assert.deepEqual(resizePanel(panel, 5000, 5000, VIEWPORT), { x: 400, y: 200, w: 880, h: 600 });
    });

    it('keeps the panel inside a viewport too small for the minimum', () => {
        const tight = { x: 0, y: 0, w: 280, h: 260 };
        assert.deepEqual(resizePanel(tight, 100, 100, { width: 240, height: 150 }), { x: 0, y: 0, w: 240, h: 150 });
    });

    it('reads a viewport it cannot use as the minimum rather than throwing', () => {
        assert.deepEqual(resizePanel(panel, 60, 60, undefined), { x: 400, y: 200, w: 280, h: 260 });
    });
});

describe('clampRecord', () => {
    it('clamps the panel size before its position, so a shrunken panel stays reachable', () => {
        // The panel asked for 500x500, so it pins to the minimum 280x260 first; only then does its
        // right edge pin at 120. Clamped position first against the requested 100x100 it would sit
        // at 390x290 and then grow straight off the viewport.
        const record = {
            v: 2,
            button: { x: 0, y: 0 },
            panel: { x: 390, y: 290, w: 100, h: 100 },
        };

        assert.deepEqual(clampRecord(record, { width: 400, height: 300 }).panel, { w: 280, h: 260, x: 120, y: 40 });
    });

    it('re-clamps a button the browser shrank out from under', () => {
        const record = { v: 2, button: { x: 5000, y: 0 }, panel: { x: 0, y: 0, w: 340, h: 420 } };

        assert.equal(clampRecord(record, { width: 400, height: 300 }).button.x, 352);
    });

    it('reads a record with no version as the defaults', () => {
        assert.deepEqual(clampRecord({}), defaultGeometry());
        assert.deepEqual(clampRecord(null), defaultGeometry());
    });
});

describe('readGeometry', () => {
    it('reads the defaults when nothing is stored', () => {
        assert.deepEqual(readGeometry({ getStored: () => null, viewport: VIEWPORT }), DEFAULTS);
        assert.deepEqual(readGeometry({ getStored: () => undefined, viewport: VIEWPORT }), DEFAULTS);
        assert.deepEqual(readGeometry({ viewport: VIEWPORT }), DEFAULTS);
        assert.deepEqual(readGeometry(), defaultGeometry());
    });

    it('reads the defaults for a string that is not JSON', () => {
        assert.deepEqual(readGeometry({ getStored: () => 'not json{', viewport: VIEWPORT }), DEFAULTS);
    });

    it('reads the defaults for JSON that is not a record', () => {
        for (const junk of ['42', '"a string"', 'null', 'true', '[1, 2, 3]']) {
            assert.deepEqual(readGeometry({ getStored: () => junk, viewport: VIEWPORT }), DEFAULTS, junk);
        }
    });

    it('reads the defaults for a record from another version', () => {
        const stored = JSON.stringify({ v: 3, button: { x: 10, y: 20 }, panel: { x: 30, y: 40, w: 300, h: 400 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), DEFAULTS);
    });

    it('fills the one field that is missing and keeps the rest', () => {
        const stored = JSON.stringify({ v: 2, button: { x: 10 }, panel: { x: 30, y: 40, w: 300 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 2,
            button: { x: 10, y: DEFAULTS.button.y },
            panel: { x: 30, y: 40, w: 300, h: DEFAULTS.panel.h },
            panelSet: true,
        });
    });

    it('fills a whole half that is not an object at all', () => {
        const stored = JSON.stringify({ v: 2, button: 'junk', panel: { x: 30, y: 40, w: 300, h: 420 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 2,
            button: DEFAULTS.button,
            panel: { x: 30, y: 40, w: 300, h: 420 },
            panelSet: true,
        });
    });

    it('restores a stored position', () => {
        const stored = JSON.stringify({ v: 2, button: { x: 100, y: 200 }, panel: { x: 10, y: 20, w: 500, h: 400 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 2,
            button: { x: 100, y: 200 },
            panel: { x: 10, y: 20, w: 500, h: 400 },
            panelSet: true,
        });
    });

    it('clamps a stored record that no longer fits the browser', () => {
        const stored = JSON.stringify({
            v: 2,
            button: { x: 5000, y: 5000 },
            panel: { x: 5000, y: 5000, w: 5000, h: 5000 },
        });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 2,
            button: { x: 1232, y: 752 },
            panel: { w: 1280, h: 800, x: 0, y: 0 },
            panelSet: true,
        });
    });

    it('leaves a stored record unclamped when the caller has no viewport to give', () => {
        const stored = JSON.stringify({ v: 2, button: { x: 5000, y: 5000 }, panel: { x: 0, y: 0, w: 340, h: 420 } });

        assert.equal(readGeometry({ getStored: () => stored }).button.x, 5000);
    });

    it('reads the defaults when storage itself refuses to answer', () => {
        const getStored = () => {
            throw new Error('storage is blocked');
        };

        assert.deepEqual(readGeometry({ getStored, viewport: VIEWPORT }), DEFAULTS);
    });
});

describe('a panel she has not placed', () => {
    const wide = { width: 1920, height: 1080 };
    const phone = { width: 390, height: 844 };
    const seen = (stored, viewport, host) => readGeometry({ getStored: () => JSON.stringify(stored), viewport, host });

    it('follows the default of the day, whatever was stored beside it', () => {
        const stored = { v: 2, panelSet: false, button: { x: 5, y: 5 }, panel: { x: 1, y: 1, w: 999, h: 999 } };

        assert.deepEqual(seen(stored, wide, ST(1920)).panel, panelDefault(wide, ST(1920)));
    });

    it('is a record from before the flag whose panel is still the old default size', () => {
        // Every old record saved the default whenever the button or window moved, so the
        // old size is what an unplaced panel looks like. Raising the default must reach it.
        const stored = { v: 2, button: { x: 5, y: 5 }, panel: { x: 470, y: 190, w: 340, h: 420 } };

        assert.deepEqual(seen(stored, wide, ST(1920)).panel, panelDefault(wide, ST(1920)));
        assert.equal(seen(stored, wide, ST(1920)).panelSet, false);
    });

    it('keeps the button she placed while the panel moves to the new default', () => {
        const stored = { v: 2, button: { x: 5, y: 5 }, panel: { x: 470, y: 190, w: 340, h: 420 } };

        assert.deepEqual(seen(stored, wide, ST(1920)).button, { x: 5, y: 5 });
    });

    it('is re-derived when the window changes, not clamped', () => {
        const record = readGeometry({ viewport: wide, host: ST(1920) });

        assert.deepEqual(clampRecord(record, phone, { top: 35, bottom: 39 }).panel, panelDefault(phone, { top: 35, bottom: 39 }));
    });

    it('reads a record with a panel that is not an object as unplaced', () => {
        const stored = { v: 2, button: { x: 5, y: 5 }, panel: 'junk' };

        assert.equal(seen(stored, wide, ST(1920)).panelSet, false);
    });
});

describe('a panel she has placed', () => {
    const wide = { width: 1920, height: 1080 };

    it('is never moved by a new default', () => {
        const stored = { v: 2, panelSet: true, button: { x: 5, y: 5 }, panel: { x: 470, y: 190, w: 340, h: 420 } };
        const read = readGeometry({ getStored: () => JSON.stringify(stored), viewport: wide, host: ST(1920) });

        assert.deepEqual(read.panel, { x: 470, y: 190, w: 340, h: 420 });
        assert.equal(read.panelSet, true);
    });

    it('is a record from before the flag whose panel she resized', () => {
        const stored = { v: 2, button: { x: 5, y: 5 }, panel: { x: 40, y: 50, w: 600, h: 500 } };
        const read = readGeometry({ getStored: () => JSON.stringify(stored), viewport: wide, host: ST(1920) });

        assert.deepEqual(read.panel, { x: 40, y: 50, w: 600, h: 500 });
        assert.equal(read.panelSet, true);
    });

    it('stays clamped to the window it is now in', () => {
        const stored = { v: 2, panelSet: true, button: { x: 5, y: 5 }, panel: { x: 1800, y: 900, w: 440, h: 560 } };
        const read = readGeometry({ getStored: () => JSON.stringify(stored), viewport: { width: 1000, height: 700 } });

        assert.ok(read.panel.x + read.panel.w <= 1000);
        assert.ok(read.panel.y + read.panel.h <= 700);
    });

    it('is written as placed, and an unplaced one as unplaced', () => {
        const wrote = (record) => {
            const fake = store();
            writeGeometry(record, { setStored: fake.setStored });
            return JSON.parse(fake.calls[0][1]).panelSet;
        };

        assert.equal(wrote({ v: 2, panelSet: true, button: { x: 1, y: 1 }, panel: { x: 1, y: 1, w: 400, h: 400 } }), true);
        assert.equal(wrote({ v: 2, panelSet: false, button: { x: 1, y: 1 }, panel: { x: 1, y: 1, w: 400, h: 400 } }), false);
    });
});

describe('writeGeometry', () => {
    const record = { v: 2, button: { x: 100, y: 200 }, panel: { x: 10, y: 20, w: 500, h: 400 }, panelSet: true };

    it('hands the record over under the versioned key', () => {
        const fake = store();

        assert.equal(writeGeometry(record, { setStored: fake.setStored }), true);
        assert.deepEqual(fake.calls, [[chromeKey(), JSON.stringify(record)]]);
    });

    it('swallows a storage that refuses, because a drag must not break on it', () => {
        const setStored = () => {
            throw new Error('quota exceeded');
        };

        assert.equal(writeGeometry(record, { setStored }), false);
    });

    it('reports false when there is no storage to write to', () => {
        assert.equal(writeGeometry(record), false);
        assert.equal(writeGeometry(record, {}), false);
    });

    it('writes the defaults for a record it cannot vouch for', () => {
        const fake = store();
        writeGeometry({}, { setStored: fake.setStored });

        assert.deepEqual(JSON.parse(fake.calls[0][1]), defaultGeometry());
    });

    it('round-trips: what it writes, readGeometry reads back', () => {
        const fake = store();
        writeGeometry(record, { setStored: fake.setStored });

        assert.deepEqual(
            readGeometry({ getStored: fake.getStored, viewport: VIEWPORT }),
            { v: 2, button: { x: 100, y: 200 }, panel: { x: 10, y: 20, w: 500, h: 400 }, panelSet: true },
        );
    });
});

describe('tabKey', () => {
    it('is versioned and does not collide with the geometry key', () => {
        assert.equal(tabKey(), 'sidekick_tab_v1');
        assert.notEqual(tabKey(), chromeKey());
    });
});

describe('readTab', () => {
    const ids = ['sheet', 'queue', 'board'];

    it('reads back the tab she left open', () => {
        assert.equal(readTab({ getStored: () => 'board', ids }), 'board');
    });

    it('falls back to the first tab when nothing is stored', () => {
        assert.equal(readTab({ getStored: () => null, ids }), 'sheet');
    });

    it('reads a tab that no longer exists as absent, not as a tab to show', () => {
        assert.equal(readTab({ getStored: () => 'archive', ids }), 'sheet');
        assert.equal(readTab({ getStored: () => 7, ids }), 'sheet');
    });

    it('swallows a storage that throws', () => {
        const getStored = () => {
            throw new Error('blocked');
        };

        assert.equal(readTab({ getStored, ids }), 'sheet');
    });

    it('falls back when there is no storage to read', () => {
        assert.equal(readTab({ ids }), 'sheet');
        assert.equal(readTab({ getStored: 'not a function', ids }), 'sheet');
    });

    it('answers null when there are no tabs at all', () => {
        assert.equal(readTab({ getStored: () => 'board', ids: [] }), null);
        assert.equal(readTab({ getStored: () => 'board' }), null);
        assert.equal(readTab(), null);
    });
});

describe('writeTab', () => {
    it('hands the id over under the versioned key', () => {
        const fake = store();

        assert.equal(writeTab('queue', { setStored: fake.setStored }), true);
        assert.deepEqual(fake.calls, [[tabKey(), 'queue']]);
    });

    it('swallows a storage that refuses, because switching tabs must not break on it', () => {
        const setStored = () => {
            throw new Error('quota exceeded');
        };

        assert.equal(writeTab('queue', { setStored }), false);
    });

    it('reports false when there is no storage to write to', () => {
        assert.equal(writeTab('queue'), false);
        assert.equal(writeTab('queue', {}), false);
    });

    it('round-trips: what it writes, readTab reads back', () => {
        const fake = store();
        writeTab('board', { setStored: fake.setStored });

        assert.equal(readTab({ getStored: fake.getStored, ids: ['sheet', 'queue', 'board'] }), 'board');
    });
});

describe('the defaults and the constants agree', () => {
    it('opens the panel at PANEL_DEFAULT and clamps it at PANEL_MIN', () => {
        const roomy = defaultGeometry({ width: 2560, height: 1440 });
        assert.equal(roomy.panel.w, PANEL_DEFAULT.width);
        assert.equal(roomy.panel.h, PANEL_DEFAULT.height);
        assert.equal(clampSize(0, 0, PANEL_MIN, VIEWPORT).w, PANEL_MIN.width);
        assert.equal(clampSize(0, 0, PANEL_MIN, VIEWPORT).h, PANEL_MIN.height);
    });

    it('knows the button by the size it will actually be drawn at', () => {
        const viewport = { width: 500, height: 500 };
        const button = defaultGeometry(viewport).button;

        assert.equal(button.x, 500 - BUTTON_SIZE.width - 12);
        assert.equal(button.y, 35 + 12);
    });
});
