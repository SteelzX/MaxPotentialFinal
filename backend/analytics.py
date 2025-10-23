"""Core analytics routines for MaxPot backend.

Implements hydration, electrolyte, sleep, and training load scoring along with
daily readiness and insight generation. Designed to mirror the product spec
outlined in the project notes so that the Expo client can consume structured
feedback from a Python service.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from statistics import mean, pstdev
from typing import Iterable, List, Sequence

from .schemas import (
    DailyAnalysis,
    DailyInputs,
    Insight,
    Recommendation,
    TrainingLoadBreakdown,
    UserProfile,
)


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def map_acwr_to_score(acwr: float) -> float:
    """Maps Acute:Chronic Workload Ratio to a 0-100 score.

    Uses a gentle bell curve centred around 1.0 with healthy range 0.8-1.3.
    """
    if acwr <= 0:
        return 0.0
    if 0.8 <= acwr <= 1.3:
        # Peak score 100 at 1.0, decline towards edges of the green zone.
        return 85 + (15 * (1 - abs(acwr - 1.0) / 0.3))
    if acwr < 0.8:
        # Linearly scale down to 60 at 0.6, 40 at 0.4.
        if acwr <= 0.4:
            return 40.0
        return 60 + (acwr - 0.6) * 125
    # acwr > 1.3
    if acwr >= 1.8:
        return 35.0
    # Decline from 85 at 1.3 down to 60 at 1.5, then 45 at 1.7
    if acwr <= 1.5:
        return 85 - ((acwr - 1.3) / 0.2) * 25
    return 60 - ((acwr - 1.5) / 0.2) * 15


def _training_load_for_workout(workout: DailyInputs.WorkoutLog) -> TrainingLoadBreakdown:
    srpe_load = (workout.session_rpe or 0) * (workout.duration_min or 0)
    strength_bonus = 0.0
    if workout.sets:
        for s in workout.sets:
            intensity_points = 0
            if s.past_failure:
                intensity_points = 12
            elif s.to_failure:
                intensity_points = 10
            elif s.rir is not None:
                if s.rir <= 0:
                    intensity_points = 10
                elif s.rir == 1:
                    intensity_points = 9
                elif s.rir == 2:
                    intensity_points = 8
                elif s.rir == 3:
                    intensity_points = 7
                elif s.rir == 4:
                    intensity_points = 6
                else:
                    intensity_points = 5
            else:
                intensity_points = 6
            reps = s.reps or 0
            strength_bonus += intensity_points * reps / 10.0
    total = srpe_load + strength_bonus
    return TrainingLoadBreakdown(
        srpe_load=srpe_load,
        strength_bonus=strength_bonus,
        total=total,
    )


def _compute_acwr(daily_loads: Sequence[float]) -> float:
    if not daily_loads:
        return 0.0
    acute = mean(daily_loads[-7:]) if len(daily_loads) >= 7 else mean(daily_loads)
    chronic_window = daily_loads[-28:] if len(daily_loads) >= 28 else daily_loads
    chronic = mean(chronic_window) if chronic_window else 1.0
    if chronic <= 0:
        chronic = 1.0
    return acute / chronic


def hydration_target_ml(user: UserProfile, training_addon_ml: float) -> float:
    base = (user.hydration_multiplier_ml_per_kg or 35.0) * user.weight_kg
    return base + training_addon_ml


def estimate_training_addon_ml(user: UserProfile, workouts: Sequence[DailyInputs.WorkoutLog]) -> float:
    """Estimate additional hydration need from training load (ml)."""
    total_minutes = sum(w.duration_min or 0 for w in workouts)
    sweat_rate_lph = user.estimated_sweat_rate_lph or 0.8
    intensity_factor = 1.2 if user.climate.lower() == "hot" else 1.0
    return total_minutes / 60.0 * sweat_rate_lph * 1000.0 * intensity_factor


def sodium_target_mg(training_addon_ml: float) -> float:
    sweat_liters = training_addon_ml / 1000.0
    return max(0.0, 700.0 * sweat_liters)


def analyze_day(user: UserProfile, inputs: DailyInputs, recent_training_loads: Sequence[float]) -> DailyAnalysis:
    training_addon_ml = estimate_training_addon_ml(user, inputs.workouts)
    hydration_target = hydration_target_ml(user, training_addon_ml)
    hydration_score = clamp(
        100.0 * inputs.total_hydration_ml / max(hydration_target, 1.0),
        0.0,
        120.0,
    )

    sodium_target = sodium_target_mg(training_addon_ml)
    sodium_score = 100.0
    if sodium_target > 0:
        sodium_score = 100.0 - 100.0 * abs(inputs.total_sodium_mg - sodium_target) / sodium_target
    sodium_score = clamp(sodium_score, 0.0, 100.0)

    sleep_duration = inputs.total_sleep_hours
    sleep_goal = user.sleep_hours_goal
    sleep_duration_score = 60.0 * min(sleep_duration / sleep_goal, 1.0) if sleep_goal else 40.0
    sleep_consistency_minutes = inputs.sleep_consistency_minutes or 0.0
    sleep_consistency_score = 25.0 * (1.0 - min(sleep_consistency_minutes / 90.0, 1.0))
    sleep_debt_hours = inputs.sleep_debt_hours or 0.0
    sleep_debt_score = 15.0 * (1.0 - min(sleep_debt_hours / 7.0, 1.0))
    sleep_score = clamp(sleep_duration_score + sleep_consistency_score + sleep_debt_score, 0.0, 100.0)

    # Training load for today
    per_session = [_training_load_for_workout(w) for w in inputs.workouts]
    today_load = sum(load.total for load in per_session)
    updated_loads = list(recent_training_loads) + [today_load]
    acwr = _compute_acwr(updated_loads)
    training_trend_score = clamp(map_acwr_to_score(acwr), 0.0, 100.0)

    readiness = (
        0.4 * sleep_score
        + 0.3 * training_trend_score
        + 0.2 * clamp(hydration_score, 0.0, 100.0)
        + 0.1 * sodium_score
    )
    readiness = clamp(readiness, 0.0, 100.0)

    insights: List[Insight] = []
    recs: List[Recommendation] = []

    if hydration_score < 70:
        insights.append(
            Insight(
                category="hydration",
                message="Hydration below target today.",
                severity="warning",
            )
        )
        deficit = max(0.0, hydration_target - inputs.total_hydration_ml)
        recs.append(
            Recommendation(
                message=f"Add roughly {int(deficit)} ml of fluids across the evening.",
                category="hydration",
            )
        )

    if sodium_score < 70 and sodium_target > 0:
        insights.append(
            Insight(
                category="electrolytes",
                message="Electrolyte intake ran below the sweat estimate.",
                severity="warning",
            )
        )
        recs.append(
            Recommendation(
                message="Consider an extra 400–600 mg of sodium for tomorrow's training.",
                category="electrolytes",
            )
        )

    if sleep_score < 75:
        insights.append(
            Insight(
                category="sleep",
                message="Sleep score dipped below the optimal range.",
                severity="info",
            )
        )

    if acwr > 1.5:
        insights.append(
            Insight(
                category="training",
                message="ACWR trending high—risk of overreaching.",
                severity="critical" if acwr >= 1.7 else "warning",
            )
        )
        recs.append(
            Recommendation(
                message="Plan a lighter or restorative session tomorrow.",
                category="training",
            )
        )
    elif acwr < 0.8 and len(updated_loads) >= 7:
        insights.append(
            Insight(
                category="training",
                message="ACWR is low; base fitness may detrain.",
                severity="info",
            )
        )

    return DailyAnalysis(
        date=inputs.date,
        readiness=readiness,
        hydration_score=clamp(hydration_score, 0.0, 100.0),
        hydration_target_ml=hydration_target,
        hydration_intake_ml=inputs.total_hydration_ml,
        sodium_score=sodium_score,
        sodium_intake_mg=inputs.total_sodium_mg,
        sodium_target_mg=sodium_target,
        sleep_score=sleep_score,
        sleep_hours=sleep_duration,
        sleep_consistency_minutes=sleep_consistency_minutes,
        sleep_debt_hours=sleep_debt_hours,
        acwr=acwr,
        training_load_today=today_load,
        session_breakdown=per_session,
        insights=insights,
        recommendations=recs,
    )


def summarize_training_loads(workouts: Iterable[DailyInputs.WorkoutLog]) -> float:
    return sum(_training_load_for_workout(w).total for w in workouts)
