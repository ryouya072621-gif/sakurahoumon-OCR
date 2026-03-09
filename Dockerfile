FROM python:3.11-slim

WORKDIR /app

# System dependencies for OpenCV and other libs
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

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

EXPOSE ${PORT}

# Use gunicorn for production
CMD exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 2 --timeout 300 app:app
