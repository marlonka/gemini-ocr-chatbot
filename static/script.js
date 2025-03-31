/**
 * OCR Chatbot Frontend Script v10 (Model Select, Language Fix)
 *
 * Handles uploads, previews, streaming API interaction, language/theme selection,
 * UI state management, status bar, i18n via JSON, ARIA, smooth scroll, and model selection.
 * Fixes issue where OCR text disappeared on language change.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Element References ---
    const ocrForm = document.getElementById('ocr-form');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseButton = document.getElementById('browse-button');
    const previewArea = document.getElementById('preview-area');
    const imagePreview = document.getElementById('image-preview');
    const pdfPreviewIcon = document.getElementById('pdf-preview-icon');
    const filenameDisplay = document.getElementById('filename-display');
    const removeImageButton = document.getElementById('remove-image-button');
    const instructionsInput = document.getElementById('instructions');
    const modelSelect = document.getElementById('model-select'); // <-- New
    const submitButton = document.getElementById('submit-button');
    const resetButton = document.getElementById('reset-button');
    const outputPlaceholder = document.getElementById('output-placeholder');
    const errorBanner = document.getElementById('error-banner');
    const errorMessage = document.getElementById('error-message');
    const closeErrorButton = document.getElementById('close-error-button');
    const inputPanel = document.getElementById('input-panel');
    const outputPanel = document.getElementById('output-panel');
    const resultArea = document.getElementById('result-area');
    const statusBar = document.getElementById('status-bar');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const extractedTextElement = document.getElementById('extracted-text');
    const copyButton = document.getElementById('copy-button');
    const languageSelect = document.getElementById('language-select');
    const themeToggleButton = document.getElementById('theme-toggle');
    const themeIcon = themeToggleButton.querySelector('.material-symbols-outlined');

    // --- State Variables ---
    let currentFile = null;
    const decoder = new TextDecoder();
    let currentLang = 'de'; // Default language
    let uiStrings = {}; // Object to hold loaded translations
    const supportedLangs = ['de', 'en']; // Available languages
    let currentStatusState = { // Store current status details
        icon: 'upload_file',
        key: 'statusInitial',
        isWave: false,
        data: {}
    };

    // --- Event Listeners ---
    browseButton.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => { if (e.target !== browseButton && e.target !== browseButton.parentNode) fileInput.click(); }); // Prevent click on button triggering dropzone click
    dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    removeImageButton.addEventListener('click', removePreview);
    ocrForm.addEventListener('submit', handleFormSubmit);
    resetButton.addEventListener('click', resetUI);
    copyButton.addEventListener('click', copyResultText);
    themeToggleButton.addEventListener('click', toggleTheme);
    closeErrorButton.addEventListener('click', hideError);
    languageSelect.addEventListener('change', handleLanguageChange);

    // --- Core Functions ---

    /** Form submission handler. */
    async function handleFormSubmit(e) {
         e.preventDefault();
         if (!currentFile) { showError("errorNoFile"); return; }
         await processImageStream();
    }

    /** Validates files and updates UI for preview. */
    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        const maxSize = 20 * 1024 * 1024;
        hideError(); // Clear previous errors first
        if (!allowedTypes.includes(file.type)) { showError("errorInvalidType", { fileType: file.type || 'unknown' }); fileInput.value = ''; return; }
        if (file.size > maxSize) { showError("errorSizeLimit"); fileInput.value = ''; return; }
        if (file.size === 0) { showError("errorFileEmpty"); fileInput.value = ''; return; }
        currentFile = file;
        displayPreview(file);
        submitButton.disabled = false;
        outputPlaceholder.hidden = true;
        // Set status to 'Ready' when a valid file is selected
        updateStatusBar('arrow_forward', "statusReady");
    }

    /** Displays image thumbnail or PDF icon. */
    function displayPreview(file) {
        filenameDisplay.textContent = file.name;
        imagePreview.hidden = true; pdfPreviewIcon.hidden = true;
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => { imagePreview.src = e.target.result; imagePreview.hidden = false; }
            reader.onerror = () => { showError("errorReadImage"); removePreview(); };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            pdfPreviewIcon.hidden = false; imagePreview.src = '#';
        }
        previewArea.hidden = false; dropZone.hidden = true;
    }

    /** Resets file input and preview area, CLEARS results, resets status. */
    function removePreview() {
        currentFile = null; fileInput.value = '';
        imagePreview.src = '#'; imagePreview.hidden = true; pdfPreviewIcon.hidden = true;
        filenameDisplay.textContent = '';
        previewArea.hidden = true; dropZone.hidden = false;
        submitButton.disabled = true;
        outputPlaceholder.hidden = false;
        extractedTextElement.textContent = ''; // Explicitly clear text here on remove/reset
        updateStatusBar('upload_file', "statusInitial"); // Reset status to initial
        hideError();
    }

    /** Updates UI element disabled states and ARIA busy attributes. */
    function setFormInputsDisabled(isDisabled) {
        // Include modelSelect in the list of elements to disable
        const elementsToDisable = [
            submitButton, resetButton, instructionsInput, languageSelect,
            removeImageButton, fileInput, browseButton, dropZone, modelSelect
        ];
        elementsToDisable.forEach(el => { if(el) el.disabled = isDisabled }); // Check if el exists
        dropZone.style.pointerEvents = isDisabled ? 'none' : 'auto';
        dropZone.setAttribute('tabindex', isDisabled ? '-1' : '0'); // Make non-interactive when disabled

        // Update ARIA busy states
        const busyValue = isDisabled ? 'true' : 'false';
        ocrForm.setAttribute('aria-busy', busyValue);
        outputPanel.setAttribute('aria-busy', busyValue);
    }

    /** Gets the translated string for a given key and optional data. */
     function getTranslation(key, data = {}) {
        // Fallback to English if current language or key is missing
        const langPack = uiStrings[currentLang] || uiStrings['en'] || {};
        let text = langPack[key] !== undefined ? langPack[key] : key;
        if (text === key && currentLang !== 'en' && uiStrings['en'] && uiStrings['en'][key]) {
            text = uiStrings['en'][key] + ` [${key}]`; // Show fallback + key if primary fails
            console.warn(`Translation key "${key}" missing for "${currentLang}", using English fallback.`);
        } else if (text === key) {
             console.warn(`Translation key "${key}" missing for "${currentLang}" and no English fallback.`);
        }

        for (const dataKey in data) {
            text = text.replace(`{${dataKey}}`, data[dataKey]);
        }
        return text;
    }


    /**
     * Updates the persistent status bar content and appearance, storing the state.
     * @param {string | null} iconName - Material Symbol name or null.
     * @param {string} textKey - The key for the translation string.
     * @param {boolean} [addWave=false] - Whether to apply the letter wave animation.
     * @param {object} [data={}] - Optional data for placeholders.
     */
    function updateStatusBar(iconName, textKey, addWave = false, data = {}) {
        // Store the current state
        currentStatusState = { icon: iconName, key: textKey, isWave: addWave, data: data };

        // Update the UI
        if (iconName) { statusIcon.textContent = iconName; statusIcon.hidden = false; }
        else { statusIcon.hidden = true; }

        let text = getTranslation(textKey, data);

        statusText.innerHTML = ''; // Clear previous
        statusText.classList.remove('wave-animation'); // Remove wave by default

        if (addWave) {
            text.split('').forEach((char, index) => {
                const span = document.createElement('span');
                span.textContent = char === ' ' ? '\u00A0' : char;
                span.style.setProperty('--i', index);
                statusText.appendChild(span);
            });
            statusText.classList.add('wave-animation');
        } else {
            statusText.textContent = text;
        }
        statusBar.hidden = false;
    }

    /** Displays an error message, updates status to error, sets ARIA describedby. */
    function showError(messageKey, data = {}) {
        const message = getTranslation(messageKey, data);
        errorMessage.textContent = message;
        errorBanner.hidden = false;
        outputPlaceholder.hidden = currentFile !== null;
        updateStatusBar('error', "statusError", false); // Update status bar to error state
        inputPanel.setAttribute('aria-describedby', 'error-message');
    }

    /** Hides the error banner and removes ARIA describedby. */
    function hideError() {
        errorBanner.hidden = true;
        errorMessage.textContent = '';
        inputPanel.removeAttribute('aria-describedby');
    }

    /** Resets the entire UI to the initial state (including clearing text). */
    function resetUI() {
        // removePreview handles file, preview, placeholder, disabling submit,
        // hiding errors, and resetting status to initial.
        // It now also clears the extractedTextElement.
        removePreview();
        instructionsInput.value = '';
        modelSelect.value = "gemini-2.5-pro-exp-03-25"; // Reset model select to default
    }

    /** Initiates fetch and processes the streamed response with smooth scrolling. */
    async function processImageStream() {
        setFormInputsDisabled(true);
        hideError();
        // DO NOT clear extractedTextElement here - allow reprocessing with different model/instructions
        // extractedTextElement.textContent = '';
        updateStatusBar('neurology', "statusThinking", true);

        const formData = new FormData();
        formData.append('image', currentFile);
        formData.append('instructions', instructionsInput.value);
        formData.append('model_name', modelSelect.value); // <-- Send selected model

        let streamFinishedSuccessfully = false;
        let streamErrorMessageKey = null;
        let streamErrorData = {};
        let isFirstChunk = true;
        extractedTextElement.textContent = ''; // Clear previous results *before* new stream starts

        try {
            const response = await fetch('/process_image', { method: 'POST', body: formData });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); } catch (e) {}
                streamErrorMessageKey = errorData?.error || "errorFetch";
                // Try to use specific backend error messages if they are translation keys
                if (errorData?.error && !getTranslation(errorData.error).startsWith(errorData.error)) {
                    streamErrorMessageKey = errorData.error; // Use the key if it exists
                    streamErrorData = {};
                } else {
                    streamErrorMessageKey = "errorFetch"; // Fallback key
                    streamErrorData = { status: response.status, details: errorData?.error }; // Include details
                }
                throw new Error(streamErrorMessageKey);
            }
            if (!response.body) { streamErrorMessageKey = "errorNoStream"; throw new Error(streamErrorMessageKey); }

            const reader = response.body.getReader();
            let done = false;

            while (!done) {
                const { value, done: streamDone } = await reader.read();
                done = streamDone;
                if (value) {
                    let chunkText;
                    try { chunkText = decoder.decode(value, { stream: true }); }
                    catch (e) { console.error("Decoding error:", e); chunkText = `\n[${getTranslation("errorDecode")}]\n`; done = true; }

                    // Check for specific error markers from backend
                    if(chunkText && chunkText.startsWith("<<ERROR:")) {
                         const internalError = chunkText.split("<<ERROR:")[1].split(">>")[0].trim();
                         console.error("Backend Stream Error:", internalError);
                         // Map backend error hints to translation keys
                         if (internalError.includes("Safety") || internalError.includes("Sicherheit")) streamErrorMessageKey = "statusBlockedSafety";
                         else if (internalError.includes("Recitation") || internalError.includes("Zitierung")) streamErrorMessageKey = "statusBlockedRecitation";
                         else if (internalError.includes("stopped") || internalError.includes("gestoppt")) streamErrorMessageKey = "statusStopped";
                         else { streamErrorMessageKey = "errorInternalStream"; streamErrorData = { internalError: internalError }; }
                         done = true;
                    } else if (chunkText) {
                        if (isFirstChunk) {
                            updateStatusBar('edit', "statusWriting", true);
                            isFirstChunk = false;
                        }
                        extractedTextElement.textContent += chunkText;
                        outputPanel.scrollTop = outputPanel.scrollHeight; // Smooth scroll
                    }
                }
            } // End while

            if (!streamErrorMessageKey) {
                 streamFinishedSuccessfully = true;
                 console.log("Stream finished.");
                 if (isFirstChunk) { // Handle empty stream case
                      updateStatusBar('block', "statusEmpty", false);
                 } else {
                      updateStatusBar('done_all', "statusDone", false); // Success with content
                 }
            }

        } catch (error) {
            console.error("Error during fetch/stream:", error);
            streamErrorMessageKey = streamErrorMessageKey || "errorUnknown";
            // Ensure the thrown key is used if it's a valid translation key
            if (!getTranslation(error.message).startsWith(error.message)) {
                streamErrorMessageKey = error.message;
            }
            showError(streamErrorMessageKey, streamErrorData); // Show error sets status bar

        } finally {
            setFormInputsDisabled(false);
             // If no error was explicitly shown, ensure the final status (Done/Empty) is set.
             // If an error *was* shown, the status bar is already correctly set to 'Error'.
            if (errorBanner.hidden) {
                 if (streamFinishedSuccessfully && !isFirstChunk) {
                      // Ensure 'Done' status is set if stream ended ok and wasn't empty
                     updateStatusBar('done_all', "statusDone", false);
                 } else if (streamFinishedSuccessfully && isFirstChunk) {
                      // Ensure 'Empty' status is set if stream ended ok but was empty
                     updateStatusBar('block', "statusEmpty", false);
                 }
                 // If !streamFinishedSuccessfully and no error banner shown, something odd happened.
                 // The showError in catch should handle setting the status bar for errors.
            }
        }
    } // End processImageStream

    /** Copies extracted text to clipboard. */
     function copyResultText() {
        const textToCopy = extractedTextElement.textContent;
        if (!textToCopy || textToCopy === getTranslation("statusEmpty")) return;
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                const originalButtonContent = copyButton.innerHTML;
                const successText = getTranslation("copiedSuccess");
                copyButton.innerHTML = `<span class="material-symbols-outlined">check</span> ${successText}`;
                copyButton.disabled = true;

                setTimeout(() => {
                    copyButton.innerHTML = originalButtonContent;
                    const textNode = Array.from(copyButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        textNode.nodeValue = ` ${getTranslation("copyButton")}`;
                    }
                    copyButton.disabled = false;
                }, 2000);
            })
            .catch(err => {
                console.error('Copy failed: ', err);
                 alert(getTranslation("errorCopy"));
            });
    } // End copyResultText

    // --- Language Handling ---

    /** Fetches and loads the translation file. */
    async function loadTranslations(lang) {
        if (uiStrings[lang]) return true;
        try {
            const response = await fetch(`locales/${lang}.json?v=${Date.now()}`); // Cache bust
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            uiStrings[lang] = await response.json();
            console.log(`Translations for ${lang} loaded.`);
            return true;
        } catch (error) {
            console.error(`Failed to load translations for ${lang}:`, error);
            return false;
        }
    }

    /**
     * Applies translations to UI elements, preserving result text
     * and updating the status bar text for the current state.
     */
    function applyTranslations(lang) {
        if (!uiStrings[lang]) {
            console.error(`Translations not loaded for language: ${lang}`);
            return; // Avoid errors if JSON failed to load
         }
        currentLang = lang;
        document.documentElement.lang = lang;

        // Update elements with data-translate attributes
        document.querySelectorAll('[data-translate-key]').forEach(el => {
            const key = el.getAttribute('data-translate-key');
            el.textContent = getTranslation(key);
        });
        document.querySelectorAll('[data-translate-placeholder-key]').forEach(el => {
            const key = el.getAttribute('data-translate-placeholder-key');
            el.placeholder = getTranslation(key);
            if (el.id === 'extracted-text') {
                 el.setAttribute('data-placeholder', getTranslation(key));
            }
        });
         document.querySelectorAll('[data-translate-aria-key]').forEach(el => {
            const key = el.getAttribute('data-translate-aria-key');
            el.setAttribute('aria-label', getTranslation(key));
        });
         document.querySelectorAll('[data-translate-alt-key]').forEach(el => {
            const key = el.getAttribute('data-translate-alt-key');
            el.alt = getTranslation(key);
        });

        // Manually update specific elements
        document.getElementById('app-title').textContent = getTranslation("appTitle");
        document.getElementById('language-select').setAttribute('aria-label', getTranslation("langSelectLabel"));
        document.getElementById('theme-toggle').setAttribute('aria-label', getTranslation("themeToggleLabel"));
        document.getElementById('close-error-button').setAttribute('aria-label', getTranslation("errorCloseLabel"));

        // --- Language Fix: Update Status Bar Text ONLY ---
        // Re-apply the *current* status using the new language.
        // It uses the stored currentStatusState (icon, key, wave, data).
        updateStatusBar(currentStatusState.icon, currentStatusState.key, currentStatusState.isWave, currentStatusState.data);

        // Update copy button text (if not showing "Copied!")
        const copyButtonTextNode = Array.from(copyButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
        if (copyButtonTextNode && !copyButton.textContent.includes(getTranslation("copiedSuccess"))) {
             copyButtonTextNode.nodeValue = ` ${getTranslation("copyButton")}`;
        }

        // Re-translate error message if visible
        if (!errorBanner.hidden) {
            // Assume the currentStatusState.key holds the error key if status is 'error'
            if (currentStatusState.key === 'statusError' && currentStatusState.data && currentStatusState.data.messageKey) {
                 errorMessage.textContent = getTranslation(currentStatusState.data.messageKey, currentStatusState.data.messageData || {});
            } else if (currentStatusState.key === 'statusError') {
                 errorMessage.textContent = getTranslation('errorUnknown'); // Fallback if details missing
            }
        }
    }

    /** Handles language selection change. */
    async function handleLanguageChange(e) {
        const newLang = e.target.value;
        if (!supportedLangs.includes(newLang)) return;

        const loaded = await loadTranslations(newLang);
        if (loaded) {
             localStorage.setItem('selectedLanguage', newLang);
             applyTranslations(newLang); // Apply new language
        } else {
            languageSelect.value = currentLang; // Revert dropdown
            alert(`Failed to load ${newLang} translations.`);
        }
    }

    /** Sets initial language. */
    async function initializeLanguage() {
        const savedLang = localStorage.getItem('selectedLanguage');
        const initialLang = (savedLang && supportedLangs.includes(savedLang)) ? savedLang : 'de';
        languageSelect.value = initialLang;

        // Try loading English first as a fallback
        await loadTranslations('en');
        // Then load the initial language
        const loaded = await loadTranslations(initialLang);

        if (loaded || uiStrings['en']) { // Proceed if initial lang loaded OR English fallback exists
             applyTranslations(initialLang); // Apply (will use English if initial failed but EN loaded)
        } else {
             document.body.innerHTML = `<p style="padding:20px; color:red;">Fatal Error: Could not load core language files (en.json). App cannot start.</p>`;
             throw new Error("Failed to load essential language files."); // Stop execution
        }
    }

    // --- Theme Handling --- (Code unchanged from previous step)
    function applyTheme(theme) { /* ... */ }
    function toggleTheme() { /* ... */ }
    function initializeTheme() { /* ... */ }
     /** Applies theme and updates icon. */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        themeIcon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
        localStorage.setItem('selectedTheme', theme);
    }
    /** Toggles theme. */
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    }
    /** Sets initial theme. */
    function initializeTheme() {
        const savedTheme = localStorage.getItem('selectedTheme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        applyTheme(initialTheme);
    }


    // --- Run Initialization ---
    try {
        initializeTheme();
        await initializeLanguage(); // Wait for language to load
        resetUI(); // Reset UI applies initial status texts based on loaded language
    } catch (error) {
        console.error("Initialization failed:", error);
        // Error is already shown in the body if language load failed critically
    }

}); // End DOMContentLoaded