"""E-Broker API settings. Env-driven via .env.local (dev) or Lambda env (prod)."""
from pydantic_settings import BaseSettings, SettingsConfigDict

UNIFIED_CLASSES = [
    "battery", "hard_drive", "pcb", "motherboard", "ram",
    "copper_cable", "smartphone_device", "chip", "peripheral_other",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env.local", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://ebroker:ebroker_dev_password@localhost:5432/ebroker"
    DATABASE_URL_SYNC: str = "postgresql://ebroker:ebroker_dev_password@localhost:5432/ebroker"

    # S3-compatible object storage (Elestio MinIO in compose, AWS S3 in cloud).
    # boto3 speaks the S3 API against either endpoint - no AWS dependency.
    AWS_ENDPOINT_URL: str | None = "http://localhost:9000"
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin123"
    AWS_DEFAULT_REGION: str = "ap-south-1"
    S3_BUCKET: str = "ebroker-images"
    S3_MODEL_BUCKET: str = "ebroker-models"

    # Auth - local bypass ONLY when ADMIN_JWT_BYPASS=true (never in prod)
    ADMIN_JWT_BYPASS: bool = True
    ADMIN_JWT_BYPASS_TOKEN: str = "admin-test-token"
    ADMIN_BYPASS_EMAIL: str = "admin@test.com"

    SESSION_TOKEN_SECRET: str = "dev-only-session-secret-change-in-prod"
    SESSION_TOKEN_TTL_S: int = 60 * 60 * 12
    
    # ML inference
    MOCK_INFERENCE: bool = False
    ACTIVE_MODEL_PATH: str = "models/best_yolo26.pt"
    INFERENCE_CONF_THRESHOLD: float = 0.35
    INFERENCE_MAX_DETECTIONS: int = 50
    # Same-class de-duplication: boxes overlapping above this IoU are merged.
    INFERENCE_DEDUP_IOU: float = 0.5
    # Cap instances served per class so one crowded class can't flood results.
    INFERENCE_PER_CLASS_MAX: int = 10

    # Internal API (Modal → Lambda callbacks)
    INTERNAL_API_KEY: str = "test-internal-key"

    # Strands / Bedrock
    BEDROCK_REGION: str = "us-east-1"
    STRANDS_AGENT_MODEL: str = "us.amazon.nova-pro-v1:0"
    AGENT_MODEL_ID: str = "us.amazon.nova-pro-v1:0"
    AGENT_TIMEOUT_S: int = 25
    AGENT_MOCK: bool = False
    # Local/self-hosted LLM via Ollama (AGENT_PROVIDER=ollama). Same Agent +
    # tools interface, so the SSE pipeline is unchanged. Thinking stays OFF
    # (no <|think|> token) so the model returns strict JSON.
    AGENT_PROVIDER: str = "ollama"  # ollama | bedrock
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma4:31b-cloud"

    # Metals pricing is a static reference table now (api/core/metal_prices.py)
    # - the metals.dev free tier is exhausted, so no live key is configured.
    METALS_API_KEY: str = ""
    METALS_API_URL: str = "https://api.metals.dev/v1/latest"
    METALS_API_CURRENCY: str = "INR"
    METALS_API_UNIT: str = "g"

    # Exchange rate (exchangerate-api.com free tier - 1500 req/month)
    EXCHANGE_RATE_API_KEY: str = ""
    EXCHANGE_RATE_API_URL: str = "https://v6.exchangerate-api.com/v6/{key}/latest/USD"

    # Misc
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    LOG_LEVEL: str = "DEBUG"
    TRAINING_TRIGGER_THRESHOLD: int = 200


settings = Settings()
