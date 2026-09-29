/**
 * Coverage floor for the suite. Pure by design--no coverage service, no new
 * dependency--so it runs anywhere node does.
 *
 * The floor exists because the two bugs shipped in sk-gu5.4 both sat inside
 * covered lines: tests passed at 97.67% while a per-item filter was unreachable
 * and every evidence index was being rejected. Coverage is not a quality
 * signal on its own, so this gate is deliberately the *smallest* useful one.
 * It stops a module from quietly falling below the line, and nothing more.
 *
 * A floor of 95% on every src file, 90% on branches. Anything the browser-only
 * modules keep out of reach (index.js, ui.js) is excluded by name rather
 */
import { spawnSync } from 'node:child_process';

const LINE_FLOOR = 95;
const BRANCH_FLOOR = 90;

/**
 * Browser-only modules the suite does not measure. test/ui-edit.test.js does
 * import ui.js, for the two pure helpers the edit path turns on, but mounting
 * the surfaces needs a live SillyTavern DOM, so the module stays exempt as a
 * whole.
 */
const UNTESTED_BY_DESIGN = ['index.js', 'ui.js'];

const RUNNER = ['--test', '--experimental-test-coverage', '--test-reporter=tap', 'test/*.test.js'];

const { stdout, status } = spawnSync('node', RUNNER, { encoding: 'utf8' });

if (status !== 0) {
    console.error('test: suite failed, so coverage was not measured.');
    process.exit(status ?? 1);
}

const rows = new Map();
for (const line of String(stdout).split('\n')) {
    // TAP prefixes each row with '# ' and the default reporter with a glyph, so
    // match on the row's shape rather than its start
    const match = /(\S+\.js)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/.exec(line);
    if (match) {
        rows.set(match[1], { line: Number(match[2]), branch: Number(match[3]) });
    }
}

if (rows.size === 0) {
    console.error('test: no coverage table found; node may have changed its report shape.');
    process.exit(1);
}

const failures = [];
for (const [file, { line, branch }] of rows) {
    if (UNTESTED_BY_DESIGN.includes(file)) continue;

    if (line < LINE_FLOOR) {
        failures.push(`${file}: ${line}% lines, floor is ${LINE_FLOOR}%`);
    }
    if (branch < BRANCH_FLOOR) {
        failures.push(`${file}: ${branch}% branches, floor is ${BRANCH_FLOOR}%`);
    }
}

if (failures.length > 0) {
    console.error('test: coverage floor not met.');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
}

const measured = [...rows.keys()].filter((f) => !UNTESTED_BY_DESIGN.includes(f));
console.log(`coverage floor met (${measured.join(', ')}): >=${LINE_FLOOR}% lines, >=${BRANCH_FLOOR}% branches.`);
