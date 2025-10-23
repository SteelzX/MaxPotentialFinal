"""FastAPI service exposing analytics endpoints for MaxPot."""
from __future__ import annotations

from datetime import date
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .analytics import analyze_day, summarize_training_loads
from .schemas import DailyAnalysis, DailyInputs, UserProfile

app = FastAPI(title="MaxPot Analytics", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory placeholder storage so the endpoints can be exercised locally.
USER_PROFILES: Dict[str, UserProfile] = {}
TRAINING_HISTORY: Dict[str, List[float]] = {}


@app.post("/users/{user_id}", response_model=UserProfile)
def upsert_user_profile(user_id: str, profile: UserProfile) -> UserProfile:
    profile.id = user_id
    USER_PROFILES[user_id] = profile
    TRAINING_HISTORY.setdefault(user_id, [])
    return profile


@app.get("/users/{user_id}", response_model=UserProfile)
def get_user_profile(user_id: str) -> UserProfile:
    profile = USER_PROFILES.get(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    return profile


@app.post("/analyze/daily", response_model=DailyAnalysis)
def post_daily_analysis(payload: DailyInputs) -> DailyAnalysis:
    profile = USER_PROFILES.get(payload.user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")

    history = payload.recent_training_loads or TRAINING_HISTORY.setdefault(payload.user_id, [])
    result = analyze_day(profile, payload, history)
    if payload.recent_training_loads is None:
        history.append(result.training_load_today)
    return result


@app.get("/training-load/{user_id}")
def get_training_load_summary(user_id: str) -> Dict[str, float]:
    history = TRAINING_HISTORY.get(user_id)
    if not history:
        raise HTTPException(status_code=404, detail="No training data for user")
    return {
        "count": len(history),
        "recent_7d_avg": sum(history[-7:]) / min(len(history), 7),
        "overall_avg": sum(history) / len(history),
    }
