/**
 * Sidekick — extension entry point.
 *
 * SillyTavern loads this as an ES module, so imports work, and it resolves the
 * manifest's `generate_interceptor` and `hooks` against `globalThis` and this
 * module's exports respectively.
 */
import { createInterceptor, registerInterceptor } from './src/inject.js';
import { renderDigest } from './src/grammar.js';
import { runEvaluation, shouldEvaluate } from './src/evaluate.js';
import { mountSettings, mountFab } from './src/ui.js';
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

/** Persists a migrated state. Callers pass a state they already hold. */
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

            const proposals = await runEvaluation(readState());
            toastr.info(`Scan complete — ${proposals.length} proposal(s) queued.`);
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
        void runEvaluation(state);
    }
}

async function onAppReady() {
    bindState();
    registerInterceptor(createInterceptor({ getState: readState }));

    const { eventSource, event_types } = context();
    eventSource.on(event_types.CHAT_CHANGED, bindState);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

    registerSlashCommands();
    await mountSettings({ folder: EXTENSION_FOLDER, context });
    mountFab();
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
