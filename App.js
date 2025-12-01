import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
 SafeAreaView,
 StyleSheet,
 Text,
 View,
 TouchableOpacity,
 Modal,
 TextInput,
 Pressable,
 Platform,
 KeyboardAvoidingView,
 Dimensions,
 ScrollView,
 Animated,
 Easing,
 LayoutAnimation,
 UIManager,
 ActivityIndicator,
 Alert,
 Switch,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import {
 onAuthChanged,
 signInWithEmail,
 signUpWithEmail,
 signOut as signOutUser,
 fetchUserData,
 saveUserData,
} from './firebase';


// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
 UIManager.setLayoutAnimationEnabledExperimental(true);
}

const defaultGoals = {
 waterMl: 2500,
 sleepHr: 8,
 workout: 1,
 electrolyte: 100,
 waterBottleMl: 500,
};

const makeDefaultElectrolytes = () => ({
 sodium: 0,
 potassium: 0,
 chloride: 0,
 magnesium: 0,
 calcium: 0,
 phosphate: 0,
 bicarbonate: 0,
});

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const formatDateLabel = (dateKey) => {
  if (!dateKey) return 'today';
  const date = new Date(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const makeDefaultToday = (dateKey = getTodayKey()) => ({
 dateKey,
 waterMl: 0,
 sleepHr: 0,
 workoutSessions: [],
 electrolytes: makeDefaultElectrolytes(),
 electrolyteLogged: false,
});

const defaultElectrolytePackets = [];

const defaultHistory = () => [];

const defaultReminders = {
 water: { enabled: false, time: '9:00 AM' },
 electrolytes: { enabled: false, time: '1:00 PM' },
 sleep: { enabled: false, time: '10:00 PM' },
 workouts: { enabled: false, time: '5:00 PM' },
};

const DEFAULT_THEME_COLORS = {
  textPrimary: '#f8fafc',
  textMuted: '#94a3b8',
  divider: 'rgba(148,163,184,0.2)',
  overlay: 'rgba(3,7,18,0.78)',
  tabIcon: '#9ca3af',
  tabIconActive: '#93c5fd',
  reminderSwitchTrack: '#374151',
  reminderSwitchIos: '#1f2937',
  donutLabel: '#f8fafc',
};

const ThemeContext = React.createContext({
  mode: 'dark',
  colors: DEFAULT_THEME_COLORS,
  styles: {},
  setAppearance: () => {},
});

const HOME_HERO_GRADIENTS = {
  dark: ['#2563eb', '#1d4ed8', '#0ea5e9'],
  light: ['#eff6ff', '#dbeafe', '#bfdbfe'],
};

const ANALYZE_HERO_GRADIENTS = {
  dark: ['#312e81', '#1e3a8a', '#0f172a'],
  light: ['#eef2ff', '#e0e7ff', '#c7d2fe'],
};

const DETAIL_HERO_GRADIENTS = {
  dark: {
    sleep: ['#4c1d95', '#2e1065'],
    water: ['#0c4a6e', '#082f49'],
    workouts: ['#7c2d12', '#431407'],
  },
  light: {
    sleep: ['#e9d5ff', '#ddd6fe'],
    water: ['#bae6fd', '#e0f2fe'],
    workouts: ['#fed7aa', '#fde68a'],
  },
};

const MOMENTUM_CARD_GRADIENTS = {
  dark: ['#312e81', '#1e1b4b', '#0f172a'],
  light: ['#fdf2f8', '#e0f2fe', '#eef2ff'],
};

const METRIC_TILE_PALETTES = {
  dark: {
    water: {
      gradient: ['rgba(14,165,233,0.95)', 'rgba(59,130,246,0.65)'],
      accent: 'rgba(125,211,252,0.35)',
    },
    sleep: {
      gradient: ['rgba(139,92,246,0.95)', 'rgba(79,70,229,0.7)'],
      accent: 'rgba(196,181,253,0.45)',
    },
    electrolyte: {
      gradient: ['rgba(34,197,94,0.95)', 'rgba(21,128,61,0.7)'],
      accent: 'rgba(187,247,208,0.4)',
    },
    workout: {
      gradient: ['rgba(249,115,22,0.95)', 'rgba(185,28,28,0.75)'],
      accent: 'rgba(254,215,170,0.4)',
    },
  },
  light: {
    water: { gradient: ['#bae6fd', '#7dd3fc'], accent: 'rgba(14,165,233,0.18)' },
    sleep: { gradient: ['#e9d5ff', '#c4b5fd'], accent: 'rgba(139,92,246,0.2)' },
    electrolyte: { gradient: ['#bbf7d0', '#86efac'], accent: 'rgba(34,197,94,0.18)' },
    workout: { gradient: ['#fed7aa', '#fdba74'], accent: 'rgba(249,115,22,0.22)' },
  },
};

function useThemeContext() {
  return React.useContext(ThemeContext);
}

const REMINDER_MESSAGES = {
 water: 'Time to hydrate — log a bottle in MaxPot.',
 electrolytes: 'Stay balanced — add electrolytes if you’ve trained or sweated today.',
 sleep: 'Wind-down reminder — aim for consistent sleep tonight.',
 workouts: 'Training check-in — schedule or log your workout for today.',
};

const ANALYTICS_API_URL = process.env.EXPO_PUBLIC_ANALYTICS_URL || null;

Notifications.setNotificationHandler?.({
 handleNotification: async () => ({
   shouldShowAlert: true,
   shouldPlaySound: false,
   shouldSetBadge: false,
 }),
});

const sanitizeReminders = (data) => {
 const base = { ...defaultReminders };
 if (!data) return base;
 Object.keys(base).forEach((key) => {
   const item = data[key];
   if (!item) return;
   const normalizedTime =
     typeof item.time === 'string' ? normalizeTimeString(item.time) : null;
   base[key] = {
     enabled: !!item.enabled,
     time: normalizedTime || base[key].time,
   };
 });
 return base;
};
const sanitizeGoals = (data) => ({ ...defaultGoals, ...(data || {}) });

const sanitizeToday = (data) => {
 const base = makeDefaultToday(data?.dateKey || getTodayKey());
 if (!data) return base;
 return {
   ...base,
   ...data,
   electrolytes: { ...base.electrolytes, ...(data.electrolytes || {}) },
   workoutSessions: Array.isArray(data.workoutSessions) ? data.workoutSessions : [],
 };
};

const sanitizePackets = (list) =>
 Array.isArray(list) ? list.map((pkt) => ({ ...pkt })) : [...defaultElectrolytePackets];

const sanitizeHistory = (list) => {
 if (!Array.isArray(list) || !list.length) return defaultHistory();
 return list
   .filter((entry) => !!entry?.dateKey)
   .map((entry) => ({
     ...entry,
     id: entry?.dateKey,
     workoutSessions: Array.isArray(entry?.workoutSessions) ? entry.workoutSessions : [],
     electrolytes: entry?.electrolytes
       ? { ...makeDefaultElectrolytes(), ...entry.electrolytes }
       : makeDefaultElectrolytes(),
  }));
};

const hasElectrolyteIntake = (electrolytes = {}) =>
  Object.values(electrolytes).some((value) => (Number(value) || 0) > 0);

const meetsDailyTargets = (entry, goals = defaultGoals) => {
  if (!entry) return false;
  const waterGoal = goals?.waterMl ?? defaultGoals.waterMl;
  const sleepGoal = goals?.sleepHr ?? defaultGoals.sleepHr;
  const workoutGoal = goals?.workout ?? defaultGoals.workout;

  const waterMet = (entry.waterMl || 0) >= waterGoal;
  const sleepMet = (entry.sleepHr || 0) >= Math.max(0, sleepGoal * 0.9);
  const workoutsLogged = Array.isArray(entry.workoutSessions)
    ? entry.workoutSessions.length
    : Number(entry.workout || 0);
  const workoutMet = workoutGoal <= 0 ? true : workoutsLogged >= Math.min(1, workoutGoal);

  return waterMet && sleepMet && workoutMet;
};

const computeConsistencyStreak = (history = [], today, goals = defaultGoals) => {
  const map = new Map();
  history.forEach((entry) => {
    if (entry?.dateKey) map.set(entry.dateKey, entry);
  });
  if (today?.dateKey) map.set(today.dateKey, today);

  const start = today?.dateKey ? new Date(today.dateKey) : new Date();
  if (Number.isNaN(start.getTime())) start.setTime(Date.now());
  start.setHours(0, 0, 0, 0);

  let streak = 0;
  const cursor = new Date(start);
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = map.get(key);
    if (!meetsDailyTargets(entry, goals)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

const formatTimeLabel = (hour24, minute) => {
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minuteStr = String(minute).padStart(2, '0');
  return `${hour12}:${minuteStr} ${suffix}`;
};

const parseTimeString = (time) => {
  if (typeof time !== 'string') return null;
  const trimmed = time.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(trimmed);
  if (!match) return null;
  let hour = Number(match[1]);
  const minuteStr = match[2] ?? '00';
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const suffix = match[3] ? match[3].toLowerCase() : null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return { hour, minute };
};

const normalizeTimeString = (time) => {
  const parsed = parseTimeString(time);
  if (!parsed) return null;
  return formatTimeLabel(parsed.hour, parsed.minute);
};

const describeNextReminder = (timeString, now = new Date()) => {
  const parsed = parseTimeString(timeString);
  if (!parsed) return null;
  const target = new Date(now);
  target.setHours(parsed.hour, parsed.minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  const diffMs = target.getTime() - now.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.round((diffMs % 3600000) / 60000);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (!parts.length) parts.push('<1m');
  return `Next alert in ${parts.join(' ')} (${formatTimeLabel(parsed.hour, parsed.minute)})`;
};

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);


export default function App() {
 const [route, setRoute] = useState('home'); // 'home' | 'analyze' | 'settings'


 // Goals & settings
 const [goals, setGoals] = useState(() => ({ ...defaultGoals }));


 // NEW: electrolyte packet profiles (saved presets)
 const [electrolytePackets, setElectrolytePackets] = useState(() => [...defaultElectrolytePackets]);


 // Today’s logs
 const [today, setToday] = useState(() => makeDefaultToday());


 // Demo history (swap for storage later)
 const [history, setHistory] = useState(() => defaultHistory());

 // Firebase auth & persistence
 const [firebaseUser, setFirebaseUser] = useState(null);
 const [authReady, setAuthReady] = useState(false);
 const [dataLoading, setDataLoading] = useState(false);
 const [dataLoaded, setDataLoaded] = useState(false);
 const [authMode, setAuthMode] = useState('signIn');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [authBusy, setAuthBusy] = useState(false);
 const [authError, setAuthError] = useState('');
 const [analysis, setAnalysis] = useState(null);
 const [analysisLoading, setAnalysisLoading] = useState(false);
 const [analysisError, setAnalysisError] = useState('');
 const [reminders, setReminders] = useState(() => ({ ...defaultReminders }));
 const [appearance, setAppearance] = useState('dark');
 const [workoutInputMode, setWorkoutInputMode] = useState('standard'); // 'standard' | 'advanced'
 const [notificationStatus, setNotificationStatus] = useState(null);
 const themeColors = useMemo(
   () => (appearance === 'light' ? THEME_COLORS.light : THEME_COLORS.dark),
   [appearance]
 );
 const styles = useMemo(() => styleVariants[appearance] || styleVariants.dark, [appearance]);
 const themeValue = useMemo(
   () => ({ mode: appearance, colors: themeColors, styles, setAppearance }),
   [appearance, themeColors, styles]
 );
 const saveTimerRef = useRef(null);
 const ensureCurrentDay = useCallback(() => {
   const key = getTodayKey();
   setToday((prev) => {
     if (prev?.dateKey === key) return prev;
     return makeDefaultToday(key);
   });
 }, []);
 useEffect(() => {
   ensureCurrentDay();
   const timer = setInterval(() => {
     ensureCurrentDay();
   }, 60 * 1000);
   return () => clearInterval(timer);
 }, [ensureCurrentDay]);
 useEffect(() => {
   if (dataLoaded) ensureCurrentDay();
 }, [dataLoaded, ensureCurrentDay]);
 useEffect(() => {
   (async () => {
     try {
       const settings = await Notifications.getPermissionsAsync();
       setNotificationStatus(settings.status);
     } catch (error) {
       console.warn('Failed to read notification permissions', error);
     }
   })();
 }, []);
 useEffect(() => {
  if (!dataLoaded) return;
  const key = today.dateKey || getTodayKey();
  const trainingLoadToday = computeDayTrainingLoad(today.workoutSessions);
  setHistory((prev) => {
    const entry = {
      id: key,
      dateKey: key,
      waterMl: today.waterMl,
      sleepHr: today.sleepHr,
      workoutSessions: today.workoutSessions,
      electrolytes: today.electrolytes,
      electrolyteLogged: today.electrolyteLogged,
      trainingLoad: trainingLoadToday,
    };
    const idx = prev.findIndex((d) => d.id === key);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = { ...next[idx], ...entry };
       return next;
     }
     return [...prev, entry];
   });
 }, [today, dataLoaded]);

  useEffect(() => {
    const unsubscribe = onAuthChanged((user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      setDataLoaded(false);
    });
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
  if (!firebaseUser) {
    setDataLoading(false);
    setDataLoaded(false);
    setAuthError('');
    setAnalysis(null);
    setAnalysisError('');
    setAnalysisLoading(false);
    setReminders({ ...defaultReminders });
    setGoals(() => ({ ...defaultGoals }));
    setToday(makeDefaultToday());
    setElectrolytePackets(() => [...defaultElectrolytePackets]);
    setHistory(defaultHistory());
    setAppearance('dark');
    setWorkoutInputMode('standard');
    setRoute('home');
      return () => {
        active = false;
      };
    }

    setDataLoading(true);
    setAuthError('');
    (async () => {
      try {
        const data = await fetchUserData(firebaseUser.uid);
        if (!active) return;
        if (data) {
          setGoals(sanitizeGoals(data.goals));
          const nextToday = sanitizeToday(data.today);
          setToday(nextToday);
          setElectrolytePackets(sanitizePackets(data.electrolytePackets));
          const sanitizedHistory = sanitizeHistory(data.history).map((entry) => ({
            ...entry,
            trainingLoad:
              typeof entry.trainingLoad === 'number'
                ? entry.trainingLoad
                : computeDayTrainingLoad(entry.workoutSessions || []),
          }));
          setHistory(sanitizedHistory);
          setReminders(sanitizeReminders(data.reminders));
          setAppearance(data?.preferences?.theme === 'light' ? 'light' : 'dark');
          setWorkoutInputMode(
            data?.preferences?.workoutInputMode === 'advanced' ? 'advanced' : 'standard'
          );
        } else {
          setGoals(() => ({ ...defaultGoals }));
          setToday(makeDefaultToday());
          setElectrolytePackets(() => [...defaultElectrolytePackets]);
          setHistory(defaultHistory());
          setReminders({ ...defaultReminders });
          setAppearance('dark');
          setWorkoutInputMode('standard');
        }
      } catch (error) {
        if (!active) return;
        console.error('Failed to load user data', error);
        setAuthError(error.message ?? 'Failed to load user data');
      } finally {
        if (active) {
          setDataLoaded(true);
          setDataLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !dataLoaded) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    const payload = {
      goals,
      today,
      history,
      electrolytePackets,
      reminders,
      preferences: { theme: appearance, workoutInputMode },
      updatedAt: Date.now(),
    };
    saveTimerRef.current = setTimeout(() => {
      saveUserData(firebaseUser.uid, payload)
        .then(() => {
          if (ANALYTICS_API_URL) {
            triggerDailyAnalysis();
          }
        })
        .catch((error) => {
          console.error('Failed to save user data', error);
          setAuthError(error.message ?? 'Failed to save user data');
        })
        .finally(() => {
          saveTimerRef.current = null;
        });
    }, 800);

  return () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };
}, [
  firebaseUser,
  dataLoaded,
  goals,
  today,
  history,
  electrolytePackets,
  triggerDailyAnalysis,
  appearance,
  workoutInputMode,
]);

 useEffect(() => {
   if (!firebaseUser || !dataLoaded || !ANALYTICS_API_URL) return;
   triggerDailyAnalysis();
 }, [firebaseUser, dataLoaded, triggerDailyAnalysis]);

 useEffect(() => {
   scheduleReminders(reminders);
 }, [scheduleReminders, reminders]);

  const handleAuthSubmit = useCallback(async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setAuthError('Email and password are required.');
      return;
    }
    if (authMode === 'signUp' && trimmedPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      if (authMode === 'signUp') {
        const user = await signUpWithEmail(trimmedEmail, trimmedPassword);
        await saveUserData(user.uid, {
          goals: { ...defaultGoals },
          today: makeDefaultToday(),
          history: defaultHistory(),
          electrolytePackets: [...defaultElectrolytePackets],
          reminders: { ...defaultReminders },
          preferences: { theme: 'dark', workoutInputMode: 'standard' },
          createdAt: Date.now(),
        });
      } else {
        await signInWithEmail(trimmedEmail, trimmedPassword);
      }
    } catch (error) {
      console.error('Auth error', error);
      setAuthError(error.message ?? 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }, [authMode, email, password]);

  const toggleAuthMode = useCallback(() => {
    setAuthMode((mode) => (mode === 'signIn' ? 'signUp' : 'signIn'));
    setAuthError('');
  }, []);

 const ensureNotificationPermission = useCallback(async () => {
   try {
     const current = await Notifications.getPermissionsAsync();
     if (current.status === 'granted') {
       setNotificationStatus(current.status);
       return true;
     }
     const request = await Notifications.requestPermissionsAsync();
     setNotificationStatus(request.status);
     return request.status === 'granted';
   } catch (error) {
     console.error('Notification permission check failed', error);
     return false;
   }
 }, []);

 const handleReminderToggle = useCallback(
   async (key, enabled) => {
     if (enabled) {
       const allowed = await ensureNotificationPermission();
       if (!allowed) {
         Alert.alert(
           'Notifications blocked',
           'Enable notifications in system settings to receive reminders.'
         );
         return;
       }
     }
     setReminders((prev) => ({
       ...prev,
       [key]: { ...prev[key], enabled },
     }));
   },
   [ensureNotificationPermission]
 );

 const handleReminderTimeChange = useCallback((key, value) => {
   const sanitized = value.replace(/[^0-9:apm\s]/gi, '').toUpperCase().slice(0, 8);
   setReminders((prev) => ({
     ...prev,
     [key]: { ...prev[key], time: sanitized },
   }));
 }, []);

 const handleReminderTimeBlur = useCallback((key, value) => {
  const normalized = normalizeTimeString(value);
  if (!normalized) {
    Alert.alert('Invalid time', 'Enter time like 7:30 AM or 9:15 PM.');
    setReminders((prev) => ({
      ...prev,
      [key]: { ...prev[key], time: defaultReminders[key].time },
    }));
    return;
  }
  setReminders((prev) => ({
    ...prev,
    [key]: { ...prev[key], time: normalized },
   }));
 }, []);

 const scheduleReminders = useCallback(
   async (prefs) => {
     if (!firebaseUser || !dataLoaded) return;
     const granted =
       notificationStatus === 'granted' || (await ensureNotificationPermission());
     if (!granted) return;
     try {
       await Notifications.cancelAllScheduledNotificationsAsync();
       const entries = Object.entries(prefs);
       await Promise.all(
         entries.map(async ([key, cfg]) => {
           if (!cfg?.enabled) return;
           const parsed = parseTimeString(cfg.time);
           if (!parsed) return;
           const content = {
             title: 'MaxPot Reminder',
             body: REMINDER_MESSAGES[key] || 'Check in with MaxPot today.',
             data: { category: key },
           };
           await Notifications.scheduleNotificationAsync({
             content,
             trigger: {
               hour: parsed.hour,
               minute: parsed.minute,
               repeats: true,
             },
           });
         })
       );
     } catch (error) {
       console.error('Scheduling reminders failed', error);
     }
   },
   [firebaseUser, dataLoaded, ensureNotificationPermission, notificationStatus]
 );

 const handleSignOut = useCallback(async () => {
   try {
     await signOutUser();
   } catch (error) {
     console.error('Sign out failed', error);
     setAuthError(error.message ?? 'Failed to sign out.');
   }
 }, []);

  const removeWorkoutSession = useCallback(
    (sessionId, dateKeyParam) => {
      if (!sessionId) return;
      const key = dateKeyParam || todayKey;
      updateEntryForDate(key, (prev) => ({
        ...prev,
        workoutSessions: (prev.workoutSessions || []).filter((session) => session.id !== sessionId),
      }));
    },
    [todayKey, updateEntryForDate]
  );

  const buildDailyAnalysisPayload = useCallback(() => {
   if (!firebaseUser) return null;
   const dateKey = today.dateKey || getTodayKey();
   const historyWithoutToday = history.filter((entry) => entry.id !== dateKey);
   const recentLoads = historyWithoutToday
     .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
     .slice(-28)
     .map((entry) =>
       typeof entry.trainingLoad === 'number'
         ? entry.trainingLoad
         : computeDayTrainingLoad(entry.workoutSessions || [])
     );
   const { stdMinutes, debt } = computeSleepStats(historyWithoutToday, today.sleepHr, goals.sleepHr || 8);
   return {
     user_id: firebaseUser.uid,
     date: dateKey,
     total_hydration_ml: today.waterMl,
     total_sodium_mg: today.electrolytes?.sodium || 0,
     total_potassium_mg: today.electrolytes?.potassium || 0,
     total_magnesium_mg: today.electrolytes?.magnesium || 0,
     total_calcium_mg: today.electrolytes?.calcium || 0,
     total_sleep_hours: today.sleepHr,
     sleep_consistency_minutes: Number.isFinite(stdMinutes) ? stdMinutes : null,
     sleep_debt_hours: Number.isFinite(debt) ? debt : null,
     workouts: (today.workoutSessions || []).map((session) => convertSessionForAnalysis(session)),
     recent_training_loads: recentLoads,
   };
 }, [firebaseUser, today, history, goals]);

 const triggerDailyAnalysis = useCallback(async () => {
   if (!ANALYTICS_API_URL) return;
   const payload = buildDailyAnalysisPayload();
   if (!payload) return;
   try {
     setAnalysisLoading(true);
     setAnalysisError('');
     const response = await fetch(`${ANALYTICS_API_URL}/analyze/daily`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload),
     });
     if (!response.ok) {
       throw new Error(`Analytics service returned ${response.status}`);
     }
     const json = await response.json();
     setAnalysis(json);
   } catch (error) {
     console.error('Analytics sync failed', error);
     setAnalysisError(error.message ?? 'Failed to load analytics.');
   } finally {
     setAnalysisLoading(false);
   }
 }, [buildDailyAnalysisPayload]);


// Log modal
const [modal, setModal] = useState({ type: null, mode: 'add', dateKey: getTodayKey() }); // mode: 'add' | 'edit'
const [inputValue, setInputValue] = useState('');
const [dayDetail, setDayDetail] = useState({ visible: false, dateKey: null });


 // WATER: mL vs Bottle modes
 const [waterLogMode, setWaterLogMode] = useState('ml'); // 'ml' | 'bottle'


 // ELECTROLYTES: single vs batch
 const [electrolyteMode, setElectrolyteMode] = useState('single'); // 'single' | 'batch'
 const [electrolyteKey, setElectrolyteKey] = useState('sodium');
 const emptyBatch = {
   sodium: '',
   potassium: '',
   chloride: '',
   magnesium: '',
   calcium: '',
   phosphate: '',
   bicarbonate: '',
 };
const [batchElectrolytes, setBatchElectrolytes] = useState(emptyBatch);


// Workout form state
const [workoutType, setWorkoutType] = useState(null); // 'strength' | 'running_steady' | 'running_sprint'
const [numSets, setNumSets] = useState(0);
const [setsDetail, setSetsDetail] = useState([]); // [{effort:'before_failure'|'to_failure'|'past_failure', rir?:number}]
const [runMinutes, setRunMinutes] = useState('');
const [runPerceived, setRunPerceived] = useState('');
const [sprintDistance, setSprintDistance] = useState('');
const [sprintPerceived, setSprintPerceived] = useState('');
const [simpleWorkoutTemplate, setSimpleWorkoutTemplate] = useState('strength_guided');
const [simpleDuration, setSimpleDuration] = useState('');
const [simpleEffort, setSimpleEffort] = useState('moderate'); // 'easy' | 'moderate' | 'hard'
const [simpleNotes, setSimpleNotes] = useState('');

const todayKey = today.dateKey || getTodayKey();

const getEntryForDate = useCallback(
  (dateKey) => {
    const key = dateKey || todayKey;
    if (key === todayKey) return today;
    const entry = history.find((item) => item.id === key || item.dateKey === key);
    if (entry) return entry;
    return makeDefaultToday(key);
  },
  [today, todayKey, history]
);

const modalTargetEntry = useMemo(() => getEntryForDate(modal.dateKey), [modal.dateKey, getEntryForDate]);
const modalWorkoutSessions = Array.isArray(modalTargetEntry.workoutSessions)
  ? modalTargetEntry.workoutSessions
  : [];

const updateEntryForDate = useCallback(
  (dateKey, updater) => {
    const key = dateKey || todayKey;
    const applyUpdate = (base) => {
      const updated = updater(base);
      if (!updated) return base;
      const merged = { ...base, ...updated, dateKey: key };
      if (merged.workoutSessions) {
        merged.trainingLoad = computeDayTrainingLoad(merged.workoutSessions);
      }
      return merged;
    };
    if (key === todayKey) {
      setToday((prev) => {
        const base = prev || makeDefaultToday(key);
        return applyUpdate(base);
      });
      return;
    }
    setHistory((prev) => {
      const idx = prev.findIndex((entry) => entry.id === key);
      const base = idx >= 0 ? prev[idx] : { ...makeDefaultToday(key), id: key };
      const nextEntry = applyUpdate(base);
      if (!nextEntry) return prev;
      const normalized = { ...nextEntry, id: key, dateKey: key };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = normalized;
        return next;
      }
      return [...prev, normalized];
    });
  },
  [todayKey, setToday, setHistory]
);

const openDayDetail = useCallback((dateKey) => {
  if (!dateKey) return;
  setDayDetail({ visible: true, dateKey });
}, []);

const closeDayDetail = useCallback(() => {
  setDayDetail({ visible: false, dateKey: null });
}, []);

useEffect(() => {
  if (modal.type !== 'electrolyte' || modal.mode !== 'edit') return;
  if (electrolyteMode !== 'single') return;
  const current = modalTargetEntry?.electrolytes?.[electrolyteKey];
  if (current == null) {
    setInputValue('0');
    return;
  }
  setInputValue(String(current));
}, [modal.type, modal.mode, electrolyteMode, electrolyteKey, modalTargetEntry]);

const resetWorkoutFormState = () => {
  setWorkoutType(null);
  setNumSets(0);
  setSetsDetail([]);
  setRunMinutes('');
  setRunPerceived('');
  setSprintDistance('');
  setSprintPerceived('');
  setSimpleWorkoutTemplate('strength_guided');
  setSimpleDuration('');
  setSimpleEffort('moderate');
  setSimpleNotes('');
};

 const openModal = (type, options = {}) => {
   const mode = options.mode || 'add';
   const targetDateKey = options.dateKey || todayKey;
  if (type === 'workout') {
    resetWorkoutFormState();
  }
   if (type === 'water') setWaterLogMode('ml'); // default to mL each time
   if (type === 'electrolyte') {
     setElectrolyteMode('single');
     setElectrolyteKey(options.initialKey || 'sodium');
     setBatchElectrolytes(emptyBatch);
   }
   const presetValue =
     mode === 'edit' && options.initialValue != null ? String(options.initialValue) : '';
  setInputValue(presetValue);
  setModal({ type, mode, dateKey: targetDateKey });
 };
 const closeModal = () => {
   setModal({ type: null, mode: 'add', dateKey: todayKey });
   setInputValue('');
   resetWorkoutFormState();
 };

 const handleDayMetricEdit = (type, extra = {}) => {
   if (!dayDetail.dateKey) return;
   closeDayDetail();
   openModal(type, { ...extra, mode: 'edit', dateKey: dayDetail.dateKey });
 };

 const handleDayWorkoutAdd = () => {
   if (!dayDetail.dateKey) return;
   closeDayDetail();
   openModal('workout', { dateKey: dayDetail.dateKey });
 };


 // Helpers
 const clamp01 = (x) => Math.max(0, Math.min(1, x));
 const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
 const stdDev = (arr) => {
   const m = avg(arr);
   const v = arr.length ? arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length : 0;
   return Math.sqrt(v);
 };
 const sleepQtyScore = (h) => {
   const mu = 8, sigma = 1.2;
   const z = (h - mu) / sigma;
   return Math.round(Math.exp(-0.5 * z * z) * 100);
 };
 const hydrationScore = (ml, goal) => (goal ? Math.round(clamp01(ml / goal) * 100) : 50);


 // Electrolyte Balance Score (simple: count how many core electrolytes logged today)
 const electrolyteBalanceScore = (elec) => {
   const { sodium, potassium, magnesium, calcium } = elec;
   const filled = [sodium, potassium, magnesium, calcium].filter((x) => x > 0).length;
   return Math.round((filled / 4) * 100);
 };


 const workoutLoadScore = (wk7) => {
   const s = wk7.reduce((a, b) => a + b, 0);
   const score01 = clamp01(1 - Math.abs(s - 5) / 5);
   return Math.round(50 + score01 * 50);
 };
 const sleepConsistencyScore = (last7) => {
  const sd = stdDev(last7);
  const score01 = clamp01(1 - sd / 2);
  return Math.round(20 + score01 * 80);
 };
 const intensityPointsFromEffort = (effort, rir) => {
   if (effort === 'past_failure') return 12;
   if (effort === 'to_failure') return 10;
   if (effort === 'before_failure') {
     if (rir === 0) return 10;
     if (rir === 1) return 9;
     if (rir === 2) return 8;
     if (rir === 3) return 7;
     if (rir === 4) return 6;
     return 5;
   }
   return 6;
 };

 const convertStrengthSetForAnalysis = (set) => {
   const rir = typeof set.rir === 'number' ? set.rir : undefined;
   return {
     reps: typeof set.reps === 'number' ? set.reps : 8,
     rir: rir != null ? rir : set.effort === 'before_failure' ? 2 : 0,
     to_failure: set.effort === 'to_failure',
     past_failure: set.effort === 'past_failure',
   };
 };

 const convertSessionForAnalysis = (session) => {
   if (session.type === 'strength') {
     const sets = (session.strength?.sets || []).map(convertStrengthSetForAnalysis);
     const intensities = sets.map((s) =>
       intensityPointsFromEffort(
         s.past_failure ? 'past_failure' : s.to_failure ? 'to_failure' : 'before_failure',
         s.rir
       )
     );
     const avgIntensity = intensities.length
       ? intensities.reduce((acc, x) => acc + x, 0) / intensities.length
       : 6;
     const sessionRpe = Math.min(10, Math.max(4, Math.round(avgIntensity * 0.8)));
     const durationMin = Math.max(30, sets.length * 5 + 20);
     return {
       type: 'strength',
       duration_min: durationMin,
       session_rpe: sessionRpe,
       sets,
     };
   }
   if (session.type === 'running_steady') {
     const minutes = Math.max(0, Number(session.running_steady?.minutes) || 0);
     const perceived = Math.min(10, Math.max(1, Number(session.running_steady?.perceived) || 5));
     return {
       type: 'conditioning',
       duration_min: minutes,
       session_rpe: perceived,
       conditioning_detail: {
         modality: 'running_steady',
         distance_m: null,
         pace: null,
       },
       sets: [],
     };
   }
  if (session.type === 'running_sprint') {
     const perceivedPct = Math.max(0, Math.min(100, Number(session.running_sprint?.perceivedPct) || 0));
     const sessionRpe = Math.min(10, Math.max(5, Math.round((perceivedPct / 100) * 10)));
     const distance = Math.max(0, Number(session.running_sprint?.distance_m) || 0);
     const durationMin = Math.max(10, distance / 80 || 10);
     return {
       type: 'conditioning',
       duration_min: durationMin,
       session_rpe: sessionRpe,
       conditioning_detail: {
         modality: 'running_sprint',
         distance_m: distance,
         pace: null,
       },
       sets: [],
     };
   }
   return {
     type: session.type,
     duration_min: Number(session.duration_min) || 0,
     session_rpe: Number(session.session_rpe) || 0,
     sets: [],
   };
 };

 const computeSessionTrainingLoad = (session) => {
   const normalized = convertSessionForAnalysis(session);
   const srpe = (normalized.session_rpe || 0) * (normalized.duration_min || 0);
   let strengthBonus = 0;
   if (normalized.type === 'strength' && normalized.sets) {
     normalized.sets.forEach((s) => {
       const intensity = intensityPointsFromEffort(
         s.past_failure ? 'past_failure' : s.to_failure ? 'to_failure' : 'before_failure',
         s.rir
       );
       strengthBonus += (intensity * (s.reps || 0)) / 10;
     });
   }
   return srpe + strengthBonus;
 };

 const computeDayTrainingLoad = (sessions) =>
   Array.isArray(sessions) ? sessions.reduce((sum, s) => sum + computeSessionTrainingLoad(s), 0) : 0;

const computeSleepStats = (historyList, todaySleep, goal) => {
  const recent = [...historyList]
    .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
    .slice(-6)
    .map((d) => Number(d.sleepHr) || 0);
  recent.push(Number(todaySleep) || 0);
  const stdMinutes = stdDev(recent) * 60;
  const totalHours = recent.reduce((acc, h) => acc + h, 0);
  const debt = Math.max(0, goal * recent.length - totalHours);
  return { stdMinutes, debt };
};

const computeReadinessTimeline = (historyList, todayEntry, goals) => {
 const map = new Map();
 historyList.forEach((item) => {
   if (!item?.dateKey) return;
   map.set(item.dateKey, item);
 });
 if (todayEntry) {
   const key = todayEntry.dateKey || getTodayKey();
   map.set(key, { ...todayEntry, dateKey: key });
 }
 const sorted = Array.from(map.values()).sort((a, b) =>
   (a.dateKey || '').localeCompare(b.dateKey || '')
 );
 if (!sorted.length) return [];
 return sorted.map((day, idx) => {
   const dateKey = day.dateKey || getTodayKey();
   const waterMl = day.waterMl || 0;
   const sleepHr = day.sleepHr || 0;
   const electrolytes = day.electrolytes || makeDefaultElectrolytes();
   const hydrationPctDay = hydrationScore(waterMl, goals.waterMl || 0);
   const electrolytePctDay = electrolyteBalanceScore(electrolytes);
   const effectiveHydrationDay = Math.round(hydrationPctDay * 0.7 + electrolytePctDay * 0.3);
   const sleepQty = sleepQtyScore(sleepHr || 0);
   const sleepWindow = sorted
     .slice(Math.max(0, idx - 6), idx + 1)
     .map((item) => item.sleepHr || 0);
   const sleepConsistency = sleepConsistencyScore(sleepWindow);
   const sleepPctDay = Math.round(0.7 * sleepQty + 0.3 * sleepConsistency);
   const workoutWindow = sorted
     .slice(Math.max(0, idx - 6), idx + 1)
     .map((item) => (Array.isArray(item.workoutSessions) ? item.workoutSessions.length : 0));
   const workoutPctDay = workoutLoadScore(workoutWindow);
   const hasEntries =
     waterMl > 0 ||
     sleepHr > 0 ||
     (Array.isArray(day.workoutSessions) && day.workoutSessions.length > 0) ||
     day.electrolyteLogged;
   const readinessValue = Math.round(avg([sleepPctDay, effectiveHydrationDay, workoutPctDay]));
   return {
     dateKey,
     readiness: hasEntries ? readinessValue : null,
     sleepPct: sleepPctDay,
     hydrationPct: hydrationPctDay,
     electrolytePct: electrolytePctDay,
     workoutPct: workoutPctDay,
   };
 });
};

const MONTH_NAMES = [
 'January',
 'February',
 'March',
 'April',
 'May',
 'June',
 'July',
 'August',
 'September',
 'October',
 'November',
 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const buildCalendarWeeks = (monthDate, readinessMap) => {
 const base = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
 const start = new Date(base);
 start.setDate(start.getDate() - start.getDay());
 const weeks = [];
 for (let week = 0; week < 6; week++) {
   const days = [];
   for (let day = 0; day < 7; day++) {
     const cellDate = new Date(start);
     cellDate.setDate(start.getDate() + week * 7 + day);
     const key = cellDate.toISOString().slice(0, 10);
     const entry = readinessMap.get(key);
     days.push({
       key,
       dayNumber: cellDate.getDate(),
       readiness: entry?.readiness ?? null,
       isCurrentMonth: cellDate.getMonth() === monthDate.getMonth(),
       isToday: key === getTodayKey(),
     });
   }
   weeks.push(days);
 }
 const label = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
 return { weeks, label };
};

const getReadinessColor = (value) => {
 if (value == null) return '#1f2937';
 if (value >= 85) return '#22c55e';
 if (value >= 70) return '#facc15';
 if (value >= 55) return '#f97316';
 return '#ef4444';
};
  // Parse decimals or fractions like "3/4"
const parseFractionOrNumber = (s) => {
  if (s == null) return NaN;
  const t = String(s).trim();
  if (!t) return NaN;
  if (t.includes('/')) {
     const [a, b] = t.split('/').map((x) => Number(String(x).trim()));
     if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return NaN;
     return a / b;
   }
   const n = Number(t);
   return Number.isFinite(n) ? n : NaN;
 };


 const safePosInt = (x) => {
   const n = Math.round(Number(x));
   return Number.isFinite(n) && n > 0 ? n : 0;
 };

 const defaultDurationForTemplate = (template) => {
   if (template === 'hiit_sprints') return 20;
   if (template === 'cardio_steady') return 30;
   return 30;
 };

 const buildStandardSession = (id) => {
   const template = simpleWorkoutTemplate;
   const effort = SIMPLE_EFFORT_OPTIONS.find((opt) => opt.key === simpleEffort)
     ? simpleEffort
     : 'moderate';
   const durationInput = Number(simpleDuration);
   const duration = Math.max(5, Number.isFinite(durationInput) && durationInput > 0 ? durationInput : defaultDurationForTemplate(template));
   const notes = simpleNotes.trim();
   const metaBase = {
     mode: 'standard',
     template,
     effort,
     durationMin: duration,
     recordedAt: id,
     ...(notes ? { notes } : {}),
   };

   if (template === 'strength_guided') {
     const effortMap = {
       easy: { effort: 'before_failure', rir: 4 },
       moderate: { effort: 'before_failure', rir: 2 },
       hard: { effort: 'to_failure' },
     };
     const conf = effortMap[effort] || effortMap.moderate;
     const setCount = Math.max(2, Math.min(6, Math.round(duration / 8) || 4));
     const sets = Array.from({ length: setCount }).map((_, idx) => ({
       idx: idx + 1,
       effort: conf.effort,
       ...(conf.rir != null ? { rir: conf.rir } : {}),
     }));
     return { id, type: 'strength', strength: { sets }, meta: metaBase };
   }

   if (template === 'cardio_steady') {
     const perceivedMap = { easy: 4, moderate: 6, hard: 8 };
     return {
       id,
       type: 'running_steady',
       running_steady: { minutes: duration, perceived: perceivedMap[effort] || 6 },
       meta: metaBase,
     };
   }

 if (template === 'hiit_sprints') {
   const sprintPct = { easy: 60, moderate: 75, hard: 90 };
   const distance = Math.max(200, Math.round(duration * 120));
   return {
     id,
     type: 'running_sprint',
     running_sprint: { distance_m: distance, perceivedPct: sprintPct[effort] || 75 },
     meta: metaBase,
   };
 }

  return null;
};

const formatWorkoutTime = (isoString) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour12 = ((hours + 11) % 12) + 1;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${suffix}`;
};

const describeWorkoutSummary = (session) => {
  if (!session) return 'Workout';
  if (session.type === 'strength') {
    const sets = session?.strength?.sets?.length || 0;
    return `${sets} set${sets === 1 ? '' : 's'} strength`;
  }
  if (session.type === 'running_steady') {
    const minutes = session?.running_steady?.minutes || 0;
    return `${minutes} min steady cardio`;
  }
  if (session.type === 'running_sprint') {
    const distance = session?.running_sprint?.distance_m || 0;
    return `${distance} m sprints`;
  }
  return 'Workout';
};

const describeWorkoutMeta = (session) => {
  if (!session) return '';
  const timeLabel = formatWorkoutTime(session?.meta?.recordedAt);
  if (session.type === 'strength') {
    const effort = session?.strength?.sets?.[0]?.effort;
    const effortLabel = effort ? effort.replace(/_/g, ' ') : null;
    return [timeLabel, effortLabel ? `Effort: ${effortLabel}` : null]
      .filter(Boolean)
      .join(' • ');
  }
  if (session.type === 'running_steady') {
    const perceived = session?.running_steady?.perceived;
    return [timeLabel, perceived ? `RPE ${perceived}` : null].filter(Boolean).join(' • ');
  }
  if (session.type === 'running_sprint') {
    const pct = session?.running_sprint?.perceivedPct;
    return [timeLabel, pct ? `${pct}% effort` : null].filter(Boolean).join(' • ');
  }
  return timeLabel || '';
};


 const addEntry = () => {
   const val = Number(inputValue);
   const isEditMode = modal.mode === 'edit';
   const targetDateKey = modal.dateKey || todayKey;


   if (modal.type === 'water') {
     let mlAmount = NaN;


     if (waterLogMode === 'ml') {
       if (!Number.isNaN(val)) mlAmount = val;
     } else {
       const bottles = parseFractionOrNumber(inputValue);
       if (Number.isFinite(bottles)) {
         mlAmount = Math.round(bottles * (goals.waterBottleMl || 0));
       }
     }


     if (!Number.isNaN(mlAmount)) {
       const sanitized = Math.max(0, mlAmount);
       if (isEditMode) {
         updateEntryForDate(targetDateKey, (prev) => ({ ...prev, waterMl: sanitized }));
       } else if (sanitized > 0) {
         updateEntryForDate(targetDateKey, (prev) => ({
           ...prev,
           waterMl: (prev.waterMl || 0) + sanitized,
         }));
       }
     }
     closeModal();
     return;
   }


    if (modal.type === 'sleep') {
     if (!Number.isNaN(val)) {
       const sanitized = Math.max(0, val);
       if (isEditMode) {
         updateEntryForDate(targetDateKey, (prev) => ({
           ...prev,
           sleepHr: +sanitized.toFixed(2),
         }));
       } else if (sanitized > 0) {
         updateEntryForDate(targetDateKey, (prev) => ({
           ...prev,
           sleepHr: +(prev.sleepHr + sanitized).toFixed(2),
         }));
       }
     }
     closeModal();
     return;
   }


    if (modal.type === 'electrolyte') {
      if (electrolyteMode === 'single') {
       if (!Number.isNaN(val)) {
         const addition = Math.max(0, Math.round(val));
         if (isEditMode || addition > 0) {
           updateEntryForDate(targetDateKey, (prev) => {
             const current = prev.electrolytes || makeDefaultElectrolytes();
             const next = {
               ...current,
               [electrolyteKey]: isEditMode
                 ? addition
                 : (current[electrolyteKey] || 0) + addition,
             };
             return {
               ...prev,
               electrolytes: next,
               electrolyteLogged: isEditMode ? hasElectrolyteIntake(next) : true,
             };
           });
         }
       }
     } else if (!isEditMode) {
        // batch mode
        const keys = Object.keys(batchElectrolytes);
        const additions = {};
       let any = false;
       keys.forEach((k) => {
         const inc = safePosInt(batchElectrolytes[k]);
         if (inc > 0) {
           additions[k] = inc;
           any = true;
         }
       });
        if (any) {
          updateEntryForDate(targetDateKey, (prev) => {
            const next = { ...(prev.electrolytes || makeDefaultElectrolytes()) };
            Object.entries(additions).forEach(([k, inc]) => {
              next[k] = (next[k] || 0) + inc;
            });
            return { ...prev, electrolytes: next, electrolyteLogged: true };
          });
        }
      }
      closeModal();
      return;
    }


   if (modal.type === 'workout') {
      if (isEditMode) {
        closeModal();
        return;
      }
      const id = new Date().toISOString();
      let session = null;

    if (workoutInputMode === 'standard') {
      session = buildStandardSession(id);
    } else {
      if (workoutType === 'strength') {
        const sets = Array.from({ length: Math.max(0, Number(numSets) || 0) }).map((_, i) => {
          const s = setsDetail[i] || {};
          const effort = s.effort || 'before_failure';
          const rir =
            effort === 'before_failure'
              ? Math.max(0, Math.min(5, Number(s.rir) || 0))
              : undefined;
          return { idx: i + 1, effort, ...(rir !== undefined ? { rir } : {}) };
        });
        session = { id, type: 'strength', strength: { sets } };
      } else if (workoutType === 'running_steady') {
        const minutes = Math.max(0, Number(runMinutes) || 0);
        const perceived = Math.max(1, Math.min(10, Number(runPerceived) || 1));
        session = { id, type: 'running_steady', running_steady: { minutes, perceived } };
      } else if (workoutType === 'running_sprint') {
        const distance_m = Math.max(0, Number(sprintDistance) || 0);
        const perceivedPct = Math.max(0, Math.min(100, Number(sprintPerceived) || 0));
        session = { id, type: 'running_sprint', running_sprint: { distance_m, perceivedPct } };
      }
    }

    if (session) {
      const nextMeta =
        workoutInputMode === 'standard'
          ? { ...(session.meta || {}), recordedAt: id }
          : {
              ...(session.meta || {}),
              recordedAt: id,
              mode: 'advanced',
              workoutType: workoutType || session.type,
            };
      updateEntryForDate(targetDateKey, (prev) => ({
        ...prev,
        workoutSessions: [...(prev.workoutSessions || []), { ...session, meta: nextMeta }],
      }));
    }
    closeModal();
    return;
  }
 };


 /* -------------------- Scores -------------------- */
 const last7 = history.slice(-7);
 const sleepPct = Math.round(
   0.7 * sleepQtyScore(today.sleepHr || 0) +
     0.3 * sleepConsistencyScore(last7.map((d) => d.sleepHr || 0))
 );
 const hydrationPct = hydrationScore(today.waterMl || 0, goals.waterMl || 0);
 const electrolytePct = electrolyteBalanceScore(today.electrolytes);
 const effectiveHydrationPct = Math.round(hydrationPct * 0.7 + electrolytePct * 0.3);
 const workoutPct = workoutLoadScore(
   last7.map((d) =>
     Array.isArray(d.workoutSessions) ? d.workoutSessions.length : d.workout || 0
   )
 );


// Home progress
const todaysSessions = Array.isArray(today.workoutSessions) ? today.workoutSessions : [];
const waterProgressPct = Math.round(clamp01((today.waterMl || 0) / (goals.waterMl || 1)) * 100);
const sleepProgressPct = Math.round(clamp01((today.sleepHr || 0) / (goals.sleepHr || 1)) * 100);
const workoutProgressPct = Math.round(
  clamp01((todaysSessions.length || 0) / (goals.workout || 1)) * 100
);
const electrolyteProgressPct = electrolytePct; // direct %


// Collective readiness (uses Effective Hydration)
const readinessPct = Math.round(avg([sleepPct, effectiveHydrationPct, workoutPct]));
const consistencyStreak = useMemo(
  () => computeConsistencyStreak(history, today, goals),
  [history, today, goals]
);

const FancyBackground = React.memo(() => {
  const { mode } = useThemeContext();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-50, 40] });
  const translateY = shimmer.interpolate({ inputRange: [0, 1], outputRange: [22, -28] });
  const scale = shimmer.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });

  const outerGradient =
    mode === 'light'
      ? ['rgba(191,219,254,0.65)', 'rgba(224,231,255,0.9)', 'rgba(255,255,255,0.95)']
      : ['rgba(2,6,23,0.92)', 'rgba(3,7,18,0.9)', 'rgba(15,23,42,0.92)'];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }, { translateY }, { scale }], opacity: 0.55 },
        ]}
      >
        <LinearGradient
          colors={
            mode === 'light'
              ? ['rgba(59,130,246,0.35)', 'rgba(14,165,233,0.2)', 'rgba(147,51,234,0.18)']
              : ['rgba(59,130,246,0.42)', 'rgba(14,165,233,0.25)', 'rgba(147,51,234,0.22)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <LinearGradient
        colors={outerGradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

const RevealView = ({ delay = 0, children, travel = 18 }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [anim, delay]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] });

  return (
    <Animated.View style={{ width: '100%', opacity: anim, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};


/* -------------------- Page Transition Wrapper -------------------- */
 const ScreenTransition = ({ routeKey, children }) => {
   const anim = useRef(new Animated.Value(0)).current;


   useEffect(() => {
     anim.setValue(0);
     Animated.timing(anim, {
       toValue: 1,
       duration: 260,
       easing: Easing.out(Easing.cubic),
       useNativeDriver: true,
     }).start();
   }, [routeKey]);


   const translate = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
   const opacity = anim;


   return (
     <Animated.View style={{ flex: 1, opacity, transform: [{ translateY: translate }] }}>
       {children}
     </Animated.View>
   );
 };


 /* -------------------- Screens -------------------- */


const Home = () => {
  const { mode } = useThemeContext();
  const isLightMode = mode === 'light';
  const tilePalette = METRIC_TILE_PALETTES[isLightMode ? 'light' : 'dark'];
  const heroGradient = HOME_HERO_GRADIENTS[isLightMode ? 'light' : 'dark'];
  const waterRemaining = Math.max(0, (goals.waterMl || 0) - (today.waterMl || 0));
  const sleepRemaining = Math.max(0, (goals.sleepHr || 0) - (today.sleepHr || 0));
  const workoutRemaining = Math.max(0, (goals.workout || 0) - todaysSessions.length);
  const electrolyteLogged = hasElectrolyteIntake(today.electrolytes || {});
  const readinessMessage =
    readinessPct >= 80
      ? 'Prime to push today.'
      : readinessPct >= 55
      ? 'Stay steady and keep stacking.'
      : 'Dial it back and recover intentionally.';
  const formatHours = (value) => {
    if (!Number.isFinite(value)) return 0;
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? Math.round(rounded) : rounded;
  };

  const metricTiles = [
    {
      key: 'water',
      label: 'Hydration',
      valueText: `${today.waterMl || 0} mL`,
      hint: waterRemaining > 0 ? `${Math.max(0, Math.round(waterRemaining))} mL to go` : 'Goal locked in',
      pct: waterProgressPct,
      gradient: tilePalette.water.gradient,
      accent: tilePalette.water.accent,
      icon: <MaterialCommunityIcons name="cup-water" size={18} color="#fff" />,
      logLabel: 'Log water',
      logAction: () => openModal('water'),
      editAction: () =>
        openModal('water', {
          mode: 'edit',
          initialValue: today.waterMl || 0,
          dateKey: todayKey,
        }),
    },
    {
      key: 'sleep',
      label: 'Sleep',
      valueText: `${today.sleepHr || 0} hr`,
      hint: sleepRemaining > 0 ? `${formatHours(sleepRemaining)} hr to go` : 'Recovery hit',
      pct: sleepProgressPct,
      gradient: tilePalette.sleep.gradient,
      accent: tilePalette.sleep.accent,
      icon: <MaterialCommunityIcons name="sleep" size={18} color="#fff" />,
      logLabel: 'Log sleep',
      logAction: () => openModal('sleep'),
      editAction: () =>
        openModal('sleep', {
          mode: 'edit',
          initialValue: today.sleepHr || 0,
          dateKey: todayKey,
        }),
    },
    {
      key: 'electrolyte',
      label: 'Electrolytes',
      valueText: `${electrolytePct}% balanced`,
      hint: electrolyteLogged ? 'Keep minerals steady' : 'Nothing logged yet',
      pct: electrolyteProgressPct,
      gradient: tilePalette.electrolyte.gradient,
      accent: tilePalette.electrolyte.accent,
      icon: <MaterialCommunityIcons name="lightning-bolt" size={18} color="#fff" />,
      logLabel: 'Log electrolytes',
      logAction: () => openModal('electrolyte'),
      editAction: () =>
        openModal('electrolyte', {
          mode: 'edit',
          initialKey: 'sodium',
          initialValue: today.electrolytes?.sodium || 0,
          dateKey: todayKey,
        }),
    },
    {
      key: 'workout',
      label: 'Workouts',
      valueText: `${todaysSessions.length} logged`,
      hint:
        workoutRemaining > 0
          ? `${workoutRemaining} session${workoutRemaining === 1 ? '' : 's'} left`
          : 'Training locked',
      pct: workoutProgressPct,
      gradient: tilePalette.workout.gradient,
      accent: tilePalette.workout.accent,
      icon: <MaterialCommunityIcons name="dumbbell" size={18} color="#fff" />,
      logLabel: 'Log workout',
      logAction: () => openModal('workout'),
      editAction: () => openModal('workout', { mode: 'edit', dateKey: todayKey }),
    },
  ];

  return (
    <AnimatedScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <RevealView>
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="lightning-bolt" size={20} color="#fff" />
            <Text style={styles.appName}>MaxPot</Text>
          </View>
          <Text style={styles.heroText}>Hit your daily targets.</Text>
        </LinearGradient>
      </RevealView>

      <RevealView delay={80}>
        <MomentumCard
          readiness={readinessPct}
          hydration={effectiveHydrationPct}
          sleep={sleepPct}
          workouts={workoutPct}
          message={readinessMessage}
        />
      </RevealView>

      {consistencyStreak > 0 && (
        <RevealView delay={160}>
          <View style={styles.statusChipRow}>
            <StatusChip
              label="Consistency streak"
              value={`${consistencyStreak} day${consistencyStreak === 1 ? '' : 's'}`}
              icon={<Ionicons name="flame" size={16} color="#fb923c" />}
              accent="#fb923c"
            />
          </View>
        </RevealView>
      )}

      <RevealView delay={220}>
        <View style={styles.metricGrid}>
          {metricTiles.map(({ key, ...tileProps }) => (
            <MetricTile key={key} {...tileProps} />
          ))}
        </View>
      </RevealView>
    </AnimatedScrollView>
  );
};


const Analyze = () => {
  const { mode } = useThemeContext();
  const isLightMode = mode === 'light';
  const analyzeHeroGradient = ANALYZE_HERO_GRADIENTS[isLightMode ? 'light' : 'dark'];
  const detailHeroGradients = DETAIL_HERO_GRADIENTS[isLightMode ? 'light' : 'dark'];
  const heroTextColor = mode === 'light' ? '#0f172a' : WHITE;
  const [view, setView] = useState('overview'); // 'overview' | 'sleep' | 'workouts' | 'water'
  const [period, setPeriod] = useState('week'); // 'week' | 'month' | 'year'
  const [showWorkoutInfo, setShowWorkoutInfo] = useState(false);

  const readinessDisplay = Math.round(analysis?.readiness ?? readinessPct);
  const sleepScoreDisplay = Math.round(analysis?.sleep_score ?? sleepPct);
  const hydrationScoreDisplay = Math.round(analysis?.hydration_score ?? hydrationPct);
  const electrolyteScoreDisplay = Math.round(analysis?.sodium_score ?? electrolytePct);
  const insightsList = analysis?.insights || [];
  const recommendationsList = analysis?.recommendations || [];

  const analyzeTabs = [
    { key: 'overview', label: 'Overview', description: 'Readiness mix', icon: 'grid-outline', color: BLUE },
    { key: 'sleep', label: 'Sleep', description: 'Recovery quality', icon: 'moon-outline', color: SLEEP },
    { key: 'water', label: 'Hydration', description: 'Fluid + electrolytes', icon: 'water-outline', color: WATER },
    { key: 'workouts', label: 'Training', description: 'Load + intensity', icon: 'barbell-outline', color: WORKOUT },
  ];

  const series = useMemo(() => {
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
    return history.slice(-days);
  }, [period, history]);

  const labels = useMemo(() => makeLabels(series, period), [series, period]);
  const values = useMemo(() => {
    if (view === 'sleep') return series.map((d) => d.sleepHr || 0);
    if (view === 'workouts')
      return series.map((d) => {
        if (typeof d.trainingLoad === 'number') return d.trainingLoad;
        return computeDayTrainingLoad(d.workoutSessions || []);
      });
    if (view === 'water') return series.map((d) => d.waterMl || 0);
    return [];
  }, [series, view]);

  const insight = useMemo(() => {
    if (values.length < 14) return null;
    const last14 = values.slice(-14);
    const prev = avg(last14.slice(0, 7));
    const curr = avg(last14.slice(7));
    const change = prev === 0 ? (curr === 0 ? 0 : 100) : ((curr - prev) / prev) * 100;
    const metric = view === 'sleep' ? 'sleep' : view === 'workouts' ? 'workouts' : 'hydration';
    const word = change >= 0 ? 'better' : 'worse';
    return `${metric[0].toUpperCase()}${metric.slice(1)} is ${Math.abs(
      Math.round(change)
    )}% ${word} this week vs last.`;
  }, [values, view]);

  const lineColor = view === 'sleep' ? SLEEP : view === 'workouts' ? WORKOUT : WATER;
  const isSeriesEmpty = series.length === 0;
  const hasWaterEntries = view === 'water' && values.some((v) => (v || 0) > 0);
  const sleepGoal = goals.sleepHr || defaultGoals.sleepHr;

  const overviewTiles = [
    {
      key: 'sleep',
      label: 'Sleep quality',
      value: `${sleepScoreDisplay}%`,
      meta: `${today.sleepHr || 0}h logged today`,
      icon: <Ionicons name="moon" size={16} color="#fff" />,
      accent: SLEEP,
    },
    {
      key: 'hydration',
      label: 'Hydration',
      value: `${hydrationScoreDisplay}%`,
      meta: `${today.waterMl || 0} mL today`,
      icon: <Ionicons name="water" size={16} color="#fff" />,
      accent: WATER,
    },
    {
      key: 'electrolyte',
      label: 'Electrolytes',
      value: `${electrolyteScoreDisplay}%`,
      meta: hasElectrolyteIntake(today.electrolytes) ? 'Logged' : 'Missing today',
      icon: <Ionicons name="flash" size={16} color="#fff" />,
      accent: ELECTROLYTE,
    },
    {
      key: 'workouts',
      label: 'Training load',
      value: `${workoutPct}%`,
      meta: `${todaysSessions.length} session${todaysSessions.length === 1 ? '' : 's'} today`,
      icon: <Ionicons name="barbell" size={16} color="#fff" />,
      accent: WORKOUT,
    },
  ];

  const detailTitle =
    view === 'sleep' ? 'Sleep quality' : view === 'water' ? 'Hydration volume' : 'Training load';

  const sleepRecommendation =
    view === 'sleep' && values.length
      ? (() => {
          const avgSleepHours = avg(values);
          if (avgSleepHours === 0) {
            return '⚠️ No sleep tracked for this window — log tonight’s routine to see trends.';
          }
          if (avgSleepHours < sleepGoal * 0.75) {
            return `⚠️ Sleep debt climbing: averaging ${avgSleepHours.toFixed(1)}h vs goal ${sleepGoal}h. Prioritize wind-down time.`;
          }
          if (avgSleepHours < sleepGoal) {
            return `🌓 Close to target: averaging ${avgSleepHours.toFixed(1)}h of ${sleepGoal}h. Add 20–30 mins of rest to lock it in.`;
          }
          return '✅ Sleep goal met — keep the same bedtime window to stay consistent.';
        })()
      : null;
  const workoutRecommendation =
    view === 'workouts' && values.length
      ? (() => {
          const avgLoad = avg(values);
          const peakLoad = Math.max(...values);
          const latestLoad = values[values.length - 1];
          if (avgLoad === 0 && peakLoad === 0) {
            return '⚠️ No workouts logged yet this period — schedule a movement session.';
          }
          const overtrainingThreshold = 650;
          if (peakLoad >= overtrainingThreshold || latestLoad >= overtrainingThreshold) {
            return '⚠️ Training load is spiking — you might be overreaching. Dial back intensity or add recovery.';
          }
          if (avgLoad >= 450 || latestLoad >= 500) {
            return '🔥 Sessions are heavy — prioritize sleep, fueling, and deloads to avoid burnout.';
          }
          if (avgLoad < 150 && latestLoad < 200) {
            return '⚠️ Workouts are very light — add intensity or duration to build capacity.';
          }
          if (avgLoad < 220 || latestLoad < 220) {
            return '↗️ Volume is building — add one more focused set or increase tempo to keep progressing.';
          }
          return '✅ Training load is in a healthy range — keep stacking consistent sessions.';
        })()
      : null;
  const hydrationRecommendation =
    view === 'water' && hasWaterEntries
      ? electrolyteScoreDisplay >= 70
        ? '✅ Hydration strong: Electrolytes are balanced.'
        : '⚠️ Hydration incomplete: Water logged, but electrolytes may be low — risk of cramping.'
      : null;
  const hydrationPrompt =
    view === 'water' && !hasWaterEntries
      ? 'Log your water first to unlock electrolyte coaching.'
      : null;

  const detailStats = useMemo(() => {
    if (view === 'overview' || !values.length) {
      return { avg: '--', best: '--', last: '--' };
    }
    const formatValue = (val) => {
      if (!Number.isFinite(val)) return '--';
      if (view === 'sleep') return `${Number(val).toFixed(1)}h`;
      if (view === 'water') return `${Math.round(val)} mL`;
      return `${Math.round(val)} pts`;
    };
    return {
      avg: formatValue(avg(values)),
      best: formatValue(Math.max(...values)),
      last: formatValue(values[values.length - 1]),
    };
  }, [values, view]);

  const callouts = useMemo(
    () =>
      [insight, hydrationRecommendation, hydrationPrompt, sleepRecommendation, workoutRecommendation].filter(
        Boolean
      ),
    [insight, hydrationRecommendation, hydrationPrompt, sleepRecommendation, workoutRecommendation]
  );

  const detailUnit = view === 'sleep' ? 'h' : view === 'water' ? 'mL' : '';
  const periodLabel =
    period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 30 days' : 'Past year';

  return (
    <>
      <AnimatedScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <RevealView>
          <View style={styles.analyzeIntro}>
            <Text style={styles.screenTitle}>Insights</Text>
            <Text style={styles.analyzeSubtitle}>Stay ahead of your trends.</Text>
          </View>
        </RevealView>
      <RevealView delay={40}>
        <View style={styles.analyzeTopTabs}>
          {analyzeTabs.map((tab) => {
            const isActive = view === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setView(tab.key)}
                style={[
                  styles.analyzeTopTab,
                  isActive && styles.analyzeTopTabActive,
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isActive ? '#0f172a' : '#cbd5f5'}
                />
                <Text
                  style={[
                    styles.analyzeTopTabText,
                    isActive && styles.analyzeTopTabTextActive,
                    tab.key === 'water' && styles.analyzeTopTabTextSmall,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </RevealView>

      {view === 'overview' ? (
        <>
          <RevealView delay={80}>
            <LinearGradient
              colors={analyzeHeroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.analyzeHero}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.momentumLabel}>Overall readiness</Text>
                <Text style={[styles.analyzeHeroTitle, { color: heroTextColor }]}>
                  Daily composite
                </Text>
                <Text style={styles.analyzeHeroSubtitle}>Updated after each log</Text>
                <View style={styles.analyzeHeroStats}>
                  <View>
                    <Text style={[styles.analyzeHeroValue, { color: heroTextColor }]}>
                      {readinessDisplay}%
                    </Text>
                    <Text style={styles.analyzeHeroMeta}>Today</Text>
                  </View>
                  <View>
                    <Text style={[styles.analyzeHeroValue, { color: heroTextColor }]}>
                      {Math.round(effectiveHydrationPct)}%
                    </Text>
                    <Text style={styles.analyzeHeroMeta}>Effective hydration</Text>
                  </View>
                </View>
              </View>
              <Donut percent={readinessDisplay} size={140} strokeWidth={14} />
            </LinearGradient>
          </RevealView>

          <RevealView delay={140}>
            <View style={styles.scoreGrid}>
              {overviewTiles.map(({ key, ...tileProps }) => (
                <ScoreTile key={key} {...tileProps} />
              ))}
            </View>
          </RevealView>

          {analysisLoading && (
            <RevealView delay={180}>
              <View style={styles.analysisLoadingRow}>
                <ActivityIndicator color={BLUE} />
                <Text style={styles.loadingText}>Updating insights...</Text>
              </View>
            </RevealView>
          )}
          {analysisError ? (
            <RevealView delay={200}>
              <Text style={styles.analysisErrorText}>{analysisError}</Text>
            </RevealView>
          ) : null}

          {insightsList.length > 0 && (
            <RevealView delay={220}>
              <View style={styles.calloutCard}>
                <Text style={styles.calloutHeading}>Insights</Text>
                {insightsList.map((item, idx) => (
                  <View key={`ins-${idx}`} style={styles.calloutRow}>
                    <Ionicons name="sparkles-outline" size={14} color="#93c5fd" />
                    <Text style={styles.calloutText}>
                      <Text style={styles.calloutCategory}>{item.category.toUpperCase()}</Text>{' '}
                      {item.message}
                    </Text>
                  </View>
                ))}
              </View>
            </RevealView>
          )}

          {recommendationsList.length > 0 && (
            <RevealView delay={260}>
              <View style={styles.calloutCard}>
                <Text style={styles.calloutHeading}>Suggested actions</Text>
                {recommendationsList.map((item, idx) => (
                  <View key={`rec-${idx}`} style={styles.calloutRow}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#34d399" />
                    <Text style={styles.calloutText}>
                      <Text style={styles.calloutCategory}>{item.category.toUpperCase()}</Text>{' '}
                      {item.message}
                    </Text>
                  </View>
                ))}
              </View>
            </RevealView>
          )}
        </>
      ) : (
        <>
          <RevealView delay={80}>
            <LinearGradient
              colors={
                view === 'sleep'
                  ? detailHeroGradients.sleep
                  : view === 'water'
                  ? detailHeroGradients.water
                  : detailHeroGradients.workouts
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.detailHeroCard}
            >
              <View style={styles.detailHeroHeader}>
                <View>
                  <Text style={styles.momentumLabel}>Focus metric</Text>
                  <Text style={styles.detailHeroTitle}>{detailTitle}</Text>
                </View>
                {view === 'workouts' && (
                  <Pressable
                    hitSlop={12}
                    onPress={() => setShowWorkoutInfo(true)}
                    style={styles.infoButton}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={mode === 'light' ? '#0f172a' : '#fefce8'}
                    />
                  </Pressable>
                )}
              </View>
              <View style={styles.detailStatsRow}>
                <View>
                  <Text style={styles.detailStatLabel}>Average</Text>
                  <Text style={styles.detailStatValue}>{detailStats.avg}</Text>
                </View>
                <View>
                  <Text style={styles.detailStatLabel}>Best</Text>
                  <Text style={styles.detailStatValue}>{detailStats.best}</Text>
                </View>
                <View>
                  <Text style={styles.detailStatLabel}>Latest</Text>
                  <Text style={styles.detailStatValue}>{detailStats.last}</Text>
                </View>
              </View>
            </LinearGradient>
          </RevealView>

          <RevealView delay={140}>
            <View style={styles.trendCard}>
              <View style={styles.trendCardHeader}>
                <View style={styles.trendHeaderText}>
                  <Text style={styles.cardTitle}>{detailTitle} trend</Text>
                  <Text style={styles.trendMeta}>{periodLabel}</Text>
                </View>
                <View style={styles.periodRow}>
                  <PeriodBtn text="Week" on={() => setPeriod('week')} active={period === 'week'} />
                  <PeriodBtn text="Month" on={() => setPeriod('month')} active={period === 'month'} />
                  <PeriodBtn text="Year" on={() => setPeriod('year')} active={period === 'year'} />
                </View>
              </View>

              <LineChartView labels={labels} values={values} unit={detailUnit} color={lineColor} />

              {isSeriesEmpty && (
                <Text style={styles.emptyStateText}>
                  Log your first {view} entry to unlock trends.
                </Text>
              )}
            </View>
          </RevealView>

          {!isSeriesEmpty && callouts.length > 0 && (
            <RevealView delay={200}>
              <View style={styles.calloutCard}>
                <Text style={styles.calloutHeading}>Coaching</Text>
                {callouts.map((text, idx) => (
                  <View key={`callout-${idx}`} style={styles.calloutRow}>
                    <Ionicons name="pulse-outline" size={14} color="#93c5fd" />
                    <Text style={styles.calloutText}>{text}</Text>
                  </View>
                ))}
              </View>
            </RevealView>
          )}

          <RevealView delay={260}>
            <TouchableOpacity onPress={() => setView('overview')} style={styles.backBtn}>
              <Text style={styles.backText}>Back to Overview</Text>
            </TouchableOpacity>
          </RevealView>
        </>
      )}
      </AnimatedScrollView>

      <Modal
        visible={showWorkoutInfo}
        animationType="fade"
        transparent
        onRequestClose={() => setShowWorkoutInfo(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.workoutInfoCard]}>
            <Text style={styles.modalTitle}>Training load points</Text>
            <Text style={styles.modalInfoText}>
              {`We convert every logged workout into load points:\n\n• Base load = session RPE × minutes logged.\n• Strength sets add an intensity bonus when you record reps and RIR/failure work.\n• Daily load is the sum of all session points.\n• The trend compares the last 7/30/365 days so you can spot spikes or dips.`}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowWorkoutInfo(false)}
                style={[styles.modalBtn, styles.btnGhost]}
              >
                <Text style={styles.btnGhostText}>Got it</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};



 const Settings = () => {
   const [localGoals, setLocalGoals] = useState(goals);


   // NEW: local packet creator state
   const [pktName, setPktName] = useState('');
   const [pkt, setPkt] = useState({
     sodium: '',
     potassium: '',
     chloride: '',
     magnesium: '',
     calcium: '',
     phosphate: '',
     bicarbonate: '',
   });


 const saveGoals = () => {
   setGoals(localGoals);
   LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
 };

  const reminderLabels = {
    water: 'Water intake',
    electrolytes: 'Electrolytes',
    sleep: 'Sleep wind-down',
    workouts: 'Workouts',
  };

  const ReminderRow = ({ reminderKey }) => {
    const config = reminders[reminderKey] || defaultReminders[reminderKey];
    const nextReminderLabel = useMemo(() => {
      if (!config?.enabled) return 'Reminder off';
      return describeNextReminder(config.time) || 'Next alert pending';
    }, [config?.enabled, config?.time]);
    return (
      <View style={styles.reminderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.reminderLabel}>{reminderLabels[reminderKey]}</Text>
          <Text style={styles.reminderSubLabel}>Daily notification</Text>
          <Text style={styles.reminderMeta}>{nextReminderLabel}</Text>
        </View>
        <View style={styles.reminderTimeBox}>
          <TextInput
            value={config.time}
            onChangeText={(text) => handleReminderTimeChange(reminderKey, text)}
            onBlur={() => handleReminderTimeBlur(reminderKey, config.time)}
            keyboardType="default"
            placeholder="7:30 AM"
            placeholderTextColor="#6b7280"
            style={styles.reminderTimeInput}
            maxLength={8}
          />
        </View>
        <Switch
          trackColor={{ false: themeColors.reminderSwitchTrack, true: BLUE }}
          thumbColor="#f9fafb"
          ios_backgroundColor={themeColors.reminderSwitchIos}
          value={!!config.enabled}
          onValueChange={(value) => handleReminderToggle(reminderKey, value)}
        />
      </View>
    );
  };


  const addPacket = () => {
     const clean = {};
     let any = false;
     Object.keys(pkt).forEach((k) => {
       const n = Math.max(0, Math.round(Number(pkt[k]) || 0));
       clean[k] = n;
       if (n > 0) any = true;
     });
     const name = pktName.trim();
     if (!name || !any) return;
     const newPkt = { id: 'pkt-' + Date.now(), name, ...clean };
     setElectrolytePackets((prev) => [newPkt, ...prev]);
     setPktName('');
     setPkt({
       sodium: '',
       potassium: '',
       chloride: '',
       magnesium: '',
       calcium: '',
       phosphate: '',
       bicarbonate: '',
     });
     LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
   };


   const delPacket = (id) => {
     setElectrolytePackets((prev) => prev.filter((p) => p.id !== id));
     LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
   };


   const PktNumber = ({ k, label }) => (
     <View style={{ width: '48%', marginBottom: 10 }}>
       <Text style={{ color: themeColors.textPrimary, marginBottom: 6 }}>{label} (mg)</Text>
       <View style={styles.inputBox}>
         <TextInput
           value={String(pkt[k])}
           onChangeText={(t) => setPkt((p) => ({ ...p, [k]: t.replace(/[^0-9]/g, '') }))}
           keyboardType="numeric"
           placeholder="0"
           placeholderTextColor="#6b7280"
           style={styles.input}
         />
       </View>
     </View>
   );


  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <RevealView>
        <View>
          <Text style={styles.screenTitle}>Settings</Text>
          <Text style={styles.settingsSubtitle}>Tune your plan and reminders.</Text>
        </View>
      </RevealView>

      <RevealView delay={60}>
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>Daily targets</Text>
          <Text style={styles.settingsHint}>Adjust water, sleep, and training goals.</Text>
          <GoalInput
            label="Daily water (mL)"
            value={String(localGoals.waterMl)}
            onChange={(v) => setLocalGoals((g) => ({ ...g, waterMl: Number(v) || 0 }))}
          />
          <GoalInput
            label="Water bottle size (mL)"
            value={String(localGoals.waterBottleMl)}
            onChange={(v) => setLocalGoals((g) => ({ ...g, waterBottleMl: Number(v) || 0 }))}
          />
          <GoalInput
            label="Daily sleep (hr)"
            value={String(localGoals.sleepHr)}
            onChange={(v) => setLocalGoals((g) => ({ ...g, sleepHr: Number(v) || 0 }))}
          />
          <GoalInput
            label="Daily workouts"
            value={String(localGoals.workout)}
            onChange={(v) => setLocalGoals((g) => ({ ...g, workout: Number(v) || 0 }))}
          />
          <Pressable onPress={saveGoals} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save targets</Text>
          </Pressable>
        </View>
      </RevealView>

      <RevealView delay={120}>
        <View style={[styles.settingsCard, styles.themeCard]}>
          <Text style={styles.cardTitle}>Appearance</Text>
          <Text style={styles.settingsHint}>Switch between dark and light mode.</Text>
          <View style={styles.themeOptionsRow}>
            <Pressable
              onPress={() => setAppearance('dark')}
              style={[styles.themeOption, appearance === 'dark' && styles.themeOptionActive]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.themeOptionLabel}>Dark</Text>
                {appearance === 'dark' && <Ionicons name="checkmark-circle" size={18} color={BLUE} />}
              </View>
              <Text style={styles.themeOptionHint}>High contrast for low-light sessions.</Text>
            </Pressable>
            <Pressable
              onPress={() => setAppearance('light')}
              style={[styles.themeOption, appearance === 'light' && styles.themeOptionActive]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.themeOptionLabel}>Light</Text>
                {appearance === 'light' && <Ionicons name="checkmark-circle" size={18} color={BLUE} />}
              </View>
              <Text style={styles.themeOptionHint}>Bright palette for daytime tracking.</Text>
            </Pressable>
          </View>
        </View>
      </RevealView>

      <RevealView delay={180}>
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>Daily reminders</Text>
          <Text style={styles.settingsHint}>Set AM/PM times for your nudges.</Text>
          {Object.keys(reminderLabels).map((key) => (
            <ReminderRow key={key} reminderKey={key} />
          ))}
        </View>
      </RevealView>

      <RevealView delay={240}>
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>Electrolyte packets</Text>
          <Text style={styles.settingsHint}>Save mineral presets for faster logging.</Text>
          <View style={{ marginTop: 10 }}>
            <Text style={styles.inputLabel}>Packet name</Text>
            <View style={styles.inputBox}>
             <TextInput
               value={pktName}
               onChangeText={setPktName}
               placeholder="e.g., Tablet A / Sports Drink"
               placeholderTextColor="#6b7280"
               style={styles.input}
             />
           </View>
         </View>


         <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 }}>
           <PktNumber k="sodium" label="Sodium" />
           <PktNumber k="potassium" label="Potassium" />
           <PktNumber k="chloride" label="Chloride" />
           <PktNumber k="magnesium" label="Magnesium" />
           <PktNumber k="calcium" label="Calcium" />
           <PktNumber k="phosphate" label="Phosphate" />
           <PktNumber k="bicarbonate" label="Bicarbonate" />
         </View>


         <Pressable onPress={addPacket} style={[styles.saveBtn, { marginTop: 8 }]}>
           <Text style={styles.saveBtnText}>Save packet</Text>
         </Pressable>
        </View>
      </RevealView>


      {electrolytePackets.length > 0 && (
        <View style={[styles.settingsCard, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Saved packets</Text>
          {electrolytePackets.map((p) => (
            <View key={p.id} style={styles.packetRow}>
              <View style={{ flex: 1 }}>
                 <Text style={{ color: themeColors.textPrimary, fontWeight: '700' }}>{p.name}</Text>
                 <Text style={{ color: themeColors.textMuted, fontSize: 12 }}>
                   Na {p.sodium || 0} • K {p.potassium || 0} • Cl {p.chloride || 0} • Mg {p.magnesium || 0} • Ca {p.calcium || 0} • PO₄ {p.phosphate || 0} • HCO₃ {p.bicarbonate || 0}
                 </Text>
               </View>
               <Pressable onPress={() => delPacket(p.id)} style={styles.delBtn}>
                 <Text style={styles.delBtnText}>Delete</Text>
               </Pressable>
             </View>
           ))}
        </View>
      )}

      <RevealView delay={300}>
        <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </RevealView>
    </ScrollView>
  );
};

const Legend = ({ color, label }) => {
  const { styles } = useThemeContext();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
};

const Calendar = ({ history, today, goals, onSelectDay }) => {
 const { styles } = useThemeContext();
 const [visibleMonth, setVisibleMonth] = useState(() => {
   const now = new Date();
   return new Date(now.getFullYear(), now.getMonth(), 1);
 });

 const readinessTimeline = useMemo(
   () => computeReadinessTimeline(history, today, goals),
   [history, today, goals]
 );

 const readinessMap = useMemo(() => {
   const map = new Map();
   readinessTimeline.forEach((entry) => {
     if (entry?.dateKey) map.set(entry.dateKey, entry);
   });
   return map;
 }, [readinessTimeline]);

 const { weeks, label } = useMemo(
   () => buildCalendarWeeks(visibleMonth, readinessMap),
   [visibleMonth, readinessMap]
 );

 const changeMonth = (delta) => {
   setVisibleMonth((prev) => {
     const next = new Date(prev);
     next.setMonth(prev.getMonth() + delta, 1);
     return next;
   });
 };

 return (
   <ScrollView
     style={styles.scroll}
     contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
     showsVerticalScrollIndicator={false}
   >
     <View style={styles.calendarHeader}>
       <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calendarNavBtn}>
         <Ionicons name="chevron-back" size={18} color={WHITE} />
       </TouchableOpacity>
       <Text style={styles.calendarHeaderText}>{label}</Text>
       <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calendarNavBtn}>
         <Ionicons name="chevron-forward" size={18} color={WHITE} />
       </TouchableOpacity>
     </View>

     <View style={styles.calendarLegend}>
       <Legend color={getReadinessColor(90)} label="90+" />
       <Legend color={getReadinessColor(75)} label="75–89" />
       <Legend color={getReadinessColor(60)} label="60–74" />
       <Legend color={getReadinessColor(45)} label="< 60" />
     </View>

     <View style={styles.calendarWeekLabels}>
       {DAY_LABELS.map((day) => (
         <Text key={day} style={styles.calendarWeekLabel}>
           {day}
         </Text>
       ))}
     </View>

     {weeks.map((week, idx) => (
       <View key={`wk-${idx}`} style={styles.calendarWeekRow}>
         {week.map((day) => {
           const backgroundColor =
             day.readiness != null ? getReadinessColor(day.readiness) : null;
           const textOnBadge =
             day.readiness != null && day.readiness >= 75 ? '#0f172a' : WHITE;
           return (
             <TouchableOpacity
               key={day.key}
               onPress={() => onSelectDay?.(day.key)}
               activeOpacity={0.9}
               style={[
                 styles.calendarCell,
                 !day.isCurrentMonth && styles.calendarCellMuted,
                 day.isToday && styles.calendarCellToday,
               ]}
             >
               <Text
                 style={[
                   styles.calendarCellDate,
                   !day.isCurrentMonth && styles.calendarCellDateMuted,
                 ]}
               >
                 {day.dayNumber}
               </Text>
               <View
                 style={[
                   styles.calendarCellBadge,
                   backgroundColor
                     ? { backgroundColor }
                     : styles.calendarCellBadgeEmpty,
                 ]}
                >
                  <Text style={[styles.calendarCellBadgeText, { color: textOnBadge }]}>
                   {day.readiness != null ? day.readiness : '-'}
                 </Text>
               </View>
             </TouchableOpacity>
           );
         })}
       </View>
     ))}

     <Text style={styles.calendarFootnote}>
       Readiness combines sleep, hydration, and workout consistency. Log daily to fill the calendar.
     </Text>
   </ScrollView>
 );
};


 /* -------------------- Render with transitions -------------------- */
 /* -------------------- Workout form helpers + UI -------------------- */


const updateSet = (i, effort) => {
 setSetsDetail((prev) => {
   const copy = [...prev];
   copy[i] = { ...copy[i], effort };
   return copy;
 });
};


const updateRir = (i, rir) => {
 setSetsDetail((prev) => {
   const copy = [...prev];
   copy[i] = { ...copy[i], rir };
   return copy;
 });
};


const isSelectedEffort = (i, key) => setsDetail[i]?.effort === key;

const SIMPLE_WORKOUT_TEMPLATES = [
  { key: 'strength_guided', label: 'Strength', hint: 'Full-body or split lifting' },
  { key: 'cardio_steady', label: 'Cardio • steady', hint: 'Jog, bike, row or long walk' },
  { key: 'hiit_sprints', label: 'HIIT / Sprints', hint: 'Intervals, hills, circuits' },
];

const SIMPLE_EFFORT_OPTIONS = [
  { key: 'easy', label: 'Easy', hint: 'Comfortable pace' },
  { key: 'moderate', label: 'Moderate', hint: 'Challenging but steady' },
  { key: 'hard', label: 'Hard', hint: 'High effort' },
];


function WorkoutForm() {
 const { styles, colors } = useThemeContext();
 return (
   <ScrollView style={{ maxHeight: 420 }}>
     {!workoutType && (
       <View>
         <Text style={styles.modalTitle}>Choose workout type</Text>
         <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
           <Pressable onPress={() => setWorkoutType('strength')} style={styles.pill}>
             <Text style={styles.pillText}>Strength</Text>
           </Pressable>
           <Pressable onPress={() => setWorkoutType('running_steady')} style={styles.pill}>
             <Text style={styles.pillText}>Running (steady)</Text>
           </Pressable>
           <Pressable onPress={() => setWorkoutType('running_sprint')} style={styles.pill}>
             <Text style={styles.pillText}>Running (sprints)</Text>
           </Pressable>
         </View>
       </View>
     )}


     {/* Strength form */}
     {workoutType === 'strength' && (
       <View style={{ marginTop: 8 }}>
         <Text style={styles.modalTitle}>Working sets</Text>
         <View style={styles.inputBox}>
           <TextInput
             value={String(numSets || '')}
             onChangeText={(t) => setNumSets(Number(t) || 0)}
             keyboardType="numeric"
             placeholder="0"
             placeholderTextColor="#6b7280"
             style={styles.input}
           />
         </View>


         {Array.from({ length: Math.max(0, numSets) }).map((_, i) => (
           <View key={i} style={{ marginTop: 10 }}>
         <Text style={{ color: colors.textPrimary, marginBottom: 6 }}>Set {i + 1}</Text>
             <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
               <Pressable
                 onPress={() => updateSet(i, 'before_failure')}
                 style={[styles.pill, isSelectedEffort(i, 'before_failure') && styles.pillActive]}
               >
                 <Text style={[styles.pillText, isSelectedEffort(i, 'before_failure') && styles.pillTextActive]}>
                   Before failure
                 </Text>
               </Pressable>


               <Pressable
                 onPress={() => updateSet(i, 'to_failure')}
                 style={[styles.pill, isSelectedEffort(i, 'to_failure') && styles.pillActive]}
               >
                 <Text style={[styles.pillText, isSelectedEffort(i, 'to_failure') && styles.pillTextActive]}>
                   To failure
                 </Text>
               </Pressable>


               <Pressable
                 onPress={() => updateSet(i, 'past_failure')}
                 style={[styles.pill, isSelectedEffort(i, 'past_failure') && styles.pillActive]}
               >
                 <Text style={[styles.pillText, isSelectedEffort(i, 'past_failure') && styles.pillTextActive]}>
                   Past failure
                 </Text>
               </Pressable>
             </View>


             {setsDetail[i]?.effort === 'before_failure' && (
               <View style={[styles.inputBox, { marginTop: 8 }]}>
                 <TextInput
                   value={String(setsDetail[i]?.rir ?? '')}
                   onChangeText={(t) => updateRir(i, Number(t) || 0)}
                   keyboardType="numeric"
                   placeholder="RIR (0-5)"
                   placeholderTextColor="#6b7280"
                   style={styles.input}
                 />
               </View>
             )}
           </View>
         ))}
       </View>
     )}


     {/* Running steady form */}
     {workoutType === 'running_steady' && (
       <View style={{ marginTop: 8 }}>
         <Text style={styles.modalTitle}>Steady run</Text>
         <View style={styles.inputBox}>
           <TextInput
             value={runMinutes}
             onChangeText={setRunMinutes}
             keyboardType="numeric"
             placeholder="Minutes"
             placeholderTextColor="#6b7280"
             style={styles.input}
           />
         </View>
         <View style={[styles.inputBox, { marginTop: 8 }]}>
           <TextInput
             value={runPerceived}
             onChangeText={setRunPerceived}
             keyboardType="numeric"
             placeholder="Perceived effort (1-10)"
             placeholderTextColor="#6b7280"
             style={styles.input}
           />
         </View>
       </View>
     )}


     {/* Running sprints form */}
     {workoutType === 'running_sprint' && (
       <View style={{ marginTop: 8 }}>
         <Text style={styles.modalTitle}>Sprints</Text>
         <View style={styles.inputBox}>
           <TextInput
             value={sprintDistance}
             onChangeText={setSprintDistance}
             keyboardType="numeric"
             placeholder="Distance (meters)"
             placeholderTextColor="#6b7280"
             style={styles.input}
           />
         </View>
         <View style={[styles.inputBox, { marginTop: 8 }]}>
           <TextInput
             value={sprintPerceived}
             onChangeText={setSprintPerceived}
             keyboardType="numeric"
             placeholder="Perceived intensity %"
             placeholderTextColor="#6b7280"
             style={styles.input}
           />
         </View>
       </View>
     )}
   </ScrollView>
 );
}

function StandardWorkoutForm() {
  const { styles, colors } = useThemeContext();
  const quickDurations =
    simpleWorkoutTemplate === 'hiit_sprints'
      ? [10, 15, 20, 25]
      : simpleWorkoutTemplate === 'cardio_steady'
      ? [15, 30, 45, 60]
      : [20, 30, 40, 50];

  return (
    <ScrollView style={{ maxHeight: 420 }}>
      <Text style={styles.modalTitle}>Guided workout</Text>
      <Text style={styles.modalSubtitle}>Tell us the vibe and we’ll handle the details.</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}
      >
        {SIMPLE_WORKOUT_TEMPLATES.map((tpl) => (
          <Pressable
            key={tpl.key}
            onPress={() => setSimpleWorkoutTemplate(tpl.key)}
            style={[
              styles.templateCard,
              simpleWorkoutTemplate === tpl.key && styles.templateCardActive,
            ]}
          >
            <Text style={styles.templateLabel}>{tpl.label}</Text>
            <Text style={styles.templateHint}>{tpl.hint}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', marginBottom: 6 }}>
          Duration (minutes)
        </Text>
        <View style={styles.inputBox}>
          <TextInput
            value={simpleDuration}
            onChangeText={(t) => setSimpleDuration(t.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            placeholder={
              simpleWorkoutTemplate === 'cardio_steady'
                ? '30'
                : simpleWorkoutTemplate === 'hiit_sprints'
                ? '20'
                : '30'
            }
            placeholderTextColor="#6b7280"
            style={styles.input}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {quickDurations.map((val) => (
            <Pressable key={val} onPress={() => setSimpleDuration(String(val))} style={styles.pill}>
              <Text style={styles.pillText}>{val} min</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>How intense?</Text>
        <View style={styles.effortRow}>
          {SIMPLE_EFFORT_OPTIONS.map((opt) => {
            const active = simpleEffort === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setSimpleEffort(opt.key)}
                style={[styles.effortChip, active && styles.effortChipActive]}
              >
                <Text style={[styles.effortChipText, active && styles.effortChipTextActive]}>
                  {opt.label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{opt.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', marginBottom: 6 }}>
          Notes (optional)
        </Text>
        <View style={[styles.inputBox, { minHeight: 80 }]}>
          <TextInput
            value={simpleNotes}
            onChangeText={setSimpleNotes}
            multiline
            placeholder="What did you focus on today?"
            placeholderTextColor="#6b7280"
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          />
        </View>
      </View>
    </ScrollView>
  );
}

 const isLoading =
   !authReady || dataLoading || (firebaseUser && !dataLoaded);

const isModalEditMode = modal.mode === 'edit';
const modalTitleText = (() => {
  if (!modal.type) return '';
   if (modal.type === 'water') {
     const suffix = waterLogMode === 'ml' ? '(mL)' : '(Bottles)';
     return `${isModalEditMode ? 'Set water total' : 'Add water'} ${suffix}`;
   }
   if (modal.type === 'sleep') {
     return isModalEditMode ? 'Set sleep total (hr)' : 'Add sleep (hr)';
   }
   if (modal.type === 'workout') {
     return isModalEditMode ? 'Adjust workouts' : 'Log workout';
   }
   if (modal.type === 'electrolyte') {
     if (!isModalEditMode && electrolyteMode === 'batch') return 'Add electrolytes (batch)';
     return isModalEditMode ? 'Set electrolyte totals' : 'Add electrolyte (single)';
   }
  return '';
})();
const modalPrimaryBtnText = isModalEditMode
  ? modal.type === 'workout'
    ? 'Done'
    : 'Save'
  : 'Add';
const modalDateLabel = formatDateLabel(modalTargetEntry?.dateKey || modal.dateKey || todayKey);
const modalEditHint = isModalEditMode
  ? modal.type === 'workout'
    ? `Manage workouts logged on ${modalDateLabel}.`
    : `Updating ${modal.type} totals for ${modalDateLabel}.`
  : null;
const selectedDayEntry = dayDetail.visible ? getEntryForDate(dayDetail.dateKey) : null;
const selectedDayLabel = selectedDayEntry ? formatDateLabel(selectedDayEntry.dateKey) : '';

 if (isLoading) {
   return (
     <ThemeContext.Provider value={themeValue}>
       <SafeAreaView style={styles.loadingScreen}>
         <StatusBar style={appearance === 'light' ? 'dark' : 'light'} />
         <FancyBackground />
         <ActivityIndicator size="large" color={BLUE} />
         <Text style={styles.loadingText}>Syncing with Firebase...</Text>
       </SafeAreaView>
     </ThemeContext.Provider>
    );
  }

  if (!firebaseUser) {
    return (
      <ThemeContext.Provider value={themeValue}>
        <SafeAreaView style={styles.authScreen}>
          <StatusBar style={appearance === 'light' ? 'dark' : 'light'} />
          <FancyBackground />
          <View style={styles.authCard}>
            <Text style={styles.authHeading}>MaxPot</Text>
            <Text style={styles.authSubtitle}>
            {authMode === 'signIn'
              ? 'Log in to sync your training and hydration data.'
              : 'Create an account to sync your training and hydration data.'}
            </Text>
            <View style={styles.authField}>
              <Text style={styles.authLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor="#6b7280"
                style={styles.authInput}
              />
            </View>
            <View style={styles.authField}>
              <Text style={styles.authLabel}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Minimum 6 characters"
                placeholderTextColor="#6b7280"
                secureTextEntry
                style={styles.authInput}
              />
            </View>
            {authError ? <Text style={styles.authError}>{authError}</Text> : null}
            <Pressable
              onPress={handleAuthSubmit}
              disabled={authBusy}
              style={({ pressed }) => [
                styles.authButton,
                (pressed && !authBusy) ? { opacity: 0.9 } : null,
                authBusy ? { opacity: 0.7 } : null,
              ]}
            >
              {authBusy ? (
                <ActivityIndicator color={themeColors.textPrimary} />
              ) : (
                <Text style={styles.authButtonText}>
                  {authMode === 'signIn' ? 'Log in' : 'Sign up'}
                </Text>
              )}
            </Pressable>
            <TouchableOpacity onPress={toggleAuthMode} style={styles.authToggle}>
              <Text style={styles.authToggleText}>
                {authMode === 'signIn'
                  ? "Don't have an account? Sign up"
                  : 'Already registered? Log in'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={themeValue}>
      <SafeAreaView style={styles.screen}>
        <StatusBar style={appearance === 'light' ? 'dark' : 'light'} />
        <FancyBackground />

        <View style={styles.screenContent}>
          {authError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{authError}</Text>
            </View>
          ) : null}

          <ScreenTransition routeKey={route}>
            {route === 'home' && <Home />}
            {route === 'analyze' && <Analyze />}
            {route === 'calendar' && (
              <Calendar history={history} today={today} goals={goals} onSelectDay={openDayDetail} />
            )}
            {route === 'settings' && <Settings />}
          </ScreenTransition>
        </View>

        {/* Bottom nav with icons */}
        <View style={styles.tabRow}>
          <TabBtn label="Analyze" icon="analytics-outline" active={route === 'analyze'} onPress={() => setRoute('analyze')} />
          <TabBtn label="Calendar" icon="calendar-outline" active={route === 'calendar'} onPress={() => setRoute('calendar')} />
          <TabBtn label="Home" icon="home-outline" active={route === 'home'} onPress={() => setRoute('home')} />
          <TabBtn label="Settings" icon="settings-outline" active={route === 'settings'} onPress={() => setRoute('settings')} />
        </View>

        {/* Modal */}
        <Modal visible={!!modal.type} animationType="slide" transparent onRequestClose={closeModal}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalCard}
            >
            <Text style={styles.modalTitle}>{modalTitleText}</Text>
            {modalEditHint ? (
              <View style={styles.modalInfoBox}>
                <Text style={styles.modalInfoText}>{modalEditHint}</Text>
              </View>
            ) : null}


           {/* WATER: mode switch */}
           {modal.type === 'water' && (
             <>
               <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                 <SegBtn text="mL" active={waterLogMode === 'ml'} onPress={() => { setWaterLogMode('ml'); setInputValue(''); }} />
                 <SegBtn text="Bottles" active={waterLogMode === 'bottle'} onPress={() => { setWaterLogMode('bottle'); setInputValue(''); }} />
               </View>
               <Text style={{ color: themeColors.textMuted, marginBottom: 6 }}>
                 Bottle size: {goals.waterBottleMl || 0} mL
               </Text>
               {isModalEditMode && (
                 <Text style={styles.modalHint}>
                   Currently logged: {modalTargetEntry?.waterMl || 0} mL
                 </Text>
               )}
             </>
           )}


           {/* ELECTROLYTES: mode switch */}
           {modal.type === 'electrolyte' && !isModalEditMode && (
             <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
               <SegBtn text="Single" active={electrolyteMode === 'single'} onPress={() => { setElectrolyteMode('single'); setInputValue(''); }} />
               <SegBtn text="Batch" active={electrolyteMode === 'batch'} onPress={() => setElectrolyteMode('batch')} />
             </View>
           )}


          {modal.type === 'workout' && !isModalEditMode && (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SegBtn
                  text="Standard"
                  active={workoutInputMode === 'standard'}
                   onPress={() => setWorkoutInputMode('standard')}
                 />
                 <SegBtn
                   text="Advanced"
                   active={workoutInputMode === 'advanced'}
                   onPress={() => setWorkoutInputMode('advanced')}
                 />
               </View>
               <Text style={styles.modalSubtitle}>
                 {workoutInputMode === 'standard'
                   ? 'Quick templates with duration + effort hints.'
                   : 'Full control over sets, intervals, and intensity.'}
               </Text>
             </>
           )}

           {modal.type === 'workout' && isModalEditMode && (
             <View style={styles.manageBox}>
               <Text style={styles.manageHeading}>Logged {modalDateLabel}</Text>
               {modalWorkoutSessions.length === 0 ? (
                 <Text style={styles.manageEmptyText}>No workouts logged yet.</Text>
               ) : (
                 <ScrollView style={styles.manageList} showsVerticalScrollIndicator={false}>
                   {modalWorkoutSessions.map((session) => (
                     <View key={session.id} style={styles.manageRow}>
                       <View style={styles.manageCopy}>
                         <Text style={styles.manageLabel}>{describeWorkoutSummary(session)}</Text>
                         <Text style={styles.manageMeta}>
                           {describeWorkoutMeta(session) || 'Logged session'}
                         </Text>
                       </View>
                       <Pressable
                         onPress={() => removeWorkoutSession(session.id, modal.dateKey)}
                         style={styles.manageRemoveBtn}
                         hitSlop={8}
                       >
                         <Text style={styles.manageRemoveText}>Remove</Text>
                       </Pressable>
                     </View>
                   ))}
                 </ScrollView>
               )}
             </View>
           )}


           {modal.type === 'workout' ? (
             isModalEditMode
               ? null
               : workoutInputMode === 'standard'
               ? <StandardWorkoutForm />
               : <WorkoutForm />
           ) : modal.type === 'electrolyte' && electrolyteMode === 'batch' ? (
             <>
               {/* PRESETS ROW */}
               {electrolytePackets.length > 0 && (
                 <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                   <View style={{ flexDirection: 'row', gap: 8 }}>
                     {electrolytePackets.map((p) => (
                       <Pressable
                         key={p.id}
                         onPress={() => {
                           setBatchElectrolytes({
                             sodium: String(p.sodium || ''),
                             potassium: String(p.potassium || ''),
                             chloride: String(p.chloride || ''),
                             magnesium: String(p.magnesium || ''),
                             calcium: String(p.calcium || ''),
                             phosphate: String(p.phosphate || ''),
                             bicarbonate: String(p.bicarbonate || ''),
                           });
                         }}
                         style={styles.pill}
                       >
                         <Text style={styles.pillText}>{p.name}</Text>
                       </Pressable>
                     ))}
                   </View>
                 </ScrollView>
               )}


               <ScrollView style={{ maxHeight: 360 }}>
                 {Object.keys(batchElectrolytes).map((k) => (
                   <View key={k} style={{ marginBottom: 10 }}>
                     <Text style={{ color: themeColors.textPrimary, marginBottom: 6, textTransform: 'capitalize' }}>{k} (mg)</Text>
                     <View style={styles.inputBox}>
                       <TextInput
                         value={String(batchElectrolytes[k])}
                         onChangeText={(t) =>
                           setBatchElectrolytes((prev) => ({ ...prev, [k]: t.replace(/[^0-9]/g, '') }))
                         }
                         keyboardType="numeric"
                         placeholder="0"
                         placeholderTextColor="#6b7280"
                         style={styles.input}
                       />
                     </View>
                   </View>
                 ))}
               </ScrollView>
               <Text style={{ color: themeColors.textMuted, marginTop: 4 }}>
                 Tip: tap a packet above to auto-fill, then edit any amounts before saving.
               </Text>
             </>
            ) : (
              <>
                {/* Single electrolyte input, or water/sleep default input */}
                {modal.type === 'electrolyte' && electrolyteMode === 'single' && (
                  <ElectrolytePicker selected={electrolyteKey} onSelect={setElectrolyteKey} />
                )}
                {isModalEditMode && modal.type === 'electrolyte' && electrolyteMode === 'single' && (
                  <Text style={styles.modalHint}>
                    {`Currently logged for ${electrolyteKey}: ${modalTargetEntry?.electrolytes?.[electrolyteKey] || 0} mg`}
                  </Text>
                )}
                {isModalEditMode && modal.type === 'sleep' && (
                  <Text style={styles.modalHint}>
                    Currently logged: {modalTargetEntry?.sleepHr || 0} hr
                  </Text>
                )}
                <View style={styles.inputBox}>
                 <TextInput
                   value={inputValue}
                   onChangeText={setInputValue}
                   keyboardType={modal.type === 'water' ? 'default' : 'numeric'}
                   placeholder={
                     modal.type === 'water'
                       ? (waterLogMode === 'ml' ? 'Enter mL (e.g., 250)' : 'Enter bottles (e.g., 3/4, 0.75, 2)')
                       : 'Enter amount'
                   }
                   placeholderTextColor="#6b7280"
                   style={styles.input}
                 />
               </View>


               {/* Quick picks */}
               {modal.type === 'water' && waterLogMode === 'ml' && (
                 <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                   {[250, 350, 500, 750].map((n) => (
                     <Pressable key={n} onPress={() => setInputValue(String(n))} style={styles.pill}>
                       <Text style={styles.pillText}>{n} mL</Text>
                     </Pressable>
                   ))}
                 </View>
               )}
               {modal.type === 'water' && waterLogMode === 'bottle' && (
                 <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                   {[
                     ['1/4', '¼'],
                     ['1/2', '½'],
                     ['3/4', '¾'],
                     ['1', '1×'],
                     ['2', '2×'],
                   ].map(([val, label]) => (
                     <Pressable key={val} onPress={() => setInputValue(val)} style={styles.pill}>
                       <Text style={styles.pillText}>{label}</Text>
                     </Pressable>
                   ))}
                 </View>
               )}
               {modal.type === 'electrolyte' && electrolyteMode === 'single' && (
                 <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                   {[250, 500, 750, 1000].map((n) => (
                     <Pressable key={n} onPress={() => setInputValue(String(n))} style={styles.pill}>
                       <Text style={styles.pillText}>{n} mg</Text>
                     </Pressable>
                   ))}
                 </View>
               )}
             </>
           )}


           <View style={styles.modalActions}>
             <Pressable onPress={closeModal} style={[styles.modalBtn, styles.btnGhost]}>
             <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={addEntry} style={styles.modalBtn}>
              <Text style={styles.modalBtnText}>{modalPrimaryBtnText}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={dayDetail.visible}
          transparent
          animationType="fade"
          onRequestClose={closeDayDetail}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, styles.dayDetailCard]}>
              <Text style={styles.modalTitle}>{selectedDayLabel || 'Selected day'}</Text>
              <Text style={styles.modalInfoText}>
                Adjust logs for this date without changing today’s data.
              </Text>
              <View style={styles.dayDetailRow}>
                <View>
                  <Text style={styles.dayDetailLabel}>Water</Text>
                  <Text style={styles.dayDetailValue}>{selectedDayEntry?.waterMl || 0} mL</Text>
                </View>
                <Pressable
                  onPress={() =>
                    handleDayMetricEdit('water', {
                      initialValue: selectedDayEntry?.waterMl || 0,
                    })
                  }
                  style={styles.dayDetailAction}
                >
                  <Text style={styles.dayDetailActionText}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.dayDetailRow}>
                <View>
                  <Text style={styles.dayDetailLabel}>Sleep</Text>
                  <Text style={styles.dayDetailValue}>{selectedDayEntry?.sleepHr || 0} hr</Text>
                </View>
                <Pressable
                  onPress={() =>
                    handleDayMetricEdit('sleep', {
                      initialValue: selectedDayEntry?.sleepHr || 0,
                    })
                  }
                  style={styles.dayDetailAction}
                >
                  <Text style={styles.dayDetailActionText}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.dayDetailRow}>
                <View>
                  <Text style={styles.dayDetailLabel}>Electrolytes</Text>
                  <Text style={styles.dayDetailValue}>
                    {hasElectrolyteIntake(selectedDayEntry?.electrolytes || {})
                      ? 'Logged'
                      : 'Not logged'}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    handleDayMetricEdit('electrolyte', {
                      initialKey: 'sodium',
                      initialValue: selectedDayEntry?.electrolytes?.sodium || 0,
                    })
                  }
                  style={styles.dayDetailAction}
                >
                  <Text style={styles.dayDetailActionText}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.dayDetailRow}>
                <View>
                  <Text style={styles.dayDetailLabel}>Workouts</Text>
                  <Text style={styles.dayDetailValue}>
                    {(selectedDayEntry?.workoutSessions || []).length} logged
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => handleDayMetricEdit('workout')}
                    style={styles.dayDetailAction}
                  >
                    <Text style={styles.dayDetailActionText}>Manage</Text>
                  </Pressable>
                  <Pressable onPress={handleDayWorkoutAdd} style={styles.dayDetailActionSecondary}>
                    <Text style={styles.dayDetailActionText}>Add</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.modalActions, { marginTop: 16 }]}>
                <Pressable onPress={closeDayDetail} style={[styles.modalBtn, styles.btnGhost]}>
                  <Text style={styles.btnGhostText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}


/* -------------------- Charts (no libs) -------------------- */


const Bars = ({ data }) => {
  const { styles } = useThemeContext();
  return (
    <View style={{ marginBottom: 16 }}>
      {data.map((row) => (
        <View key={row.label} style={{ marginBottom: 10 }}>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>{row.label}</Text>
            <Text style={styles.barPct}>{row.value}%</Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.max(0, Math.min(100, row.value))}%`, backgroundColor: row.color },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
};


const LineChartView = ({ labels = [], values = [], unit, color = BLUE }) => {
 const { styles } = useThemeContext();
 const [graphWidth, setGraphWidth] = useState(
   () => Dimensions.get('window').width - 48
 );
 const height = 200;
 const pad = 16;
 const hasValues = Array.isArray(values) && values.length > 0;
 const placeholderSparkline = [20, 45, 30, 60, 40, 65];
 const data = hasValues ? values : placeholderSparkline;
 const lineColor = hasValues ? color : 'rgba(148,163,184,0.55)';
 const dotBorder = hasValues ? color : 'rgba(148,163,184,0.8)';
 const dotFill = hasValues ? WHITE : 'rgba(148,163,184,0.18)';
 const safeLabels =
   hasValues && labels.length ? labels : Array.from({ length: data.length }, () => '');

 const effectiveWidth = Math.max(graphWidth, pad * 2 + 1);
 const min = Math.min(...data, 0);
 const max = Math.max(...data, 1);
 const range = max - min || 1;

 const pts = data.map((v, i) => {
   const x = pad + (i * (effectiveWidth - pad * 2)) / Math.max(1, data.length - 1);
   const y = pad + (height - pad * 2) * (1 - (v - min) / range);
   return { x, y };
 });

 return (
   <View style={[styles.card, { padding: 12 }]}>
     <View
       style={{ height, width: '100%' }}
       onLayout={({ nativeEvent }) => {
         const nextWidth = nativeEvent.layout.width;
         if (Math.abs(nextWidth - graphWidth) > 0.5) {
           setGraphWidth(nextWidth);
         }
       }}
     >
       <View style={[styles.gridLine, { top: pad }]} />
       <View style={[styles.gridLine, { top: height / 2 }]} />
       <View style={[styles.gridLine, { bottom: pad }]} />
       {pts.map((p, i) => {
         if (i === 0) return null;
         const p0 = pts[i - 1];
         const dx = p.x - p0.x;
         const dy = p.y - p0.y;
         const len = Math.sqrt(dx * dx + dy * dy);
         const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
         return (
           <View
             key={`seg-${i}`}
             style={{
               position: 'absolute',
               left: p0.x,
               top: p0.y,
               width: len,
               height: hasValues ? 2 : 0,
               borderRadius: 1,
               backgroundColor: hasValues ? lineColor : 'transparent',
               borderTopWidth: hasValues ? 0 : 1,
               borderColor: hasValues ? 'transparent' : lineColor,
               borderStyle: hasValues ? 'solid' : 'dashed',
               opacity: hasValues ? 1 : 0.8,
               transform: [{ rotateZ: `${angle}deg` }],
               transformOrigin: 'left center',
             }}
           />
         );
       })}
       {pts.map((p, i) => (
         <View
           key={`pt-${i}`}
           style={[
             styles.dot,
             {
               left: p.x - 4,
               top: p.y - 4,
               borderColor: dotBorder,
               backgroundColor: dotFill,
             },
           ]}
         />
       ))}
     </View>
     <View style={styles.xLabels}>
       {safeLabels.map((t, i) => (
         <Text key={`lbl-${i}`} style={styles.xLabelText}>
           {t}
         </Text>
       ))}
     </View>
     {!hasValues && (
       <Text style={styles.placeholderCaption}>Placeholder trend — log entries to unlock real data.</Text>
     )}
   </View>
 );
};


/* -------------------- Donut progress (no libs) -------------------- */
const Donut = ({ percent = 0, size = 120, strokeWidth = 12 }) => {
 const { colors, mode } = useThemeContext();
 const bounded = Math.max(0, Math.min(100, percent));
 const half = size / 2;
 const progress = useRef(new Animated.Value(0)).current;
 const listenerRef = useRef(null);
 const [displayPct, setDisplayPct] = useState(0);
 const trackColor = mode === 'light' ? '#e2e8f0' : '#111827';

 useEffect(() => {
   progress.stopAnimation();
   if (listenerRef.current) {
     progress.removeListener(listenerRef.current);
     listenerRef.current = null;
   }
   const id = progress.addListener(({ value }) => {
     setDisplayPct(Math.round(value));
   });
   listenerRef.current = id;
   Animated.timing(progress, {
     toValue: bounded,
     duration: 900,
     easing: Easing.out(Easing.cubic),
     useNativeDriver: false,
   }).start();
   return () => {
     if (listenerRef.current) {
       progress.removeListener(listenerRef.current);
       listenerRef.current = null;
     }
   };
 }, [progress, bounded]);

 const rightRotation = progress.interpolate({
   inputRange: [0, 50, 100],
   outputRange: ['0deg', '180deg', '180deg'],
 });
 const leftRotation = progress.interpolate({
   inputRange: [0, 50, 100],
   outputRange: ['0deg', '0deg', '180deg'],
 });
 const leftOpacity = progress.interpolate({
   inputRange: [0, 49.999, 50, 100],
   outputRange: [0, 0, 1, 1],
   extrapolate: 'clamp',
 });

 return (
   <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
     <View
       style={{
         width: size,
         height: size,
         justifyContent: 'center',
         alignItems: 'center',
       }}
     >
       {/* base ring */}
       <View
         style={{
           position: 'absolute',
           width: size,
           height: size,
           borderRadius: half,
           backgroundColor: 'transparent',
           borderWidth: strokeWidth,
           borderColor: trackColor,
         }}
       />
       {/* right half */}
       <View
         style={{
           position: 'absolute',
           width: half,
           height: size,
           left: half,
           overflow: 'hidden',
         }}
       >
         <Animated.View
           style={{
             position: 'absolute',
             width: size,
             height: size,
             borderRadius: half,
             borderWidth: strokeWidth,
             borderColor: BLUE,
             left: -half,
             transform: [{ rotateZ: rightRotation }],
           }}
         />
       </View>
       {/* left half */}
       <View
         style={{
           position: 'absolute',
           width: half,
           height: size,
           overflow: 'hidden',
           left: 0,
         }}
       >
         <Animated.View
           style={{
             position: 'absolute',
             width: size,
             height: size,
             borderRadius: half,
             borderWidth: strokeWidth,
             borderColor: BLUE,
             left: 0,
             transform: [{ rotateZ: leftRotation }],
             opacity: leftOpacity,
           }}
         />
       </View>


       {/* center label */}
      <Text style={{ color: colors.donutLabel, fontWeight: '800', fontSize: 20 }}>{displayPct}%</Text>
       <Text style={{ color: colors.textMuted, fontSize: 12 }}>Readiness</Text>
     </View>
   </View>
 );
};


/* -------------------- Demo data helpers -------------------- */


function makeDemoHistory(nDays) {
 const out = [];
 const now = new Date();
 for (let i = nDays - 1; i >= 0; i--) {
   const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
   const wobble = () => Math.sin(i * 0.4) + Math.random() * 0.6 - 0.3;
   const sleepHr = +(7.2 + wobble()).toFixed(1);
   const waterMl = Math.max(0, Math.round(1900 + wobble() * 700));


   const addSession = Math.random() < 0.45;
   const workoutSessions = addSession
     ? [{ id: d.toISOString(), type: 'strength', strength: { sets: [{ idx: 1, effort: 'to_failure' }] } }]
     : [];


   out.push({
     id: d.toISOString().slice(0, 10),
     sleepHr: Math.max(0, sleepHr),
     waterMl,
     workoutSessions,
     electrolyteLogged: workoutSessions.length ? Math.random() < 0.7 : false,
   });
 }
 const last = out[out.length - 1];
 out[out.length - 1] = { ...last, sleepHr: 0, waterMl: 0, workoutSessions: [], electrolyteLogged: false };
 return out;
}


function makeLabels(series, period) {
 if (period === 'week') {
   const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
   return series.map((d, i) => (i % 2 === 0 ? days[new Date(d.id).getDay()] : ''));
 }
 if (period === 'month') return series.map((d, i) => (i % 5 === 0 ? d.id.slice(5) : ''));
 return series.map((d, i) => (i % 30 === 0 ? d.id.slice(0, 7) : ''));
}


/* -------------------- Styles -------------------- */


const BLUE = '#3B82F6';
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const TEXT_MUTED = '#9CA3AF';
const BORDER = '#1f2937';


// metric colors
const WATER = '#0ea5e9'; // sky-500
const SLEEP = '#8b5cf6'; // violet-500
const WORKOUT = '#f59e0b'; // amber-500
const ELECTROLYTE = '#22c55e'; // green-500


const styles = StyleSheet.create({
 screen: { flex: 1, backgroundColor: '#020617', position: 'relative' },
 screenContent: { flex: 1, paddingTop: 12 },
 loadingScreen: {
   flex: 1,
   backgroundColor: '#020617',
   alignItems: 'center',
   justifyContent: 'center',
   paddingHorizontal: 24,
   position: 'relative',
 },
 loadingText: { marginTop: 12, color: TEXT_MUTED, fontSize: 14 },
 authScreen: {
   flex: 1,
   backgroundColor: '#020617',
   alignItems: 'center',
   justifyContent: 'center',
   paddingHorizontal: 20,
   paddingBottom: 40,
   position: 'relative',
 },
 authCard: {
   width: '100%',
   maxWidth: 420,
   backgroundColor: 'rgba(12,18,32,0.88)',
   borderRadius: 16,
   borderWidth: 1,
   borderColor: BORDER,
   padding: 24,
   shadowColor: '#020b2f',
   shadowOpacity: 0.45,
   shadowRadius: 26,
   shadowOffset: { width: 0, height: 18 },
   elevation: 12,
 },
 authHeading: { color: WHITE, fontSize: 28, fontWeight: '800', textAlign: 'center' },
 authSubtitle: { color: TEXT_MUTED, fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 20 },
 authField: { marginBottom: 12 },
 authLabel: { color: TEXT_MUTED, fontSize: 12, marginBottom: 6 },
 authInput: {
   backgroundColor: '#0b0f1a',
   borderWidth: 1,
   borderColor: BORDER,
   borderRadius: 12,
   paddingHorizontal: 12,
   paddingVertical: Platform.select({ ios: 14, default: 10 }),
   color: WHITE,
   fontSize: 16,
 },
 authButton: { marginTop: 12, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
 authButtonText: { color: WHITE, fontWeight: '700', fontSize: 16 },
 authToggle: { marginTop: 16, alignItems: 'center' },
 authToggleText: { color: TEXT_MUTED, fontSize: 14 },
 authError: { color: '#f87171', textAlign: 'center', marginTop: 12 },
 errorBanner: {
   marginHorizontal: 16,
   marginBottom: 12,
   backgroundColor: '#1f2937',
   borderRadius: 12,
   paddingVertical: 10,
   paddingHorizontal: 12,
   borderWidth: 1,
   borderColor: '#374151',
 },
 errorBannerText: { color: '#fca5a5', textAlign: 'center', fontSize: 13, fontWeight: '600' },
scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
scrollContent: { paddingBottom: 90, paddingTop: 4 },
settingsSubtitle: { color: '#94a3b8', marginTop: 4 },
settingsCard: {
  backgroundColor: 'rgba(12,18,32,0.88)',
  borderWidth: 1,
  borderColor: 'rgba(148,163,184,0.15)',
  borderRadius: 20,
  padding: 16,
  marginTop: 18,
},
settingsHint: { color: '#94a3b8', fontSize: 13, marginBottom: 12 },


 hero: {
   padding: 20,
   borderRadius: 20,
   marginTop: 12,
   marginBottom: 24,
   borderWidth: 1,
   borderColor: 'rgba(191,219,254,0.35)',
   overflow: 'hidden',
   shadowColor: '#1d4ed8',
   shadowOpacity: 0.35,
   shadowRadius: 28,
   shadowOffset: { width: 0, height: 16 },
   elevation: 10,
 },
 appName: { color: '#e0f2fe', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
 heroText: { color: WHITE, fontSize: 20, marginTop: 10, fontWeight: '600' },
 momentumCard: {
   flexDirection: 'row',
   alignItems: 'center',
   borderRadius: 28,
   padding: 18,
   borderWidth: 1,
   borderColor: 'rgba(191,219,254,0.25)',
   shadowColor: '#312e81',
   shadowOpacity: 0.35,
   shadowRadius: 28,
   shadowOffset: { width: 0, height: 18 },
   marginBottom: 16,
 },
 momentumLabel: { color: '#c7d2fe', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
 momentumHeading: { color: WHITE, fontSize: 24, fontWeight: '800', marginTop: 2 },
 momentumSub: { color: '#e0e7ff', marginTop: 4, fontSize: 14 },
 momentumMeta: { color: '#c7d2fe', fontWeight: '700', marginTop: 8 },
 momentumBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
 momentumBadge: {
   borderRadius: 999,
   paddingVertical: 6,
   paddingHorizontal: 12,
   backgroundColor: 'rgba(15,23,42,0.35)',
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.25)',
 },
 momentumBadgeLabel: { color: '#cbd5f5', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
 momentumBadgeValue: { color: WHITE, fontWeight: '800', fontSize: 14 },
momentumGauge: { width: 140, alignItems: 'center', justifyContent: 'center' },
analyzeIntro: { marginTop: 10, marginBottom: 12 },
analyzeSubtitle: { color: '#94a3b8', marginTop: 4 },
analyzeTopTabs: { flexDirection: 'row', gap: 10, marginBottom: 18 },
analyzeTopTab: {
  flex: 1,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(148,163,184,0.25)',
  backgroundColor: 'rgba(15,23,42,0.5)',
  paddingVertical: 10,
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
  gap: 6,
},
analyzeTopTabActive: { backgroundColor: '#bfdbfe', borderColor: '#bfdbfe' },
analyzeTopTabText: { color: '#cbd5f5', fontWeight: '700', fontSize: 13 },
analyzeTopTabTextActive: { color: '#0f172a' },
analyzeTopTabTextSmall: { fontSize: 12 },
analyzeHero: {
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 28,
  padding: 20,
  borderWidth: 1,
  borderColor: 'rgba(191,219,254,0.3)',
  marginBottom: 18,
},
analyzeHeroTitle: { color: WHITE, fontSize: 24, fontWeight: '800', marginTop: 6 },
analyzeHeroSubtitle: { color: '#cbd5f5', marginTop: 2 },
analyzeHeroStats: { flexDirection: 'row', gap: 22, marginTop: 14 },
analyzeHeroValue: { color: WHITE, fontSize: 24, fontWeight: '800' },
analyzeHeroMeta: { color: '#cbd5f5', fontSize: 12, marginTop: 2 },
statusChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
metricGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: 14,
},
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  metricTile: {
    width: '48%',
    borderRadius: 28,
    padding: 18,
    minHeight: 160,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,18,32,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  metricTileWave: {
    position: 'absolute',
    width: '140%',
    height: 140,
    bottom: -60,
    left: -20,
    opacity: 0.45,
    borderRadius: 80,
  },
  metricTileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricTileIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15,23,42,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTilePct: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.45)',
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTileHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricTileEdit: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.4)',
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTilePctText: { color: WHITE, fontWeight: '800', fontSize: 16 },
  metricTileLabel: { color: '#cbd5f5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12 },
  metricTileValue: { color: WHITE, fontSize: 22, fontWeight: '800', marginTop: 6 },
  metricTileHint: { color: '#e0f2fe', fontSize: 13, marginTop: 4 },
  metricTileCta: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.5)',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  metricTileCtaText: { color: WHITE, fontWeight: '700' },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 18,
  },
  scoreTile: {
    width: '48%',
    borderRadius: 24,
    padding: 16,
    backgroundColor: 'rgba(12,18,32,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
  },
  scoreTileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  scoreTileLabel: { color: '#cbd5f5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  scoreTileValue: { color: WHITE, fontSize: 22, fontWeight: '800', marginTop: 8 },
  scoreTileMeta: { color: '#cbd5f5', fontSize: 12, marginTop: 4 },
  analysisLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginVertical: 10 },
  calloutCard: {
    backgroundColor: 'rgba(12,18,32,0.88)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    marginTop: 14,
  },
  calloutHeading: { color: WHITE, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  calloutRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  calloutText: { color: '#cbd5f5', flex: 1 },
  calloutCategory: { color: '#93c5fd', fontWeight: '700' },
  detailHeroCard: {
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    marginBottom: 18,
  },
  detailHeroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailHeroTitle: { color: WHITE, fontSize: 22, fontWeight: '800', marginTop: 4 },
  detailStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  detailStatLabel: { color: '#cbd5f5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  detailStatValue: { color: WHITE, fontSize: 18, fontWeight: '800', marginTop: 6 },
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(254,240,138,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  trendCard: {
    backgroundColor: 'rgba(12,18,32,0.88)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  trendCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 10,
  },
  trendHeaderText: { flexShrink: 1 },
  trendMeta: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
   borderWidth: 1,
   borderColor: 'rgba(147,197,253,0.35)',
   borderRadius: 14,
   paddingVertical: 10,
   paddingHorizontal: 12,
   backgroundColor: 'rgba(15,23,42,0.88)',
   flex: 1,
   minWidth: '48%',
   gap: 10,
   shadowColor: 'rgba(37,99,235,0.25)',
   shadowOpacity: 0.25,
   shadowRadius: 12,
   shadowOffset: { width: 0, height: 6 },
   elevation: 4,
 },
 statusChipIcon: {
   width: 32,
   height: 32,
   borderRadius: 16,
   alignItems: 'center',
   justifyContent: 'center',
 },
 statusChipLabel: { color: TEXT_MUTED, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
 statusChipValue: { color: WHITE, fontSize: 16, fontWeight: '800', marginTop: 2 },

 analysisCard: {
   backgroundColor: 'rgba(12,18,32,0.92)',
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.14)',
   borderRadius: 18,
   padding: 18,
   marginTop: 14,
   shadowColor: '#020b2f',
   shadowOpacity: 0.35,
   shadowRadius: 20,
   shadowOffset: { width: 0, height: 14 },
   elevation: 8,
 },
 analysisCardTitle: { color: WHITE, fontSize: 16, fontWeight: '700', marginBottom: 8 },
 analysisItem: { marginBottom: 8 },
 analysisItemCategory: { color: TEXT_MUTED, fontSize: 11, letterSpacing: 1.2 },
 analysisItemText: { color: WHITE, fontSize: 14 },
 analysisErrorText: { color: '#fca5a5', textAlign: 'center', marginTop: 12 },
 emptyStateText: { color: TEXT_MUTED, textAlign: 'center', marginTop: 32 },

 card: {
   backgroundColor: 'rgba(12,18,32,0.88)',
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.12)',
   borderRadius: 18,
   padding: 16,
   marginBottom: 16,
   shadowColor: '#010813',
   shadowOpacity: 0.4,
   shadowRadius: 18,
   shadowOffset: { width: 0, height: 14 },
   elevation: 7,
 },
 cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
 cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
 cardEditBtn: {
   flexDirection: 'row',
   alignItems: 'center',
   gap: 4,
   paddingHorizontal: 8,
   paddingVertical: 4,
   borderRadius: 999,
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.4)',
   backgroundColor: 'rgba(15,23,42,0.35)',
 },
 cardEditText: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
 cardTitle: { color: WHITE, fontSize: 16, fontWeight: '700' },
 cardValue: { color: TEXT_MUTED, fontSize: 14 },

 reminderNote: { color: TEXT_MUTED, fontSize: 12, marginBottom: 12 },
 reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
 reminderLabel: { color: WHITE, fontWeight: '700' },
 reminderSubLabel: { color: TEXT_MUTED, fontSize: 11 },
 reminderMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
 reminderTimeBox: { width: 72, backgroundColor: '#0b0f1a', borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingVertical: 6, paddingHorizontal: 10 },
 reminderTimeInput: { color: WHITE, fontSize: 16, textAlign: 'center' },
 calendarHeader: {
   flexDirection: 'row',
   alignItems: 'center',
   justifyContent: 'space-between',
   marginBottom: 12,
 },
 calendarHeaderText: { color: WHITE, fontSize: 18, fontWeight: '800' },
 calendarNavBtn: {
   width: 34,
   height: 34,
   borderRadius: 17,
   borderWidth: 1,
   borderColor: BORDER,
   alignItems: 'center',
   justifyContent: 'center',
 },
 calendarLegend: {
   flexDirection: 'row',
   alignItems: 'center',
   gap: 12,
   marginBottom: 12,
 },
 legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
 legendSwatch: { width: 12, height: 12, borderRadius: 6 },
 legendLabel: { color: TEXT_MUTED, fontSize: 12 },
 calendarWeekLabels: {
   flexDirection: 'row',
   justifyContent: 'space-between',
   marginBottom: 6,
 },
 calendarWeekLabel: { flex: 1, textAlign: 'center', color: TEXT_MUTED, fontSize: 12 },
 calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
 calendarCell: {
   flex: 1,
   backgroundColor: '#0b0f1a',
   borderRadius: 12,
   borderWidth: 1,
   borderColor: '#111827',
   paddingVertical: 10,
   marginHorizontal: 4,
   alignItems: 'center',
   gap: 6,
 },
 calendarCellMuted: { opacity: 0.55 },
 calendarCellToday: { borderColor: BLUE },
 calendarCellDate: { color: WHITE, fontWeight: '700' },
 calendarCellDateMuted: { color: TEXT_MUTED },
 calendarCellBadge: {
   minWidth: 36,
   paddingVertical: 4,
   paddingHorizontal: 6,
   borderRadius: 8,
   alignItems: 'center',
   justifyContent: 'center',
 },
 calendarCellBadgeEmpty: {
   backgroundColor: '#111827',
 },
 calendarCellBadgeText: { color: WHITE, fontSize: 12, fontWeight: '700' },
 calendarFootnote: { color: TEXT_MUTED, fontSize: 12, textAlign: 'center', marginTop: 16 },


 progressTrack: {
   height: 12,
   backgroundColor: 'rgba(15,23,42,0.85)',
   borderRadius: 999,
   overflow: 'hidden',
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.12)',
 },
 progressFill: { height: '100%', borderRadius: 999 },
 progressCaption: { color: '#a5b4fc', fontSize: 12, marginTop: 8, fontWeight: '600', letterSpacing: 0.2 },


 screenTitle: { color: WHITE, fontSize: 24, fontWeight: '800', marginBottom: 12, marginTop: 10, letterSpacing: 0.4 },
 switchRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14 },


 pill: {
   paddingVertical: 10,
   paddingHorizontal: 14,
   borderRadius: 999,
   backgroundColor: 'rgba(15,23,42,0.78)',
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.18)',
 },
 pillText: { color: WHITE, fontWeight: '700' },
 pillActive: { backgroundColor: BLUE, borderColor: BLUE },
 pillTextActive: { color: WHITE },


 // segmented controls
 seg: {
   paddingVertical: 8,
   paddingHorizontal: 12,
   borderRadius: 10,
   backgroundColor: '#0b0f1a',
   borderWidth: 1,
   borderColor: BORDER,
 },
 segActive: { backgroundColor: '#132239', borderColor: BLUE },
 segText: { color: '#9ca3af', fontSize: 12, fontWeight: '700' },
 segTextActive: { color: WHITE },


 rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
 periodRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
 periodBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#0b0f1a', borderWidth: 1, borderColor: BORDER },
 periodBtnActive: { backgroundColor: '#132239', borderColor: BLUE },
 periodText: { color: '#9ca3af', fontSize: 12, fontWeight: '700' },
 periodTextActive: { color: WHITE },


 insight: { marginTop: 12, color: '#9ca3af', fontSize: 14, textAlign: 'center' },
 backBtn: { marginTop: 12, alignSelf: 'center' },
 backText: { color: BLUE, fontWeight: '700' },


 barRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
 barLabel: { color: WHITE, fontWeight: '700' },
 barPct: { color: TEXT_MUTED },
 barTrack: { height: 12, backgroundColor: '#0f172a', borderRadius: 8, overflow: 'hidden' },
 barFill: { height: '100%', borderRadius: 8 },


 gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#111827' },
 dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: WHITE, borderWidth: 2 },
 xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
 xLabelText: { color: '#6b7280', fontSize: 11 },
 placeholderCaption: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 6 },


 tabRow: {
   flexDirection: 'row',
   alignItems: 'center',
   justifyContent: 'space-between',
   paddingHorizontal: 18,
   paddingVertical: 14,
   borderTopWidth: 1,
   borderTopColor: 'rgba(148,163,184,0.16)',
   backgroundColor: 'rgba(2,6,23,0.94)',
   shadowColor: '#000',
   shadowOpacity: 0.45,
   shadowRadius: 26,
   shadowOffset: { width: 0, height: -12 },
   elevation: 14,
 },
 tabItem: {
   flex: 1,
   alignItems: 'center',
   gap: 6,
   paddingVertical: 10,
   borderRadius: 16,
 },
 tabText: { color: '#9ca3af', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
 tabTextActive: { color: '#e0f2fe', fontWeight: '800' },
 tabActive: {
   backgroundColor: 'rgba(37,99,235,0.18)',
   shadowColor: '#2563eb',
   shadowOpacity: 0.35,
   shadowRadius: 16,
   shadowOffset: { width: 0, height: 10 },
   elevation: 8,
 },


 inputLabel: { color: TEXT_MUTED, fontSize: 12, marginBottom: 6 },
 inputBox: { backgroundColor: '#0b0f1a', borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
 input: { color: WHITE, fontSize: 16 },


 saveBtn: { marginTop: 16, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
 saveBtnText: { color: WHITE, fontWeight: '700' },
 themeCard: { marginTop: 18 },
 themeOptionsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
 themeOption: {
   flex: 1,
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.25)',
   borderRadius: 14,
   padding: 14,
   backgroundColor: 'rgba(12,18,32,0.6)',
 },
 themeOptionActive: {
   borderColor: BLUE,
   backgroundColor: 'rgba(37,99,235,0.15)',
 },
 themeOptionLabel: { color: WHITE, fontSize: 16, fontWeight: '700' },
 themeOptionHint: { color: TEXT_MUTED, fontSize: 12, marginTop: 4 },


 modalBackdrop: { flex: 1, backgroundColor: 'rgba(3,7,18,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: {
    width: '100%',
    backgroundColor: 'rgba(10,14,26,0.96)',
   borderRadius: 20,
   borderWidth: 1,
   borderColor: 'rgba(148,163,184,0.16)',
   padding: 18,
   shadowColor: '#030712',
   shadowOpacity: 0.45,
   shadowRadius: 18,
   shadowOffset: { width: 0, height: 12 },
   elevation: 12,
 },
 modalTitle: { color: WHITE, fontSize: 18, fontWeight: '800', marginBottom: 10 },
 modalSubtitle: { color: TEXT_MUTED, fontSize: 13, marginBottom: 12 },
  modalInfoBox: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    padding: 10,
    marginBottom: 10,
  },
  modalInfoText: { color: TEXT_MUTED, fontSize: 12, lineHeight: 16 },
  modalHint: { color: TEXT_MUTED, fontSize: 12, marginBottom: 8 },
  workoutInfoCard: { maxWidth: 420 },
  dayDetailCard: { paddingVertical: 18 },
  dayDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 10,
  },
  dayDetailLabel: { color: WHITE, fontSize: 14, fontWeight: '600' },
  dayDetailValue: { color: TEXT_MUTED, fontSize: 13, marginTop: 2 },
  dayDetailAction: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.4)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayDetailActionSecondary: {
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.7)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(37,99,235,0.15)',
  },
  dayDetailActionText: { color: '#bfdbfe', fontWeight: '700', fontSize: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalBtn: { backgroundColor: BLUE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnText: { color: WHITE, fontWeight: '700' },
 btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(148,163,184,0.4)' },
 btnGhostText: { color: '#e0e7ff', fontWeight: '700' },
 templateCards: { flexDirection: 'row', gap: 10, marginBottom: 12 },
 templateCard: {
   minWidth: 150,
   borderWidth: 1,
   borderColor: BORDER,
   borderRadius: 14,
   padding: 12,
   backgroundColor: '#0b0f1a',
 },
 templateCardActive: {
   borderColor: BLUE,
   backgroundColor: 'rgba(37,99,235,0.18)',
 },
 templateLabel: { color: WHITE, fontSize: 15, fontWeight: '700' },
 templateHint: { color: TEXT_MUTED, fontSize: 12, marginTop: 2 },
 effortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
 effortChip: {
   borderRadius: 999,
   borderWidth: 1,
   borderColor: BORDER,
   paddingVertical: 8,
   paddingHorizontal: 14,
   backgroundColor: '#0b0f1a',
 },
 effortChipActive: { borderColor: BLUE, backgroundColor: 'rgba(37,99,235,0.2)' },
 effortChipText: { color: WHITE, fontWeight: '600' },
 effortChipTextActive: { color: WHITE },

  manageBox: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(2,6,23,0.4)',
  },
  manageHeading: { color: WHITE, fontWeight: '700', marginBottom: 8 },
  manageEmptyText: { color: TEXT_MUTED, fontSize: 12 },
  manageList: { maxHeight: 220 },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  manageCopy: { flex: 1 },
  manageLabel: { color: WHITE, fontWeight: '700' },
  manageMeta: { color: TEXT_MUTED, fontSize: 12, marginTop: 2 },
  manageRemoveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4c0519',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  manageRemoveText: { color: '#f87171', fontWeight: '700', fontSize: 12 },


 packetRow: {
   flexDirection: 'row',
   alignItems: 'center',
   paddingVertical: 10,
   borderTopWidth: 1,
   borderTopColor: 'rgba(255,255,255,0.06)',
   gap: 10,
 },
 delBtn: { backgroundColor: '#111827', borderWidth: 1, borderColor: BORDER, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
 delBtnText: { color: '#ef4444', fontWeight: '700' },
 signOutBtn: {
   marginTop: 24,
   borderRadius: 12,
   borderWidth: 1,
   borderColor: '#ef4444',
   paddingVertical: 12,
   alignItems: 'center',
 },
 signOutText: { color: '#ef4444', fontWeight: '700' },
});

const lightOverrides = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc' },
  loadingScreen: { backgroundColor: '#f8fafc' },
  loadingText: { color: '#475569' },
  templateCard: { backgroundColor: '#fff', borderColor: 'rgba(15,23,42,0.12)' },
  templateHint: { color: '#475569' },
  effortChip: { backgroundColor: '#fff', borderColor: 'rgba(15,23,42,0.12)' },
  authScreen: { backgroundColor: '#f8fafc' },
  authCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  authHeading: { color: '#0f172a' },
  authSubtitle: { color: '#475569' },
  authLabel: { color: '#475569' },
  authInput: { backgroundColor: '#ffffff', borderColor: '#cbd5f5', color: '#0f172a' },
  authToggleText: { color: '#475569' },
  authError: { color: '#dc2626' },
  errorBanner: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  errorBannerText: { color: '#b91c1c' },
  hero: { borderColor: 'rgba(148,163,184,0.45)', shadowColor: 'rgba(15,23,42,0.15)' },
  appName: { color: '#0f172a' },
  heroText: { color: '#0f172a' },
  analyzeSubtitle: { color: '#475569' },
  analyzeTopTab: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  analyzeTopTabActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  analyzeTopTabText: { color: '#475569' },
  analyzeTopTabTextActive: { color: '#f8fafc' },
  analyzeTopTabTextSmall: { fontSize: 12 },
  analyzeHero: { borderColor: '#e2e8f0' },
  analyzeHeroSubtitle: { color: '#475569' },
  analyzeHeroMeta: { color: '#475569' },
  settingsSubtitle: { color: '#475569' },
  settingsCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  settingsHint: { color: '#475569' },
  momentumCard: { borderColor: '#cbd5f5' },
  momentumLabel: { color: '#475569' },
  momentumHeading: { color: '#0f172a' },
  momentumSub: { color: '#475569' },
  momentumMeta: { color: '#1d4ed8' },
  momentumBadge: { backgroundColor: '#e2e8f0', borderColor: '#cbd5f5' },
  momentumBadgeLabel: { color: '#475569' },
  momentumBadgeValue: { color: '#0f172a' },
  metricTile: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  metricTileIcon: { backgroundColor: 'rgba(15,23,42,0.08)' },
  metricTilePct: { borderColor: '#cbd5f5', backgroundColor: 'rgba(248,250,252,0.85)' },
  metricTilePctText: { color: '#0f172a' },
  metricTileLabel: { color: '#475569' },
  metricTileValue: { color: '#0f172a' },
  metricTileHint: { color: '#475569' },
  metricTileEdit: { borderColor: '#cbd5f5', backgroundColor: '#e2e8f0' },
  metricTileCta: { borderColor: '#cbd5f5', backgroundColor: '#e0f2fe' },
  metricTileCtaText: { color: '#0f172a' },
  scoreTile: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  scoreTileLabel: { color: '#475569' },
  scoreTileValue: { color: '#0f172a' },
  scoreTileMeta: { color: '#475569' },
  calloutCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  calloutHeading: { color: '#0f172a' },
  calloutText: { color: '#475569' },
  calloutCategory: { color: '#1d4ed8' },
  detailHeroCard: { borderColor: '#e2e8f0' },
  detailHeroTitle: { color: '#0f172a' },
  infoButton: { backgroundColor: '#f8fafc', borderColor: '#cbd5f5' },
  detailStatLabel: { color: '#475569' },
  detailStatValue: { color: '#0f172a' },
  trendCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  trendMeta: { color: '#64748b' },
  analysisCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  analysisCardTitle: { color: '#0f172a' },
  analysisItemCategory: { color: '#475569' },
  analysisItemText: { color: '#0f172a' },
  analysisErrorText: { color: '#b91c1c' },
  emptyStateText: { color: '#475569' },
  card: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  cardTitle: { color: '#0f172a' },
  cardValue: { color: '#475569' },
  modalInfoBox: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  modalInfoText: { color: '#475569' },
  modalHint: { color: '#475569' },
  dayDetailLabel: { color: '#0f172a' },
  dayDetailValue: { color: '#475569' },
  dayDetailAction: { borderColor: '#cbd5f5' },
  dayDetailActionSecondary: { borderColor: '#93c5fd', backgroundColor: '#dbeafe' },
  dayDetailActionText: { color: '#1d4ed8' },
  cardEditBtn: { backgroundColor: '#e2e8f0', borderColor: '#cbd5f5' },
  cardEditText: { color: '#1d4ed8' },
  statusChip: { backgroundColor: '#f1f5f9', borderColor: '#cbd5f5', shadowColor: 'rgba(15,23,42,0.12)' },
  statusChipLabel: { color: '#475569' },
  reminderNote: { color: '#475569' },
  reminderLabel: { color: '#0f172a' },
  reminderSubLabel: { color: '#475569' },
  reminderMeta: { color: '#64748b' },
  reminderTimeBox: { backgroundColor: '#f8fafc', borderColor: '#cbd5f5' },
  reminderTimeInput: { color: '#0f172a' },
  calendarHeaderText: { color: '#0f172a' },
  calendarNavBtn: { borderColor: '#cbd5f5' },
  legendLabel: { color: '#475569' },
  calendarWeekLabel: { color: '#475569' },
  calendarCell: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  calendarCellDate: { color: '#0f172a' },
  calendarCellDateMuted: { color: '#94a3b8' },
  calendarCellBadgeEmpty: { backgroundColor: '#e2e8f0' },
  calendarFootnote: { color: '#475569' },
  progressTrack: { backgroundColor: '#e2e8f0', borderColor: '#cbd5f5' },
  progressCaption: { color: '#475569' },
  screenTitle: { color: '#0f172a' },
  pill: { backgroundColor: '#e2e8f0', borderColor: '#cbd5f5' },
  pillText: { color: '#0f172a' },
  seg: { backgroundColor: '#e2e8f0', borderColor: '#cbd5f5' },
  segActive: { backgroundColor: '#dbeafe' },
  segText: { color: '#475569' },
  segTextActive: { color: '#1d4ed8' },
  periodBtn: { backgroundColor: '#e2e8f0', borderColor: '#cbd5f5' },
  periodBtnActive: { backgroundColor: '#dbeafe' },
  periodText: { color: '#475569' },
  periodTextActive: { color: '#1e3a8a' },
  insight: { color: '#475569' },
  barLabel: { color: '#0f172a' },
  barPct: { color: '#475569' },
  barTrack: { backgroundColor: '#e2e8f0' },
  gridLine: { backgroundColor: '#e2e8f0' },
  dot: { backgroundColor: '#0f172a' },
  xLabelText: { color: '#94a3b8' },
  placeholderCaption: { color: '#94a3b8' },
  tabRow: { backgroundColor: '#ffffff', borderTopColor: '#e2e8f0' },
  tabText: { color: '#475569' },
  tabTextActive: { color: '#1d4ed8' },
  tabActive: { backgroundColor: 'rgba(37,99,235,0.12)', shadowColor: 'rgba(37,99,235,0.3)' },
  inputLabel: { color: '#475569' },
  inputBox: { backgroundColor: '#f8fafc', borderColor: '#cbd5f5' },
  input: { color: '#0f172a' },
  modalBackdrop: { backgroundColor: 'rgba(15,23,42,0.25)' },
  modalCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  modalTitle: { color: '#0f172a' },
  btnGhost: { borderColor: '#cbd5f5' },
  btnGhostText: { color: '#1d4ed8' },
  packetRow: { borderTopColor: 'rgba(15,23,42,0.08)' },
  delBtn: { backgroundColor: '#f8fafc', borderColor: '#cbd5f5' },
  delBtnText: { color: '#b91c1c' },
  manageBox: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  manageHeading: { color: '#0f172a' },
  manageEmptyText: { color: '#475569' },
  manageLabel: { color: '#0f172a' },
  manageMeta: { color: '#64748b' },
  manageRemoveBtn: { borderColor: '#fecaca', backgroundColor: '#fee2e2' },
  manageRemoveText: { color: '#b91c1c' },
  signOutBtn: { borderColor: '#dc2626' },
  signOutText: { color: '#b91c1c' },
  themeOption: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  themeOptionActive: { backgroundColor: '#dbeafe' },
  themeOptionLabel: { color: '#0f172a' },
  themeOptionHint: { color: '#475569' },
});

const styleVariants = {
  dark: styles,
  light: mergeStyles(styles, lightOverrides),
};

const THEME_COLORS = {
  dark: DEFAULT_THEME_COLORS,
  light: {
    ...DEFAULT_THEME_COLORS,
    textPrimary: '#0f172a',
    textMuted: '#475569',
    divider: 'rgba(148,163,184,0.4)',
    overlay: 'rgba(15,23,42,0.25)',
    tabIcon: '#475569',
    tabIconActive: '#1d4ed8',
    reminderSwitchTrack: '#cbd5f5',
    reminderSwitchIos: '#e2e8f0',
    donutLabel: '#0f172a',
  },
};

function mergeStyles(base, overrides) {
  const merged = { ...base };
  Object.keys(overrides).forEach((key) => {
    merged[key] = base[key] ? [base[key], overrides[key]] : overrides[key];
  });
  return merged;
}


/* -------- small UI bits -------- */


const StatusChip = ({ label, value, icon, accent = BLUE }) => {
  const { styles } = useThemeContext();
  const accentBg =
    typeof accent === 'string' && accent.startsWith('#') ? `${accent}26` : 'rgba(59,130,246,0.16)';
  return (
    <View style={[styles.statusChip, { borderColor: accentBg, shadowColor: accentBg }]}>
      <View style={[styles.statusChipIcon, { backgroundColor: accentBg }]}>{icon}</View>
      <View>
        <Text style={styles.statusChipLabel}>{label}</Text>
        <Text style={[styles.statusChipValue, { color: accent }]}>{value}</Text>
      </View>
    </View>
  );
};


const MomentumCard = ({ readiness, hydration, sleep, workouts, message }) => {
  const { styles, mode } = useThemeContext();
  const gradientColors = MOMENTUM_CARD_GRADIENTS[mode === 'light' ? 'light' : 'dark'];
  const clampStat = (value) =>
    Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  const stats = [
    { label: 'Hydration', value: `${clampStat(hydration)}%` },
    { label: 'Sleep', value: `${clampStat(sleep)}%` },
    { label: 'Training', value: `${clampStat(workouts)}%` },
  ];
  const readinessLabel = clampStat(readiness);
  const readinessHeading =
    readinessLabel >= 80 ? 'Overdrive' : readinessLabel >= 55 ? 'Momentum' : 'Reset';
  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.momentumCard}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.momentumLabel}>Today</Text>
        <Text style={styles.momentumHeading}>{readinessHeading}</Text>
        <Text style={styles.momentumSub}>{message || 'Stay consistent today.'}</Text>
        <Text style={styles.momentumMeta}>{`Readiness ${readinessLabel}%`}</Text>
        <View style={styles.momentumBadgeRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.momentumBadge}>
              <Text style={styles.momentumBadgeLabel}>{stat.label}</Text>
              <Text style={styles.momentumBadgeValue}>{stat.value}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.momentumGauge}>
        <Donut percent={readinessLabel} size={110} strokeWidth={12} />
      </View>
    </LinearGradient>
  );
};


const MetricTile = ({
  label,
  valueText,
  pct,
  hint,
  gradient,
  accent,
  icon,
  logLabel = 'Log entry',
  logAction,
  editAction,
}) => {
  const { styles, colors } = useThemeContext();
  const wave = useRef(new Animated.Value(0)).current;
  const pctValue = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [wave]);

  const translateX = wave.interpolate({ inputRange: [0, 1], outputRange: [0, -60] });
  const opacity = wave.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });

  const handleLogPress = useCallback(() => {
    if (typeof logAction === 'function') logAction();
  }, [logAction]);

  const handleEditPress = useCallback(() => {
    if (typeof editAction === 'function') editAction();
  }, [editAction]);

  return (
    <View style={styles.metricTile}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.metricTileWave,
          { backgroundColor: accent, opacity, transform: [{ translateX }, { rotate: '12deg' }] },
        ]}
      />
      <View style={styles.metricTileHeader}>
        <View style={styles.metricTileIcon}>{icon}</View>
        <View style={styles.metricTileHeaderRight}>
          {editAction ? (
            <TouchableOpacity
              onPress={handleEditPress}
              style={styles.metricTileEdit}
              activeOpacity={0.85}
            >
              <Ionicons
                name="create-outline"
                size={14}
                color={colors?.tabIconActive || '#bfdbfe'}
              />
            </TouchableOpacity>
          ) : null}
          <View style={styles.metricTilePct}>
            <Text style={styles.metricTilePctText}>{Math.round(pctValue)}%</Text>
          </View>
        </View>
      </View>
      <Text style={styles.metricTileLabel}>{label}</Text>
      <Text style={styles.metricTileValue}>{valueText}</Text>
      {hint ? <Text style={styles.metricTileHint}>{hint}</Text> : null}
      <TouchableOpacity
        onPress={handleLogPress}
        style={styles.metricTileCta}
        activeOpacity={0.88}
        disabled={!logAction}
      >
        <Ionicons
          name="add-circle-outline"
          size={16}
          color={colors?.textPrimary ? `${colors.textPrimary}` : '#e0f2fe'}
        />
        <Text style={styles.metricTileCtaText}>{logLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};


const ScoreTile = ({ label, value, meta, icon, accent = BLUE }) => {
  const { styles } = useThemeContext();
  return (
    <View style={styles.scoreTile}>
      <View style={[styles.scoreTileIcon, { backgroundColor: accent }]}>{icon}</View>
      <Text style={styles.scoreTileLabel}>{label}</Text>
      <Text style={styles.scoreTileValue}>{value}</Text>
      <Text style={styles.scoreTileMeta}>{meta}</Text>
    </View>
  );
};


const SwitchPill = ({ text, onPress }) => {
 const { styles } = useThemeContext();
 return (
   <TouchableOpacity onPress={onPress} style={styles.pill}>
     <Text style={styles.pillText}>{text}</Text>
   </TouchableOpacity>
 );
};


const GoalInput = ({ label, value, onChange }) => {
 const { styles } = useThemeContext();
 return (
   <View style={{ marginTop: 12 }}>
     <Text style={styles.inputLabel}>{label}</Text>
     <View style={styles.inputBox}>
       <TextInput
         value={value}
         onChangeText={onChange}
         keyboardType="numeric"
         placeholder="0"
         placeholderTextColor="#6b7280"
         style={styles.input}
       />
     </View>
   </View>
 );
};


const PeriodBtn = ({ text, on, active }) => {
 const { styles } = useThemeContext();
 return (
   <TouchableOpacity onPress={on} style={[styles.periodBtn, active && styles.periodBtnActive]}>
     <Text style={[styles.periodText, active && styles.periodTextActive]}>{text}</Text>
   </TouchableOpacity>
 );
};


const ElectrolytePicker = ({ selected, onSelect }) => {
 const { styles } = useThemeContext();
 const keys = ['sodium', 'potassium', 'chloride', 'magnesium', 'calcium', 'phosphate', 'bicarbonate'];
 return (
   <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
     {keys.map((k) => (
       <Pressable
         key={k}
         onPress={() => onSelect(k)}
         style={[styles.pill, selected === k && { backgroundColor: BLUE, borderColor: BLUE }]}
       >
         <Text style={[styles.pillText, selected === k && { color: 'white' }]}>{k}</Text>
       </Pressable>
     ))}
   </View>
 );
};


const SegBtn = ({ text, active, onPress }) => {
 const { styles } = useThemeContext();
 return (
   <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]}>
     <Text style={[styles.segText, active && styles.segTextActive]}>{text}</Text>
   </Pressable>
 );
};


const TabBtn = ({ label, icon, active, onPress }) => {
 const { styles, colors } = useThemeContext();
 const scale = useRef(new Animated.Value(active ? 1 : 0.96)).current;

 useEffect(() => {
   Animated.spring(scale, {
     toValue: active ? 1 : 0.96,
     useNativeDriver: true,
     friction: 9,
     tension: 120,
   }).start();
 }, [active, scale]);

 return (
   <AnimatedTouchableOpacity
     onPress={onPress}
     activeOpacity={0.85}
     style={[
       styles.tabItem,
       active && styles.tabActive,
       { transform: [{ scale }] },
     ]}
   >
    <Ionicons
      name={icon}
      size={18}
      color={active ? colors.tabIconActive : colors.tabIcon}
    />
     <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
   </AnimatedTouchableOpacity>
 );
};
