/**
 * The settings drawer's commit rule: what an input's text may become, and what
 * it may not.
 *
 * src/ui.js is browser-only, so this file imports it for the one pure helper
 * the drawer's write path turns on. committedSetting is the guard that keeps the
 * drawer honest: a control that clamps a typo in silence, or ignores one, has
 * the DM looking at a number that is not the number that runs—the same defect
 * class as the scan's false success, in a smaller drawer.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { committedPlacement, committedSetting } from '../src/ui.js';

const CADENCE = { min: 1, max: 200 };
const BUDGET = { min: 50, max: 2000 };

describe('committedSetting', () => {
    it('commits a plain whole number', () => {
        assert.equal(committedSetting('15', CADENCE), 15);
    });

    it('commits the number jQuery hands back from a number input', () => {
        assert.equal(committedSetting(15, CADENCE), 15);
    });

    it('trims what a browser lets a number input hold', () => {
        assert.equal(committedSetting('  250 ', BUDGET), 250);
    });

    it('commits a whole number written with a decimal point', () => {
        assert.equal(committedSetting('15.0', CADENCE), 15);
    });

    it('commits either bound', () => {
        assert.equal(committedSetting('1', CADENCE), 1);
        assert.equal(committedSetting('200', CADENCE), 200);
    });

    it('refuses text', () => {
        assert.equal(committedSetting('fifteen', CADENCE), null);
    });

    it('refuses an emptied input, which parses to zero', () => {
        assert.equal(committedSetting('', CADENCE), null);
        assert.equal(committedSetting(null, CADENCE), null);
        assert.equal(committedSetting(undefined, CADENCE), null);
    });

    it('refuses a fraction of a message', () => {
        assert.equal(committedSetting('15.5', CADENCE), null);
    });

    it('refuses below the input minimum', () => {
        assert.equal(committedSetting('0', CADENCE), null);
        assert.equal(committedSetting('49', BUDGET), null);
    });

    it('refuses above the input maximum', () => {
        assert.equal(committedSetting('201', CADENCE), null);
        assert.equal(committedSetting('2001', BUDGET), null);
    });

    it('keeps any integer when the input declares no bounds', () => {
        assert.equal(committedSetting('9001'), 9001);
        assert.equal(committedSetting('-3', { min: -5 }), -3);
    });
});

describe('committedPlacement', () => {
    it('distinguishes blank legacy placement from zero and invalid depth', () => {
        for (const raw of ['', '  ', null, undefined]) {
            assert.equal(committedPlacement(raw, 'injectionDepth'), null);
        }
        assert.equal(committedPlacement('0', 'injectionDepth'), 0);
        assert.equal(committedPlacement('4', 'injectionDepth'), 4);
        assert.equal(committedPlacement('10000', 'injectionDepth'), 10000);
        for (const raw of ['-1', '10001', '1.5', 'unknown']) {
            assert.equal(committedPlacement(raw, 'injectionDepth'), undefined);
        }
    });

    it('only accepts supported message roles', () => {
        for (const role of ['system', 'user', 'assistant']) {
            assert.equal(committedPlacement(role, 'injectionRole'), role);
        }
        for (const role of ['', 'developer', 'SYSTEM', null, undefined]) {
            assert.equal(committedPlacement(role, 'injectionRole'), undefined);
        }
    });
});
