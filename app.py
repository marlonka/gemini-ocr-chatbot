# Standard library imports
import os
import io
import traceback
import logging # Use logging instead of print

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

# Define allowed models and the default
ALLOWED_MODELS = {
    "gemini-2.5-pro-exp-03-25",
    "gemini-2.0-flash",
    "gemini-2.0-flash-thinking-exp-01-21"
}
DEFAULT_MODEL_NAME = "gemini-2.5-pro-exp-03-25"

# File Handling Config
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}
MAX_FILE_SIZE = 20 * 1024 * 1024 # 20 MB

# AI Model Configuration (applied dynamically)
SYS_INSTRUCTION = """You are a sophisticated OCR assistant. Your task is to accurately extract text from the provided file (image or PDF document).
- Preserve the original formatting as much as possible, including line breaks, paragraphs, and indentations.
- When processing a multi-page PDF, clearly indicate the start of each new page with a marker like '--- Page [PageNumber] ---' on its own line before the content of that page begins. Start with Page 1.
- Respond *only* with the extracted text and the page markers. Do not add introductory or concluding remarks like 'Here is the text...' or 'Document analysis complete.'."""
GENERATION_CONFIG = { "temperature": 0.3 }

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Flask Application Setup ---
app = Flask(__name__, static_folder='static', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# --- Gemini AI Client Setup (Configuration only) ---
sdk_configured_successfully = False
try:
    if not API_KEY:
        raise ValueError("GOOGLE_API_KEY not found in environment variables. Was a .env file created?")
    genai.configure(api_key=API_KEY)
    logging.info("Google Generative AI SDK configured successfully.")
    sdk_configured_successfully = True
except Exception as e:
    logging.critical(f"Fatal Error: Could not configure Gemini SDK ({type(e).__name__}): {e}")
    if "API key" in str(e) or "credential" in str(e).lower():
         logging.critical("-> Please ensure your GOOGLE_API_KEY is correctly set in the .env file and is valid.")
    else:
         logging.exception("-> Unexpected error during SDK configuration.") # Logs traceback

# --- Helper Functions ---
def allowed_file(filename: str) -> bool:
    """Checks if a filename has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Flask Routes ---
@app.route('/')
def index():
    """Serves the main index.html page."""
    if not sdk_configured_successfully:
         # Provide a more user-friendly error message if possible, but keep details in server logs
         return "Error: The AI service could not be initialized. Please check server logs.", 500
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/process_image', methods=['POST'])
def process_image():
    """Handles file uploads and streams OCR results from a dynamically selected Gemini model."""
    if not sdk_configured_successfully:
        logging.error("process_image called but SDK is not configured.")
        return Response('{"error": "AI service is not configured on the server."}', status=500, mimetype='application/json')

    # --- Get Form Data ---
    if 'image' not in request.files:
        logging.warning("Missing 'image' part in request files.")
        return Response('{"error": "No \'image\' part in the request"}', status=400, mimetype='application/json')

    file = request.files['image']
    instructions = request.form.get('instructions', '')
    selected_model_name = request.form.get('model_name', DEFAULT_MODEL_NAME) # Get selected model or use default

    # --- Validate Model Selection ---
    if selected_model_name not in ALLOWED_MODELS:
        logging.warning(f"Invalid model selected by user: {selected_model_name}")
        return Response(f'{{"error": "Invalid AI model selected."}}', status=400, mimetype='application/json')

    # --- Validate File ---
    if file.filename == '':
        logging.warning("No file selected in the request.")
        return Response('{"error": "No file selected"}', status=400, mimetype='application/json')

    file_extension = ''
    if '.' in file.filename:
        file_extension = file.filename.rsplit('.', 1)[1].lower()

    if not allowed_file(file.filename):
         logging.warning(f"Invalid file type uploaded: {file.filename}")
         allowed_types_str = ", ".join(ALLOWED_EXTENSIONS)
         return Response(f'{{"error": "Invalid file type. Allowed: {allowed_types_str}"}}', status=400, mimetype='application/json')

    try:
        # --- Read and Validate File Content ---
        file_bytes = file.read()
        file_mimetype = file.mimetype
        logging.info(f"Received file: {file.filename} ({file_mimetype}), Size: {len(file_bytes)} bytes")

        # Basic validation for non-PDFs using Pillow
        if file_extension != 'pdf':
            try:
                with Image.open(io.BytesIO(file_bytes)) as img:
                    img.verify() # Check for corruption
                    # Double-check format if possible
                    detected_format = img.format.lower() if img.format else 'unknown'
                    logging.info(f"Pillow detected image format: {detected_format}")
                    # Allow common variations for jpeg
                    allowed_image_formats = {'png', 'jpeg', 'webp'}
                    if detected_format not in allowed_image_formats and detected_format != 'unknown':
                         logging.warning(f"Pillow detected disallowed format: {detected_format}")
                         return Response(f'{{"error": "Invalid image format detected: {detected_format}"}}', status=400, mimetype='application/json')
            except UnidentifiedImageError:
                 logging.warning(f"Pillow could not identify image file: {file.filename}")
                 return Response('{"error": "Cannot identify image file. It might be corrupt or unsupported."}', status=400, mimetype='application/json')
            except Exception as pil_error:
                 logging.exception(f"Pillow error processing file {file.filename}")
                 return Response('{"error": "Error processing image data."}', status=400, mimetype='application/json')

        # --- Prepare Content for Gemini ---
        file_part = { "mime_type": file_mimetype, "data": file_bytes }
        contents = []
        if instructions:
            contents.append(f"Additional user instruction: {instructions}")
            logging.info(f"Using additional instructions: {instructions[:100]}...") # Log truncated instructions
        contents.append(file_part)

        logging.info(f"Starting stream for Gemini using model: {selected_model_name}.")

        # --- Initialize Model and Generate Content ---
        try:
            # Initialize model dynamically based on selection FOR THIS REQUEST
            dynamic_model = genai.GenerativeModel(
                selected_model_name,
                generation_config=GENERATION_CONFIG,
                system_instruction=SYS_INSTRUCTION
            )
            logging.info(f"Successfully initialized dynamic model instance: {selected_model_name}")

            # --- Streaming Generator Function ---
            def generate_chunks():
                """Yields text chunks from the Gemini API stream."""
                try:
                    response_stream = dynamic_model.generate_content(contents, stream=True)
                    for chunk in response_stream:
                        if chunk.text:
                            yield chunk.text
                        # Log safety ratings or block reasons if present
                        elif chunk.prompt_feedback and chunk.prompt_feedback.block_reason:
                             logging.warning(f"Stream blocked by API. Reason: {chunk.prompt_feedback.block_reason}")
                             yield f'<<ERROR: Request blocked ({chunk.prompt_feedback.block_reason})>>'
                             break # Stop generation
                        elif chunk.candidates and chunk.candidates[0].finish_reason.name != "STOP":
                             # Log other finish reasons like MAX_TOKENS, SAFETY, RECITATION etc.
                             finish_reason = chunk.candidates[0].finish_reason.name
                             logging.warning(f"Stream stopped prematurely by API. Reason: {finish_reason}")
                             yield f'<<ERROR: Generation stopped ({finish_reason})>>'
                             break # Stop generation

                    logging.info(f"Stream from {selected_model_name} completed successfully.")

                # Handle specific API errors during generation
                except genai.types.BlockedPromptException as e:
                     logging.warning(f"Stream blocked (BlockedPromptException) for model {selected_model_name}: {e}")
                     yield f'<<ERROR: Request blocked (Safety)>>'
                except genai.types.StopCandidateException as e:
                     reason = e.candidate.finish_reason.name if (e.candidate and e.candidate.finish_reason) else "Unknown"
                     logging.warning(f"Stream stopped (StopCandidateException - {reason}) for model {selected_model_name}: {e}")
                     yield f'<<ERROR: Request stopped ({reason})>>'
                except Exception as e:
                    logging.exception(f"Error during streaming with {selected_model_name}") # Logs traceback
                    yield f'<<ERROR: Server error during generation>>'

            return Response(stream_with_context(generate_chunks()), mimetype='text/plain; charset=utf-8')

        except Exception as model_init_error:
            logging.exception(f"Failed to initialize or use Gemini model '{selected_model_name}'")
            return Response(f'{{"error": "Failed to initialize selected AI model."}}', status=500, mimetype='application/json')

    except Exception as e:
        logging.exception(f"Unhandled error in /process_image before streaming") # Logs traceback
        # Return JSON here as streaming hasn't started
        return jsonify({"error": f"A server error occurred before processing could start."}), 500


# --- Run the Flask Application ---
if __name__ == '__main__':
    if not sdk_configured_successfully:
        logging.critical("\n*** Flask server cannot start: Gemini SDK configuration failed. Check logs. ***\n")
    else:
        logging.info("Starting Flask server...")
        # Use threaded=True for handling multiple requests during streaming
        # Set debug=False for production/testing (reloader can interfere with state)
        # Host 0.0.0.0 makes it accessible on the network
        app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)