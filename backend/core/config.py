from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str = ""  # reserved for future Claude-based features
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    # Image model = "Nano Banana" (Google's instruction-based image edit / gen model).
    # Same API key as gemini_model. Free-tier limited (~10-50 RPD typical).
    image_model: str = "gemini-2.5-flash-image-preview"

    database_url: str = f"sqlite:///{BASE_DIR / 'data' / 'ig_autopilot.db'}"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

(BASE_DIR / "data").mkdir(exist_ok=True)
