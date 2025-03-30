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
MODEL_NAME = "gemini-2.5-pro-exp-03-25"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}
MAX_FILE_SIZE = 20 * 1024 * 1024

# --- Flask Application Setup ---
app = Flask(__name__, static_folder='static', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# --- Gemini AI Client Setup ---
model = None
try:
    if not API_KEY:
        raise ValueError("GOOGLE_API_KEY nicht in Umgebungsvariablen gefunden. Wurde eine .env Datei erstellt?")
    genai.configure(api_key=API_KEY)

    SYS_INSTRUCTION = """Du bist ein hochentwickelter OCR-Assistent. Deine Aufgabe ist es, Text aus der bereitgestellten Datei (Bild oder PDF-Dokument) präzise zu extrahieren.
- Behalte die ursprüngliche Formatierung so weit wie möglich bei, einschließlich Zeilenumbrüchen, Absätzen und Einzügen.
- Wenn du ein mehrseitiges PDF verarbeitest, kennzeichne den Beginn jeder neuen Seite deutlich mit einer Markierung wie '--- Seite [Seitenzahl] ---' in einer eigenen Zeile, bevor der Inhalt dieser Seite beginnt. Beginne mit Seite 1.
- Antworte *nur* mit dem extrahierten Text und den Seitenmarkierungen. Füge keine einleitenden oder abschließenden Bemerkungen wie 'Hier ist der Text...' oder 'Die Dokumentanalyse ist abgeschlossen.' hinzu."""

    GENERATION_CONFIG = { "temperature": 0.3 }

    model = genai.GenerativeModel(
        MODEL_NAME,
        generation_config=GENERATION_CONFIG,
        system_instruction=SYS_INSTRUCTION
        )
    print(f"Gemini Modell '{MODEL_NAME}' erfolgreich konfiguriert.")
except Exception as e:
    print(f"Fataler Fehler: Konnte Gemini SDK nicht konfigurieren ({type(e).__name__}): {e}")
    if "API key" in str(e) or "credential" in str(e).lower():
         print("-> Bitte stellen Sie sicher, dass Ihr GOOGLE_API_KEY in der .env Datei korrekt gesetzt und gültig ist.")
    else:
         traceback.print_exc()
         print("-> Überprüfen Sie die SDK-Konfiguration und -Installation.")

# --- Helper Functions ---
def allowed_file(filename: str) -> bool:
    """Checks if a filename has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Flask Routes ---
@app.route('/')
def index():
    """Serves the main index.html page."""
    if model is None:
         return "Fehler: Gemini AI Modell konnte nicht initialisiert werden. Server-Logs prüfen.", 500
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/process_image', methods=['POST'])
def process_image():
    """Handles file uploads and streams OCR results from Gemini."""
    if model is None:
        return Response('{"error": "Gemini Modell ist auf dem Server nicht konfiguriert."}', status=500, mimetype='application/json')

    if 'image' not in request.files:
        return Response('{"error": "Kein \'image\'-Teil in der Anfrage"}', status=400, mimetype='application/json')

    file = request.files['image']
    instructions = request.form.get('instructions', '')

    if file.filename == '':
        return Response('{"error": "Keine Datei ausgewählt"}', status=400, mimetype='application/json')

    file_extension = ''
    if '.' in file.filename:
        file_extension = file.filename.rsplit('.', 1)[1].lower()

    if not allowed_file(file.filename):
         return Response(f'{{"error": "Ungültiger Dateityp. Erlaubt: {", ".join(ALLOWED_EXTENSIONS)}"}}', status=400, mimetype='application/json')

    try:
        file_bytes = file.read()
        file_mimetype = file.mimetype

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

        file_part = { "mime_type": file_mimetype, "data": file_bytes }
        contents = []
        if instructions: contents.append(f"Zusätzliche Benutzeranweisung: {instructions}")
        contents.append(file_part)

        print(f"Starte Stream für Gemini (Modell: {MODEL_NAME}). MimeType: {file_mimetype}.")

        # --- Streaming Generator Function ---
        def generate_chunks():
            """Yields text chunks from the Gemini API stream."""
            try:
                response_stream = model.generate_content(contents, stream=True)
                for chunk in response_stream:
                    if chunk.text: yield chunk.text
                    elif not chunk.candidates and not (chunk.prompt_feedback and chunk.prompt_feedback.block_reason):
                            print(f"Leerer Stream-Chunk ohne Fehler empfangen.")
                print("Stream beendet.")
            except genai.types.BlockedPromptException as e:
                 print(f"Stream blockiert (BlockedPromptException): {e}")
                 yield f'<<ERROR: Anfrage blockiert (Sicherheit)>>'
            except genai.types.StopCandidateException as e:
                 reason = e.candidate.finish_reason.name if (e.candidate and e.candidate.finish_reason) else "Unbekannt"
                 print(f"Stream gestoppt (StopCandidateException - {reason}): {e}")
                 yield f'<<ERROR: Anfrage gestoppt ({reason})>>'
            except Exception as e:
                print(f"Fehler während des Streamings: {type(e).__name__}: {e}")
                traceback.print_exc()
                yield f'<<ERROR: Serverfehler während der Verarbeitung>>'

        return Response(stream_with_context(generate_chunks()), mimetype='text/plain; charset=utf-8')

    except Exception as e:
        print(f"Fehler vor dem Streamen in /process_image: {type(e).__name__}: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Ein Serverfehler ist vor der Verarbeitung aufgetreten."}), 500

# --- Run the Flask Application ---
if __name__ == '__main__':
    if model is None:
        print("\n*** Flask Server kann nicht gestartet werden: Gemini Modell konnte nicht initialisiert werden. ***\n")
    else:
        print("Starte Flask Server...")
        app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)