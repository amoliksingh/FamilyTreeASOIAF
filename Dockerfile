# Stage 1 — build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2 — Python backend + built frontend
FROM python:3.12-slim
WORKDIR /app
COPY backend/ ./backend/
COPY ASOIAF.ged ./
COPY --from=frontend-builder /frontend/dist ./frontend/dist
RUN pip install --no-cache-dir -r backend/requirements.txt
WORKDIR /app/backend
CMD sh -c "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
