/**
 * Sidekick — extension entry point.
 *
 * SillyTavern loads this as an ES module, so imports work, and it resolves the
 * manifest's `generate_interceptor` and `hooks` against `globalThis` and this
 * module's exports respectively.
 */
import { createInterceptor, registerInterceptor } from './src/inject.js';
import { renderDigest } from './src/grammar.js';
import { startEvaluation, shouldEvaluate } from './src/evaluate.js';
import { reanchorCitations } from './src/citations.js';
import { mountSettings, mountFab, mountQueue, mountSheet } from './src/ui.js';
import { loadState } from './src/state.js';

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

let messagesSince = 0;

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

/** `/hero digest` — renders and reports, generating nothing (§5). */
function previewDigest() {
    const state = readState();
    if (!state) {
        toastr.warning('No hero state in this chat yet');
        return;
    }

    const { text, tokens } = renderDigest(state);
    console.info(`[Sidekick] digest (${tokens} tokens)\n${text}`);
    toastr.info(`Digest rendered — ${tokens} tokens. See the console.`);
}

/**
 * Runs a scan wherever it was triggered from. §3's silence rule ends here
 * rather than inside the pass: everything that can fail in a pass already
 * resolved to [], so what reaches this catch is our own wiring, and that logs
 * once instead of dying inside a fire-and-forget call.
 *
 * A dropped trigger—one that arrived while a pass was already running—returns
 * null, so the slash command stays quiet rather than reporting a zero it did
 * not produce. The queue is persisted only when something was added.
 */
async function evaluateNow(state) {
    const { chat, generateRaw, chatMetadata } = context();
    const started = startEvaluation(state, { chat, generate: generateRaw });
    if (!started) {
        return null;
    }

    let queued;
    try {
        queued = await started;
    } catch (error) {
        console.error('[Sidekick] evaluation pass failed', error);
        return null;
    }

    if (queued.length > 0) {
        // sk-06p: a quiet pass runs for seconds to minutes, and CHAT_CHANGED
        // reassigns SillyTavern's chatMetadata pointer when it fires. Persisting
        // after a switch would write this chat's ledger into the new chat's
        // metadata—wrong data in the wrong chat, silently. This checks
        // identity, not chat equality: returning to the same chat reloads
        // metadata from disk, so a round trip also fails here and loses the
        // entries instead, which is the honest direction to fail in. The
        // guard and persistState's own read land in one turn, so nothing can
        // move the pointer between them.
        if (context().chatMetadata === chatMetadata) {
            try {
                await persistState(state);
            } catch (error) {
                // The entries are real and in memory; the chat just never learned
                // them. Naming the phase keeps the next debug pass off the pass.
                console.error('[Sidekick] could not persist the scan queue', error);
            }
        } else {
            console.error('[Sidekick] the chat changed during the scan—nothing was persisted');
        }
    }
    return queued;
}

function registerSlashCommands() {
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = context();

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'hero',
        callback: async (_namedArgs, unnamedArgs) => {
            const mode = String(unnamedArgs?.[0] ?? 'evaluate').toLowerCase();
            if (mode === 'digest' || mode === 'preview') {
                previewDigest();
                return '';
            }

            const queued = await evaluateNow(readState());
            if (queued) {
                toastr.info(`Scan complete—${queued.length} proposal(s) queued.`);
            } else {
                // null, not []: the in-flight guard dropped this trigger, which
                // would otherwise be indistinguishable from a pass that found
                // nothing at all.
                toastr.info('A scan is already running—this trigger was dropped. Try again when it finishes.');
            }
            return '';
        },
        helpString: 'Sidekick. <code>/hero evaluate</code> runs a pass on demand; '
            + '<code>/hero digest</code> renders the digest without generating.',
        returns: 'the number of proposals queued',
        namedArgumentList: [],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'evaluate | digest',
                typeList: ARGUMENT_TYPE.STRING,
                isRequired: false,
                defaultValue: 'evaluate',
                enumList: ['evaluate', 'digest'],
            }),
        ],
    }));
}

/** Cadence ticker (§3): a fixed, configurable tick with a manual trigger on top. */
function onMessageReceived() {
    const state = readState();
    if (!state) {
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

    registerSlashCommands();
    await mountSettings({ folder: EXTENSION_FOLDER, context });
    mountFab();
    mountQueue({ getState: readState, persist: persistState });
    mountSheet({ getState: readState });
}

try {
    context().eventSource.on(context().event_types.APP_READY, () => void onAppReady());
} catch (error) {
    console.error('[Sidekick] could not attach to APP_READY', error);
}

/** `clean` hook: clears stored hero data for this chat (§8). */
export async function onClean() {
    const { chatMetadata, saveMetadata } = context();
    if (chatMetadata && Object.hasOwn(chatMetadata, STORAGE_KEY)) {
        delete chatMetadata[STORAGE_KEY];
        await saveMetadata();
    }
}
