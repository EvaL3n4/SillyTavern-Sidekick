/**
 * Sidekick — extension entry point.
 *
 * SillyTavern loads this as an ES module, so imports work, and it resolves the
 * manifest's `generate_interceptor` and `hooks` against `globalThis` and this
 * module's exports respectively.
 */
import { createInterceptor, registerInterceptor } from './src/inject.js';
import { startEvaluation, shouldEvaluate } from './src/evaluate.js';
import { reanchorCitations } from './src/citations.js';
import {
    mountSettings,
    mountChrome,
    mountQueue,
    mountSheet,
    mountBoard,
    refreshChrome,
} from './src/ui.js';
import { hasState } from './src/grammar.js';
import { loadState } from './src/state.js';
import { BOARD_KEY, readBoard, runBoardTurn } from './src/board.js';
import { mountImpulseAssessment } from './src/impulse-lifecycle.js';

/** The folder SillyTavern mounts us under. Used for template lookups. */
export const EXTENSION_FOLDER = 'third-party/SillyTavern-Sidekick';

/** Where state lives inside chatMetadata (§6). */
export const STORAGE_KEY = 'sidekick';

const context = () => SillyTavern.getContext();

/**
 * §6 hygiene: chatMetadata is rebound on CHAT_CHANGED, so the reader always
 * fetches it fresh rather than holding a reference that would go stale.
 */
let readState = () => null;

/**
 * The scan's diagnostics. A pass never shouts at the DM—§3's silence is a
 * promise about play, not about the console—but a pass that failed and a pass
 * that found nothing are indistinguishable from the outside otherwise, which
 * is how a broken scan goes weeks before anyone can debug it. Every level is
 * off until DEBUG_KEY is set, then everything is on.
 *
 * The channels are optional at the call site, so a test that injects nothing
 * logs nothing rather than throwing on an undefined channel.
 */
const DEBUG_KEY = 'sidekick_debug';
const debugOn = () => {
    try {
        return localStorage.getItem(DEBUG_KEY) === '1';
    } catch {
        return false;
    }
};
const log = {
    debug: (message, detail) => {
        if (debugOn()) {
            console.debug(`[Sidekick] ${message}`, detail);
        }
    },
    info: (message, detail) => {
        if (debugOn()) {
            console.info(`[Sidekick] ${message}`, detail);
        }
    },
    warn: (message, detail) => {
        console.warn(`[Sidekick] ${message}`, detail);
    },
};

let messagesSince = 0;
let impulseAssessment = null;

function bindState() {
    readState = () => {
        const metadata = context().chatMetadata;
        if (!metadata || typeof metadata !== 'object') {
            return null;
        }
        return loadState(metadata[STORAGE_KEY] ?? null);
    };
    messagesSince = 0;
}


/**
 * Keeps stored citations honest after the chat moves under them.
 *
 * A deletion shifts every later index; a swipe rewrites a message's date in
 * place. Either turns a citation into a claim the chat no longer backs, and
 * nothing would notice if nobody looked. This pass rewrites what moved and
 * counts what it could not resolve; the queue and the sheet then name a dead
 * citation when the DM actually tries to use it, which is the only moment
 * she needs to know.
 *
 * Only a heal changes stored state, so only a heal persists. CHAT_CHANGED runs
 * this after bindState, because listeners fire in registration order, so the
 * state being walked is already this chat's.
 */
function onCitationsStale() {
    const state = readState();
    if (!state) {
        return;
    }

    const { chat } = context();
    const counts = reanchorCitations(state, chat);
    if (counts.healed === 0 && counts.stale === 0) {
        // every citation still lands where it was filed
        return;
    }

    const report = `${counts.live} live, ${counts.healed} healed, ${counts.stale} stale`;
    console.info(`[Sidekick] citations re-anchored: ${report}`);
    if (counts.healed > 0) {
        void persistState(state).catch((error) => {
            console.error('[Sidekick] could not persist re-anchored citations', error);
        });
    }
}
/**
 * Persists a migrated state. Callers pass a state they already hold.
 *
 * The store keeps the state object by reference, so anything that mutates it
 * after this call changes what chatMetadata holds without any flush; a path that
 * mutates state must persist again explicitly.
 */
export async function persistState(state) {
    const { chatMetadata, saveMetadata } = context();
    chatMetadata[STORAGE_KEY] = state;
    await saveMetadata();
}

/** Commit background impulse state, restoring the previous ledger on save failure. */
export async function persistImpulse(state, captured) {
    const { chatMetadata, saveMetadata } = context();
    if (chatMetadata !== captured) {
        return false;
    }
    const previous = chatMetadata[STORAGE_KEY];
    chatMetadata[STORAGE_KEY] = state;
    try {
        await saveMetadata();
    } catch (error) {
        // Another manual write owns a different ledger pointer. Never roll it
        // back when a preceding background save fails.
        if (chatMetadata[STORAGE_KEY] === state) {
            chatMetadata[STORAGE_KEY] = previous;
        }
        throw error;
    }
    return true;
}

/**
 * Reads this chat's board conversation.
 *
 * chatMetadata is rebound on CHAT_CHANGED, so this reads it fresh exactly as
 * readState does. readBoard never throws: a chat that has never opened the board,
 * or one whose board was mangled by hand, reads as an empty conversation rather
 * than something the panel has to defend against.
 *
 * @returns {object} this chat's board
 */
export function readBoardState() {
    const { chatMetadata } = context();
    return readBoard(chatMetadata);
}

/**
 * Files this chat's board.
 *
 * The metadata pointer is checked by identity rather than compared for
 * equality, the same guard evaluateNow uses, because a board turn is a quiet
 * generation that can run for seconds and CHAT_CHANGED reassigns SillyTavern's
 * chatMetadata while it does—writing after a switch would file this chat's
 * conversation inside another chat, silently. The caller captures the pointer in
 * the synchronous turn that starts the work, which leaves no window between
 * capturing and checking it.
 *
 * @param {object} board
 * @param {object} [captured] the chatMetadata this work started under
 * @returns {Promise<boolean>} false when the chat moved, or the save itself failed
 */
export async function saveBoardState(board, captured) {
    if (captured && context().chatMetadata !== captured) {
        console.error('[Sidekick] the chat changed during the board turn—nothing was persisted');
        return false;
    }

    try {
        const { chatMetadata, saveMetadata } = context();
        chatMetadata[BOARD_KEY] = board;
        await saveMetadata();
        return true;
    } catch (error) {
        console.error('[Sidekick] could not persist the board', error);
        return false;
    }
}

/**
 * What a triggered pass did, in a shape the surface that triggered it can say
 * something honest about. `null` is the one case that is not a result the pass
 * produced: the in-flight guard dropped the trigger before it started.
 *
 * `persisted` means nothing was lost—either the entries reached this chat's
 * metadata, or there were none to file. `failed` means the pass reported that it
 * could not do its job, which §7 keeps quiet in the queue but the manual trigger
 * she clicked is entitled to name.
 *
 * §3's silence rule ends at this function's return value rather than inside the
 * pass: everything that can fail there already resolved to [], so what reaches
 * the catch below is our own wiring, and that logs once instead of dying inside
 * a fire-and-forget call.
 *
 * @typedef {object} ScanOutcome
 * @property {Array<object>} queued the entries the pass appended, possibly none
 * @property {boolean} persisted whether anything was lost
 * @property {boolean} failed whether the pass reported a failure of its own
 */
async function evaluateNow(state) {
    const { chat, generateRaw, chatMetadata } = context();
    const card = readCard();
    let failed = false;
    const passLog = {
        ...log,
        // The pass's `warn` is where it reports that it could not do its job (a
        // refused generation, a voided citation), and both of those resolve to
        // [] exactly as a genuine "nothing here" does. Wrapping the channel here
        // is the only way that reaches the trigger without changing the pass's
        // own array contract, which §3's silence rule depends on.
        warn: (message, detail) => {
            failed = true;
            log.warn(message, detail);
        },
    };
    const started = startEvaluation(state, { chat, generate: generateRaw, log: passLog, card });
    if (!started) {
        return null;
    }

    let queued;
    try {
        queued = await started;
    } catch (error) {
        // §7: a pass that resolves to [] is a quiet backend and stays quiet. A
        // rejection out of the pass is our own wiring, and it is not the same
        // thing as a dropped trigger.
        console.error('[Sidekick] evaluation pass failed', error);
        return { queued: [], persisted: true, failed: true };
    }

    if (queued.length === 0) {
        // Nothing to file, so nothing can be lost.
        return { queued, persisted: true, failed };
    }

    // sk-06p: a quiet pass runs for seconds to minutes, and CHAT_CHANGED
    // reassigns SillyTavern's chatMetadata pointer when it fires. Persisting
    // after a switch would write this chat's ledger into the new chat's
    // metadata—wrong data in the wrong chat, silently. This checks identity,
    // not chat equality: returning to the same chat reloads metadata from disk,
    // so a round trip also fails here and loses the entries instead, which is
    // the honest direction to fail in. The guard and persistState's own read
    // land in one turn, so nothing can move the pointer between them.
    if (context().chatMetadata !== chatMetadata) {
        console.error('[Sidekick] the chat changed during the scan—nothing was persisted');
        return { queued, persisted: false, failed };
    }

    // A background impulse pass may have committed while this bookkeeping scan
    // ran. Only its new proposals belong to this save, never its old ledger copy.
    const live = readState();
    live.queue.push(...queued);
    try {
        await persistState(live);
    } catch (error) {
        // The entries are real and in memory; the chat just never learned
        // them. Naming the phase keeps the next debug pass off the pass.
        console.error('[Sidekick] could not persist the scan queue', error);
        return { queued, persisted: false, failed };
    }

    // The markers and an open Queue tab read chatMetadata, and loadState hands
    // back a copy of it, so they can only show an entry once it is stored: a
    // refresh before the save above saw the queue as it was. This is the one
    // arrival signal: no toast, and nothing switches the tab she is on.
    refreshChrome();
    return { queued, persisted: true, failed };
}

/**
 * Runs a scan because the DM asked for one. The Queue tab's Run a scan control is
 * the only manual path now: a typed command is a completion-era affordance, and
 * nobody types to run a pass when the control is already in front of them.
 *
 * The wording the command produced is kept, because it carries the one
 * distinction that matters: null is a trigger the in-flight guard dropped, which
 * is not the same as a pass that found nothing.
 * §7's silence for the DM is the scan surface itself, not this trigger: she
 * asked for a pass, so she hears back which of the things happened. Four
 * messages, one per outcome, instead of the two the old shape could make.
 *
 * @returns {Promise<void>}
 */
async function scanOnDemand() {
    const state = readState();

    // No chat is open, so there is nothing for a pass to read. An empty ledger is
    // not that: a scan on one begins the ledger from the card and the scene (§3).
    if (!state) {
        toastr.info('Open a chat first—a scan reads the chat that is open.');
        return;
    }

    const outcome = await evaluateNow(state);
    if (!outcome) {
        toastr.info('A scan is already running—this trigger was dropped. Try again when it finishes.');
        return;
    }

    // Each branch below names a thing that really happened. The old shape made
    // two of them say the same sentence: a thrown pass and a dropped trigger
    // both returned null, and a refused backend and a real "nothing here" both
    // returned an empty array queued.
    if (!outcome.persisted) {
        // The entries are real and in memory; the chat just never learned them,
        // and they are gone on the next reload. Say so instead of the count.
        toastr.error(
            `The scan finished but could not be saved to this chat—${outcome.queued.length} proposal(s) not filed. Check the console.`,
        );
        return;
    }

    if (outcome.queued.length === 0) {
        // An empty queue is three different things (nothing to say, the backend
        // refused, a response that did not conform) and this is the one surface
        // that can say which without another console hop.
        toastr.warning(
            outcome.failed
                ? 'The scan could not run. Set localStorage.sidekick_debug = \'1\' and scan again to see where it failed.'
                : 'Scan complete—no proposals worth writing down right now.',
        );
        return;
    }

    // Something queued and filed: the only message that can stay a success.
    toastr.success(`Scan complete—${outcome.queued.length} proposal(s) queued.`);
}

/**
 * The open character's card, for the scan that begins a ledger (§3). A group chat
 * has no single card, so it reads as none and the pass reads the scene alone.
 * Macros are expanded, so the model reads names and not {{char}}.
 *
 * @returns {{name: string, description: string, personality: string, scenario: string}|null}
 */
function readCard() {
    const { characters, characterId, groupId, substituteParams } = context();
    const character = groupId ? null : characters?.[characterId];
    if (!character) {
        return null;
    }

    const expand = (text) => {
        const value = String(text ?? '');
        try {
            return typeof substituteParams === 'function' ? substituteParams(value) : value;
        } catch {
            return value;
        }
    };
    return {
        name: character.name ?? '',
        description: expand(character.description ?? character.data?.description),
        personality: expand(character.personality ?? character.data?.personality),
        scenario: expand(character.scenario ?? character.data?.scenario),
    };
}

/** Cadence ticker (§3): a fixed, configurable tick with a manual trigger on top. */
function onMessageReceived() {
    const state = readState();
    // The first scan of an empty ledger is always hers to press (§3): a hero
    // filed unasked every fifteen messages is noise.
    if (!state || !hasState(state)) {
        return;
    }

    messagesSince += 1;
    const cadence = state.settings?.evaluationCadence;
    if (shouldEvaluate(messagesSince, cadence)) {
        messagesSince = 0;
        void evaluateNow(state);
    }
}

async function onAppReady() {
    bindState();
    registerInterceptor(createInterceptor({ getState: readState }));

    const { eventSource, event_types } = context();
    eventSource.on(event_types.CHAT_CHANGED, bindState);
    eventSource.on(event_types.CHAT_CHANGED, onCitationsStale);
    eventSource.on(event_types.MESSAGE_DELETED, onCitationsStale);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

    impulseAssessment ??= mountImpulseAssessment({
        getContext: context,
        getState: () => readState(),
        persist: persistImpulse,
        generate: (args) => context().generateRaw(args),
        refresh: refreshChrome,
        log,
    });

    // The drawer's two live controls are per-chat by §6, so they go through the
    // same state the scan and the digest render already read.
    await mountSettings({
        folder: EXTENSION_FOLDER,
        context,
        getState: readState,
        persist: persistState,
    });
    mountChrome({ getState: readState, persist: persistState });
    mountQueue({ getState: readState, persist: persistState, onScan: scanOnDemand });
    mountSheet({ getState: readState, persist: persistState });
    mountBoard({
        getState: readState,
        persist: persistState,
        loadBoard: readBoardState,
        saveBoard: saveBoardState,
        // Injected the way evaluateNow injects it, so the board module stays
        // node-testable and the generation function is resolved from the live
        // context on every turn rather than captured once at setup.
        runTurn: (state, board) => runBoardTurn(state, board, { generate: context().generateRaw }),
    });
}

try {
    context().eventSource.on(context().event_types.APP_READY, () => void onAppReady());
} catch (error) {
    console.error('[Sidekick] could not attach to APP_READY', error);
}

/** `clean` hook: clears stored hero data for this chat (§8). */
export async function onClean() {
    const { chatMetadata, saveMetadata } = context();
    if (chatMetadata && (Object.hasOwn(chatMetadata, STORAGE_KEY) || Object.hasOwn(chatMetadata, BOARD_KEY))) {
        delete chatMetadata[STORAGE_KEY];
        // The board is chat-specific too, so it goes with the ledger: leaving it
        // behind would orphan a conversation nobody can open.
        delete chatMetadata[BOARD_KEY];
        await saveMetadata();
    }
}
