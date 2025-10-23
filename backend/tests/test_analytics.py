import math
from datetime import date

from backend.analytics import analyze_day
from backend.schemas import DailyInputs, UserProfile


def test_analyze_day_basic():
    profile = UserProfile(
        id="user1",
        weight_kg=70,
        climate="temperate",
        sleep_hours_goal=8,
    )
    inputs = DailyInputs(
        user_id="user1",
        date=date.today(),
        total_hydration_ml=2600,
        total_sodium_mg=1500,
        total_sleep_hours=7.5,
        sleep_consistency_minutes=45,
        sleep_debt_hours=1.0,
        workouts=[
            DailyInputs.WorkoutLog(
                date=date.today(),
                type="strength",
                duration_min=60,
                session_rpe=7,
                sets=[
                    {"reps": 8, "rir": 2},
                    {"reps": 8, "rir": 1},
                ],
            )
        ],
    )
    result = analyze_day(profile, inputs, recent_training_loads=[])
    assert 0 <= result.readiness <= 100
    assert math.isclose(result.hydration_intake_ml, 2600)
    assert result.session_breakdown[0].total > 0
