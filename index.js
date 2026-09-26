// Overseer - SillyTavern extension boilerplate

const MODULE_NAME = 'overseer';
const MANIFEST_VERSION = '1.0.0';

const defaultSettings = Object.freeze({
    enabled: false,
    option1: 'default',
    option2: 5,
});

const getContext = () => SillyTavern.getContext();

function getSettings() {
    const { extensionSettings } = getContext();
    const settings = extensionSettings[MODULE_NAME] ?? {};

    // Ensure all default keys exist (helpful after updates)
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = defaultSettings[key];
        }
    }

    extensionSettings[MODULE_NAME] = settings;
    return settings;
}

function loadSettings() {
    const { extensionSettings } = getContext();
    // Merge with defaults to handle new keys after updates and initialize if it doesn't exist
    extensionSettings[MODULE_NAME] = SillyTavern.libs.lodash.merge(
        structuredClone(defaultSettings),
        extensionSettings[MODULE_NAME]
    );
}

async function appendSettingsPanel() {
    const { renderExtensionTemplateAsync } = getContext();
    const settings = getSettings();

    const settingsHtml = await renderExtensionTemplateAsync('third-party/overseer', 'settings', {
        title: 'Overseer',
        version: MANIFEST_VERSION,
        defaultValue: settings.option1,
    });

    $('#extensions_settings2').append(settingsHtml);

    $('#overseer_enabled').on('input', function () {
        const { saveSettingsDebounced } = getContext();
        const value = $(this).prop('checked');
        getSettings().enabled = value;
        saveSettingsDebounced();
    });

    $('#overseer_option1').on('input', function () {
        const { saveSettingsDebounced } = getContext();
        const value = $(this).val();
        getSettings().option1 = String(value);
        saveSettingsDebounced();
    });
}

// ---- Event handlers ----

/** Loader handle for the active generation, or null when idle */
let generationLoader = null;

/** TODO(test): simulated pre/post-processing task duration, in ms. Remove after testing. */
const TEST_DELAY_MS = 10_000;

/** Timer handle for the active test task, or null when idle */
let testDelayTimer = null;

/** Cancel function for the active test task, or null when idle */
let cancelTestTask = null;

/** Cancels the active test task, if any. */
function clearTestDelay() {
    clearTimeout(testDelayTimer);
    testDelayTimer = null;
    cancelTestTask?.();
    cancelTestTask = null;
}

/**
 * TODO(test): stand-in for the future pre/post-processing features. Shows a
 * cancellable loader and resolves when the simulated task completes or the
 * user cancels it via the loader's stop button. Remove after testing.
 *
 * @param {string} message Message shown in the loader toast
 * @param {string} stopTooltip Tooltip for the cancel button
 * @returns {Promise<void>}
 */
function runTestTask(message, stopTooltip) {
    clearTestDelay();

    const { loader } = getContext();

    return new Promise((resolve) => {
        /** Ends the task and unblocks the awaiting caller. */
        const finish = () => {
            testDelayTimer = null;
            cancelTestTask = null;
            resolve();
        };

        // Show the task loader before hiding the previous one, so the input
        // lock is seamless (the overlay never drops between the two)
        const taskLoader = loader.show({
            slug: MODULE_NAME,
            message,
            stopTooltip,
            // stop() disposes the loader; just end the task here
            onStop: finish,
        });

        // Cancel hook so external cancellation (cleanup, a new generation) ends the task
        cancelTestTask = () => {
            hideGenerationLoader();
            finish();
        };

        // Hide the previous loader (clears its toast; the shared overlay stays up)
        generationLoader?.hide();
        generationLoader = taskLoader;

        // TODO(test): simulated task duration. Remove after testing.
        testDelayTimer = setTimeout(() => {
            hideGenerationLoader();
            finish();
        }, TEST_DELAY_MS);
    });
}

function handleIncomingMessage() {
    // Handle message
}

/**
 * Runs the (test) pre-processing task under a cancellable loader, then locks
 * the user input with a blocking loader while the generation is in flight.
 */
async function handleGenerationAfterCommands(_type, _options, dryRun) {
    if (!getSettings().enabled) {
        return;
    }

    // Skip background dry runs (quiet prompts, auto-continue, etc.)
    if (dryRun) {
        return;
    }

    const { loader, stopGeneration } = getContext();

    // TODO(test): run the pre-processing features here. Remove after testing.
    // Cancelling ends the task early; generation then proceeds.
    await runTestTask('Pre-processing...', 'Cancel pre-processing');

    // The stop button stops the in-flight generation, which fires GENERATION_ENDED,
    // where the post-processing task takes over.
    generationLoader = loader.show({
        slug: MODULE_NAME,
        message: 'Generating...',
        stopTooltip: 'Cancel generation',
        onStop: () => stopGeneration(),
    });
}

/**
 * Keeps the user input locked with a cancellable loader while a (test)
 * post-generation task runs after the generation completes, errors out,
 * or is stopped. Unlocks when the task finishes or is cancelled.
 */
async function handleGenerationEnded(_type, _options, dryRun) {
    // Skip background dry runs (quiet prompts, auto-continue, etc.) and return
    // before clearTestDelay(), so a dry run can't cancel an in-flight
    // post-processing task from a real generation
    if (dryRun) {
        return;
    }

    clearTestDelay();

    if (!getSettings().enabled) {
        // Still unlock in case the setting was flipped mid-generation
        await hideGenerationLoader();
        return;
    }

    // TODO(test): run the post-processing features here. Remove after testing.
    // The task loader is shown before the generation one is hidden, so the
    // input lock is seamless (the overlay never drops between the two).
    await runTestTask('Post-processing...', 'Cancel post-processing');
}

/** Hides the active generation loader, if any. */
async function hideGenerationLoader() {
    if (generationLoader) {
        await generationLoader.hide();
        generationLoader = null;
    }
}

function setupEventListeners() {
    const { eventSource, event_types } = getContext();
    eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, handleGenerationAfterCommands);
    eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);
}

async function cleanupEventListeners() {
    const { eventSource, event_types } = getContext();
    eventSource.removeListener(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
    eventSource.removeListener(event_types.GENERATION_AFTER_COMMANDS, handleGenerationAfterCommands);
    eventSource.removeListener(event_types.GENERATION_ENDED, handleGenerationEnded);

    // Hide the loader in case the extension is removed while a task is in-flight
    clearTestDelay();
    await hideGenerationLoader();
}

// ---- Lifecycle hooks ----

export async function onInstall() {
    console.log('[Overseer] Extension installed! Performing first-time setup...');
    loadSettings();
}

export async function onActivate() {
    console.log('[Overseer] Extension activated during page load');
    loadSettings();
    setupEventListeners();
}

export async function onUpdate() {
    console.log('[Overseer] Extension updated! Running migrations...');
}

export async function onDelete() {
    console.log('[Overseer] Extension about to be deleted. Cleaning up...');
    cleanupEventListeners();
}

export function onEnable() {
    console.log('[Overseer] Extension enabled');
}

export function onDisable() {
    console.log('[Overseer] Extension disabled');
}

export async function onClean() {
    console.log('[Overseer] Extension data cleaned');
    const { extensionSettings, saveSettingsDebounced } = getContext();
    delete extensionSettings[MODULE_NAME];
    saveSettingsDebounced();
}

// ---- Initialization ----

// Asynchronous setup that doesn't need to block SillyTavern from being ready
const { eventSource, event_types } = getContext();
eventSource.on(event_types.APP_READY, async () => {
    try {
        await appendSettingsPanel();
        console.log('[Overseer] Extension loaded');
    } catch (error) {
        console.error('[Overseer] Failed to initialize:', error);
    }
});
