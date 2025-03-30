/**
 * OCR Chatbot Frontend Script v7
 *
 * Handles file uploads, previews, API interaction (streaming), model selection,
 * theme toggling, and UI state management for the Gemini OCR Assistant.
 * Includes persistent status bar with letter-wave animation.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    // Input Panel
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
    const modelSelect = document.getElementById('model-select'); // ***** NEW: Model select element *****
    const submitButton = document.getElementById('submit-button');
    const resetButton = document.getElementById('reset-button');
    const outputPlaceholder = document.getElementById('output-placeholder');
    const errorBanner = document.getElementById('error-banner');
    const errorMessage = document.getElementById('error-message');
    const closeErrorButton = document.getElementById('close-error-button');

    // Output Panel
    const outputPanel = document.getElementById('output-panel');
    const resultArea = document.getElementById('result-area');
    const statusBar = document.getElementById('status-bar');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const extractedTextElement = document.getElementById('extracted-text');
    const copyButton = document.getElementById('copy-button');

    // Header
    const themeToggleButton = document.getElementById('theme-toggle');
    const themeIcon = themeToggleButton.querySelector('.material-symbols-outlined');

    // --- State Variables ---
    let currentFile = null;
    const decoder = new TextDecoder();

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

    // --- Core Functions ---

    /** Form submission handler. */
    async function handleFormSubmit(e) {
         e.preventDefault();
         if (!currentFile) { showError("Bitte wählen Sie zuerst eine Datei aus."); return; }
         await processImageStream();
    }

    /** Validates files and updates UI for preview. */
    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        const maxSize = 20 * 1024 * 1024;

        hideError();

        if (!allowedTypes.includes(file.type)) { showError(`Ungültiger Dateityp: ${file.type || 'unbekannt'}. Bitte PNG, JPG, WEBP oder PDF verwenden.`); fileInput.value = ''; return; }
        if (file.size > maxSize) { showError(`Dateigröße überschreitet das 20MB-Limit.`); fileInput.value = ''; return; }
        if (file.size === 0) { showError(`Datei scheint leer zu sein.`); fileInput.value = ''; return; }

        currentFile = file;
        displayPreview(file);
        submitButton.disabled = false;
        outputPlaceholder.hidden = true;
        clearResultArea();
        updateStatusBar('arrow_forward', "Bereit. Klicken Sie auf 'PDF/Bild OCR starten'.");
    }

    /** Displays image thumbnail or PDF icon. */
    function displayPreview(file) {
        filenameDisplay.textContent = file.name;
        imagePreview.hidden = true; pdfPreviewIcon.hidden = true;

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => { imagePreview.src = e.target.result; imagePreview.hidden = false; }
            reader.onerror = () => { showError("Die ausgewählte Bilddatei konnte nicht gelesen werden."); removePreview(); };
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
        // ***** MODIFIED: Include modelSelect *****
        const elementsToDisable = [submitButton, resetButton, instructionsInput, modelSelect, removeImageButton, fileInput, browseButton, dropZone];
        elementsToDisable.forEach(el => el.disabled = isDisabled);
        dropZone.style.pointerEvents = isDisabled ? 'none' : 'auto';
    }

    /**
     * Updates the persistent status bar content and appearance.
     * @param {string | null} iconName - Material Symbol name or null.
     * @param {string} text - Text content for the status bar.
     * @param {boolean} addWave - Whether to apply the letter wave animation.
     */
    function updateStatusBar(iconName, text, addWave = false) {
        if (iconName) { statusIcon.textContent = iconName; statusIcon.hidden = false; }
        else { statusIcon.hidden = true; }

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

    /** Displays an error message in the banner and updates status bar. */
    function showError(message) {
        errorMessage.textContent = message;
        errorBanner.hidden = false;
        outputPlaceholder.hidden = currentFile !== null;
        updateStatusBar('error', "Fehler bei der Analyse", false);
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
            updateStatusBar('arrow_forward', "Bereit. Klicken Sie auf 'PDF/Bild OCR starten'.");
        } else {
            updateStatusBar('upload_file', "Bitte Datei hochladen.");
        }
    }

    /** Resets the entire UI to the initial state. */
    function resetUI() {
        removePreview(); // Handles placeholder, error, results, status bar reset
        instructionsInput.value = '';
        modelSelect.selectedIndex = 0; // Reset dropdown to the first option (default)
        // Status bar reset is handled by removePreview -> clearResultArea
    }

    /** Initiates the fetch request and processes the streamed response. */
    async function processImageStream() {
        setFormInputsDisabled(true);
        hideError();
        extractedTextElement.textContent = '';
        updateStatusBar('neurology', "KI denkt nach...", true); // Thinking status WITH wave

        const formData = new FormData();
        formData.append('image', currentFile);
        formData.append('instructions', instructionsInput.value);
        // ***** NEW: Append selected model name *****
        formData.append('selected_model', modelSelect.value);

        let streamFinishedSuccessfully = false;
        let streamErrorMessage = null;
        let isFirstChunk = true;

        try {
            const response = await fetch('/process_image', { method: 'POST', body: formData });

            if (!response.ok) {
                let errorData = { error: `Anfrage fehlgeschlagen mit Status: ${response.status}` };
                try { errorData = await response.json(); } catch (e) {}
                throw new Error(errorData.error || `HTTP-Fehler ${response.status}`);
            }
            if (!response.body) throw new Error("Antwort enthält keinen Stream-Body.");

            const reader = response.body.getReader();
            let done = false;

            while (!done) {
                const { value, done: streamDone } = await reader.read();
                done = streamDone;
                if (value) {
                    let chunkText;
                    try { chunkText = decoder.decode(value, { stream: true }); }
                    catch (e) { console.error("Decoding error:", e); chunkText = "<<DECODING ERROR>>"; done = true; }

                    if(chunkText.includes("<<ERROR:")) {
                         const internalError = chunkText.split("<<ERROR:")[1].split(">>")[0].trim();
                         console.error("Backend Stream Error:", internalError);
                         streamErrorMessage = internalError;
                         showError(internalError);
                         done = true;
                    } else if (chunkText) {
                        if (isFirstChunk) {
                            // ***** MODIFIED: Update status with wave *****
                            updateStatusBar('edit', "Die KI schreibt...", true); // Writing status WITH wave
                            isFirstChunk = false;
                        }
                        extractedTextElement.textContent += chunkText;
                        outputPanel.scrollTop = outputPanel.scrollHeight;
                    }
                }
            } // End while

            if (!streamErrorMessage) {
                 streamFinishedSuccessfully = true;
                 console.log("Stream vollständig gelesen.");
                 if (isFirstChunk) { // Handle empty stream case
                      updateStatusBar('block', "Kein Text gefunden oder extrahiert.", false);
                 }
            }

        } catch (error) {
            console.error("Fehler während Fetch oder Stream-Verarbeitung:", error);
            streamErrorMessage = error.message || "Ein unbekannter Fehler ist aufgetreten.";
            showError(streamErrorMessage);
        } finally {
            setFormInputsDisabled(false);
            // Set final status message *only if* no error is currently shown
            if (errorBanner.hidden) {
                 if (streamFinishedSuccessfully && !isFirstChunk) {
                     updateStatusBar('done_all', "Fertig! Text mit Kopieren-Button entnehmen.", false);
                 } else if (streamFinishedSuccessfully && isFirstChunk) {
                     updateStatusBar('block', "Kein Text gefunden oder extrahiert.", false);
                 }
                 else if (!streamFinishedSuccessfully){
                      updateStatusBar('error', "Fehler bei der Analyse", false);
                 }
            } else {
                 // Ensure status bar shows error if banner is visible
                 updateStatusBar('error', "Fehler bei der Analyse", false);
            }
        }
    } // End processImageStream

    /** Copies extracted text to clipboard. */
     function copyResultText() {
        const textToCopy = extractedTextElement.textContent;
        if (!textToCopy || textToCopy === "Es konnte kein Text extrahiert werden.") return;
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                const copyButtonContent = copyButton.innerHTML;
                copyButton.innerHTML = `<span class="material-symbols-outlined">check</span> Kopiert!`;
                copyButton.disabled = true;
                setTimeout(() => { copyButton.innerHTML = copyButtonContent; copyButton.disabled = false; }, 2000);
            })
            .catch(err => {
                console.error('Kopieren fehlgeschlagen: ', err);
                 alert('Text konnte nicht in die Zwischenablage kopiert werden. Bitte manuell versuchen.');
            });
    } // End copyResultText

    // --- Theme Handling ---
    /** Applies theme and updates icon. */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        themeIcon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
        localStorage.setItem('theme', theme);
    }
    /** Toggles theme. */
    function toggleTheme() {
         const currentTheme = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
         applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    }
    /** Sets initial theme. */
    function initializeTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    }

    // --- Run Initialization ---
    initializeTheme();
    resetUI(); // Set initial UI and status bar state

}); // End DOMContentLoaded