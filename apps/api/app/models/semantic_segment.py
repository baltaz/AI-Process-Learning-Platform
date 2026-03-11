import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Float, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SemanticSegment(Base):
    __tablename__ = "semantic_segments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    training_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trainings.id", ondelete="CASCADE"))
    start_time: Mapped[float] = mapped_column(Float)
    end_time: Mapped[float] = mapped_column(Float)
    text_fused: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Vector(3072), nullable=True)
