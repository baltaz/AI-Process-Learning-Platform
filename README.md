# Mento

Plataforma para gestionar procedimientos versionados y generar trainings derivados con IA a partir de videos operativos cortos (\<= 5 min). `Procedure` define el concepto, `ProcedureVersion` concentra el contenido, el video y la inteligencia de fuente (transcript, chunks, frames, embeddings y estructura canónica), y `Training` queda como artefacto derivado 1 a 1 para despliegue y evaluación pedagógica.

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

Para un reset reproducible del nuevo dominio:

```bash
dropdb ai_training --if-exists
createdb ai_training
alembic upgrade head
python seed.py
```

`seed.py` ya no crea el esquema con `Base.metadata.create_all()`: Alembic es el camino principal para bootstrapear la base.

Flujo recomendado del MVP:

```text
1. Crear Procedure
2. Crear ProcedureVersion
3. Subir video fuente a la versión
4. Esperar source processing = READY
5. Generar training derivado
6. Revisar/iterar el training
7. Asignar y medir compliance
```

Iniciar el servidor:

```bash
make dev
```

Si necesitás otro puerto:

```bash
make dev PORT=8010
```

El target `make dev` levanta `uvicorn` con `--reload-dir app` y excluye `.venv` y caches comunes del watcher para evitar reinicios espurios del backend cuando cambian archivos dentro del entorno virtual.

La API queda disponible en `http://localhost:8000`. Documentación interactiva en `http://localhost:8000/docs`.

### 3. Frontend (React + Vite)

```bash
cd apps/web

npm install
npm run dev
```

La app queda disponible en `http://localhost:5173`.

Configuración opcional para apuntar a un backend remoto o evitar el proxy local:

```bash
cd apps/web
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
```

Si `VITE_API_BASE_URL` no está definida, el dev server de Vite sigue usando el proxy `/api/*` al backend en el puerto 8000.

## Usuarios de prueba

El script `seed.py` crea estos usuarios:

| Email | Password | Rol | Ubicación |
|-------|----------|-----|-----------|
| `admin@demo.com` | `admin123` | admin | Buenos Aires |
| `sofia@demo.com` | `demo123` | supervisor | Buenos Aires |
| `carlos@demo.com` | `demo123` | kitchen | Buenos Aires |
| `ana@demo.com` | `demo123` | cashier | Córdoba |

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

Variables de frontend para Vite/Netlify:

| Variable | Descripción | Default local |
|----------|-------------|---------------|
| `VITE_API_BASE_URL` | Base URL absoluta de la API para builds del frontend | `http://localhost:8000` |

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

Además, el bucket debe tener una política CORS que permita `PUT` desde tu frontend de Netlify y `localhost:5173` para que funcionen las uploads con presigned URLs.

Ejemplo:

```json
[
  {
    "AllowedOrigins": [
      "https://<tu-sitio>.netlify.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Deploy recomendado

Arquitectura objetivo:

```text
Netlify (apps/web) -> Railway API (apps/api Docker)
                      -> Railway Postgres con pgvector
                      -> Cloudflare R2
```

### Backend en Railway

1. Crear un servicio nuevo apuntando a este repo.
2. Configurar `Root Directory` como `apps/api`.
3. Usar el `Dockerfile` dentro de `apps/api`.
4. Definir las variables de entorno de backend.
5. Conectar una base PostgreSQL con soporte `pgvector`.
6. Ejecutar `alembic upgrade head`.
7. Opcional: correr `python seed.py` si querés datos demo.

Variables mínimas recomendadas en Railway:

```env
DATABASE_URL=postgresql+asyncpg://...
JWT_SECRET_KEY=<secret-largo>
AI_PROFILE=PAID
OPENAI_API_KEY=sk-...
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<r2-access-key>
S3_SECRET_ACCESS_KEY=<r2-secret-key>
S3_BUCKET_NAME=ai-training-assets
S3_PUBLIC_URL=https://<tu-dominio-publico-r2>
CORS_ORIGINS=https://<tu-sitio>.netlify.app,http://localhost:5173
```

Smoke tests mínimos después del deploy:

```bash
curl https://<tu-api>.up.railway.app/health
```

Verificar además:

- login con un usuario válido
- `POST /uploads/presign`
- upload real al bucket R2
- creación de ProcedureVersion con source asset
- cambio de `source_processing_status` hasta `READY`

Nota operativa: en esta fase los jobs largos siguen corriendo inline dentro del proceso web usando `asyncio.create_task(...)`. Es suficiente para un MVP con una sola réplica, pero un restart del contenedor puede interrumpir trabajos en vuelo.

### Frontend en Netlify

1. Crear un sitio nuevo desde el mismo repo.
2. Configurar `Base directory` como `apps/web`.
3. Usar `npm run build` como build command.
4. Usar `apps/web/dist` como publish directory.
5. Definir `VITE_API_BASE_URL=https://<tu-api>.up.railway.app`.
6. Publicar.

El archivo `netlify.toml` ya deja configurado el rewrite SPA a `index.html`, necesario porque la app usa `BrowserRouter`.

### Checklist de provisión

- Railway API creada desde `apps/api`
- Railway Postgres creada con soporte `vector`
- `alembic upgrade head` ejecutado sin errores
- bucket `ai-training-assets` creado en R2
- CORS del bucket habilitado para Netlify y localhost
- variables de Railway cargadas
- variable `VITE_API_BASE_URL` cargada en Netlify
- `CORS_ORIGINS` del backend incluye el dominio real del frontend

## API endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/register` | Registrar usuario |
| `POST` | `/auth/login` | Login (devuelve JWT) |
| `GET` | `/trainings` | Listar trainings derivados |
| `POST` | `/trainings` | Crear training derivado para una `procedure_version_id` |
| `POST` | `/trainings/{id}/generate` | Generar contenido con IA |
| `POST` | `/trainings/{id}/iterate` | Iterar con instrucciones |
| `GET` | `/trainings/{id}/cost-summary` | Resumen de costo/tokens del procesamiento |
| `GET` | `/procedures/search` | Buscar procedimientos/versiones por significado |
| `POST` | `/uploads/presign` | Obtener URL pre-firmada para subir archivos |
| `POST` | `/procedures/{id}/versions` | Crear una nueva versión de procedimiento |
| `POST` | `/procedures/versions/{id}/source-asset` | Registrar/reemplazar video fuente de una versión y disparar source processing |
| `POST` | `/procedures/versions/{id}/generate-training` | Crear o regenerar el training derivado de una versión ya procesada |
| `GET/POST` | `/assignments` | Gestionar asignaciones |
| `GET/POST` | `/incidents` | Gestionar incidentes |
| `GET/POST` | `/incidents/{id}/analysis-runs` | Guardar y reutilizar memoria de análisis operativo |
| `GET/POST` | `/tasks` | Gestionar tareas |
| `GET` | `/dashboard` | Métricas y estadísticas |
