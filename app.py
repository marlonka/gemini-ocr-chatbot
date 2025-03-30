# Standard library imports
import os
import io
import traceback

# Third-party library imports
import google.generativeai as genai
from flask import (
    Flask, request, jsonify, send_from_directory, Response, stream_with_context
)
from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError

# --- Application Configuration ---
load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")
# Default model used if frontend doesn't specify or on error
DEFAULT_MODEL_NAME = "gemini-2.5-pro-exp-03-25"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}
MAX_FILE_SIZE = 20 * 1024 * 1024

# --- Flask Application Setup ---
app = Flask(__name__, static_folder='static', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# --- Gemini AI Client Setup ---
# Configure the SDK globally, but initialize the specific model per request
sdk_configured_successfully = False
try:
    if not API_KEY:
        raise ValueError("GOOGLE_API_KEY nicht in Umgebungsvariablen gefunden. Wurde eine .env Datei erstellt?")
    genai.configure(api_key=API_KEY)
    print("Gemini SDK erfolgreich konfiguriert.")
    sdk_configured_successfully = True # Flag successful configuration
except Exception as e:
    print(f"Fataler Fehler: Konnte Gemini SDK nicht konfigurieren ({type(e).__name__}): {e}")
    if "API key" in str(e) or "credential" in str(e).lower():
         print("-> Bitte stellen Sie sicher, dass Ihr GOOGLE_API_KEY in der .env Datei korrekt gesetzt und gültig ist.")
    else:
         traceback.print_exc()
         print("-> Überprüfen Sie die SDK-Konfiguration und -Installation.")

# --- System Instruction and Base Generation Config (Applied per request) ---
SYS_INSTRUCTION = """Du bist ein hochentwickelter OCR-Assistent. Deine Aufgabe ist es, Text aus der bereitgestellten Datei (Bild oder PDF-Dokument) präzise zu extrahieren.
- Behalte die ursprüngliche Formatierung so weit wie möglich bei, einschließlich Zeilenumbrüchen, Absätzen und Einzügen.
- Wenn du ein mehrseitiges PDF verarbeitest, kennzeichne den Beginn jeder neuen Seite deutlich mit einer Markierung wie '--- Seite [Seitenzahl] ---' in einer eigenen Zeile, bevor der Inhalt dieser Seite beginnt. Beginne mit Seite 1.
- Antworte *nur* mit dem extrahierten Text und den Seitenmarkierungen. Füge keine einleitenden oder abschließenden Bemerkungen wie 'Hier ist der Text...' oder 'Die Dokumentanalyse ist abgeschlossen.' hinzu."""

GENERATION_CONFIG = { "temperature": 0.3 }

# --- Helper Functions ---
def allowed_file(filename: str) -> bool:
    """Checks if a filename has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Flask Routes ---
@app.route('/')
def index():
    """Serves the main index.html page."""
    # Check if the SDK itself was configured, not a specific model instance
    if not sdk_configured_successfully:
         return "Fehler: Gemini SDK konnte nicht initialisiert werden. Server-Logs prüfen.", 500
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/process_image', methods=['POST'])
def process_image():
    """
    Handles file uploads, selects the Gemini model based on user input,
    and streams OCR results back to the client.
    """
    # Check if SDK is configured before proceeding
    if not sdk_configured_successfully:
        return Response('{"error": "Gemini SDK ist auf dem Server nicht konfiguriert."}', status=500, mimetype='application/json')

    # --- Request Validation ---
    if 'image' not in request.files:
        return Response('{"error": "Kein \'image\'-Teil in der Anfrage"}', status=400, mimetype='application/json')

    file = request.files['image']
    instructions = request.form.get('instructions', '')
    # Get selected model from form data, fallback to default
    selected_model_name = request.form.get('selected_model', DEFAULT_MODEL_NAME)

    if file.filename == '':
        return Response('{"error": "Keine Datei ausgewählt"}', status=400, mimetype='application/json')

    file_extension = ''
    if '.' in file.filename:
        file_extension = file.filename.rsplit('.', 1)[1].lower()

    if not allowed_file(file.filename):
         return Response(f'{{"error": "Ungültiger Dateityp. Erlaubt: {", ".join(ALLOWED_EXTENSIONS)}"}}', status=400, mimetype='application/json')

    # --- File Processing and Model Initialization (per request) ---
    try:
        file_bytes = file.read()
        file_mimetype = file.mimetype

        # Validate images using Pillow if applicable
        if file_extension != 'pdf':
            try:
                img = Image.open(io.BytesIO(file_bytes))
                img.verify()
                if img.format and img.format.lower() not in ALLOWED_EXTENSIONS:
                     return Response(f'{{"error": "Ungültiges Bildformat von Pillow erkannt: {img.format}"}}', status=400, mimetype='application/json')
            except UnidentifiedImageError:
                 return Response('{"error": "Bilddatei kann nicht identifiziert werden."}', status=400, mimetype='application/json')
            except Exception as pil_error:
                 print(f"Pillow Fehler: {pil_error}")
                 return Response('{"error": "Fehler beim Verarbeiten der Bilddaten."}', status=400, mimetype='application/json')

        # Prepare file part for the API call
        file_part = { "mime_type": file_mimetype, "data": file_bytes }

        # Construct content list (instructions + file)
        contents = []
        if instructions: contents.append(f"Zusätzliche Benutzeranweisung: {instructions}")
        contents.append(file_part)

        # --- Initialize the specific model instance for *this* request ---
        print(f"Initialisiere Modell für diese Anfrage: {selected_model_name}")
        try:
            request_model = genai.GenerativeModel(
                selected_model_name,
                generation_config=GENERATION_CONFIG,
                system_instruction=SYS_INSTRUCTION
            )
            print(f"Modell {selected_model_name} erfolgreich für Anfrage initialisiert.")
        except Exception as model_init_error:
            # Handle errors during model initialization (e.g., invalid name)
            print(f"Fehler bei Initialisierung von Modell {selected_model_name}: {model_init_error}")
            traceback.print_exc()
            # Return a JSON error as streaming cannot start
            return jsonify({"error": f"Fehler bei Auswahl des Modells '{selected_model_name}'. Existiert es oder haben Sie Zugriff?"}), 500

        print(f"Starte Stream für Gemini (Modell: {selected_model_name}). MimeType: {file_mimetype}.")

        # --- Streaming Generator Function ---
        def generate_chunks():
            """Yields text chunks from the selected Gemini API model stream."""
            try:
                # Use the request-specific model instance
                response_stream = request_model.generate_content(contents, stream=True)
                for chunk in response_stream:
                    if chunk.text: yield chunk.text
                    elif not chunk.candidates and not (chunk.prompt_feedback and chunk.prompt_feedback.block_reason):
                            print(f"Leerer Stream-Chunk ohne Fehler empfangen.")
                print(f"Stream von {selected_model_name} beendet.")
            # Handle potential errors during the generation stream
            except genai.types.BlockedPromptException as e:
                 print(f"Stream blockiert (BlockedPromptException): {e}")
                 yield f'<<ERROR: Anfrage blockiert (Sicherheit)>>'
            except genai.types.StopCandidateException as e:
                 reason = e.candidate.finish_reason.name if (e.candidate and e.candidate.finish_reason) else "Unbekannt"
                 print(f"Stream gestoppt (StopCandidateException - {reason}): {e}")
                 yield f'<<ERROR: Anfrage gestoppt ({reason})>>'
            except Exception as e:
                print(f"Fehler während des Streamings mit {selected_model_name}: {type(e).__name__}: {e}")
                traceback.print_exc()
                yield f'<<ERROR: Serverfehler während der Verarbeitung>>'

        # Return the streaming response
        return Response(stream_with_context(generate_chunks()), mimetype='text/plain; charset=utf-8')

    # Catch errors that occurred before model initialization or streaming start
    except Exception as e:
        print(f"Fehler vor dem Streamen in /process_image: {type(e).__name__}: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Ein Serverfehler ist vor der Verarbeitung aufgetreten."}), 500

# --- Run the Flask Application ---
if __name__ == '__main__':
    if not sdk_configured_successfully:
        print("\n*** Flask Server kann nicht gestartet werden: Gemini SDK konnte nicht initialisiert werden. ***\n")
    else:
        print("Starte Flask Server...")
        app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)