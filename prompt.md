# PROMPT.md — AI Mini-Training Demo (Product Validation MVP)

## Context / Goal
We are building a **functional demo** (MVP) to validate a product idea: an **AI-powered Operational Mini-Training module** integrated into a larger HR/workplace-like platform.

The demo must be accessible publicly via URL:
- **Frontend** will be deployed on **Vercel**.
- **Backend (FastAPI) + AI processing** will be deployed outside Vercel (Render/Fly/VM).
- The MVP should be **fast to build** but demonstrate the core value convincingly.

### Core Value Proposition (what the demo must prove)
1. A user can upload a **short operational video (<= 5 minutes)** (e.g., a recipe procedure).
2. The system generates a **structured mini training** and a **quiz** strongly grounded in the uploaded video.
3. The quiz must include **verifiable evidence** (timestamps + transcript quotes), so it’s clear the model is not inventing content.
4. The training is indexed for **semantic search** (query like: “elaboración de chocotorta”).
5. The training can be assigned to users and tracked (completion/score).
6. Incidents/tasks can be linked to trainings; incidents trigger suggested trainings via semantic similarity.

> Critical requirement: **Outputs must be based on the user-provided inputs only** (video/transcript/prompt/manual questions). Do NOT use internet browsing or external sources.

---

## Product Scope (MVP Demo)
We will implement the following flows:

### A) Create Mini Training (main flow)
Inputs:
- Upload video (<= 5 min)
- Optional prompt/guidelines for quiz generation
- Optional manual questions provided by the author

Outputs:
- Training content (title, objectives, step-by-step procedure, critical points)
- Quiz questions (MCQ + situational), each with evidence:
  - `chunk_id`
  - `start_time`, `end_time`
  - `quote` (literal snippet from transcript)
- Persist transcript + chunks + embeddings for future search

The author can iterate:
- “Make it shorter”
- “Add more situational questions”
- “Focus on kitchen staff”
Iterations should update the draft and re-verify evidence.

### B) Semantic Search

Search must run over **semantic_segments** instead of raw transcript.

Each segment contains:

- transcript
- frame captions
- OCR text (optional)

Query flow:

User Query
   ↓
Embedding
   ↓
Vector similarity search over semantic_segments
   ↓
Top segments returned with:
  - training
  - snippet
  - timestamp
  - frame preview (optional)

### C) Assignments & Tracking
- Assign training to individual users or by simple segment (role/location).
- Track: assigned/in_progress/completed/overdue, score, attempts, timestamps.

### D) Dashboard (simple)
- Completion rate per training
- Overdue list
- Average score per training
- Top incidents and linked trainings

### E) Tasks + Incidents
- Create operational tasks/SOP and link trainings
- Create incidents and suggest relevant trainings using semantic search

---

## Architecture Decisions (Demo-First)
### Repo structure: MONOREPO
Single repo with frontend + backend:
ai-training-demo/
apps/
api/ # FastAPI backend
web/ # React + Vite frontend
infra/
docker-compose.local.yml # local dev convenience

### Deployment
- **Web**: Vercel
- **API**: Render or Fly.io (always-on, not serverless)
- **DB**: Supabase Postgres (recommended) or Railway Postgres
- **Storage**: Cloudflare R2 (recommended) or AWS S3 (S3-compatible)
- **Vector Search**: pgvector in Postgres (recommended) OR store embeddings in a compatible vector store if pgvector not available

### Why not Vercel backend?
- We need large uploads + long-running processing (ASR + quiz generation), which is not suitable for Vercel serverless limits.
- Storage must be external (Vercel filesystem is ephemeral).

---

## Storage & Upload Flow (must implement)
We must support large video uploads from browser efficiently:

1) Frontend requests a **presigned upload URL** from backend:
   - `POST /uploads/presign`
2) Frontend uploads video directly to S3/R2 using the presigned URL.
3) Frontend notifies backend to register the asset:
   - `POST /trainings/{id}/assets`

Do NOT stream video through backend.

---

## Database & Data Model (minimal)
Use Postgres tables (names can vary but keep these concepts):

- users (id, name, email, role, location)
- trainings (id, title, status[draft/published], created_by, created_at, updated_at)
- training_assets (id, training_id, type(video/pdf/image), storage_key, mime, size)
- training_transcripts (training_id, transcript_raw, language, created_at)
- training_chunks (id, training_id, chunk_index, text, start_time, end_time, embedding vector)
- training_structure (training_id, structure_json)  # steps/concepts/critical_points WITH evidence
- quiz_questions (id, training_id, question_json)  # includes evidence referencing chunk_id + timestamps + quote
- jobs (id, type, status, progress, error, created_at, updated_at)  # pipeline progress tracking
- assignments (id, training_id, user_id, due_date, status, score, attempts, started_at, completed_at)
- tasks (id, title, description, role?, location?, embedding vector)
- task_training_links (task_id, training_id)
- incidents (id, description, severity, role?, location?, created_by, created_at, embedding vector)
- incident_training_links (incident_id, training_id, source[suggested/manual], confidence)
- video_frames (id, training_id, timestamp, storage_key, caption)
- semantic_segments (id, training_id, start_time, end_time, text_fused, embedding vector)

Vector storage:
- Use pgvector columns for embeddings (chunks, tasks, incidents, optionally training global embedding).

---

## AI Pipeline (Multimodal, grounded, verifiable)

We implement a multi-stage pipeline to reduce hallucinations
The system must understand both **audio and visual information** from the video.
Operational procedures often rely on what is shown visually, not only what is spoken.

Therefore the pipeline must extract **three signals**:

1. Audio transcript
2. Visual frames
3. Combined semantic segments

### Stage 1: Transcription (ASR)

Extract transcript from the uploaded video with timestamps.

Store segments like:

{
  "start_time": "00:12",
  "end_time": "00:18",
  "text": "now we dip the cookies in coffee"
}

### Stage 2: Frame Sampling (Visual Context)

Extract frames from the video every 3–5 seconds.

Example:

video.mp4
 ├ frame_00:05
 ├ frame_00:10
 ├ frame_00:15

Each frame should be processed with an image captioning model to produce a description.

Example output:

{
  "timestamp": "00:15",
  "caption": "person dipping cookies in coffee"
}

Optional:
- OCR if text appears in the frame.

### Stage 3: Segment Builder (Audio + Visual Fusion)

Create semantic segments by merging:

- transcript segments
- frame captions
- OCR (optional)

Example:

{
  "segment_id": "seg_12",
  "start": "02:10",
  "end": "02:20",
  "text_fused": "Instructor warns not to soak cookies too long. Frame shows cookies dipped briefly in coffee.",
  "transcript_refs": ["t_57"],
  "frame_refs": ["f_130"]
}

These segments are the main semantic unit for indexing and retrieval.

### Stage 4: Embedding & Indexing

Generate embeddings for `segment.text_fused`.

Store them in pgvector.

These embeddings power:

- semantic search
- training suggestions
- quiz grounding

#### Video Semantic Indexing

Video
 ├─ Transcription (audio)
 ├─ Frame Sampling (visual)
 └─ OCR (optional)
        │
        ▼
Segment Builder
(audio + visual fusion)
        │
        ▼
Embeddings
        │
        ▼
Vector Index
(pgvector)
        │
        ▼
Search / Quiz / Suggestions

### Stage 5: Knowledge Extractor

Extract structured knowledge from segments:

- steps
- concepts
- critical_points

Each item must reference segments as evidence.

### Stage 6: Coverage Planner

Ensure quiz questions cover:

- critical points
- main steps
- important mistakes

Question type intent:

- `mcq`: direct factual or procedural recall
- other types may be supported later, but the current rollout should plan only `mcq` questions

### Stage 7: Quiz Generator

Generate quiz questions grounded in segments.

Question rules:

- Every question must be auto-gradable
- Every question must include exactly 4 options
- Every question must include a single `correct_answer` index
- For now, generate only `mcq` questions even though the schema keeps a `type` field for future expansion
- In iterate mode, provide the latest generated quiz as context so author instructions can refer to existing question numbers or request targeted rewrites

Each question must include evidence:

{
  "segment_id": "...",
  "start_time": "...",
  "end_time": "...",
  "quote": "..."
}

### Stage 8: Verifier

Validate:

- quote exists in transcript
- segment_id exists
- timestamps are valid
- coverage is acceptable

If validation fails → regenerate missing questions.

### Stage 9: Training Ready

The training is marked READY once:

- segments indexed
- quiz validated
- embeddings stored

## Job/Status Model (for UI)
Pipeline should run asynchronously (in-process background is fine for MVP).
Expose job status:

Statuses:
- UPLOADED
- TRANSCRIBING
- CHUNKING
- EXTRACTING
- PLANNING
- GENERATING_QUIZ
- VERIFYING
- INDEXING
- READY
- FAILED

Endpoints:
- `POST /trainings/{id}/generate` → returns {job_id}
- `GET /jobs/{job_id}` → {status, progress, logs?, error?}

---

## APIs to Implement (minimal)
### Upload
- `POST /uploads/presign` → returns presigned_url, storage_key
- `POST /uploads/complete` (optional) → validate & finalize

### Training CRUD
- `POST /trainings`
- `GET /trainings/{id}`
- `POST /trainings/{id}/assets`
- `POST /trainings/{id}/generate`  (runs AI pipeline)
- `POST /trainings/{id}/iterate`   (instruction-based update; re-verify)
- `POST /trainings/{id}/publish`   (optional for demo)

### Search
- `GET /trainings/search?q=...` → returns ranked trainings + snippet + timestamp

### Assignments
- `POST /assignments` (by user_ids or role/location)
- `GET /assignments?filters...`
- `POST /assignments/{id}/submit` (quiz answers; compute score)

### Tasks + Incidents
- `POST /tasks`
- `POST /tasks/{id}/suggest-trainings`
- `POST /incidents`
- `GET /incidents/{id}/suggest-trainings`
- `POST /incidents/{id}/link-training`

### Dashboard
- `GET /dashboard`

---

## Frontend (React + Vite)
Pages:
1. Training Builder:
   - create training
   - upload video via presigned URL
   - “Generate Draft”
   - show job progress
   - show generated structure + quiz with evidence
   - iterate with instruction text area
2. Search:
   - query and list results with snippet + timestamp
3. Assignments:
   - list + assign (simple UI)
4. Dashboard:
   - completion rate, overdue, avg score
5. Tasks + Incidents:
   - create incident and show suggested trainings

Keep UI simple but functional.

---

## Constraints & Non-goals (MVP)
- Limit video duration to <= 5 minutes (reject longer uploads).
- No real notifications (email/whatsapp) needed.
- No multi-language full coverage required (translation optional).
- No advanced analytics.
- No microservices. One backend service is enough.
- No internet browsing or external knowledge sources.

---

## Implementation Plan (Milestones)
1) Repo scaffolding: apps/api + apps/web + infra local dev
2) Backend: DB models + migrations + basic CRUD
3) Storage: presigned upload + asset registration
4) AI pipeline stages + jobs status
5) Semantic search (pgvector)
6) Frontend pages (builder + progress + preview)
7) Assignments + dashboard
8) Tasks/incidents + suggestion flow

---

## Coding Guidelines
- Use clean modular structure in backend:
  - routers/controllers
  - services (training_service, ai_pipeline_service, search_service)
  - db models + repositories
- Use pydantic models for request/response schemas.
- Enforce JSON outputs for LLM steps with strict schema validation.
- Always store and reference evidence in quiz items.
- Add basic error handling and clear API responses.

---

## Deliverable
A working demo that can be tested from any computer via URL:
- User uploads a short video
- System generates a grounded quiz with evidence
- User can search for trainings semantically
- User can assign training and see completion/score
- User can report an incident and see suggested trainings

### MVP Simplification

To keep the demo simple:

- Video length limit: 5 minutes
- Frame sampling interval: 3 seconds
- Segment window: ~10 seconds
- No heavy CV models required

Frame captions can be generated with a multimodal LLM.