/**
 * OCR Chatbot Frontend Script v8 (Multilingual)
 *
 * Handles file uploads, previews, API interaction (streaming), language selection,
 * theme toggling, and UI state management for the Gemini OCR Assistant.
 * Includes persistent status bar with letter-wave animation.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const ocrForm = document.getElementById('ocr-form');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseButton = document.getElementById('browse-button');
    const previewArea = document.getElementById('preview-area');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('image-preview');
    const pdfPreviewIcon = document.getElementById('pdf-preview-icon');
    const filenameDisplay = document.getElementById('filename-display');
    const removeImageButton = document.getElementById('remove-image-button');
    const instructionsInput = document.getElementById('instructions');
    // Removed modelSelect reference
    const submitButton = document.getElementById('submit-button');
    const resetButton = document.getElementById('reset-button');
    const outputPlaceholder = document.getElementById('output-placeholder');
    const errorBanner = document.getElementById('error-banner');
    const errorMessage = document.getElementById('error-message');
    const closeErrorButton = document.getElementById('close-error-button');
    const outputPanel = document.getElementById('output-panel');
    const resultArea = document.getElementById('result-area');
    const statusBar = document.getElementById('status-bar');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const extractedTextElement = document.getElementById('extracted-text');
    const copyButton = document.getElementById('copy-button');
    const languageSelect = document.getElementById('language-select'); // Language dropdown
    const themeToggleButton = document.getElementById('theme-toggle');
    const themeIcon = themeToggleButton.querySelector('.material-symbols-outlined');

    // --- State Variables ---
    let currentFile = null;
    const decoder = new TextDecoder();
    let currentLang = 'de'; // Default language

    // --- UI String Translations ---
    const uiStrings = {
        de: {
            // --- Keys must match data-translate-key attributes in HTML or be used directly in JS ---
            appTitle: "Gemini OCR Assistent",
            langSelectLabel: "Sprache auswählen",
            themeToggleLabel: "Design wechseln",
            errorCloseLabel: "Fehler schließen",
            placeholderText: "Laden Sie eine Datei (Bild/PDF) hoch und klicken Sie auf 'PDF/Bild OCR starten', um Ergebnisse zu sehen",
            uploadHeading: "Datei hochladen",
            dropzoneText: "Datei hierher ziehen oder",
            dropzoneAriaLabel: "Datei-Dropzone oder zum Durchsuchen klicken",
            browseButton: "Dateien durchsuchen",
            helperText: "Unterstützt PNG, JPG, WEBP, PDF. Max. 20MB.",
            previewLabel: "Vorschau:",
            imagePreviewAlt: "Bildvorschau",
            removeFileAriaLabel: "Datei entfernen",
            instructionsLabel: "Zusätzliche Anweisungen (Optional)",
            instructionsPlaceholder: "z.B. Nur Tabellendaten extrahieren, Dokument zusammenfassen, Adresse identifizieren",
            submitButton: "PDF/Bild OCR starten",
            resetButton: "Neu starten",
            resultsHeading: "OCR Ergebnis",
            copyButton: "Text kopieren",
            copyButtonAriaLabel: "Extrahierten Text kopieren",
            copiedSuccess: "Kopiert!",
            extractedTextPlaceholder: "OCR Ergebnis wird hier angezeigt...",
            // Status Bar Messages (Keys used in updateStatusBar)
            statusInitial: "Bitte Datei hochladen.",
            statusReady: "Bereit. Klicken Sie auf 'PDF/Bild OCR starten'.",
            statusThinking: "KI denkt nach...",
            statusWriting: "Die KI schreibt...",
            statusDone: "Fertig! Text mit Kopieren-Button entnehmen.",
            statusEmpty: "Kein Text gefunden oder extrahiert.",
            statusError: "Fehler bei der Analyse",
            statusStopped: "Analyse gestoppt", // Generic stop
            statusBlockedSafety: "Anfrage blockiert (Sicherheit)",
            statusBlockedRecitation: "Anfrage blockiert (Zitierung)",
            // Error Messages (Keys used in showError)
            errorNoFile: "Bitte wählen Sie zuerst eine Datei aus.",
            errorInvalidType: "Ungültiger Dateityp: {fileType}. Bitte PNG, JPG, WEBP oder PDF verwenden.", // Placeholder {fileType}
            errorSizeLimit: "Dateigröße überschreitet das 20MB-Limit.",
            errorFileEmpty: "Datei scheint leer zu sein.",
            errorReadImage: "Die ausgewählte Bilddatei konnte nicht gelesen werden.",
            errorFetch: "Anfrage fehlgeschlagen mit Status: {status}", // Placeholder {status}
            errorNoStream: "Antwort enthält keinen Stream-Body.",
            errorDecode: "<<DECODING ERROR>>", // Keep technical markers
            errorInternalStream: "{internalError}", // Placeholder for backend stream errors
            errorUnexpectedFormat: "Unerwartetes Antwortformat vom Server erhalten.",
            errorUnknown: "Ein unbekannter Fehler ist aufgetreten.",
            errorCopy: "Text konnte nicht in die Zwischenablage kopiert werden. Bitte manuell versuchen.",
            errorModelSelect: "Fehler bei Auswahl des Modells '{modelName}'. Existiert es oder haben Sie Zugriff?" // Although model select is removed, keep for potential future use or debugging backend issues
        },
        en: {
            // --- English Translations ---
            appTitle: "Gemini OCR Assistant",
            langSelectLabel: "Select Language",
            themeToggleLabel: "Toggle Theme",
            errorCloseLabel: "Close error",
            placeholderText: "Upload a file (Image/PDF) and click 'Start PDF/Image OCR' to see results",
            uploadHeading: "Upload File",
            dropzoneText: "Drag & drop a file here, or",
            dropzoneAriaLabel: "File drop zone or click to browse",
            browseButton: "Browse files",
            helperText: "Supports PNG, JPG, WEBP, PDF. Max 20MB.",
            previewLabel: "Preview:",
            imagePreviewAlt: "Image preview",
            removeFileAriaLabel: "Remove file",
            instructionsLabel: "Custom Instructions (Optional)",
            instructionsPlaceholder: "e.g., Extract table data only, Summarize the document, Identify the address",
            submitButton: "Start PDF/Image OCR",
            resetButton: "Start New",
            resultsHeading: "OCR Result",
            copyButton: "Copy Text",
            copyButtonAriaLabel: "Copy extracted text",
            copiedSuccess: "Copied!",
            extractedTextPlaceholder: "OCR Result will be displayed here...",
            // Status Bar Messages
            statusInitial: "Please upload a file.",
            statusReady: "Ready. Click 'Start PDF/Image OCR'.",
            statusThinking: "AI is thinking...",
            statusWriting: "AI is writing...",
            statusDone: "Done! Use the copy button to get the text.",
            statusEmpty: "No text found or extracted.",
            statusError: "Analysis failed",
            statusStopped: "Analysis stopped",
            statusBlockedSafety: "Request blocked (Safety)",
            statusBlockedRecitation: "Request blocked (Recitation)",
            // Error Messages
            errorNoFile: "Please select a file first.",
            errorInvalidType: "Invalid file type: {fileType}. Please use PNG, JPG, WEBP, or PDF.",
            errorSizeLimit: "File size exceeds the 20MB limit.",
            errorFileEmpty: "File appears to be empty.",
            errorReadImage: "Could not read the selected image file.",
            errorFetch: "Request failed with status: {status}",
            errorNoStream: "Response does not contain a stream body.",
            errorDecode: "<<DECODING ERROR>>",
            errorInternalStream: "{internalError}",
            errorUnexpectedFormat: "Received an unexpected response format from the server.",
            errorUnknown: "An unknown error occurred.",
            errorCopy: "Could not copy text to clipboard. Please try manually.",
            errorModelSelect: "Error selecting model '{modelName}'. Does it exist or do you have access?"
        }
    };


    // --- Event Listeners ---
    browseButton.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => { if (e.target !== browseButton) fileInput.click(); });
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
    languageSelect.addEventListener('change', handleLanguageChange); // Listener for language change

    // --- Core Functions ---

    /** Form submission handler. */
    async function handleFormSubmit(e) {
         e.preventDefault();
         if (!currentFile) { showError("errorNoFile"); return; } // Use translation key
         await processImageStream();
    }

    /** Validates files and updates UI for preview. */
    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        const maxSize = 20 * 1024 * 1024;

        hideError();

        if (!allowedTypes.includes(file.type)) { showError("errorInvalidType", { fileType: file.type || 'unbekannt' }); fileInput.value = ''; return; } // Pass data
        if (file.size > maxSize) { showError("errorSizeLimit"); fileInput.value = ''; return; }
        if (file.size === 0) { showError("errorFileEmpty"); fileInput.value = ''; return; }

        currentFile = file;
        displayPreview(file);
        submitButton.disabled = false;
        outputPlaceholder.hidden = true;
        clearResultArea(); // Will set statusReady message
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

    /** Resets file input and preview area. */
    function removePreview() {
        currentFile = null; fileInput.value = '';
        imagePreview.src = '#'; imagePreview.hidden = true; pdfPreviewIcon.hidden = true;
        filenameDisplay.textContent = '';
        previewArea.hidden = true; dropZone.hidden = false;
        submitButton.disabled = true;
        outputPlaceholder.hidden = false;
        clearResultArea(); hideError();
    }

    /** Updates UI element disabled states during processing. */
    function setFormInputsDisabled(isDisabled) {
        // Include language select in elements to disable during processing
        const elementsToDisable = [submitButton, resetButton, instructionsInput, languageSelect, removeImageButton, fileInput, browseButton, dropZone];
        elementsToDisable.forEach(el => el.disabled = isDisabled);
        dropZone.style.pointerEvents = isDisabled ? 'none' : 'auto';
    }

    /**
     * Updates the persistent status bar content and appearance.
     * @param {string | null} iconName - Material Symbol name or null.
     * @param {string} textKey - The key for the translation string in uiStrings.
     * @param {boolean} addWave - Whether to apply the letter wave animation.
     * @param {object} [data={}] - Optional data for placeholders in the text string.
     */
    function updateStatusBar(iconName, textKey, addWave = false, data = {}) {
        if (iconName) { statusIcon.textContent = iconName; statusIcon.hidden = false; }
        else { statusIcon.hidden = true; }

        let text = uiStrings[currentLang][textKey] || textKey; // Get translated text or use key as fallback
        // Replace placeholders in text
        for (const key in data) {
            text = text.replace(`{${key}}`, data[key]);
        }

        statusText.innerHTML = ''; // Clear previous content
        statusText.classList.remove('wave-animation');

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

    /**
     * Displays an error message in the banner and updates status bar.
     * @param {string} messageKey - The key for the error string in uiStrings.
     * @param {object} [data={}] - Optional data for placeholders in the error string.
     */
    function showError(messageKey, data = {}) {
        let message = uiStrings[currentLang][messageKey] || messageKey; // Get translated message
         // Replace placeholders
        for (const key in data) {
            message = message.replace(`{${key}}`, data[key]);
        }

        errorMessage.textContent = message;
        errorBanner.hidden = false;
        outputPlaceholder.hidden = currentFile !== null;
        updateStatusBar('error', "statusError", false); // Show error status
    }

    /** Hides the error banner. */
    function hideError() {
        errorBanner.hidden = true;
        errorMessage.textContent = '';
    }

    /** Clears the result text area and resets the status bar. */
     function clearResultArea() {
        extractedTextElement.textContent = '';
        if (currentFile) {
            updateStatusBar('arrow_forward', "statusReady");
        } else {
            updateStatusBar('upload_file', "statusInitial");
        }
    }

    /** Resets the entire UI to the initial state. */
    function resetUI() {
        removePreview(); // Handles placeholder, error, results, status bar reset
        instructionsInput.value = '';
        // Status bar reset is handled within removePreview -> clearResultArea
    }

    /** Initiates the fetch request and processes the streamed response. */
    async function processImageStream() {
        setFormInputsDisabled(true);
        hideError();
        extractedTextElement.textContent = '';
        updateStatusBar('neurology', "statusThinking", true); // Thinking status WITH wave

        const formData = new FormData();
        formData.append('image', currentFile);
        formData.append('instructions', instructionsInput.value);
        // No need to send model name anymore as it's fixed in backend

        let streamFinishedSuccessfully = false;
        let streamErrorMessageKey = null; // Store the error key
        let streamErrorData = {}; // Store data for error message placeholders

        try {
            const response = await fetch('/process_image', { method: 'POST', body: formData });

            if (!response.ok) {
                let errorData = { error: uiStrings[currentLang].errorFetch.replace('{status}', response.status) }; // Default fetch error
                try { errorData = await response.json(); } catch (e) {} // Try to parse specific error
                streamErrorMessageKey = "errorUnknown"; // Default key if backend doesn't provide one
                if (errorData.error) {
                    // Use backend error message directly if provided (might not be a key)
                    streamErrorMessageKey = errorData.error;
                }
                throw new Error(streamErrorMessageKey); // Throw to be caught below
            }
            if (!response.body) { streamErrorMessageKey = "errorNoStream"; throw new Error(streamErrorMessageKey); }

            const reader = response.body.getReader();
            let done = false;
            let isFirstChunk = true;

            while (!done) {
                const { value, done: streamDone } = await reader.read();
                done = streamDone;
                if (value) {
                    let chunkText;
                    try { chunkText = decoder.decode(value, { stream: true }); }
                    catch (e) { console.error("Decoding error:", e); chunkText = uiStrings[currentLang].errorDecode; done = true; }

                    if(chunkText.startsWith("<<ERROR:")) {
                         const internalError = chunkText.split("<<ERROR:")[1].split(">>")[0].trim();
                         console.error("Backend Stream Error:", internalError);
                         // Try to map backend errors to translation keys, or use directly
                         if (internalError.includes("Sicherheit")) streamErrorMessageKey = "statusBlockedSafety";
                         else if (internalError.includes("Zitierung")) streamErrorMessageKey = "statusBlockedRecitation";
                         else if (internalError.includes("gestoppt")) streamErrorMessageKey = "statusStopped";
                         else { streamErrorMessageKey = "errorInternalStream"; streamErrorData = { internalError: internalError }; } // Pass raw error
                         done = true; // Stop processing on internal error
                    } else if (chunkText) {
                        if (isFirstChunk) {
                            updateStatusBar('edit', "statusWriting", true); // Writing status WITH wave
                            isFirstChunk = false;
                        }
                        extractedTextElement.textContent += chunkText;
                        outputPanel.scrollTop = outputPanel.scrollHeight;
                    }
                }
            } // End while

            if (!streamErrorMessageKey) { // If no internal error marker was found
                 streamFinishedSuccessfully = true;
                 console.log("Stream vollständig gelesen.");
                 if (isFirstChunk) { // Handle empty stream
                      updateStatusBar('block', "statusEmpty", false);
                 }
            }

        } catch (error) {
            console.error("Fehler während Fetch oder Stream-Verarbeitung:", error);
            // Use the messageKey if already set, otherwise use a generic one
            streamErrorMessageKey = streamErrorMessageKey || "errorUnknown";
            // If the error object has a specific message (like from fetch failure), use it.
            // This might overwrite a more specific key determined earlier if fetch itself fails.
            if (error.message && !streamErrorData.internalError) {
                streamErrorMessageKey = error.message; // Use raw message if it's likely a network/fetch error
            }
            showError(streamErrorMessageKey, streamErrorData);
        } finally {
            setFormInputsDisabled(false);
            // Set final status message *only if* no error banner is currently shown
            if (errorBanner.hidden) {
                 if (streamFinishedSuccessfully && !isFirstChunk) {
                     updateStatusBar('done_all', "statusDone", false);
                 } else if (streamFinishedSuccessfully && isFirstChunk) {
                     updateStatusBar('block', "statusEmpty", false);
                 }
                 else if (!streamFinishedSuccessfully){
                      // This case means an error happened but wasn't displayed via showError
                      updateStatusBar('error', "statusError", false);
                 }
            } else {
                 // Ensure status bar shows error if banner is visible
                 updateStatusBar('error', "statusError", false);
            }
        }
    } // End processImageStream

    /** Copies extracted text to clipboard. */
     function copyResultText() {
        const textToCopy = extractedTextElement.textContent;
        if (!textToCopy || textToCopy === uiStrings[currentLang].statusEmpty) return; // Check translated empty message

        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                const copyButtonContent = copyButton.innerHTML;
                // Use translated success message
                copyButton.innerHTML = `<span class="material-symbols-outlined">check</span> ${uiStrings[currentLang].copiedSuccess}`;
                copyButton.disabled = true;
                setTimeout(() => { copyButton.innerHTML = copyButtonContent; applyTranslations(currentLang); copyButton.disabled = false; }, 2000); // Re-apply translation to restore original text
            })
            .catch(err => {
                console.error('Kopieren fehlgeschlagen: ', err);
                 alert(uiStrings[currentLang].errorCopy); // Use translated error alert
            });
    } // End copyResultText

    // --- Language Handling ---

    /**
     * Applies translations to all targeted UI elements.
     * @param {'de' | 'en'} lang - The language code to apply.
     */
    function applyTranslations(lang) {
        if (!uiStrings[lang]) {
            console.error("Invalid language selected:", lang);
            return;
        }
        currentLang = lang; // Update global current language
        document.documentElement.lang = lang; // Update HTML lang attribute

        // Update elements with data-translate-key attribute
        document.querySelectorAll('[data-translate-key]').forEach(el => {
            const key = el.getAttribute('data-translate-key');
            if (uiStrings[lang][key]) {
                el.textContent = uiStrings[lang][key];
            }
        });

        // Update elements with data-translate-placeholder-key attribute
        document.querySelectorAll('[data-translate-placeholder-key]').forEach(el => {
            const key = el.getAttribute('data-translate-placeholder-key');
            if (uiStrings[lang][key]) {
                el.placeholder = uiStrings[lang][key];
            }
            // Special case for empty <pre> placeholder
             if (el.id === 'extracted-text' && uiStrings[lang][key]) {
                 el.setAttribute('data-placeholder', uiStrings[lang][key]);
            }
        });

         // Update elements with data-translate-aria-key attribute
         document.querySelectorAll('[data-translate-aria-key]').forEach(el => {
            const key = el.getAttribute('data-translate-aria-key');
            if (uiStrings[lang][key]) {
                el.setAttribute('aria-label', uiStrings[lang][key]);
            }
        });

         // Update elements with data-translate-alt-key attribute
         document.querySelectorAll('[data-translate-alt-key]').forEach(el => {
            const key = el.getAttribute('data-translate-alt-key');
            if (uiStrings[lang][key]) {
                el.alt = uiStrings[lang][key];
            }
        });

        // Manually update elements without data attributes if necessary
        document.getElementById('app-title').textContent = uiStrings[lang].appTitle;
        document.getElementById('language-select').setAttribute('aria-label', uiStrings[lang].langSelectLabel);
        document.getElementById('theme-toggle').setAttribute('aria-label', uiStrings[lang].themeToggleLabel);
        document.getElementById('close-error-button').setAttribute('aria-label', uiStrings[lang].errorCloseLabel);


        // Re-apply current status bar text in the new language
        // Determine current status key based on UI state or a stored variable if needed
        let currentStatusKey = 'statusInitial'; // Default
        if (currentFile && submitButton.disabled === false) currentStatusKey = 'statusReady';
        // Add more logic here if you need to preserve the exact status across language switches
        // For simplicity, we'll just reset to 'Ready' or 'Initial' based on file presence.
        updateStatusBar(
            statusBar.querySelector('.status-icon')?.textContent || 'upload_file', // Keep current icon
            currentStatusKey,
            statusText.classList.contains('wave-animation') // Keep wave if it was active
        );

         // Update copy button text if it's not showing "Copied!"
         if (!copyButton.textContent.includes(uiStrings[lang].copiedSuccess)) {
             copyButton.childNodes[1].nodeValue = ` ${uiStrings[lang].copyButton}`; // Update text node
         }
    }

    /** Handles the language selection change event. */
    function handleLanguageChange(e) {
        const newLang = e.target.value;
        localStorage.setItem('selectedLanguage', newLang); // Save preference
        applyTranslations(newLang);
    }

    /** Sets the initial language based on saved preference or default. */
    function initializeLanguage() {
        const savedLang = localStorage.getItem('selectedLanguage');
        const initialLang = savedLang && uiStrings[savedLang] ? savedLang : 'de'; // Default to German
        languageSelect.value = initialLang; // Set dropdown value
        applyTranslations(initialLang); // Apply translations
    }


    // --- Theme Handling ---
    function applyTheme(theme) { /* ... (code unchanged) ... */ }
    function toggleTheme() { /* ... (code unchanged) ... */ }
    function initializeTheme() { /* ... (code unchanged) ... */ }

    // --- Run Initialization ---
    initializeTheme();
    initializeLanguage(); // Initialize language and apply translations
    resetUI(); // Set initial UI state (which uses the now set language)

}); // End DOMContentLoaded