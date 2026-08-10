from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
import magic
import os
import shutil
import zipfile
import tempfile
import uvicorn

app = FastAPI(title="NexusAI File Processor")

MAX_TEXT_CHARS = 200_000

SUPPORTED_TYPES = {
    "text/plain": "text",
    "text/csv": "text",
    "text/html": "text",
    "text/markdown": "text",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "docx",
    "application/vnd.ms-excel": "xlsx",
    "application/vnd.ms-powerpoint": "pptx",
    "image/jpeg": "image",
    "image/png": "image",
    "image/gif": "image",
    "image/webp": "image",
    "image/bmp": "image",
    "audio/mpeg": "audio",
    "audio/wav": "audio",
    "audio/ogg": "audio",
    "audio/mp4": "audio",
    "video/mp4": "video",
    "video/avi": "video",
    "video/quicktime": "video",
    "video/webm": "video",
    "application/zip": "zip",
}

# Plain-text files read directly (by extension — Windows browsers often report
# these as application/octet-stream, so magic alone is unreliable).
TEXT_EXTENSIONS = {
    ".txt", ".csv", ".tsv", ".md", ".markdown", ".html", ".htm", ".json",
    ".xml", ".yml", ".yaml", ".log", ".ini", ".cfg", ".conf", ".toml", ".env",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".h", ".cpp", ".hpp",
    ".cs", ".go", ".rb", ".php", ".sh", ".bash", ".sql", ".css", ".scss",
    ".less", ".ipynb", ".swift", ".kt", ".lua", ".pl", ".r", ".dart", ".vue",
    ".svelte", ".rst", ".tex", ".gitignore", ".dockerfile",
}

TEMP_DIR = "/app/temp"
os.makedirs(TEMP_DIR, exist_ok=True)


def _read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read(MAX_TEXT_CHARS)


def _extract_pdf(path: str) -> str:
    try:
        import fitz
        doc = fitz.open(path)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    except ImportError:
        return "PDF processing requires PyMuPDF"
    except Exception as e:
        return f"PDF error: {e}"


def _extract_docx(path: str) -> str:
    try:
        from docx import Document
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs)
    except ImportError:
        return "DOCX processing requires python-docx"
    except Exception as e:
        return f"DOCX error: {e}"


def _extract_xlsx(path: str) -> str:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        parts = []
        for ws in wb.worksheets:
            rows = []
            for row in ws.iter_rows(values_only=True):
                vals = [str(c) for c in row if c is not None]
                if vals:
                    rows.append("\t".join(vals))
            parts.append(f"--- Sheet: {ws.title} ---\n" + "\n".join(rows))
        wb.close()
        return "\n".join(parts)
    except ImportError:
        return "XLSX processing requires openpyxl"
    except Exception as e:
        return f"XLSX error: {e}"


def _extract_pptx(path: str) -> str:
    try:
        from pptx import Presentation
        prs = Presentation(path)
        parts = []
        for i, slide in enumerate(prs.slides, 1):
            texts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        t = "".join(run.text for run in para.runs)
                        if t:
                            texts.append(t)
                if getattr(shape, "has_table", False) and shape.has_table:
                    for row in shape.table.rows:
                        texts.append("\t".join(cell.text for cell in row.cells))
            parts.append(f"--- Slide {i} ---\n" + "\n".join(texts))
        return "\n".join(parts)
    except ImportError:
        return "PPTX processing requires python-pptx"
    except Exception as e:
        return f"PPTX error: {e}"


def _extract_image(path: str) -> str:
    try:
        import easyocr
        reader = easyocr.Reader(["en"])
        result = reader.readtext(path)
        return "\n".join(r[1] for r in result)
    except ImportError:
        return "Image OCR requires EasyOCR (not installed in this image)"
    except Exception as e:
        return f"Image OCR error: {e}"


def _extract_audio(path: str) -> str:
    try:
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(path)
        return result.get("text", "")
    except ImportError:
        return "Audio transcription requires openai-whisper (not installed in this image)"
    except Exception as e:
        return f"Audio transcription error: {e}"


def extract_zip(zip_path: str, depth: int = 0) -> str:
    """Recursively extract text from every readable file inside a ZIP."""
    if depth > 3:
        return "[Nested archives too deep]"
    parts = []
    try:
        with zipfile.ZipFile(zip_path) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
            infos.sort(key=lambda i: i.filename)
            for info in infos:
                name = info.filename
                base = os.path.basename(name)
                if not base or base.startswith(".") or base == ".DS_Store" or "__MACOSX" in name:
                    continue
                sub_dir = tempfile.mkdtemp(dir=TEMP_DIR)
                try:
                    target = os.path.join(sub_dir, base)
                    with zf.open(name) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    if os.path.splitext(base)[1].lower() == ".zip":
                        text = extract_zip(target, depth + 1)
                    else:
                        text = extract_text_from_file(target, depth + 1)
                    if text and text.strip():
                        parts.append(f"\n===== {name} =====\n{text}")
                except Exception as e:
                    parts.append(f"\n===== {name} =====\n[Error: {e}]")
                finally:
                    shutil.rmtree(sub_dir, ignore_errors=True)
    except zipfile.BadZipFile:
        return "[Not a valid ZIP archive]"
    except Exception as e:
        return f"[ZIP error: {e}]"

    out = "\n".join(parts)
    return out[:MAX_TEXT_CHARS]


def extract_text_from_file(path: str, depth: int = 0) -> str:
    """Extract readable text from a file, dispatching on extension first (more
    reliable than MIME for files uploaded from Windows browsers), then MIME."""
    ext = os.path.splitext(path)[1].lower()
    try:
        mime = magic.from_file(path, mime=True)
    except Exception:
        mime = ""

    if ext in TEXT_EXTENSIONS or mime.startswith("text/"):
        return _read_text(path)
    if ext == ".pdf" or mime == "application/pdf":
        return _extract_pdf(path)
    if ext in (".docx", ".doc") or "wordprocessingml" in mime or mime == "application/msword":
        return _extract_docx(path)
    if ext in (".xlsx", ".xls") or "spreadsheetml" in mime or mime == "application/vnd.ms-excel":
        return _extract_xlsx(path)
    if ext in (".pptx", ".ppt") or "presentationml" in mime or mime == "application/vnd.ms-powerpoint":
        return _extract_pptx(path)
    if ext == ".zip" or mime == "application/zip":
        return extract_zip(path, depth)
    if mime.startswith("image/"):
        return _extract_image(path)
    if mime.startswith("audio/"):
        return _extract_audio(path)
    return "[No extractable text for this file type]"


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/supported-types")
async def supported_types():
    return {"types": list(SUPPORTED_TYPES.keys())}


@app.post("/process")
async def process_file(
    file: UploadFile = File(...),
    generate_embeddings: bool = Form(False),
    include_metadata: bool = Form(False)
):
    file_type = magic.from_buffer(await file.read(2048), mime=True)
    await file.seek(0)

    category = SUPPORTED_TYPES.get(file_type, "unknown")

    temp_path = os.path.join(TEMP_DIR, os.path.basename(file.filename or "upload"))
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        extracted_text = extract_text_from_file(temp_path)
    except Exception as e:
        extracted_text = f"Error processing file: {str(e)}"
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    response = {"text": extracted_text[:MAX_TEXT_CHARS]}

    if include_metadata:
        response["metadata"] = {
            "filename": file.filename,
            "mime_type": file_type,
            "category": category,
            "size": file.size if hasattr(file, "size") else 0,
        }

    return JSONResponse(content=response)


@app.post("/process-path")
async def process_file_path(
    file_path: str,
    generate_embeddings: bool = False,
    include_metadata: bool = False
):
    if not os.path.exists(file_path):
        return JSONResponse(content={"error": "File not found"}, status_code=404)

    try:
        extracted_text = extract_text_from_file(file_path)
    except Exception as e:
        extracted_text = f"Error processing file: {str(e)}"

    return JSONResponse(content={"text": extracted_text[:MAX_TEXT_CHARS]})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
