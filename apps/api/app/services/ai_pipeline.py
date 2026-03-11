import base64
import json
import logging
import os
import shutil
import tempfile
import uuid

from pydantic import ValidationError
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.job import Job
from app.models.quiz import QuizQuestion
from app.models.semantic_segment import SemanticSegment
from app.models.training import (
    Training,
    TrainingAsset,
    TrainingChunk,
    TrainingStructure,
    TrainingTranscript,
)
from app.schemas.generated_content import (
    validate_quiz_question,
    validate_quiz_response,
    validate_training_structure,
)
from app.models.video_frame import VideoFrame
from app.services.ai.provider_factory import get_ai_provider
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.ai.usage_tracking import clear_ai_usage_context, set_ai_usage_context
from app.services.storage_service import download_file, upload_file

logger = logging.getLogger(__name__)

FRAME_INTERVAL_SECONDS = 3
SEGMENT_WINDOW_SECONDS = 10
QUIZ_RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["type", "question", "options", "correct_answer", "evidence"],
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["mcq"],
                    },
                    "question": {"type": "string"},
                    "options": {
                        "type": "array",
                        "minItems": 4,
                        "maxItems": 4,
                        "items": {"type": "string"},
                    },
                    "correct_answer": {"type": "integer"},
                    "evidence": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["segment_range", "quote"],
                        "properties": {
                            "segment_range": {"type": "string"},
                            "quote": {"type": "string"},
                        },
                    },
                },
            },
        },
    },
}


async def _update_job(db: AsyncSession, job_id: uuid.UUID, status: str, progress: int, error: str | None = None):
    await db.execute(
        update(Job).where(Job.id == job_id).values(status=status, progress=progress, error=error)
    )
    await db.commit()


async def _load_existing_training_data(db: AsyncSession, training_id: uuid.UUID):
    """Load transcript, chunks, frames and semantic segments for iterate. Returns None if any is missing."""
    r = await db.execute(select(TrainingTranscript).where(TrainingTranscript.training_id == training_id))
    transcript_row = r.scalar_one_or_none()
    if not transcript_row:
        return None
    raw_transcript = transcript_row.transcript_raw

    r = await db.execute(
        select(TrainingChunk).where(TrainingChunk.training_id == training_id).order_by(TrainingChunk.chunk_index)
    )
    chunks = r.scalars().all()
    if not chunks:
        return None
    transcript_segments = [{"text": c.text, "start": c.start_time, "end": c.end_time} for c in chunks]

    r = await db.execute(
        select(VideoFrame).where(VideoFrame.training_id == training_id).order_by(VideoFrame.timestamp)
    )
    frames = r.scalars().all()
    if not frames:
        return None
    frames_data = [
        {"timestamp": f.timestamp, "caption": f.caption or "", "storage_key": f.storage_key, "local_path": None}
        for f in frames
    ]

    r = await db.execute(
        select(SemanticSegment).where(SemanticSegment.training_id == training_id).order_by(SemanticSegment.start_time)
    )
    sem = r.scalars().all()
    if not sem:
        return None
    segments = [{"start": s.start_time, "end": s.end_time, "text_fused": s.text_fused} for s in sem]

    return (transcript_segments, frames_data, segments, raw_transcript)


async def _load_existing_quiz_context(db: AsyncSession, training_id: uuid.UUID) -> list[dict]:
    r = await db.execute(select(QuizQuestion).where(QuizQuestion.training_id == training_id))
    questions = r.scalars().all()
    ordered_questions = sorted(
        questions,
        key=lambda q: (q.question_json.get("position", 10**9), str(q.id)),
    )

    context = []
    for fallback_position, question in enumerate(ordered_questions, start=1):
        try:
            payload = validate_quiz_question(question.question_json or {})
        except ValidationError:
            logger.warning("Skipping invalid stored quiz question %s", question.id)
            continue
        context.append(
            {
                "position": payload.get("position", fallback_position),
                "id": str(question.id),
                "type": payload.get("type"),
                "question": payload.get("question"),
                "options": payload.get("options"),
                "correct_answer": payload.get("correct_answer"),
                "evidence": payload.get("evidence"),
            }
        )
    return context


def _prepare_questions_for_persistence(questions: list[dict]) -> list[dict]:
    prepared = []
    for position, question in enumerate(questions, start=1):
        try:
            payload = validate_quiz_question({**dict(question), "position": position})
        except ValidationError:
            logger.warning("Skipping invalid generated quiz question at position %s", position)
            continue
        prepared.append(payload)
    return prepared


def _validate_structure_for_persistence(structure: dict) -> dict:
    try:
        return validate_training_structure(structure)
    except ValidationError as exc:
        raise ValueError(f"Generated training structure did not match expected schema: {exc}") from exc


async def run_pipeline(training_id: uuid.UUID, job_id: uuid.UUID, instruction: str | None = None):
    async with async_session() as db:
        try:
            provider = get_ai_provider()
            set_ai_usage_context(training_id=training_id)

            # Optimized path for iterate: reuse existing transcript, frames, segments; only re-run AI stages that use instruction
            if instruction is not None:
                loaded = await _load_existing_training_data(db, training_id)
                if loaded is not None:
                    _transcript_segments, _frames_data, segments, raw_transcript = loaded
                    existing_quiz = await _load_existing_quiz_context(db, training_id)
                    await _update_job(db, job_id, "EXTRACTING", 45)

                    set_ai_usage_context(stage="EXTRACTING")
                    structure = _validate_structure_for_persistence(
                        await _stage_extract_knowledge(provider, segments, instruction)
                    )
                    existing_struct = await db.execute(
                        select(TrainingStructure).where(TrainingStructure.training_id == training_id)
                    )
                    es = existing_struct.scalar_one_or_none()
                    if es:
                        es.structure_json = structure
                    else:
                        db.add(TrainingStructure(training_id=training_id, structure_json=structure))
                    await db.commit()
                    await _update_job(db, job_id, "PLANNING", 65)

                    set_ai_usage_context(stage="PLANNING")
                    coverage_plan = await _stage_coverage_plan(provider, structure, segments)
                    await _update_job(db, job_id, "GENERATING_QUIZ", 75)

                    set_ai_usage_context(stage="GENERATING_QUIZ")
                    questions = await _stage_generate_quiz(
                        provider,
                        coverage_plan,
                        segments,
                        instruction,
                        existing_quiz=existing_quiz,
                    )
                    await _update_job(db, job_id, "VERIFYING", 85)

                    verified_questions = _prepare_questions_for_persistence(
                        await _stage_verify(questions, raw_transcript, segments)
                    )

                    await db.execute(delete(QuizQuestion).where(QuizQuestion.training_id == training_id))
                    for q in verified_questions:
                        db.add(QuizQuestion(training_id=training_id, question_json=q))
                    await db.commit()

                    await db.execute(
                        update(Training).where(Training.id == training_id).values(status="ready")
                    )
                    await db.commit()
                    await _update_job(db, job_id, "READY", 100)
                    return

            await _update_job(db, job_id, "TRANSCRIBING", 10)
            result = await db.execute(
                select(TrainingAsset).where(
                    TrainingAsset.training_id == training_id,
                    TrainingAsset.type == "video",
                )
            )
            asset = result.scalar_one_or_none()
            if not asset:
                await _update_job(db, job_id, "FAILED", 0, error="No video asset found")
                return

            with tempfile.TemporaryDirectory() as tmpdir:
                video_path = os.path.join(tmpdir, "video.mp4")
                await download_file(asset.storage_key, video_path)

                # Stage 1: Transcription
                set_ai_usage_context(stage="TRANSCRIBING")
                transcript_segments = await _stage_transcribe(provider, video_path)
                raw_transcript = " ".join(s["text"] for s in transcript_segments)

                existing = await db.execute(
                    select(TrainingTranscript).where(TrainingTranscript.training_id == training_id)
                )
                if existing.scalar_one_or_none() is None:
                    db.add(TrainingTranscript(
                        training_id=training_id,
                        transcript_raw=raw_transcript,
                        language="auto",
                    ))

                chunks = []
                for i, seg in enumerate(transcript_segments):
                    chunk = TrainingChunk(
                        training_id=training_id,
                        chunk_index=i,
                        text=seg["text"],
                        start_time=seg["start"],
                        end_time=seg["end"],
                    )
                    chunks.append(chunk)
                    db.add(chunk)
                await db.commit()
                await _update_job(db, job_id, "CHUNKING", 20)

                # Stage 2: Frame Sampling + Captioning
                set_ai_usage_context(stage="CHUNKING")
                frames_data = await _stage_frame_sampling(provider, video_path, tmpdir, training_id)
                for fd in frames_data:
                    db.add(VideoFrame(
                        training_id=training_id,
                        timestamp=fd["timestamp"],
                        storage_key=fd["storage_key"],
                        caption=fd["caption"],
                    ))
                    await upload_file(fd["local_path"], fd["storage_key"])
                await db.commit()
                await _update_job(db, job_id, "CHUNKING", 35)

                # Stage 3: Segment Builder
                segments = _stage_build_segments(transcript_segments, frames_data)
                await _update_job(db, job_id, "EXTRACTING", 45)

                # Stage 4: Embeddings
                set_ai_usage_context(stage="INDEXING")
                semantic_segment_records = []
                for seg in segments:
                    emb = await provider.embed_text(seg["text_fused"])
                    record = SemanticSegment(
                        training_id=training_id,
                        start_time=seg["start"],
                        end_time=seg["end"],
                        text_fused=seg["text_fused"],
                        embedding=emb,
                    )
                    db.add(record)
                    semantic_segment_records.append(record)
                await db.commit()
                await _update_job(db, job_id, "INDEXING", 55)

                # Stage 5: Knowledge Extraction
                set_ai_usage_context(stage="EXTRACTING")
                structure = _validate_structure_for_persistence(
                    await _stage_extract_knowledge(provider, segments, instruction)
                )
                existing_struct = await db.execute(
                    select(TrainingStructure).where(TrainingStructure.training_id == training_id)
                )
                es = existing_struct.scalar_one_or_none()
                if es:
                    es.structure_json = structure
                else:
                    db.add(TrainingStructure(training_id=training_id, structure_json=structure))
                await db.commit()
                await _update_job(db, job_id, "PLANNING", 65)

                # Stage 6: Coverage Planning
                set_ai_usage_context(stage="PLANNING")
                coverage_plan = await _stage_coverage_plan(provider, structure, segments)
                await _update_job(db, job_id, "GENERATING_QUIZ", 75)

                # Stage 7: Quiz Generation
                set_ai_usage_context(stage="GENERATING_QUIZ")
                questions = await _stage_generate_quiz(provider, coverage_plan, segments, instruction)
                await _update_job(db, job_id, "VERIFYING", 85)

                # Stage 8: Verification
                verified_questions = _prepare_questions_for_persistence(
                    await _stage_verify(questions, raw_transcript, segments)
                )

                await db.execute(delete(QuizQuestion).where(QuizQuestion.training_id == training_id))
                for q in verified_questions:
                    db.add(QuizQuestion(training_id=training_id, question_json=q))
                await db.commit()

                # Stage 9: Mark ready
                await db.execute(
                    update(Training).where(Training.id == training_id).values(status="ready")
                )
                await db.commit()
                await _update_job(db, job_id, "READY", 100)

        except AIProviderError as e:
            logger.exception("Pipeline provider error for training %s", training_id)
            async with async_session() as err_db:
                await _update_job(err_db, job_id, "FAILED", 0, error=_map_provider_error(e))
        except Exception as e:
            logger.exception("Pipeline failed for training %s", training_id)
            async with async_session() as err_db:
                await _update_job(err_db, job_id, "FAILED", 0, error=str(e))
        finally:
            clear_ai_usage_context()


def _map_provider_error(error: AIProviderError) -> str:
    if error.code == "quota_exceeded":
        return "No hay creditos/cupo disponible en el proveedor de IA configurado."
    if error.code == "auth_error":
        return "Credenciales invalidas o faltantes del proveedor de IA."
    if error.code == "rate_limited":
        return "El proveedor de IA esta limitado temporalmente. Intenta nuevamente."
    return f"Error del proveedor de IA: {str(error)}"


async def _stage_transcribe(provider: AIProvider, video_path: str) -> list[dict]:
    return await provider.transcribe_video(video_path)


async def _stage_frame_sampling(
    provider: AIProvider, video_path: str, tmpdir: str, training_id: uuid.UUID
) -> list[dict]:
    import subprocess

    if shutil.which("ffprobe") is None or shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "FFmpeg no esta instalado. Instala ffmpeg/ffprobe para procesar videos "
            "(macOS: `brew install ffmpeg`)."
        )

    probe_cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", video_path,
    ]
    result = subprocess.run(probe_cmd, capture_output=True, text=True)
    duration = float(result.stdout.strip()) if result.stdout.strip() else 60.0

    frames_dir = os.path.join(tmpdir, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    subprocess.run([
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{FRAME_INTERVAL_SECONDS}",
        os.path.join(frames_dir, "frame_%04d.jpg"),
        "-y", "-loglevel", "error",
    ], check=True)

    frame_files = sorted(
        [f for f in os.listdir(frames_dir) if f.endswith(".jpg")]
    )

    frames_data = []

    for i, fname in enumerate(frame_files):
        timestamp = i * FRAME_INTERVAL_SECONDS
        if timestamp > duration:
            break

        frame_path = os.path.join(frames_dir, fname)
        with open(frame_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        caption = await provider.caption_image_b64(
            b64,
            "Describe briefly what you see in this frame from an operational training video. "
            "Be factual and concise. Respond in Spanish.",
        )

        storage_key = f"frames/{training_id}/{fname}"
        frames_data.append({
            "timestamp": float(timestamp),
            "caption": caption,
            "storage_key": storage_key,
            "local_path": frame_path,
        })

    return frames_data


def _stage_build_segments(transcript_segments: list[dict], frames_data: list[dict]) -> list[dict]:
    if not transcript_segments:
        return []

    total_duration = max(s["end"] for s in transcript_segments)
    segments = []
    t = 0.0

    while t < total_duration:
        window_end = t + SEGMENT_WINDOW_SECONDS

        transcript_parts = [
            s["text"] for s in transcript_segments
            if s["start"] < window_end and s["end"] > t
        ]
        frame_parts = [
            f["caption"] for f in frames_data
            if t <= f["timestamp"] < window_end and f["caption"]
        ]

        text_fused = ""
        if transcript_parts:
            text_fused += " ".join(transcript_parts)
        if frame_parts:
            if text_fused:
                text_fused += " | Visual: "
            text_fused += " ".join(frame_parts)

        if text_fused.strip():
            segments.append({
                "start": t,
                "end": min(window_end, total_duration),
                "text_fused": text_fused.strip(),
            })

        t = window_end

    return segments


async def _stage_extract_knowledge(
    provider: AIProvider, segments: list[dict], instruction: str | None = None
) -> dict:
    segments_text = "\n\n".join(
        f"[{s['start']:.0f}s - {s['end']:.0f}s]: {s['text_fused']}" for s in segments
    )

    system_prompt = (
        "You are an expert training content designer. Extract structured knowledge from the following "
        "video segments. Return a JSON object with: title, objectives (list), steps (list of {step, description, segment_ref}), "
        "critical_points (list of {point, why, segment_ref}). All segment_ref should be the time range like '10s-20s'. "
        "Respond ONLY with valid JSON. Respond in Spanish."
    )
    if instruction:
        system_prompt += f"\n\nAdditional instruction from the author: {instruction}"

    return await provider.generate_json(
        system_prompt=system_prompt,
        user_prompt=segments_text,
        temperature=0.3,
    )


async def _stage_coverage_plan(provider: AIProvider, structure: dict, segments: list[dict]) -> dict:
    return await provider.generate_json(
        system_prompt=(
            "You are a quiz coverage planner. Given a training structure and video segments, "
            "plan which topics need quiz questions. Return JSON with: "
            "topics_to_cover (list of {topic, type, target_segment_range}). "
            "For now, always set type to 'mcq'. "
            "Keep the type field in the output because the system may support more quiz types in the future. "
            "Use mcq for direct factual or procedural recall questions grounded in the training. "
            "Ensure critical points and main steps are covered. Respond ONLY with valid JSON."
        ),
        user_prompt=json.dumps({"structure": structure, "segment_count": len(segments)}, ensure_ascii=False),
        temperature=0.3,
    )


async def _stage_generate_quiz(
    provider: AIProvider,
    coverage_plan: dict,
    segments: list[dict],
    instruction: str | None = None,
    existing_quiz: list[dict] | None = None,
) -> list[dict]:
    segments_text = "\n\n".join(
        f"[{s['start']:.0f}s - {s['end']:.0f}s]: {s['text_fused']}" for s in segments
    )

    system_prompt = (
        "You are a quiz generator for operational training. Generate quiz questions based on the coverage plan "
        "and video segments provided.\n\n"
        "The quiz schema supports multiple question types, but for this current rollout you must generate only "
        "'mcq' questions.\n\n"
        "Question type definition for this rollout:\n"
        "- 'mcq': a direct multiple-choice question that checks factual or procedural recall grounded in the training.\n\n"
        "Never return open-ended or situational questions in this rollout.\n"
        "Each question must include:\n"
        "- type: 'mcq'\n"
        "- question: the question text\n"
        "- options: list of exactly 4 answer options\n"
        "- correct_answer: integer index (0-3) of the single best option\n"
        "- evidence: {segment_range, quote} where quote is a literal snippet from the segments\n\n"
        "Additional rules:\n"
        "- Every question must be answerable from the provided segments.\n"
        "- The evidence quote must support the correct answer.\n"
        "- Distractors must be plausible but clearly incorrect.\n"
        "- If an existing quiz is provided, it represents the latest quiz revision for this training.\n"
        "- If the author instruction refers to question numbers such as 'question 1', use the existing quiz "
        "position field to resolve that reference.\n"
        "- When an existing quiz is provided, preserve unchanged questions unless the author instruction asks to "
        "replace, rewrite, reorder, remove, or expand them.\n"
        "Return JSON with: questions (list). Respond ONLY with valid JSON. Respond in Spanish."
    )
    if instruction:
        system_prompt += f"\n\nAdditional author instruction: {instruction}"

    prompt_sections = []
    if existing_quiz:
        prompt_sections.append(
            "Existing Quiz (latest revision):\n"
            f"{json.dumps(existing_quiz, ensure_ascii=False)}"
        )
    prompt_sections.append(f"Coverage Plan:\n{json.dumps(coverage_plan, ensure_ascii=False)}")
    prompt_sections.append(f"Segments:\n{segments_text}")

    result = await provider.generate_json(
        system_prompt=system_prompt,
        user_prompt="\n\n".join(prompt_sections),
        temperature=0.4,
        response_schema=QUIZ_RESPONSE_SCHEMA,
        schema_name="quiz_response",
    )
    if isinstance(result, list):
        result = {"questions": result}
    if not isinstance(result, dict):
        return []
    try:
        validated = validate_quiz_response(result)
    except ValidationError:
        return []
    return validated.get("questions", [])


def _normalize_generated_question(question: dict) -> dict | None:
    try:
        return validate_quiz_question(question)
    except ValidationError:
        return None


async def _stage_verify(
    questions: list[dict], raw_transcript: str, segments: list[dict]
) -> list[dict]:
    verified = []
    transcript_lower = raw_transcript.lower()

    for q in questions:
        normalized = _normalize_generated_question(q)
        if normalized is None:
            continue

        q = normalized
        evidence = q.get("evidence", {})
        quote = evidence.get("quote", "")

        if quote and quote.lower()[:30] in transcript_lower:
            q["verified"] = True
        else:
            q["verified"] = False

        if "question" in q:
            verified.append(q)

    return verified
