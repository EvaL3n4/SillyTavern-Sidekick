import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    LAUNCHER_SIZE,
    PANEL_DEFAULT,
    PANEL_MIN,
    clampPosition,
    clampRecord,
    clampSize,
    defaultGeometry,
    launcherKey,
    movePanel,
    readGeometry,
    resizePanel,
    writeGeometry,
} from '../src/launcher.js';

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

describe('launcherKey', () => {
    it('carries the record shape version in the key', () => {
        assert.equal(launcherKey(), 'sidekick_chrome_v1');
        assert.ok(launcherKey().endsWith(`_v${defaultGeometry().v}`));
    });
});

describe('defaultGeometry', () => {
    it('sits the launcher above the send form, on the right', () => {
        assert.deepEqual(defaultGeometry(VIEWPORT).launcher, { x: 1208, y: 728 });
    });

    it('centres the panel and opens it at its default size', () => {
        assert.deepEqual(defaultGeometry(VIEWPORT).panel, { x: 470, y: 190, w: 340, h: 420 });
    });

    it('stamps the record with the version the key names', () => {
        assert.equal(defaultGeometry().v, 1);
        assert.equal(defaultGeometry({ width: 400, height: 300 }).v, 1);
    });

    it('puts the defaults fully inside the viewport it was given', () => {
        // The defaults are only a starting point, but they must not start off-screen
        const small = defaultGeometry({ width: 600, height: 500 });

        assert.deepEqual(
            clampPosition(small.launcher.x, small.launcher.y, LAUNCHER_SIZE, { width: 600, height: 500 }),
            small.launcher,
        );
    });
});

describe('clampPosition', () => {
    it('keeps a control dragged past the bottom-right inside', () => {
        assert.deepEqual(clampPosition(5000, 5000, LAUNCHER_SIZE, VIEWPORT), { x: 1232, y: 752 });
    });

    it('pins a control dragged past the top-left at the origin', () => {
        assert.deepEqual(clampPosition(-100, -100, LAUNCHER_SIZE, VIEWPORT), { x: 0, y: 0 });
    });

    it('leaves a position that already fits alone', () => {
        assert.deepEqual(clampPosition(300, 200, LAUNCHER_SIZE, VIEWPORT), { x: 300, y: 200 });
    });

    it('pins at the origin when the viewport is smaller than the control', () => {
        assert.deepEqual(
            clampPosition(10, 10, { width: 200, height: 100 }, { width: 100, height: 50 }),
            { x: 0, y: 0 },
        );
    });

    it('returns the origin rather than throwing on coordinates that are not numbers', () => {
        assert.deepEqual(clampPosition(Number.NaN, 10, LAUNCHER_SIZE, VIEWPORT), { x: 0, y: 0 });
        assert.deepEqual(clampPosition('10', 10, LAUNCHER_SIZE, VIEWPORT), { x: 0, y: 0 });
        assert.deepEqual(clampPosition(10, 10, { width: 48 }, VIEWPORT), { x: 0, y: 0 });
        assert.deepEqual(clampPosition(10, 10, LAUNCHER_SIZE, { width: 1280 }), { x: 0, y: 0 });
    });
});

describe('clampSize', () => {
    it('pins a size below the minimum at the minimum', () => {
        assert.deepEqual(clampSize(100, 100, PANEL_MIN, VIEWPORT), { w: 280, h: 200 });
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
        assert.deepEqual(clampSize(Number.NaN, 300, PANEL_MIN, VIEWPORT), { w: 280, h: 200 });
        assert.deepEqual(clampSize(400, '300', PANEL_MIN, VIEWPORT), { w: 280, h: 200 });
        assert.deepEqual(clampSize(400, 300, null, VIEWPORT), { w: 280, h: 200 });
    });

    it('uses the panel minimum and its own viewport when the caller supplies neither', () => {
        assert.deepEqual(clampSize(100, 100), { w: 280, h: 200 });
    });
});

describe('movePanel', () => {
    const panel = { x: 400, y: 200, w: 340, h: 420 };

    it('moves the panel by the drag and leaves its size alone', () => {
        assert.deepEqual(movePanel(panel, 50, -30, VIEWPORT), { x: 450, y: 170, w: 340, h: 420 });
    });

    it('stops the panel at the viewport edges by its own size, not the launcher\'s', () => {
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
        assert.deepEqual(resizePanel(panel, -5000, -5000, VIEWPORT), { x: 400, y: 200, w: 280, h: 200 });
    });

    it('stops at the viewport edge the corner leaves room for, not at the viewport size', () => {
        // 1280 - 400 and 800 - 200: the grip stays on screen, where it can be
        // dragged back.
        assert.deepEqual(resizePanel(panel, 5000, 5000, VIEWPORT), { x: 400, y: 200, w: 880, h: 600 });
    });

    it('keeps the panel inside a viewport too small for the minimum', () => {
        const tight = { x: 0, y: 0, w: 280, h: 200 };
        assert.deepEqual(resizePanel(tight, 100, 100, { width: 240, height: 150 }), { x: 0, y: 0, w: 240, h: 150 });
    });

    it('reads a viewport it cannot use as the minimum rather than throwing', () => {
        assert.deepEqual(resizePanel(panel, 60, 60, undefined), { x: 400, y: 200, w: 280, h: 200 });
    });
});

describe('clampRecord', () => {
    it('clamps the panel size before its position, so a shrunken panel stays reachable', () => {
        // The panel asked for 500x500, so it pins to the minimum 280x200 first; only then does its
        // right edge pin at 120. Clamped position first against the requested 100x100 it would sit
        // at 390x290 and then grow straight off the viewport.
        const record = {
            v: 1,
            launcher: { x: 0, y: 0 },
            panel: { x: 390, y: 290, w: 100, h: 100 },
        };

        assert.deepEqual(clampRecord(record, { width: 400, height: 300 }).panel, { w: 280, h: 200, x: 120, y: 100 });
    });

    it('re-clamps a launcher the browser shrank out from under', () => {
        const record = { v: 1, launcher: { x: 5000, y: 0 }, panel: { x: 0, y: 0, w: 340, h: 420 } };

        assert.equal(clampRecord(record, { width: 400, height: 300 }).launcher.x, 352);
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
        const stored = JSON.stringify({ v: 2, launcher: { x: 10, y: 20 }, panel: { x: 30, y: 40, w: 300, h: 400 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), DEFAULTS);
    });

    it('fills the one field that is missing and keeps the rest', () => {
        const stored = JSON.stringify({ v: 1, launcher: { x: 10 }, panel: { x: 30, y: 40, w: 300 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 1,
            launcher: { x: 10, y: DEFAULTS.launcher.y },
            panel: { x: 30, y: 40, w: 300, h: DEFAULTS.panel.h },
        });
    });

    it('fills a whole half that is not an object at all', () => {
        const stored = JSON.stringify({ v: 1, launcher: 'junk', panel: { x: 30, y: 40, w: 300, h: 420 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 1,
            launcher: DEFAULTS.launcher,
            panel: { x: 30, y: 40, w: 300, h: 420 },
        });
    });

    it('restores a stored position', () => {
        const stored = JSON.stringify({ v: 1, launcher: { x: 100, y: 200 }, panel: { x: 10, y: 20, w: 500, h: 400 } });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 1,
            launcher: { x: 100, y: 200 },
            panel: { x: 10, y: 20, w: 500, h: 400 },
        });
    });

    it('clamps a stored record that no longer fits the browser', () => {
        const stored = JSON.stringify({
            v: 1,
            launcher: { x: 5000, y: 5000 },
            panel: { x: 5000, y: 5000, w: 5000, h: 5000 },
        });

        assert.deepEqual(readGeometry({ getStored: () => stored, viewport: VIEWPORT }), {
            v: 1,
            launcher: { x: 1232, y: 752 },
            panel: { w: 1280, h: 800, x: 0, y: 0 },
        });
    });

    it('leaves a stored record unclamped when the caller has no viewport to give', () => {
        const stored = JSON.stringify({ v: 1, launcher: { x: 5000, y: 5000 }, panel: { x: 0, y: 0, w: 340, h: 420 } });

        assert.equal(readGeometry({ getStored: () => stored }).launcher.x, 5000);
    });

    it('reads the defaults when storage itself refuses to answer', () => {
        const getStored = () => {
            throw new Error('storage is blocked');
        };

        assert.deepEqual(readGeometry({ getStored, viewport: VIEWPORT }), DEFAULTS);
    });
});

describe('writeGeometry', () => {
    const record = { v: 1, launcher: { x: 100, y: 200 }, panel: { x: 10, y: 20, w: 500, h: 400 } };

    it('hands the record over under the versioned key', () => {
        const fake = store();

        assert.equal(writeGeometry(record, { setStored: fake.setStored }), true);
        assert.deepEqual(fake.calls, [[launcherKey(), JSON.stringify(record)]]);
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
            { v: 1, launcher: { x: 100, y: 200 }, panel: { x: 10, y: 20, w: 500, h: 400 } },
        );
    });
});

describe('the defaults and the constants agree', () => {
    it('opens the panel at PANEL_DEFAULT and clamps it at PANEL_MIN', () => {
        assert.equal(DEFAULTS.panel.w, PANEL_DEFAULT.width);
        assert.equal(DEFAULTS.panel.h, PANEL_DEFAULT.height);
        assert.equal(clampSize(0, 0, PANEL_MIN, VIEWPORT).w, PANEL_MIN.width);
        assert.equal(clampSize(0, 0, PANEL_MIN, VIEWPORT).h, PANEL_MIN.height);
    });

    it('knows the launcher by the size it will actually be drawn at', () => {
        const viewport = { width: 500, height: 500 };
        const launcher = defaultGeometry(viewport).launcher;

        assert.equal(launcher.x, 500 - LAUNCHER_SIZE.width - 24);
        assert.equal(launcher.y, 500 - LAUNCHER_SIZE.height - 24);
    });
});
