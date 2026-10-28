FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/app/.venv/bin:$PATH
WORKDIR /app
RUN python -m venv /app/.venv
COPY apps/api/requirements.lock /app/apps/api/requirements.lock
RUN python -m pip install --no-cache-dir -r /app/apps/api/requirements.lock
COPY packages/pfd-core /app/packages/pfd-core
RUN python -m pip install --no-cache-dir /app/packages/pfd-core
COPY apps/api /app/apps/api
COPY examples /app/examples
RUN useradd --system --uid 10001 --create-home pfdkit && chown -R pfdkit:pfdkit /app
USER pfdkit
WORKDIR /app/apps/api
EXPOSE 8000
