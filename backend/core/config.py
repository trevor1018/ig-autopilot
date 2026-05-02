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

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    database_url: str = f"sqlite:///{BASE_DIR / 'data' / 'ig_autopilot.db'}"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    ig_dry_run: bool = True
    ig_username: str = ""
    ig_password: str = ""
    ig_proxy: str = ""

    sweep_hours: str = "0,8,16"
    daily_action_cap: int = 120
    like_ratio: float = 0.9
    action_delay_min_sec: int = 30
    action_delay_max_sec: int = 300

    @property
    def sweep_hour_list(self) -> list[int]:
        return [int(h.strip()) for h in self.sweep_hours.split(",") if h.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

(BASE_DIR / "data").mkdir(exist_ok=True)
