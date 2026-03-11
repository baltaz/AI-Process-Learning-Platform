from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_trainings: int
    total_assignments: int
    completion_rate: float
    average_score: float | None
    overdue_count: int
    top_incidents: list[dict] = []
