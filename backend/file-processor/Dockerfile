FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-core.txt ./
RUN pip install --no-cache-dir -r requirements-core.txt

COPY . .

RUN mkdir -p /app/temp /app/uploads /tmp/transformers_cache /tmp/torch_home

EXPOSE 8000

CMD ["python", "main.py"]
