FROM python:3.11

WORKDIR /app

# System dependencies (OpenCV needs libGL, PyTorch needs libgomp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only first (smaller than GPU version)
RUN pip install --no-cache-dir \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download all 4 yomitoku AI models into the image
RUN python -m yomitoku.cli.download_model

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Thread control — match CPU count (4 vCPU on Cloud Run)
ENV OMP_NUM_THREADS=4
ENV MKL_NUM_THREADS=4
ENV TORCH_NUM_THREADS=4
ENV ORT_NUM_THREADS=4
ENV ONNXRUNTIME_NUM_THREADS=4
ENV OPENBLAS_NUM_THREADS=4
ENV PYTHONUNBUFFERED=1

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

EXPOSE ${PORT}

# Use gunicorn for production
CMD exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 2 --timeout 300 app:app
