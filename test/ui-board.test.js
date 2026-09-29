/**
 * The board's apply path: every word the affordance can say after a click.
 *
 * src/ui.js is browser-only, so this file imports it for the one pure helper
 * the path turns on. applyOutcome holds the whole honesty contract: the board
 * is the surface the DM sits at waiting, so a failed write must say so instead
 * of rendering 'applied', and a partial landing must name how many changes
 * went through rather than claiming the whole call did.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyOutcome } from '../src/ui.js';

describe('applyOutcome', () => {
    it('names a throw as a path that did not resolve', () => {
        const outcome = applyOutcome({ thrown: true, applied: 0, total: 3, saved: false });

        assert.equal(outcome.chip, 'failed—a path did not resolve');
        assert.equal(outcome.applied, undefined);
    });

    it('says nothing landed when the provenance gate refused every change', () => {
        const outcome = applyOutcome({ thrown: false, applied: 0, total: 2, saved: true });

        assert.equal(outcome.chip, 'nothing landed');
        assert.equal(outcome.applied, undefined);
    });

    it('says nothing landed even when the save failed—nothing needed saving', () => {
        const outcome = applyOutcome({ thrown: false, applied: 0, total: 2, saved: false });

        assert.equal(outcome.chip, 'nothing landed');
    });

    it('keeps the affordance when the write did not file', () => {
        const outcome = applyOutcome({ thrown: false, applied: 1, total: 1, saved: false });

        assert.equal(outcome.chip, 'could not be saved');
        assert.equal(outcome.applied, undefined);
    });

    it('marks a full landing applied, with nothing to add', () => {
        const outcome = applyOutcome({ thrown: false, applied: 3, total: 3, saved: true });

        assert.equal(outcome.applied, true);
        assert.equal(outcome.label, undefined);
        assert.equal(outcome.chip, undefined);
    });

    it('names a partial landing on the mark', () => {
        const outcome = applyOutcome({ thrown: false, applied: 2, total: 3, saved: true });

        assert.equal(outcome.applied, true);
        assert.equal(outcome.label, '2 of 3 landed');
    });
});
