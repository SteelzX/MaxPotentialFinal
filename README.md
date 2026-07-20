# MaxPot — Athlete Tracking & Analytics App

MaxPot is a mobile app for athletes to log daily training, hydration, electrolytes, and sleep, and get science-based daily analysis of training load and recovery. It consists of an Expo (React Native) mobile app backed by Firebase, plus a FastAPI analytics service.

## Features

- **Daily logging** — track water intake, electrolytes, sleep, and workouts (strength sets, steady-state runs, sprint sessions) through quick-entry modals with edit support.
- **Analyze tab** — charts and summaries of your workouts, sleep, and hydration over time.
- **Calendar** — browse and edit past days' entries.
- **Analytics engine** — the backend computes per-workout training load, acute:chronic workload ratio (ACWR), personalized hydration and sodium targets, and returns daily insights and recommendations.
- **Accounts & sync** — email/password auth and cloud data storage via Firebase (Auth + Firestore), with AsyncStorage persistence.
- **Dark / light mode** and local notifications.

## Project structure

```
.
├── App.js            # Entire mobile app UI: auth, Home/Analyze/Calendar/Settings, forms, charts
├── firebase.js       # Firebase initialization (Auth + Firestore)
├── index.js          # Expo entry point
├── app.json          # Expo app config
├── eas.json          # EAS build config
├── assets/           # App icons and splash screen
└── backend/          # FastAPI analytics service ("MaxPot Analytics")
    ├── main.py       # API endpoints (user profiles, daily analysis, training-load summary)
    ├── analytics.py  # Training load, ACWR, hydration/sodium target calculations
    ├── schemas.py    # Pydantic models (UserProfile, DailyInputs, DailyAnalysis, ...)
    └── tests/        # Backend unit tests
```

## Getting started

### Prerequisites

- Node.js and npm
- [Expo CLI](https://docs.expo.dev/) (installed automatically via `npx expo`)
- Python 3.10+ (for the backend)
- Expo Go on your phone, or an iOS/Android simulator

### Mobile app

1. Copy `.env.example` to `.env` and fill in your Firebase project's config values (from the Firebase console → Project settings → Your apps). The `.env` file is git-ignored.

```bash
cp .env.example .env
```

2. Install dependencies and start the dev server:

```bash
npm install
npm start          # starts the Expo dev server
```

Then scan the QR code with Expo Go, or run natively:

```bash
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # web preview
```

### Backend (analytics API)

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload    # run from the repo root
```

The API serves interactive docs at `http://localhost:8000/docs`.

#### Key endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/users/{user_id}` | Create or update a user profile |
| `GET` | `/users/{user_id}` | Fetch a user profile |
| `POST` | `/analyze/daily` | Run daily analysis (training load, ACWR, hydration/sodium targets, insights) |
| `GET` | `/training-load/{user_id}` | Summary of recent and overall training load |

Note: the backend currently uses in-memory storage, so data resets on restart — it's intended for local development.

### Backend tests

```bash
cd backend
python -m pytest tests/
```

## Tech stack

- **Frontend:** React Native 0.81 / React 19 via Expo SDK 54, React Navigation, Expo Notifications, `expo-linear-gradient`
- **Data & auth:** Firebase (Auth, Firestore) with AsyncStorage persistence
- **Backend:** FastAPI, Pydantic, Uvicorn

## Builds

Production builds are configured through [EAS Build](https://docs.expo.dev/build/introduction/) (`eas.json`):

```bash
npx eas build --platform ios      # or android
```
