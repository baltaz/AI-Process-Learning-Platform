from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_training"

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 1440

    AI_PROFILE: str = "PAID"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL_TEXT: str = "gpt-4o"
    OPENAI_MODEL_CAPTION: str = "gpt-4o-mini"
    OPENAI_MODEL_TRANSCRIBE: str = "whisper-1"
    OPENAI_MODEL_EMBEDDING: str = "text-embedding-3-large"
    AI_EMBEDDING_DIM: int = 3072
    OPENAI_COST_TEXT_INPUT_PER_1M: float = 0.0
    OPENAI_COST_TEXT_OUTPUT_PER_1M: float = 0.0
    OPENAI_COST_EMBED_INPUT_PER_1M: float = 0.0
    OPENAI_COST_TRANSCRIBE_PER_MINUTE: float = 0.0

    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GEMINI_MODEL_TEXT: str = "gemini-2.5-flash"
    GEMINI_MODEL_CAPTION: str = "gemini-2.5-flash"
    GEMINI_MODEL_TRANSCRIBE: str = "gemini-2.5-flash"
    GEMINI_MODEL_EMBEDDING: str = "gemini-embedding-001"
    GEMINI_MIN_REQUEST_INTERVAL_SECONDS: float = 12.0
    GEMINI_MAX_RETRIES: int = 3
    GEMINI_RETRY_BASE_SECONDS: float = 2.0
    GEMINI_COST_TEXT_INPUT_PER_1M: float = 0.0
    GEMINI_COST_TEXT_OUTPUT_PER_1M: float = 0.0
    GEMINI_COST_EMBED_INPUT_PER_1M: float = 0.0
    GEMINI_COST_TRANSCRIBE_PER_MINUTE: float = 0.0

    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY_ID: str = "minioadmin"
    S3_SECRET_ACCESS_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "ai-training-assets"
    S3_PUBLIC_URL: str = "http://localhost:9000/ai-training-assets"

    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
