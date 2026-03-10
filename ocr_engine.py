import faulthandler
faulthandler.enable()

import threading
import uuid
import time
import cv2
import numpy as np
from pathlib import Path

# Job storage
jobs = {}
jobs_lock = threading.Lock()

# Batch storage
batches = {}
batches_lock = threading.Lock()

# Analyzer singleton
_analyzer = None
_analyzer_lock = threading.Lock()
_analyzer_loading = False


def get_analyzer():
    global _analyzer, _analyzer_loading
    if _analyzer is not None:
        return _analyzer

    with _analyzer_lock:
        if _analyzer is not None:
            return _analyzer
        _analyzer_loading = True
        from yomitoku import DocumentAnalyzer
        _analyzer = DocumentAnalyzer(
            device="cpu",
            configs={
                "ocr": {
                    "text_detector": {"infer_onnx": True},
                    "text_recognizer": {"infer_onnx": True},
                },
                "layout_analyzer": {
                    "layout_parser": {"infer_onnx": True},
                    "table_structure_recognizer": {"infer_onnx": True},
                },
            },
        )
        _analyzer_loading = False
        return _analyzer


def create_job(file_path):
    job_id = str(uuid.uuid4())[:8]
    with jobs_lock:
        jobs[job_id] = {
            "status": "pending",
            "file_path": file_path,
            "current_page": 0,
            "page_count": 0,
            "results": [],
            "images": [],
            "error": None,
        }
    return job_id


def get_job(job_id):
    with jobs_lock:
        return jobs.get(job_id)


def start_ocr(job_id):
    thread = threading.Thread(target=_run_ocr, args=(job_id,), daemon=True)
    thread.start()


def _run_ocr(job_id):
    job = get_job(job_id)
    if not job:
        return

    file_path = job["file_path"]
    ext = Path(file_path).suffix[1:].lower()

    try:
        # Update status to loading model
        with jobs_lock:
            jobs[job_id]["status"] = "loading_model"

        analyzer = get_analyzer()

        # Load file
        if ext == "pdf":
            from yomitoku.data.functions import load_pdf
            pages = load_pdf(file_path, dpi=200)
        else:
            from yomitoku.data.functions import load_image
            pages = load_image(file_path)

        with jobs_lock:
            jobs[job_id]["page_count"] = len(pages)
            jobs[job_id]["status"] = "processing"

        results = []
        images = []

        for i, page_img in enumerate(pages):
            with jobs_lock:
                jobs[job_id]["current_page"] = i + 1

            # Run OCR (thread-safe via analyzer lock)
            with _analyzer_lock:
                result, ocr_vis, layout_vis = analyzer(page_img)

            # Store result as dict
            result_dict = result.model_dump()
            results.append(result_dict)

            # Convert BGR image to RGB for later JPEG encoding
            images.append(page_img)

        with jobs_lock:
            jobs[job_id]["status"] = "done"
            jobs[job_id]["results"] = results
            jobs[job_id]["images"] = images

    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = str(e)


def create_batch(file_entries):
    """Create a batch of OCR jobs for consultation sheets.
    file_entries: list of {"name": filename, "path": filepath}
    """
    batch_id = str(uuid.uuid4())[:8]
    job_ids = []
    for entry in file_entries:
        jid = create_job(entry["path"])
        with jobs_lock:
            jobs[jid]["source_name"] = entry["name"]
        job_ids.append(jid)

    with batches_lock:
        batches[batch_id] = {
            "job_ids": job_ids,
            "status": "processing",
            "structured": {},  # job_id -> structured data
        }

    # Start OCR for all files sequentially in background
    thread = threading.Thread(target=_run_batch_ocr, args=(batch_id,), daemon=True)
    thread.start()

    return batch_id


def get_batch(batch_id):
    with batches_lock:
        return batches.get(batch_id)


def _run_batch_ocr(batch_id):
    batch = get_batch(batch_id)
    if not batch:
        return

    for job_id in batch["job_ids"]:
        _run_ocr(job_id)

    with batches_lock:
        batches[batch_id]["status"] = "done"


def get_page_image_jpeg(job_id, page_idx):
    job = get_job(job_id)
    if not job or page_idx >= len(job["images"]):
        return None
    img = job["images"][page_idx]
    # BGR to RGB for display, then encode as JPEG
    img_rgb = img[:, :, ::-1]
    from PIL import Image
    import io
    pil_img = Image.fromarray(img_rgb)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf
