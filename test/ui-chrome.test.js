/**
 * The button's menu geometry, which is the one piece of the drag that is pure
 * arithmetic.
 *
 * src/ui.js is browser-only, so this file imports it for menuPlacement rather
 * than driving jQuery. What it pins is the placement rule: the menu reads
 * against wherever the button came to rest, never against a corner the
 * scaffold picked, and a viewport that honors neither preference still leaves
 * the menu on screen rather than off it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { menuPlacement } from '../src/ui.js';

const VIEWPORT = { width: 1280, height: 800 };
const MENU = { width: 160, height: 120 };

describe('menuPlacement', () => {
    it('opens above the button when there is room, left edges aligned', () => {
        const at = menuPlacement({ x: 600, y: 700 }, VIEWPORT, MENU);
        assert.deepEqual(at, { x: 600, y: 580 });
    });

    it('opens below when the button sits too close to the top', () => {
        // 40 - 120 is off-screen, so the menu hangs under the button instead.
        const at = menuPlacement({ x: 600, y: 40 }, VIEWPORT, MENU);
        assert.deepEqual(at, { x: 600, y: 88 });
    });

    it('measures the drop from the button box, not from nothing', () => {
        // 40 + BUTTON_SIZE.height. A constant that drifts from the CSS box
        // opens the menu over the button, and this is where that shows.
        const at = menuPlacement({ x: 600, y: 40 }, VIEWPORT, { width: 160, height: 200 });
        assert.deepEqual(at, { x: 600, y: 88 });
    });

    it('flips to the button right edge when the menu would run off it', () => {
        // 1200 + 160 is past 1280, so the menu's right edge meets the
        // button's right edge instead of its left.
        const at = menuPlacement({ x: 1200, y: 700 }, VIEWPORT, MENU);
        assert.deepEqual(at, { x: 1088, y: 580 });
    });

    it('clamps a viewport too small for either preference', () => {
        // The flip alone would still hang 28px off the right edge: 300 + 48
        // - 160 is 188 against a 160 max, so the clamp has the last word.
        const at = menuPlacement({ x: 300, y: 350 }, { width: 320, height: 400 }, MENU);
        assert.deepEqual(at, { x: 160, y: 230 });
    });

    it('pins the menu at the origin when it is larger than the viewport', () => {
        const at = menuPlacement({ x: 300, y: 350 }, { width: 100, height: 100 }, MENU);
        assert.deepEqual(at, { x: 0, y: 0 });
    });

    it('pulls a button resting off-screen back on', () => {
        const left = menuPlacement({ x: -50, y: 700 }, VIEWPORT, MENU);
        assert.deepEqual(left, { x: 0, y: 580 });

        const below = menuPlacement({ x: 600, y: 900 }, VIEWPORT, MENU);
        assert.deepEqual(below, { x: 600, y: 680 });
    });

    it('reads a coordinate that is not a number as absent rather than as a place', () => {
        const at = menuPlacement({ x: Number.NaN, y: 100 }, VIEWPORT, MENU);
        assert.deepEqual(at, { x: 0, y: 0 });
    });
});
