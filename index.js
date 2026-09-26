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

/** TODO(test): simulated generation duration in ms. Remove after testing. */
const TEST_DELAY_MS = 10_000;

/** Timer handle for the active test delay, or null when idle */
let testDelayTimer = null;

/** Cancels the pending test delay timer, if any. */
function clearTestDelay() {
    clearTimeout(testDelayTimer);
    testDelayTimer = null;
}

function handleIncomingMessage() {
    // Handle message
}

/**
 * Locks the user input with a blocking loader and a cancellable toast
 * when a generation is about to start.
 */
function handleGenerationAfterCommands() {
    if (!getSettings().enabled) {
        return;
    }

    // Clear any stale test timer from a previous generation
    clearTestDelay();

    const { loader, stopGeneration } = getContext();

    // The stop button cancels the test delay and stops any in-flight generation,
    // which disposes the loader / fires GENERATION_ENDED respectively.
    generationLoader = loader.show({
        slug: MODULE_NAME,
        message: 'Generating...',
        stopTooltip: 'Cancel generation',
        onStop: () => {
            clearTestDelay();
            stopGeneration();
        },
    });

    // TODO(test): auto-hide after the simulated duration. Remove after testing.
    testDelayTimer = setTimeout(() => {
        testDelayTimer = null;
        handleGenerationEnded();
    }, TEST_DELAY_MS);
}

/**
 * Unlocks the user input when the generation completes, errors out, or is stopped.
 */
async function handleGenerationEnded() {
    clearTestDelay();

    if (!generationLoader) {
        return;
    }

    // TODO(test): delay unlocking by the simulated duration. Remove after testing.
    // The loader's stop button cancels the delay and disposes the loader immediately.
    testDelayTimer = setTimeout(() => {
        testDelayTimer = null;
        hideGenerationLoader();
    }, TEST_DELAY_MS);
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

    // Hide the loader in case the extension is removed while a generation is in-flight
    clearTestDelay();
    await generationLoader?.hide();
    generationLoader = null;
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
