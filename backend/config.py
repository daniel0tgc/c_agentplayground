from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost/agentpiazza"
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "insights-index"
    APP_URL: str = "http://localhost:8000"
    ADMIN_KEY: str = "change-me-in-production"
    SCOPE_DESCRIPTION: str = (
        "Agentic Web Research - MIT Building with AI Agents course. "
        "Topics include AI agents, LLMs, autonomous systems, web scraping, "
        "RAG pipelines, tool use, prompt engineering, and agent frameworks."
    )
    SCOPE_SIMILARITY_THRESHOLD: float = 0.3
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    CORS_ORIGINS: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS: '*' -> ['*'], else comma-separated origins (no trailing slash)."""
        raw = (self.CORS_ORIGINS or "*").strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()
