"""Shared Pydantic models for the MaxPot analytics service."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    id: str
    sex: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: float = Field(..., gt=0)
    sport: Optional[str] = None
    climate: str = "temperate"
    timezone: str = "UTC"
    sleep_hours_goal: float = Field(default=8.0, gt=0)
    hydration_multiplier_ml_per_kg: Optional[float] = Field(default=35.0, gt=0)
    estimated_sweat_rate_lph: Optional[float] = Field(default=0.8, gt=0)


class HydrationLog(BaseModel):
    ts: datetime
    volume_ml: float
    source: Optional[str] = None


class ElectrolyteLog(BaseModel):
    ts: datetime
    sodium_mg: float = 0
    potassium_mg: float = 0
    magnesium_mg: float = 0
    calcium_mg: float = 0
    source: Optional[str] = None


class SleepLog(BaseModel):
    sleep_start_ts: datetime
    wake_ts: datetime
    naps_minutes: Optional[float] = None
    sleep_quality_1_5: Optional[int] = Field(default=None, ge=1, le=5)


class WorkoutSet(BaseModel):
    muscle_group: Optional[str] = None
    reps: Optional[int] = None
    rir: Optional[int] = Field(default=None, ge=0, le=6)
    to_failure: Optional[bool] = False
    past_failure: Optional[bool] = False


class ConditioningDetail(BaseModel):
    modality: Optional[str] = None
    distance_m: Optional[float] = None
    pace: Optional[float] = None
    hr_avg: Optional[int] = None


class WorkoutLog(BaseModel):
    date: date
    type: str
    duration_min: Optional[float] = None
    session_rpe: Optional[float] = None
    sets: Optional[List[WorkoutSet]] = None
    conditioning_detail: Optional[ConditioningDetail] = None


class DailyInputs(BaseModel):
    class WorkoutLog(WorkoutLog):
        pass

    user_id: str
    date: date
    total_hydration_ml: float = 0
    total_sodium_mg: float = 0
    total_potassium_mg: float = 0
    total_magnesium_mg: float = 0
    total_calcium_mg: float = 0
    total_sleep_hours: float = 0
    sleep_consistency_minutes: Optional[float] = None
    sleep_debt_hours: Optional[float] = None
    workouts: List[WorkoutLog] = Field(default_factory=list)
    recent_training_loads: Optional[List[float]] = None


class TrainingLoadBreakdown(BaseModel):
    srpe_load: float
    strength_bonus: float
    total: float


class Insight(BaseModel):
    category: str
    message: str
    severity: str = "info"


class Recommendation(BaseModel):
    message: str
    category: str


class DailyAnalysis(BaseModel):
    date: date
    readiness: float
    hydration_score: float
    hydration_target_ml: float
    hydration_intake_ml: float
    sodium_score: float
    sodium_intake_mg: float
    sodium_target_mg: float
    sleep_score: float
    sleep_hours: float
    sleep_consistency_minutes: Optional[float] = None
    sleep_debt_hours: Optional[float] = None
    acwr: float
    training_load_today: float
    session_breakdown: List[TrainingLoadBreakdown]
    insights: List[Insight] = Field(default_factory=list)
    recommendations: List[Recommendation] = Field(default_factory=list)
