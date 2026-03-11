# AI Mini-Training Platform

Plataforma para generar mini-capacitaciones a partir de videos operativos cortos (\<= 5 min). La IA analiza el video, extrae la estructura del contenido y genera evaluaciones con evidencia verificable (timestamps, citas del transcript).

## Stack

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Query |
| Backend | FastAPI, SQLAlchemy (async), Alembic |
| Base de datos | PostgreSQL 16 + pgvector |
| Storage | MinIO (local) / Cloudflare R2 (producción) |
| IA | Adaptadores por perfil: OpenAI (PAID) / Gemini (FREE) |

## Estructura del proyecto

```
huckathon/
├── apps/
│   ├── api/          # Backend FastAPI
│   │   ├── app/
│   │   │   ├── core/       # Config, seguridad, dependencias
│   │   │   ├── models/     # Modelos SQLAlchemy
│   │   │   ├── routers/    # Endpoints de la API
│   │   │   ├── schemas/    # Schemas Pydantic
│   │   │   └── services/   # Lógica de negocio (AI pipeline, storage, search)
│   │   ├── alembic/        # Migraciones de BD
│   │   └── seed.py         # Datos iniciales
│   └── web/          # Frontend React + Vite
│       └── src/
│           ├── pages/      # Páginas de la app
│           ├── components/ # Componentes compartidos
│           └── services/   # Cliente API (axios)
├── infra/
│   └── docker-compose.local.yml  # Postgres + MinIO
└── prompt.md                     # Especificación del producto
```

## Requisitos previos

- **Docker** y **Docker Compose**
- **Python 3.13+**
- **Node.js 18+** y **npm**
- **FFmpeg** (incluye `ffmpeg` y `ffprobe`)
- Una API key del proveedor de IA elegido:
  - **OpenAI** si `AI_PROFILE=PAID`
  - **Gemini** si `AI_PROFILE=FREE`

## Levantar el proyecto

### 1. Infraestructura (PostgreSQL + MinIO)

```bash
cd infra
docker compose -f docker-compose.local.yml up -d
```

Esto levanta:
- **PostgreSQL** en `localhost:5432` (user: `postgres`, password: `postgres`, db: `ai_training`)
- **MinIO** en `localhost:9000` (API) y `localhost:9001` (consola web, user: `minioadmin`, password: `minioadmin`)

Crear el bucket de storage:

```bash
docker exec infra-minio-1 mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec infra-minio-1 mc mb local/ai-training-assets
```

### 2. Backend (FastAPI)

```bash
cd apps/api

# Crear y activar entorno virtual
python -m venv .venv
source .venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp ../../.env.example .env
# Editar .env y configurar AI_PROFILE + API key del proveedor elegido
```

Ejecutar migraciones y datos iniciales:

```bash
alembic upgrade head
python seed.py
```

Iniciar el servidor:

```bash
uvicorn app.main:app --reload --port 8000
```

La API queda disponible en `http://localhost:8000`. Documentación interactiva en `http://localhost:8000/docs`.

### 3. Frontend (React + Vite)

```bash
cd apps/web

npm install
npm run dev
```

La app queda disponible en `http://localhost:5173`. El dev server de Vite proxea `/api/*` al backend en el puerto 8000.

## Usuarios de prueba

El script `seed.py` crea estos usuarios:

| Email | Password | Rol | Ubicación |
|-------|----------|-----|-----------|
| `admin@demo.com` | `admin123` | admin | Buenos Aires |
| `carlos@demo.com` | `demo123` | kitchen | Buenos Aires |
| `ana@demo.com` | `demo123` | employee | Córdoba |
| `luis@demo.com` | `demo123` | supervisor | Buenos Aires |

## Variables de entorno

Copiar `.env.example` a `apps/api/.env` y configurar:

| Variable | Descripción | Default (local) |
|----------|-------------|-----------------|
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql+asyncpg://postgres:postgres@localhost:5432/ai_training` |
| `JWT_SECRET_KEY` | Clave para firmar tokens JWT | `change-me-in-production` |
| `JWT_EXPIRATION_MINUTES` | Duración del token en minutos | `1440` (24 hs) |
| `AI_PROFILE` | Perfil de proveedor IA (`PAID`/`FREE`) | `PAID` |
| `OPENAI_API_KEY` | API Key OpenAI (si `AI_PROFILE=PAID`) | — |
| `OPENAI_MODEL_TEXT` | Modelo para generación JSON (OpenAI) | `gpt-4o` |
| `OPENAI_MODEL_CAPTION` | Modelo para caption de frames (OpenAI) | `gpt-4o-mini` |
| `OPENAI_MODEL_TRANSCRIBE` | Modelo para transcripción (OpenAI) | `whisper-1` |
| `OPENAI_MODEL_EMBEDDING` | Modelo para embeddings (OpenAI) | `text-embedding-3-large` |
| `AI_EMBEDDING_DIM` | Dimensión esperada de embeddings en pgvector | `3072` |
| `OPENAI_COST_TEXT_INPUT_PER_1M` | Costo USD por 1M tokens de entrada (texto) | `0` |
| `OPENAI_COST_TEXT_OUTPUT_PER_1M` | Costo USD por 1M tokens de salida (texto) | `0` |
| `OPENAI_COST_EMBED_INPUT_PER_1M` | Costo USD por 1M tokens de entrada (embeddings) | `0` |
| `OPENAI_COST_TRANSCRIBE_PER_MINUTE` | Costo USD por minuto de audio transcripto | `0` |
| `GEMINI_API_KEY` | API Key Gemini (si `AI_PROFILE=FREE`) | — |
| `GEMINI_BASE_URL` | Base URL API Gemini | `https://generativelanguage.googleapis.com/v1beta` |
| `GEMINI_MODEL_TEXT` | Modelo para generación JSON (Gemini) | `gemini-2.5-flash` |
| `GEMINI_MODEL_CAPTION` | Modelo para caption de frames (Gemini) | `gemini-2.5-flash` |
| `GEMINI_MODEL_TRANSCRIBE` | Modelo para transcripción (Gemini) | `gemini-2.5-flash` |
| `GEMINI_MODEL_EMBEDDING` | Modelo para embeddings (Gemini) | `gemini-embedding-001` |
| `GEMINI_MIN_REQUEST_INTERVAL_SECONDS` | Intervalo mínimo entre requests a Gemini | `12` |
| `GEMINI_MAX_RETRIES` | Reintentos máximos para errores transitorios | `3` |
| `GEMINI_RETRY_BASE_SECONDS` | Backoff base (segundos) para retries | `2` |
| `GEMINI_COST_TEXT_INPUT_PER_1M` | Costo USD por 1M tokens de entrada (texto) | `0` |
| `GEMINI_COST_TEXT_OUTPUT_PER_1M` | Costo USD por 1M tokens de salida (texto) | `0` |
| `GEMINI_COST_EMBED_INPUT_PER_1M` | Costo USD por 1M tokens de entrada (embeddings) | `0` |
| `GEMINI_COST_TRANSCRIBE_PER_MINUTE` | Costo USD por minuto de audio/video transcripto | `0` |
| `S3_ENDPOINT_URL` | Endpoint S3-compatible | `http://localhost:9000` |
| `S3_ACCESS_KEY_ID` | Access key de S3/MinIO | `minioadmin` |
| `S3_SECRET_ACCESS_KEY` | Secret key de S3/MinIO | `minioadmin` |
| `S3_BUCKET_NAME` | Nombre del bucket | `ai-training-assets` |
| `S3_PUBLIC_URL` | URL pública del bucket | `http://localhost:9000/ai-training-assets` |
| `CORS_ORIGINS` | Orígenes permitidos (separados por coma) | `http://localhost:5173` |

## Switch FREE/PAID

Configurar en `apps/api/.env`:

- `AI_PROFILE=PAID` para usar OpenAI
- `AI_PROFILE=FREE` para usar Gemini

Ejemplo PAID:

```env
AI_PROFILE=PAID
OPENAI_API_KEY=sk-...
```

Ejemplo FREE:

```env
AI_PROFILE=FREE
GEMINI_API_KEY=...
```

## Pasar a producción (Cloudflare R2)

El storage usa la API S3-compatible, así que solo hay que cambiar las variables de entorno:

```env
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<tu-r2-access-key>
S3_SECRET_ACCESS_KEY=<tu-r2-secret-key>
S3_BUCKET_NAME=ai-training-assets
S3_PUBLIC_URL=https://<tu-dominio-publico-r2>
```

## API endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/register` | Registrar usuario |
| `POST` | `/auth/login` | Login (devuelve JWT) |
| `GET` | `/trainings` | Listar capacitaciones |
| `POST` | `/trainings` | Crear capacitación |
| `POST` | `/trainings/{id}/generate` | Generar contenido con IA |
| `POST` | `/trainings/{id}/iterate` | Iterar con instrucciones |
| `GET` | `/trainings/{id}/cost-summary` | Resumen de costo/tokens del procesamiento |
| `GET` | `/trainings/search` | Búsqueda semántica |
| `POST` | `/uploads/presign` | Obtener URL pre-firmada para subir archivos |
| `GET/POST` | `/assignments` | Gestionar asignaciones |
| `GET/POST` | `/incidents` | Gestionar incidentes |
| `GET/POST` | `/tasks` | Gestionar tareas |
| `GET` | `/dashboard` | Métricas y estadísticas |
