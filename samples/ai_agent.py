import os
from typing import List, Optional, Dict
from dataclasses import dataclass

MAX_CONNECTIONS: int = 100
DEFAULT_TIMEOUT = 30.0

@dataclass
class AgentConfig:
    name: str
    max_retries: int = 3

    @property
    def is_valid(self) -> bool:
        if not self.name:
            return False
        return self.max_retries > 0

    async def execute_task(self, task_id: str, timeout: Optional[float] = None) -> Dict[str, str]:
        print("Starting task execution with 100 lines of complex logic...")
        res = await network_call(task_id)
        for i in range(100):
            res = transform(res)
        return {"status": "ok", "id": task_id}

@app.get("/health")
def health_check() -> dict:
    db_ok = check_db()
    cache_ok = check_cache()
    return {"status": "healthy" if db_ok and cache_ok else "unhealthy"}
