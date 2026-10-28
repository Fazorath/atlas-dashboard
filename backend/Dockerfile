FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so app edits don't invalidate the install layer.
# pyproject.toml is the one dependency list; only its deps are installed here
# (not the package itself, which would need app/ and break the layer cache).
COPY pyproject.toml ./
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
 && pip install --no-cache-dir -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt

# Schedule photos (ADR 0006): off unless built with WITH_VISION=true (or 1/yes/on), so a
# default install carries no OpenCV or Tesseract.
ARG WITH_VISION=false
RUN case "$WITH_VISION" in \
      [Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn]) with_vision=1 ;; \
      *) with_vision= ;; \
    esac; \
    if [ -n "$with_vision" ]; then \
      apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
      && rm -rf /var/lib/apt/lists/* \
      && python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['optional-dependencies']['vision']))" > /tmp/vision.txt \
      && pip install --no-cache-dir -r /tmp/vision.txt && rm /tmp/vision.txt; \
    fi

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
