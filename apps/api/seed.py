"""Seed script for the procedure-centric demo domain.

Run migrations first:

    alembic upgrade head
    python seed.py
"""

import argparse
import asyncio
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, false, or_, select, text

from app.core.database import Base, async_session
from app.core.security import hash_password
from app.models.ai_usage_event import AIUsageEvent
from app.models.assignment import Assignment
from app.models.change_event import ChangeEvent, ProcedureImpactAssessment
from app.models.incident import (
    Incident,
    IncidentAnalysisFinding,
    IncidentAnalysisRun,
    IncidentRelatedMatch,
    IncidentTrainingLink,
)
from app.models.job import Job
from app.models.procedure import (
    Procedure,
    ProcedureVersion,
    ProcedureVersionChunk,
    ProcedureVersionStructure,
    ProcedureVersionTranscript,
    TaskProcedureLink,
    UserProcedureCompliance,
)
from app.models.quiz import QuizQuestion
from app.models.role import Role, RoleTaskLink, UserRoleAssignment
from app.models.semantic_segment import SemanticSegment
from app.models.task import Task, TaskTrainingLink
from app.models.training import Training, TrainingChunk, TrainingStructure, TrainingTranscript
from app.models.user import User
from app.models.video_frame import VideoFrame
from app.services.compliance_service import sync_user_procedure_compliance
from app.services.embedding_service import get_embedding

_embedding_counter = 0


DEMO_USERS = [
    {"name": "Admin Demo", "email": "admin@demo.com", "password": "admin123", "location": "Buenos Aires"},
    {"name": "Marta Encargada", "email": "marta@demo.com", "password": "demo123", "location": "Buenos Aires"},
    {"name": "Sofía Supervisora", "email": "sofia@demo.com", "password": "demo123", "location": "Buenos Aires"},
    {"name": "Diego Reposición", "email": "diego@demo.com", "password": "demo123", "location": "Buenos Aires"},
    {"name": "Ana Caja", "email": "ana@demo.com", "password": "demo123", "location": "Córdoba"},
    {"name": "Luis Alimentos", "email": "luis@demo.com", "password": "demo123", "location": "Córdoba"},
]

DEMO_ROLES = [
    {"code": "store-manager", "name": "Encargado de sucursal", "description": "Administra la sucursal y supervisa cumplimiento operativo."},
    {"code": "shift-supervisor", "name": "Supervisor de turno", "description": "Coordina la operación diaria y valida desvíos."},
    {"code": "cashier", "name": "Cajero", "description": "Opera caja, entrega pedidos y maneja ventas sensibles."},
    {"code": "stock-clerk", "name": "Reponedor", "description": "Recibe mercadería y mantiene góndolas en orden."},
    {"code": "fresh-food-operator", "name": "Operador de alimentos", "description": "Manipula alimentos listos para consumo con foco sanitario."},
]

LEGACY_DEMO_TASK_TITLES = [
    "Recepción de mercadería",
    "Reposición de góndolas",
    "Preparación y entrega de pedido pickup",
    "Venta de productos restringidos",
    "Manejo de alimentos listos para consumo",
]

DEMO_PROCEDURES = [
    {
        "code": "PROC-GOODS-RECEIPT",
        "title": "Recepción y validación de mercadería",
        "description": "Verificar remito, cantidades, lotes y estado de productos antes del ingreso.",
        "role_code": "shift-supervisor",
        "content": (
            "Paso 1: comparar remito, cantidades y referencias recibidas. "
            "Paso 2: revisar lote, vencimiento y estado del empaque. "
            "Paso 3: registrar diferencias y escalar antes de ingresar mercadería."
        ),
        "training_title": "Recepción segura de mercadería",
    },
    {
        "code": "PROC-COLD-CHAIN",
        "title": "Control de cadena de frío",
        "description": "Mantener y auditar la conservación segura de productos refrigerados en recepción y manipulación.",
        "role_code": "fresh-food-operator",
        "content": (
            "Paso 1: medir temperatura al recibir o retirar producto refrigerado. "
            "Paso 2: registrar el valor y la hora en el control. "
            "Paso 3: aislar producto fuera de rango y avisar al supervisor."
        ),
        "training_title": "Cadena de frío y registro seguro",
    },
    {
        "code": "PROC-DAMAGED-GOODS",
        "title": "Segregación de mercadería dañada",
        "description": "Separar y documentar productos dañados antes de su ingreso o exhibición.",
        "role_code": "stock-clerk",
        "content": (
            "Paso 1: separar unidades golpeadas, abiertas o derramadas. "
            "Paso 2: fotografiar evidencia y registrar lote. "
            "Paso 3: enviar a devolución, descarte o cuarentena según criterio."
        ),
        "training_title": "Mercadería dañada y trazabilidad",
    },
    {
        "code": "PROC-SHELF-RESTOCK",
        "title": "Reposición segura de góndolas",
        "description": "Reponer productos respetando orden visual, planograma y rotación correcta.",
        "role_code": "stock-clerk",
        "content": (
            "Paso 1: verificar planograma y espacio disponible. "
            "Paso 2: reponer aplicando FIFO y orden visual. "
            "Paso 3: confirmar que no queden frentes vacíos ni producto mal ubicado."
        ),
        "training_title": "Reposición eficiente y ordenada",
    },
    {
        "code": "PROC-EXPIRY-CHECK",
        "title": "Control de vencimientos",
        "description": "Detectar productos vencidos o próximos a vencer antes de exhibición o uso.",
        "role_code": "stock-clerk",
        "content": (
            "Paso 1: revisar fechas antes de exhibir o manipular producto. "
            "Paso 2: retirar unidades vencidas o próximas a vencer según política. "
            "Paso 3: registrar merma o acción correctiva."
        ),
        "training_title": "Vencimientos y retiro preventivo",
    },
    {
        "code": "PROC-PRICE-TAG-CHECK",
        "title": "Validación de precios y etiquetas",
        "description": "Confirmar que precio de góndola, sistema y promociones coincidan.",
        "role_code": "shift-supervisor",
        "content": (
            "Paso 1: comparar precio en góndola, sistema y promoción vigente. "
            "Paso 2: corregir etiqueta o reportar inconsistencia. "
            "Paso 3: dejar evidencia y confirmar resolución antes del siguiente turno."
        ),
        "training_title": "Control de precios exhibidos",
    },
    {
        "code": "PROC-PICKUP-PICKING",
        "title": "Armado de pedido pickup",
        "description": "Preparar pedidos pickup asegurando cantidades, sustituciones y estado del producto.",
        "role_code": "cashier",
        "content": (
            "Paso 1: recoger cada ítem siguiendo el pedido confirmado. "
            "Paso 2: validar cantidades, sustituciones autorizadas y estado del producto. "
            "Paso 3: embolsar y rotular el pedido para retiro."
        ),
        "training_title": "Picking correcto para pickup",
    },
    {
        "code": "PROC-CUSTOMER-HANDOFF",
        "title": "Entrega al cliente",
        "description": "Entregar pedidos o productos confirmando identidad y cierre correcto en sistema.",
        "role_code": "cashier",
        "content": (
            "Paso 1: pedir nombre, código o comprobante del retiro. "
            "Paso 2: entregar el pedido correcto y confirmar recepción con el cliente. "
            "Paso 3: cerrar la entrega en el sistema y registrar incidencias si aparecen."
        ),
        "training_title": "Handoff seguro al cliente",
    },
    {
        "code": "PROC-AGE-RESTRICTED-SALE",
        "title": "Venta de productos restringidos",
        "description": "Validar edad antes de vender productos con restricción legal.",
        "role_code": "cashier",
        "content": (
            "Paso 1: solicitar identificación cuando la edad no sea evidente. "
            "Paso 2: validar mayoría de edad antes de cobrar. "
            "Paso 3: rechazar y registrar el intento si no hay documento válido."
        ),
        "training_title": "Venta responsable de productos restringidos",
    },
    {
        "code": "PROC-HAND-HYGIENE",
        "title": "Higiene de manos para alimentos",
        "description": "Asegurar higiene de manos antes y durante la manipulación de alimentos listos para consumo.",
        "role_code": "fresh-food-operator",
        "content": (
            "Paso 1: lavar y secar manos antes de manipular alimentos o utensilios. "
            "Paso 2: repetir higiene tras tocar dinero, residuos o superficies sucias. "
            "Paso 3: colocarse elementos limpios antes de retomar la tarea."
        ),
        "training_title": "Higiene crítica en manipulación de alimentos",
    },
]

DEMO_ROLE_PROCEDURE_LINKS = [
    {"role_code": "store-manager", "procedure_code": "PROC-GOODS-RECEIPT", "is_required": True},
    {"role_code": "store-manager", "procedure_code": "PROC-AGE-RESTRICTED-SALE", "is_required": False},
    {"role_code": "shift-supervisor", "procedure_code": "PROC-GOODS-RECEIPT", "is_required": True},
    {"role_code": "shift-supervisor", "procedure_code": "PROC-PRICE-TAG-CHECK", "is_required": True},
    {"role_code": "shift-supervisor", "procedure_code": "PROC-CUSTOMER-HANDOFF", "is_required": True},
    {"role_code": "stock-clerk", "procedure_code": "PROC-DAMAGED-GOODS", "is_required": True},
    {"role_code": "stock-clerk", "procedure_code": "PROC-SHELF-RESTOCK", "is_required": True},
    {"role_code": "stock-clerk", "procedure_code": "PROC-EXPIRY-CHECK", "is_required": True},
    {"role_code": "cashier", "procedure_code": "PROC-PICKUP-PICKING", "is_required": True},
    {"role_code": "cashier", "procedure_code": "PROC-CUSTOMER-HANDOFF", "is_required": True},
    {"role_code": "cashier", "procedure_code": "PROC-AGE-RESTRICTED-SALE", "is_required": True},
    {"role_code": "fresh-food-operator", "procedure_code": "PROC-GOODS-RECEIPT", "is_required": False},
    {"role_code": "fresh-food-operator", "procedure_code": "PROC-COLD-CHAIN", "is_required": True},
    {"role_code": "fresh-food-operator", "procedure_code": "PROC-HAND-HYGIENE", "is_required": True},
    {"role_code": "fresh-food-operator", "procedure_code": "PROC-EXPIRY-CHECK", "is_required": True},
]

DEMO_ASSIGNMENTS = [
    {"email": "luis@demo.com", "procedure_code": "PROC-HAND-HYGIENE", "status": "completed", "score": 96},
    {"email": "ana@demo.com", "procedure_code": "PROC-AGE-RESTRICTED-SALE", "status": "assigned", "score": None},
    {"email": "sofia@demo.com", "procedure_code": "PROC-GOODS-RECEIPT", "status": "in_progress", "score": None},
    {"email": "diego@demo.com", "procedure_code": "PROC-EXPIRY-CHECK", "status": "completed", "score": 88},
]

DEMO_INCIDENTS = [
    {
        "description": (
            "Un cliente retiró un pedido pickup incompleto durante hora pico; el equipo preparó y entregó el "
            "pedido, pero no hubo doble chequeo final antes del handoff."
        ),
        "severity": "high",
        "role_code": "cashier",
        "location": "Córdoba",
        "embedding_text": "pedido pickup incompleto doble chequeo final inexistente entrega cliente",
        "analysis_summary": (
            "El flujo actual cubre picking y entrega, pero no existe un control final formal de integridad "
            "antes del handoff al cliente."
        ),
        "resolution_summary": (
            "Crear un procedimiento específico de verificación final previa a entrega y entrenar al personal "
            "de caja y supervisión."
        ),
        "finding": {
            "procedure_code": None,
            "finding_type": "missing_procedure",
            "confidence": 0.89,
            "reasoning_summary": (
                "Falta un procedimiento preventivo de doble chequeo final que confirme integridad del pedido "
                "antes de la entrega al cliente."
            ),
            "recommended_action": (
                "Crear PROC-ORDER-FINAL-CHECK y vincularlo al rol de caja para el flujo de entrega pickup."
            ),
        },
    },
    {
        "description": (
            "Durante una promoción, varios clientes reportaron que el precio de góndola no coincidía con caja y "
            "el equipo resolvió cada caso distinto, sin criterio de escalamiento ni evidencia."
        ),
        "severity": "medium",
        "role_code": "shift-supervisor",
        "location": "Buenos Aires",
        "embedding_text": "precio góndola distinto caja criterio escalamiento evidencia promoción",
        "analysis_summary": (
            "Existe un control de etiquetas, pero el procedimiento no define cómo actuar ante diferencias "
            "repetidas ni qué evidencia debe quedar registrada."
        ),
        "resolution_summary": (
            "Publicar una nueva versión del control de precios con umbrales, responsables y trazabilidad "
            "de corrección."
        ),
        "finding": {
            "procedure_code": "PROC-PRICE-TAG-CHECK",
            "finding_type": "needs_redefinition",
            "confidence": 0.84,
            "reasoning_summary": (
                "El procedimiento actual cubre la validación puntual de etiquetas, pero no define un flujo claro "
                "para promociones mal configuradas o incidentes repetitivos."
            ),
            "recommended_action": (
                "Redefinir PROC-PRICE-TAG-CHECK incorporando escalamiento, evidencia mínima y responsable de cierre."
            ),
        },
    },
    {
        "description": (
            "Una entrega de lácteos llegó con temperatura fuera de rango y el operador la guardó sin registrar "
            "la desviación ni aislar el producto."
        ),
        "severity": "high",
        "role_code": "fresh-food-operator",
        "location": "Buenos Aires",
        "embedding_text": "lácteos temperatura fuera de rango sin registro ni aislamiento",
        "analysis_summary": (
            "El procedimiento de cadena de frío existe y describe medición, registro y aislamiento, pero no se "
            "cumplió en la recepción."
        ),
        "resolution_summary": (
            "Reentrenar al equipo de recepción y exigir evidencia del control antes del ingreso a cámara."
        ),
        "finding": {
            "procedure_code": "PROC-COLD-CHAIN",
            "finding_type": "not_followed",
            "confidence": 0.95,
            "reasoning_summary": (
                "La mercadería se almacenó sin ejecutar los pasos obligatorios de medición, registro y "
                "aislamiento definidos por el procedimiento."
            ),
            "recommended_action": (
                "Reasignar training de cadena de frío y exigir checklist visible durante la recepción."
            ),
        },
    },
]

DEMO_CHANGE_EVENT = {
    "title": "Nueva exigencia de evidencia en recepción refrigerada",
    "description": (
        "La autoridad sanitaria exige evidencia de temperatura y acción correctiva documentada para cada "
        "recepción de productos refrigerados."
    ),
    "source_type": "regulation",
    "status": "review",
    "context_json": {"issuer": "Autoridad Sanitaria Local", "scope": "productos refrigerados"},
    "embedding_text": "recepción refrigerada evidencia temperatura acción correctiva",
}

DEMO_USER_EMAILS = [item["email"] for item in DEMO_USERS]
DEMO_ROLE_CODES = [item["code"] for item in DEMO_ROLES]
DEMO_PROCEDURE_CODES = [item["code"] for item in DEMO_PROCEDURES]
DEMO_INCIDENT_DESCRIPTIONS = [item["description"] for item in DEMO_INCIDENTS]


def _build_structure(title: str, content: str) -> dict:
    steps = [part.strip() for part in content.split(". ") if part.strip()]
    return {
        "title": title,
        "objectives": [
            f"Ejecutar correctamente {title.lower()}",
            "Detectar desvíos operativos y documentarlos",
        ],
        "steps": [
            {
                "title": f"Paso {index + 1}",
                "description": step,
                "segment_ref": f"{index * 10}s-{(index + 1) * 10}s",
            }
            for index, step in enumerate(steps)
        ],
        "critical_points": [
            {
                "point": "Registrar evidencia",
                "why": "Permite trazabilidad y acciones correctivas",
                "segment_ref": "10s-20s",
            }
        ],
    }


def log_progress(message: str) -> None:
    print(f"[seed] {message}", flush=True)


def hidden_role_procedure_marker(role_code: str, procedure_code: str) -> str:
    return f"[hidden-role-procedure] role={role_code} procedure={procedure_code}"


DEMO_TASK_MARKERS = [
    hidden_role_procedure_marker(item["role_code"], item["procedure_code"])
    for item in DEMO_ROLE_PROCEDURE_LINKS
]


async def get_existing_table_names(db) -> set[str]:
    result = await db.execute(
        text("select tablename from pg_tables where schemaname = current_schema()")
    )
    return set(result.scalars().all())


async def wipe_demo_data(db) -> None:
    log_progress("wipe demo: resolviendo entidades demo")
    existing_tables = await get_existing_table_names(db)

    demo_user_ids = list(
        (await db.execute(select(User.id).where(User.email.in_(DEMO_USER_EMAILS)))).scalars().all()
    )
    demo_role_ids = list(
        (await db.execute(select(Role.id).where(Role.code.in_(DEMO_ROLE_CODES)))).scalars().all()
    )
    demo_procedure_ids = list(
        (await db.execute(select(Procedure.id).where(Procedure.code.in_(DEMO_PROCEDURE_CODES)))).scalars().all()
    )
    demo_version_ids = list(
        (
            await db.execute(
                select(ProcedureVersion.id).where(ProcedureVersion.procedure_id.in_(demo_procedure_ids))
            )
        )
        .scalars()
        .all()
        if demo_procedure_ids
        else []
    )
    demo_training_ids = list(
        (await db.execute(select(Training.id).where(Training.procedure_version_id.in_(demo_version_ids))))
        .scalars()
        .all()
        if demo_version_ids
        else []
    )
    demo_incident_ids = list(
        (
            await db.execute(
                select(Incident.id).where(Incident.description.in_(DEMO_INCIDENT_DESCRIPTIONS))
            )
        )
        .scalars()
        .all()
    )
    demo_analysis_run_ids = list(
        (
            await db.execute(
                select(IncidentAnalysisRun.id).where(IncidentAnalysisRun.incident_id.in_(demo_incident_ids))
            )
        )
        .scalars()
        .all()
        if demo_incident_ids
        else []
    )
    demo_change_event_ids = list(
        (
            await db.execute(
                select(ChangeEvent.id).where(ChangeEvent.title == DEMO_CHANGE_EVENT["title"])
            )
        )
        .scalars()
        .all()
    )
    demo_task_ids = list(
        (
            await db.execute(
                select(Task.id).where(
                    or_(
                        Task.description.in_(DEMO_TASK_MARKERS),
                        Task.description.like("[hidden-role-procedure]%"),
                        Task.title.in_(LEGACY_DEMO_TASK_TITLES),
                    )
                )
            )
        )
        .scalars()
        .all()
    )

    log_progress("wipe demo: eliminando dependencias")
    if demo_user_ids or demo_procedure_ids:
        await db.execute(
            delete(UserProcedureCompliance).where(
                or_(
                    UserProcedureCompliance.user_id.in_(demo_user_ids) if demo_user_ids else false(),
                    UserProcedureCompliance.procedure_id.in_(demo_procedure_ids) if demo_procedure_ids else false(),
                )
            )
        )

    if demo_analysis_run_ids or demo_incident_ids:
        await db.execute(
            delete(IncidentRelatedMatch).where(
                or_(
                    IncidentRelatedMatch.analysis_run_id.in_(demo_analysis_run_ids)
                    if demo_analysis_run_ids
                    else false(),
                    IncidentRelatedMatch.related_analysis_run_id.in_(demo_analysis_run_ids)
                    if demo_analysis_run_ids
                    else false(),
                    IncidentRelatedMatch.related_incident_id.in_(demo_incident_ids)
                    if demo_incident_ids
                    else false(),
                )
            )
        )
        await db.execute(
            delete(IncidentAnalysisFinding).where(
                IncidentAnalysisFinding.analysis_run_id.in_(demo_analysis_run_ids)
            )
        )
        await db.execute(delete(IncidentAnalysisRun).where(IncidentAnalysisRun.id.in_(demo_analysis_run_ids)))

    if demo_incident_ids or demo_training_ids:
        await db.execute(
            delete(IncidentTrainingLink).where(
                or_(
                    IncidentTrainingLink.incident_id.in_(demo_incident_ids) if demo_incident_ids else false(),
                    IncidentTrainingLink.training_id.in_(demo_training_ids) if demo_training_ids else false(),
                )
            )
        )

    if demo_incident_ids:
        await db.execute(delete(Incident).where(Incident.id.in_(demo_incident_ids)))

    if demo_training_ids:
        if AIUsageEvent.__tablename__ in existing_tables:
            await db.execute(delete(AIUsageEvent).where(AIUsageEvent.training_id.in_(demo_training_ids)))
        if Job.__tablename__ in existing_tables:
            await db.execute(delete(Job).where(Job.training_id.in_(demo_training_ids)))
        if QuizQuestion.__tablename__ in existing_tables:
            await db.execute(delete(QuizQuestion).where(QuizQuestion.training_id.in_(demo_training_ids)))
        if TaskTrainingLink.__tablename__ in existing_tables:
            await db.execute(delete(TaskTrainingLink).where(TaskTrainingLink.training_id.in_(demo_training_ids)))
        await db.execute(delete(Assignment).where(Assignment.training_id.in_(demo_training_ids)))
        if TrainingTranscript.__tablename__ in existing_tables:
            await db.execute(delete(TrainingTranscript).where(TrainingTranscript.training_id.in_(demo_training_ids)))
        if TrainingChunk.__tablename__ in existing_tables:
            await db.execute(delete(TrainingChunk).where(TrainingChunk.training_id.in_(demo_training_ids)))
        if TrainingStructure.__tablename__ in existing_tables:
            await db.execute(delete(TrainingStructure).where(TrainingStructure.training_id.in_(demo_training_ids)))
        await db.execute(delete(Training).where(Training.id.in_(demo_training_ids)))

    if demo_version_ids or demo_procedure_ids or demo_change_event_ids:
        await db.execute(
            delete(ProcedureImpactAssessment).where(
                or_(
                    ProcedureImpactAssessment.change_event_id.in_(demo_change_event_ids)
                    if demo_change_event_ids
                    else false(),
                    ProcedureImpactAssessment.procedure_id.in_(demo_procedure_ids)
                    if demo_procedure_ids
                    else false(),
                    ProcedureImpactAssessment.procedure_version_id.in_(demo_version_ids)
                    if demo_version_ids
                    else false(),
                )
            )
        )

    if demo_version_ids:
        await db.execute(delete(SemanticSegment).where(SemanticSegment.procedure_version_id.in_(demo_version_ids)))
        await db.execute(delete(VideoFrame).where(VideoFrame.procedure_version_id.in_(demo_version_ids)))
        await db.execute(
            delete(ProcedureVersionChunk).where(ProcedureVersionChunk.procedure_version_id.in_(demo_version_ids))
        )
        await db.execute(
            delete(ProcedureVersionTranscript).where(
                ProcedureVersionTranscript.procedure_version_id.in_(demo_version_ids)
            )
        )
        await db.execute(
            delete(ProcedureVersionStructure).where(
                ProcedureVersionStructure.procedure_version_id.in_(demo_version_ids)
            )
        )
        await db.execute(delete(ProcedureVersion).where(ProcedureVersion.id.in_(demo_version_ids)))

    if demo_task_ids or demo_procedure_ids:
        await db.execute(
            delete(TaskProcedureLink).where(
                or_(
                    TaskProcedureLink.task_id.in_(demo_task_ids) if demo_task_ids else false(),
                    TaskProcedureLink.procedure_id.in_(demo_procedure_ids) if demo_procedure_ids else false(),
                )
            )
        )
        await db.execute(
            delete(RoleTaskLink).where(
                or_(
                    RoleTaskLink.task_id.in_(demo_task_ids) if demo_task_ids else false(),
                    RoleTaskLink.role_id.in_(demo_role_ids) if demo_role_ids else false(),
                )
            )
        )

    if demo_task_ids:
        await db.execute(delete(Task).where(Task.id.in_(demo_task_ids)))

    if demo_procedure_ids:
        await db.execute(delete(Procedure).where(Procedure.id.in_(demo_procedure_ids)))

    if demo_change_event_ids:
        await db.execute(delete(ChangeEvent).where(ChangeEvent.id.in_(demo_change_event_ids)))

    if demo_user_ids or demo_role_ids:
        await db.execute(
            delete(UserRoleAssignment).where(
                or_(
                    UserRoleAssignment.user_id.in_(demo_user_ids) if demo_user_ids else false(),
                    UserRoleAssignment.role_id.in_(demo_role_ids) if demo_role_ids else false(),
                )
            )
        )

    if demo_role_ids:
        await db.execute(delete(Role).where(Role.id.in_(demo_role_ids)))

    if demo_user_ids:
        await db.execute(delete(User).where(User.id.in_(demo_user_ids)))

    await db.flush()
    log_progress("wipe demo: completo")


async def wipe_all_data(db) -> None:
    log_progress("wipe full: eliminando toda la base")
    existing_tables = await get_existing_table_names(db)
    for table in reversed(Base.metadata.sorted_tables):
        if table.name in existing_tables:
            await db.execute(table.delete())
    await db.flush()
    log_progress("wipe full: completo")


async def safe_embedding(text: str, label: str) -> list[float] | None:
    global _embedding_counter
    _embedding_counter += 1
    log_progress(f"embedding {_embedding_counter}: {label}")
    try:
        return await get_embedding(text)
    except Exception as exc:
        log_progress(f"embedding {_embedding_counter} failed: {label} ({exc})")
        return None


async def get_or_create_user(db, payload: dict) -> User:
    existing = (await db.execute(select(User).where(User.email == payload["email"]))).scalar_one_or_none()
    if existing:
        existing.name = payload["name"]
        existing.location = payload["location"]
        return existing
    user = User(
        name=payload["name"],
        email=payload["email"],
        hashed_password=hash_password(payload["password"]),
        location=payload["location"],
    )
    db.add(user)
    await db.flush()
    return user


async def seed(mode: str = "demo"):
    if mode not in {"demo", "full"}:
        raise ValueError(f"Unsupported seed mode: {mode}")

    log_progress(f"inicio modo={mode}")
    async with async_session() as db:
        if mode == "full":
            await wipe_all_data(db)
        else:
            await wipe_demo_data(db)

        log_progress("creando usuarios demo")
        admin = None
        users: dict[str, User] = {}
        for item in DEMO_USERS:
            user = await get_or_create_user(db, item)
            users[item["email"]] = user
            if item["email"] == "admin@demo.com":
                admin = user

        if admin is None:
            raise RuntimeError("Admin demo user is required")

        log_progress("creando roles demo")
        roles: dict[str, Role] = {}
        for item in DEMO_ROLES:
            role = (await db.execute(select(Role).where(Role.code == item["code"]))).scalar_one_or_none()
            if role is None:
                role = Role(**item)
                db.add(role)
                await db.flush()
            else:
                role.name = item["name"]
                role.description = item["description"]
                role.is_active = True
            roles[item["code"]] = role

        log_progress("creando asignaciones usuario-rol")
        role_assignments_map = {
            "marta@demo.com": "store-manager",
            "sofia@demo.com": "shift-supervisor",
            "diego@demo.com": "stock-clerk",
            "ana@demo.com": "cashier",
            "luis@demo.com": "fresh-food-operator",
        }
        for email, role_code in role_assignments_map.items():
            user = users[email]
            role = roles[role_code]
            existing = (
                await db.execute(
                    select(UserRoleAssignment).where(
                        UserRoleAssignment.user_id == user.id,
                        UserRoleAssignment.role_id == role.id,
                        UserRoleAssignment.status == "active",
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                db.add(
                    UserRoleAssignment(
                        user_id=user.id,
                        role_id=role.id,
                        location=user.location,
                        status="active",
                        starts_on=date.today() - timedelta(days=30),
                    )
                )

        procedures: dict[str, Procedure] = {}
        versions: dict[str, ProcedureVersion] = {}
        trainings: dict[str, Training] = {}

        for item in DEMO_PROCEDURES:
            log_progress(f"procesando procedimiento {item['code']}")
            role = roles[item["role_code"]]
            procedure = (await db.execute(select(Procedure).where(Procedure.code == item["code"]))).scalar_one_or_none()
            if procedure is None:
                procedure = Procedure(
                    code=item["code"],
                    title=item["title"],
                    description=item["description"],
                    owner_role_id=role.id,
                    status="active",
                    created_by=admin.id,
                )
                db.add(procedure)
                await db.flush()
            else:
                procedure.title = item["title"]
                procedure.description = item["description"]
                procedure.owner_role_id = role.id
                procedure.status = "active"
            procedures[item["code"]] = procedure

            version = (
                await db.execute(
                    select(ProcedureVersion).where(
                        ProcedureVersion.procedure_id == procedure.id,
                        ProcedureVersion.version_number == 1,
                    )
                )
            ).scalar_one_or_none()
            if version is None:
                version = ProcedureVersion(
                    procedure_id=procedure.id,
                    version_number=1,
                    status="published",
                    change_summary="Versión inicial demo",
                    change_reason="Bootstrap retail de mini mercados",
                    effective_from=date.today() - timedelta(days=15),
                    content_json={"steps": item["content"].split(". ")},
                    content_text=item["content"],
                    source_asset_type="video",
                    source_storage_key=f"demo/{item['code'].lower()}.mp4",
                    source_mime="video/mp4",
                    source_size=12_000_000,
                    source_processing_status="READY",
                    source_processing_error=None,
                    source_processed_at=datetime.now(timezone.utc),
                    created_by=admin.id,
                    embedding=await safe_embedding(item["content"], label=f"procedure-version:{item['code']}"),
                )
                db.add(version)
                await db.flush()
            else:
                version.status = "published"
                version.change_summary = "Versión inicial demo"
                version.change_reason = "Bootstrap retail de mini mercados"
                version.effective_from = date.today() - timedelta(days=15)
                version.content_json = {"steps": item["content"].split(". ")}
                version.content_text = item["content"]
                version.source_asset_type = "video"
                version.source_storage_key = f"demo/{item['code'].lower()}.mp4"
                version.source_mime = "video/mp4"
                version.source_size = 12_000_000
                version.source_processing_status = "READY"
                version.source_processing_error = None
                version.source_processed_at = datetime.now(timezone.utc)
                version.embedding = await safe_embedding(item["content"], label=f"procedure-version:{item['code']}")
            versions[item["code"]] = version

            transcript = (
                await db.execute(
                    select(ProcedureVersionTranscript).where(
                        ProcedureVersionTranscript.procedure_version_id == version.id
                    )
                )
            ).scalar_one_or_none()
            if transcript is None:
                db.add(
                    ProcedureVersionTranscript(
                        procedure_version_id=version.id,
                        transcript_raw=item["content"],
                        language="es",
                    )
                )
            else:
                transcript.transcript_raw = item["content"]
                transcript.language = "es"

            existing_chunks = list(
                (
                    await db.execute(
                        select(ProcedureVersionChunk).where(ProcedureVersionChunk.procedure_version_id == version.id)
                    )
                )
                .scalars()
                .all()
            )
            for chunk in existing_chunks:
                await db.delete(chunk)
            sentences = [part.strip() for part in item["content"].split(". ") if part.strip()]
            for index, sentence in enumerate(sentences):
                db.add(
                    ProcedureVersionChunk(
                        procedure_version_id=version.id,
                        chunk_index=index,
                        text=sentence,
                        start_time=float(index * 10),
                        end_time=float((index + 1) * 10),
                        embedding=await safe_embedding(
                            sentence,
                            label=f"chunk:{item['code']}:#{index + 1}",
                        ),
                    )
                )

            existing_frames = list(
                (
                    await db.execute(select(VideoFrame).where(VideoFrame.procedure_version_id == version.id))
                )
                .scalars()
                .all()
            )
            for frame in existing_frames:
                await db.delete(frame)
            db.add(
                VideoFrame(
                    procedure_version_id=version.id,
                    timestamp=3.0,
                    storage_key=f"frames/{version.id}/frame_0001.jpg",
                    caption=f"Vista operativa del procedimiento {item['title'].lower()}",
                )
            )
            db.add(
                VideoFrame(
                    procedure_version_id=version.id,
                    timestamp=12.0,
                    storage_key=f"frames/{version.id}/frame_0002.jpg",
                    caption="Registro visual de control y validación final",
                )
            )

            existing_segments = list(
                (
                    await db.execute(
                        select(SemanticSegment).where(SemanticSegment.procedure_version_id == version.id)
                    )
                )
                .scalars()
                .all()
            )
            for segment in existing_segments:
                await db.delete(segment)
            db.add(
                SemanticSegment(
                    procedure_version_id=version.id,
                    start_time=0.0,
                    end_time=10.0,
                    text_fused=item["content"],
                    embedding=await safe_embedding(
                        f"{item['title']} {item['content']}",
                        label=f"semantic-segment:{item['code']}",
                    ),
                )
            )

            structure = _build_structure(item["title"], item["content"])
            existing_structure = (
                await db.execute(
                    select(ProcedureVersionStructure).where(
                        ProcedureVersionStructure.procedure_version_id == version.id
                    )
                )
            ).scalar_one_or_none()
            if existing_structure is None:
                db.add(
                    ProcedureVersionStructure(
                        procedure_version_id=version.id,
                        structure_json=structure,
                    )
                )
            else:
                existing_structure.structure_json = structure

            training = (
                await db.execute(select(Training).where(Training.procedure_version_id == version.id))
            ).scalar_one_or_none()
            if training is None:
                training = Training(
                    procedure_version_id=version.id,
                    title=item["training_title"],
                    status="published",
                    summary=f"Training derivado de {item['code']}",
                    created_by=admin.id,
                )
                db.add(training)
                await db.flush()
            else:
                training.title = item["training_title"]
                training.status = "published"
                training.summary = f"Training derivado de {item['code']}"
            existing_training_structure = (
                await db.execute(select(TrainingStructure).where(TrainingStructure.training_id == training.id))
            ).scalar_one_or_none()
            if existing_training_structure is None:
                db.add(TrainingStructure(training_id=training.id, structure_json=structure))
            else:
                existing_training_structure.structure_json = structure
            existing_quizzes = list(
                (await db.execute(select(QuizQuestion).where(QuizQuestion.training_id == training.id))).scalars().all()
            )
            for quiz in existing_quizzes:
                await db.delete(quiz)
            db.add(
                QuizQuestion(
                    training_id=training.id,
                    question_json={
                        "position": 1,
                        "type": "mcq",
                        "question": f"¿Cuál es un paso crítico de {item['title'].lower()}?",
                        "options": [
                            "Documentar el proceso y validar desvíos",
                            "Saltar el registro si no hay tiempo",
                            "Esperar indicaciones del cliente",
                            "Delegar el control sin evidencia",
                        ],
                        "correct_answer": 0,
                        "evidence": {
                            "segment_range": "0s-10s",
                            "quote": item["content"][:120],
                        },
                        "verified": True,
                    },
                )
            )
            trainings[item["code"]] = training

        await db.flush()

        log_progress("limpiando relaciones demo rol-procedimiento")
        existing_demo_tasks = list(
            (
                await db.execute(
                    select(Task).where(
                        or_(
                            Task.description.like("[hidden-role-procedure]%"),
                            Task.title.in_(LEGACY_DEMO_TASK_TITLES),
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        for task in existing_demo_tasks:
            await db.delete(task)

        existing_demo_role_links = list(
            (
                await db.execute(
                    select(RoleTaskLink).where(RoleTaskLink.role_id.in_([role.id for role in roles.values()]))
                )
            )
            .scalars()
            .all()
        )
        for link in existing_demo_role_links:
            await db.delete(link)

        await db.flush()

        log_progress("creando relaciones demo rol-procedimiento")
        for item in DEMO_ROLE_PROCEDURE_LINKS:
            role = roles[item["role_code"]]
            procedure = procedures[item["procedure_code"]]
            marker = hidden_role_procedure_marker(item["role_code"], item["procedure_code"])
            task = (await db.execute(select(Task).where(Task.description == marker))).scalars().first()
            if task is None:
                task = Task(
                    title=f"{role.name} · {procedure.title}",
                    description=marker,
                    embedding=await safe_embedding(
                        f"{role.name} {procedure.title} {procedure.description or ''}",
                        label=f"hidden-task:{item['role_code']}:{item['procedure_code']}",
                    ),
                )
                db.add(task)
                await db.flush()
            else:
                task.title = f"{role.name} · {procedure.title}"
                task.description = marker
                task.embedding = await safe_embedding(
                    f"{role.name} {procedure.title} {procedure.description or ''}",
                    label=f"hidden-task:{item['role_code']}:{item['procedure_code']}",
                )

            role_links = list(
                (
                    await db.execute(select(RoleTaskLink).where(RoleTaskLink.task_id == task.id))
                )
                .scalars()
                .all()
            )
            current_role_link = None
            for role_link in role_links:
                if role_link.role_id == role.id and current_role_link is None:
                    current_role_link = role_link
                else:
                    await db.delete(role_link)
            if current_role_link is None:
                db.add(RoleTaskLink(role_id=role.id, task_id=task.id, is_required=item["is_required"]))
            else:
                current_role_link.is_required = item["is_required"]

            procedure_links = list(
                (
                    await db.execute(select(TaskProcedureLink).where(TaskProcedureLink.task_id == task.id))
                )
                .scalars()
                .all()
            )
            current_procedure_link = None
            for procedure_link in procedure_links:
                if procedure_link.procedure_id == procedure.id and current_procedure_link is None:
                    current_procedure_link = procedure_link
                else:
                    await db.delete(procedure_link)
            if current_procedure_link is None:
                db.add(TaskProcedureLink(task_id=task.id, procedure_id=procedure.id, is_primary=True))
            else:
                current_procedure_link.is_primary = True

        log_progress("creando assignments demo")
        for item in DEMO_ASSIGNMENTS:
            user = users[item["email"]]
            training = trainings[item["procedure_code"]]
            existing = (
                await db.execute(
                    select(Assignment).where(Assignment.training_id == training.id, Assignment.user_id == user.id)
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = Assignment(
                    training_id=training.id,
                    user_id=user.id,
                    assignment_type="training",
                    status=item["status"],
                    due_date=date.today() + timedelta(days=7),
                    score=item["score"],
                    attempts=1 if item["score"] is not None else 0,
                    completed_at=datetime.now(timezone.utc) if item["status"] == "completed" else None,
                    started_at=datetime.now(timezone.utc) if item["status"] in {"completed", "in_progress"} else None,
                )
                db.add(existing)
            else:
                existing.status = item["status"]
                existing.due_date = date.today() + timedelta(days=7)
                existing.score = item["score"]
                existing.attempts = 1 if item["score"] is not None else 0
                existing.completed_at = datetime.now(timezone.utc) if item["status"] == "completed" else None
                existing.started_at = (
                    datetime.now(timezone.utc) if item["status"] in {"completed", "in_progress"} else None
                )

        log_progress("creando incidentes demo")
        for item in DEMO_INCIDENTS:
            incident = (
                await db.execute(select(Incident).where(Incident.description == item["description"]))
            ).scalar_one_or_none()
            if incident is None:
                incident = Incident(
                    description=item["description"],
                    severity=item["severity"],
                    role_id=roles[item["role_code"]].id,
                    location=item["location"],
                    created_by=admin.id,
                    embedding=await safe_embedding(item["embedding_text"], label=f"incident:{item['role_code']}"),
                )
                db.add(incident)
                await db.flush()
            else:
                incident.severity = item["severity"]
                incident.role_id = roles[item["role_code"]].id
                incident.location = item["location"]
                incident.embedding = await safe_embedding(item["embedding_text"], label=f"incident:{item['role_code']}")

            analysis_run = (
                await db.execute(
                    select(IncidentAnalysisRun).where(
                        IncidentAnalysisRun.incident_id == incident.id,
                        IncidentAnalysisRun.source == "manual",
                    )
                )
            ).scalar_one_or_none()
            if analysis_run is None:
                analysis_run = IncidentAnalysisRun(
                    incident_id=incident.id,
                    source="manual",
                    analysis_summary=item["analysis_summary"],
                    resolution_summary=item["resolution_summary"],
                    created_by=admin.id,
                )
                db.add(analysis_run)
                await db.flush()
            else:
                analysis_run.analysis_summary = item["analysis_summary"]
                analysis_run.resolution_summary = item["resolution_summary"]
                analysis_run.created_by = admin.id

            existing_findings = list(
                (
                    await db.execute(
                        select(IncidentAnalysisFinding).where(IncidentAnalysisFinding.analysis_run_id == analysis_run.id)
                    )
                )
                .scalars()
                .all()
            )
            for finding in existing_findings:
                await db.delete(finding)

            procedure_code = item["finding"]["procedure_code"]
            db.add(
                IncidentAnalysisFinding(
                    analysis_run_id=analysis_run.id,
                    procedure_version_id=versions[procedure_code].id if procedure_code else None,
                    finding_type=item["finding"]["finding_type"],
                    confidence=item["finding"]["confidence"],
                    reasoning_summary=item["finding"]["reasoning_summary"],
                    recommended_action=item["finding"]["recommended_action"],
                    status="confirmed",
                )
            )

        change_event = (
            await db.execute(select(ChangeEvent).where(ChangeEvent.title == DEMO_CHANGE_EVENT["title"]))
        ).scalar_one_or_none()
        if change_event is None:
            change_event = ChangeEvent(
                title=DEMO_CHANGE_EVENT["title"],
                description=DEMO_CHANGE_EVENT["description"],
                source_type=DEMO_CHANGE_EVENT["source_type"],
                status=DEMO_CHANGE_EVENT["status"],
                effective_from=date.today() + timedelta(days=10),
                context_json=DEMO_CHANGE_EVENT["context_json"],
                created_by=admin.id,
                embedding=await safe_embedding(
                    DEMO_CHANGE_EVENT["embedding_text"],
                    label="change-event:recepcion refrigerada",
                ),
            )
            db.add(change_event)
        else:
            change_event.description = DEMO_CHANGE_EVENT["description"]
            change_event.source_type = DEMO_CHANGE_EVENT["source_type"]
            change_event.status = DEMO_CHANGE_EVENT["status"]
            change_event.effective_from = date.today() + timedelta(days=10)
            change_event.context_json = DEMO_CHANGE_EVENT["context_json"]
            change_event.embedding = await safe_embedding(
                DEMO_CHANGE_EVENT["embedding_text"],
                label="change-event:recepcion refrigerada",
            )

        log_progress("sincronizando compliance")
        await sync_user_procedure_compliance(db)
        log_progress("commit final")
        await db.commit()

    log_progress("completo")
    print(f"Seed complete ({mode}): migrate with Alembic first, then run python seed.py", flush=True)


async def reseed_demo():
    await seed(mode="demo")


async def reseed_full():
    await seed(mode="full")


def parse_args():
    parser = argparse.ArgumentParser(description="Seed demo data")
    parser.add_argument("--mode", choices=["demo", "full"], default="demo")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(seed(mode=args.mode))
