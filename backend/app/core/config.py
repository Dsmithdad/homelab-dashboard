"""
Application configuration
"""
from pydantic import validator
from pydantic_settings import BaseSettings, NoDecode
from typing import Annotated
from typing import List, Union
import ast


class Settings(BaseSettings):
    PROJECT_NAME: str = "Homelab Dashboard"
    API_V1_STR: str = "/api/v1"
    BACKEND_CORS_ORIGINS: Annotated[List[str], NoDecode] = []

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, list):
            return v
        return v

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Security
    SECRET_KEY: str = "changeme-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days

    # Database
    SQLITE_DB_PATH: str = "data/app.db"

    # Docker
    DOCKER_HOST: str = "unix:///var/run/docker.sock"

    # External service APIs (to be configured via env vars)
    HOME_ASSISTANT_URL: str = ""
    HOME_ASSISTANT_TOKEN: str = ""

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"  # .env also holds settings read straight from the environment by the endpoints


settings = Settings()