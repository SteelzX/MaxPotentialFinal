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
 water: { enabled: false, time: '09:00' },
 electrolytes: { enabled: false, time: '13:00' },
 sleep: { enabled: false, time: '22:00' },
 workouts: { enabled: false, time: '17:00' },
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
   base[key] = {
     enabled: !!item.enabled,
     time: typeof item.time === 'string' ? item.time : base[key].time,
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
        } else {
          setGoals(() => ({ ...defaultGoals }));
          setToday(makeDefaultToday());
          setElectrolytePackets(() => [...defaultElectrolytePackets]);
          setHistory(defaultHistory());
          setReminders({ ...defaultReminders });
          setAppearance('dark');
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
      preferences: { theme: appearance },
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
}, [firebaseUser, dataLoaded, goals, today, history, electrolytePackets, triggerDailyAnalysis, appearance]);

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
          preferences: { theme: 'dark' },
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
   const sanitized = value.replace(/[^0-9:]/g, '').slice(0, 5);
   setReminders((prev) => ({
     ...prev,
     [key]: { ...prev[key], time: sanitized },
   }));
 }, []);

 const handleReminderTimeBlur = useCallback((key, value) => {
   const normalized = normalizeTimeString(value);
  if (!normalized) {
    Alert.alert('Invalid time', 'Enter time using 24-hour format, e.g. 07:30 or 18:45.');
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
 const [modal, setModal] = useState({ type: null }); // 'water' | 'sleep' | 'workout' | 'electrolyte' | null
 const [inputValue, setInputValue] = useState('');


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


 const openModal = (type) => {
   setInputValue('');
   if (type === 'workout') {
     setWorkoutType(null);
     setNumSets(0);
     setSetsDetail([]);
     setRunMinutes('');
     setRunPerceived('');
     setSprintDistance('');
     setSprintPerceived('');
   }
   if (type === 'water') setWaterLogMode('ml'); // default to mL each time
   if (type === 'electrolyte') {
     setElectrolyteMode('single');
     setElectrolyteKey('sodium');
     setBatchElectrolytes(emptyBatch);
   }
   setModal({ type });
 };
 const closeModal = () => {
   setModal({ type: null });
   setWorkoutType(null);
   setNumSets(0);
   setSetsDetail([]);
   setRunMinutes('');
   setRunPerceived('');
   setSprintDistance('');
   setSprintPerceived('');
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


 const addEntry = () => {
   const val = Number(inputValue);


   if (modal.type === 'water') {
     let mlToAdd = 0;


     if (waterLogMode === 'ml') {
       if (!Number.isNaN(val) && val > 0) mlToAdd = val;
     } else {
       const bottles = parseFractionOrNumber(inputValue);
       if (Number.isFinite(bottles) && bottles > 0) {
         mlToAdd = Math.round(bottles * (goals.waterBottleMl || 0));
       }
     }


     if (mlToAdd > 0) {
       setToday((p) => ({ ...p, waterMl: p.waterMl + mlToAdd }));
     }
     closeModal();
     return;
   }


   if (modal.type === 'sleep') {
     if (!Number.isNaN(val) && val > 0)
       setToday((p) => ({ ...p, sleepHr: +(p.sleepHr + val).toFixed(2) }));
     closeModal();
     return;
   }


   if (modal.type === 'electrolyte') {
     if (electrolyteMode === 'single') {
       if (!Number.isNaN(val) && val > 0) {
         setToday((p) => {
           const next = {
             ...p.electrolytes,
             [electrolyteKey]: p.electrolytes[electrolyteKey] + Math.round(val),
           };
           return { ...p, electrolytes: next, electrolyteLogged: true };
         });
       }
     } else {
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
         setToday((p) => {
           const next = { ...p.electrolytes };
           Object.entries(additions).forEach(([k, inc]) => {
             next[k] = (next[k] || 0) + inc;
           });
           return { ...p, electrolytes: next, electrolyteLogged: true };
         });
       }
     }
     closeModal();
     return;
   }


   if (modal.type === 'workout') {
     let session = null;
     const id = new Date().toISOString();


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


     if (session) {
       setToday((p) => ({ ...p, workoutSessions: [...p.workoutSessions, session] }));
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
 const waterProgressPct = Math.round(clamp01((today.waterMl || 0) / (goals.waterMl || 1)) * 100);
 const sleepProgressPct = Math.round(clamp01((today.sleepHr || 0) / (goals.sleepHr || 1)) * 100);
 const workoutProgressPct = Math.round(
   clamp01((today.workoutSessions.length || 0) / (goals.workout || 1)) * 100
 );
 const electrolyteProgressPct = electrolytePct; // direct %


// Collective readiness (uses Effective Hydration)
const readinessPct = Math.round(avg([sleepPct, effectiveHydrationPct, workoutPct]));

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


 const Home = () => (
   <AnimatedScrollView
     style={styles.scroll}
     contentContainerStyle={styles.scrollContent}
     showsVerticalScrollIndicator={false}
   >
     <RevealView>
       <LinearGradient
         colors={['#2563eb', '#1d4ed8', '#0ea5e9']}
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

     <RevealView delay={120}>
       <View style={styles.quickRow}>
         <QuickButton
           color={WATER}
           icon={<MaterialCommunityIcons name="cup-water" size={22} color="#fff" />}
           label="Log water"
           onPress={() => openModal('water')}
         />
         <QuickButton
           color={SLEEP}
           icon={<MaterialCommunityIcons name="sleep" size={22} color="#fff" />}
           label="Log sleep"
           onPress={() => openModal('sleep')}
         />
         <QuickButton
           color={WORKOUT}
           icon={<MaterialCommunityIcons name="dumbbell" size={22} color="#fff" />}
           label="Log workout"
           onPress={() => openModal('workout')}
         />
       </View>
     </RevealView>

     <RevealView delay={180}>
       <View style={styles.quickRow}>
         <QuickButton
           color={ELECTROLYTE}
           icon={<MaterialCommunityIcons name="lightning-bolt" size={20} color="#fff" />}
           label="Log electrolytes"
           onPress={() => openModal('electrolyte')}
         />
       </View>
     </RevealView>

     <RevealView delay={260}>
       <ProgressCard
         label="Water"
         valueText={`${today.waterMl} / ${goals.waterMl} mL`}
         pct={waterProgressPct}
         color={WATER}
       />
     </RevealView>
     <RevealView delay={320}>
       <ProgressCard
         label="Electrolytes"
         valueText={`${electrolytePct}% balance`}
         pct={electrolyteProgressPct}
         color={ELECTROLYTE}
       />
     </RevealView>
     <RevealView delay={380}>
       <ProgressCard
         label="Sleep"
         valueText={`${today.sleepHr} / ${goals.sleepHr} hr`}
         pct={sleepProgressPct}
         color={SLEEP}
       />
     </RevealView>
     <RevealView delay={440}>
       <ProgressCard
         label="Workouts"
         valueText={`${today.workoutSessions.length} / ${goals.workout}`}
         pct={workoutProgressPct}
         color={WORKOUT}
       />
     </RevealView>
   </AnimatedScrollView>
 );


const Analyze = () => {
  const [view, setView] = useState('overview'); // 'overview' | 'sleep' | 'workouts' | 'water'
  const [period, setPeriod] = useState('week'); // 'week' | 'month' | 'year'

  const readinessDisplay = Math.round(analysis?.readiness ?? readinessPct);
  const sleepScoreDisplay = Math.round(analysis?.sleep_score ?? sleepPct);
  const hydrationScoreDisplay = Math.round(analysis?.hydration_score ?? hydrationPct);
  const electrolyteScoreDisplay = Math.round(analysis?.sodium_score ?? electrolytePct);
  const insightsList = analysis?.insights || [];
  const recommendationsList = analysis?.recommendations || [];

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


   return (
     <AnimatedScrollView
       style={styles.scroll}
       contentContainerStyle={styles.scrollContent}
       showsVerticalScrollIndicator={false}
     >
       {view === 'overview' ? (
         <>
           <RevealView>
             <Text style={styles.screenTitle}>Performance Overview</Text>
           </RevealView>
           <RevealView delay={80}>
             <Bars
               data={[
                 { label: 'Sleep', value: sleepScoreDisplay, color: SLEEP },
                 { label: 'Hydration', value: hydrationScoreDisplay, color: WATER },
                 { label: 'Electrolytes', value: electrolyteScoreDisplay, color: ELECTROLYTE },
                 { label: 'Effective Hydration', value: Math.round(effectiveHydrationPct), color: BLUE },
                 { label: 'Workouts', value: workoutPct, color: WORKOUT },
               ]}
             />
           </RevealView>
           <RevealView delay={150}>
             <Donut percent={readinessDisplay} size={140} strokeWidth={14} />
           </RevealView>

           {analysisLoading && (
             <RevealView delay={220}>
               <View style={{ marginTop: 12, alignItems: 'center' }}>
                 <ActivityIndicator color={BLUE} />
                 <Text style={styles.loadingText}>Updating insights...</Text>
               </View>
             </RevealView>
           )}
           {analysisError ? (
             <RevealView delay={220}>
               <Text style={styles.analysisErrorText}>{analysisError}</Text>
             </RevealView>
           ) : null}

           {insightsList.length > 0 && (
             <RevealView delay={260}>
               <View style={styles.analysisCard}>
                 <Text style={styles.analysisCardTitle}>Insights</Text>
                 {insightsList.map((item, idx) => (
                   <View key={`ins-${idx}`} style={styles.analysisItem}>
                     <Text style={styles.analysisItemCategory}>{item.category.toUpperCase()}</Text>
                     <Text style={styles.analysisItemText}>{item.message}</Text>
                   </View>
                 ))}
               </View>
             </RevealView>
           )}

           {recommendationsList.length > 0 && (
             <RevealView delay={320}>
               <View style={styles.analysisCard}>
                 <Text style={styles.analysisCardTitle}>Suggested Actions</Text>
                 {recommendationsList.map((item, idx) => (
                   <View key={`rec-${idx}`} style={styles.analysisItem}>
                     <Text style={styles.analysisItemCategory}>{item.category.toUpperCase()}</Text>
                     <Text style={styles.analysisItemText}>{item.message}</Text>
                   </View>
                 ))}
               </View>
             </RevealView>
           )}


           <RevealView delay={360}>
             <View style={styles.switchRow}>
               <SwitchPill text="Sleep" onPress={() => setView('sleep')} />
               <SwitchPill text="Workouts" onPress={() => setView('workouts')} />
               <SwitchPill text="Water" onPress={() => setView('water')} />
             </View>
           </RevealView>
         </>
       ) : (
         <>
           <RevealView>
             <View style={styles.rowBetween}>
               <Text style={styles.screenTitle}>
                 {view === 'sleep' ? 'Sleep' : view === 'workouts' ? 'Workouts' : 'Water'}
               </Text>
               <View style={styles.periodRow}>
                 <PeriodBtn text="Week" on={() => setPeriod('week')} active={period === 'week'} />
                 <PeriodBtn text="Month" on={() => setPeriod('month')} active={period === 'month'} />
                 <PeriodBtn text="Year" on={() => setPeriod('year')} active={period === 'year'} />
               </View>
             </View>
           </RevealView>


           {isSeriesEmpty ? (
             <RevealView delay={120}>
               <Text style={styles.emptyStateText}>Log your first {view} entry to unlock trends.</Text>
             </RevealView>
           ) : (
             <>
               <RevealView delay={120}>
                 <LineChartView
                   labels={labels}
                   values={values}
                   unit={view === 'sleep' ? 'h' : view === 'water' ? 'mL' : ''}
                   color={lineColor}
                 />
               </RevealView>

               {insight && (
                 <RevealView delay={200}>
                   <Text style={styles.insight}>{insight}</Text>
                 </RevealView>
               )}

               {view === 'water' && (
                 <RevealView delay={240}>
                   <Text style={styles.insight}>
                     {electrolyteScoreDisplay >= 70
                       ? '✅ Hydration strong: Electrolytes are balanced.'
                       : '⚠️ Hydration incomplete: Water logged, but electrolytes may be low — risk of cramping.'}
                   </Text>
                 </RevealView>
               )}
             </>
           )}


           <RevealView delay={320}>
             <TouchableOpacity onPress={() => setView('overview')} style={styles.backBtn}>
               <Text style={styles.backText}>Back to Overview</Text>
             </TouchableOpacity>
           </RevealView>
         </>
       )}
     </AnimatedScrollView>
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
    return (
      <View style={styles.reminderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.reminderLabel}>{reminderLabels[reminderKey]}</Text>
          <Text style={styles.reminderSubLabel}>Daily notification</Text>
        </View>
        <View style={styles.reminderTimeBox}>
          <TextInput
            value={config.time}
            onChangeText={(text) => handleReminderTimeChange(reminderKey, text)}
            onBlur={() => handleReminderTimeBlur(reminderKey, config.time)}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            placeholder="HH:MM"
            placeholderTextColor="#6b7280"
            style={styles.reminderTimeInput}
            maxLength={5}
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
      <Text style={styles.screenTitle}>Settings</Text>


       {/* Goals & bottle size */}
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
         <Text style={styles.saveBtnText}>Save settings</Text>
       </Pressable>

       <View style={[styles.card, styles.themeCard]}>
         <Text style={styles.cardTitle}>Appearance</Text>
         <Text style={styles.reminderNote}>Switch between dark and light mode.</Text>
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

       <View style={{ height: 1, backgroundColor: themeColors.divider, marginVertical: 16, opacity: 0.6 }} />

       <View style={styles.card}>
         <Text style={styles.cardTitle}>Daily reminders</Text>
         <Text style={styles.reminderNote}>Set 24-hour times for your nudges.</Text>
         {Object.keys(reminderLabels).map((key) => (
           <ReminderRow key={key} reminderKey={key} />
         ))}
       </View>


       {/* Divider */}
       <View style={{ height: 1, backgroundColor: themeColors.divider, marginVertical: 16, opacity: 0.6 }} />


       {/* Electrolyte packet profiles */}
       <Text style={styles.screenTitle}>Electrolyte Packets</Text>
       <View style={styles.card}>
         <Text style={styles.cardTitle}>Create packet</Text>
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


       {electrolytePackets.length > 0 && (
         <View style={[styles.card, { marginTop: 12 }]}>
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

      <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
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

const Calendar = ({ history, today, goals }) => {
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
             <View
               key={day.key}
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
             </View>
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

const parseTimeString = (time) => {
 if (typeof time !== 'string') return null;
 const trimmed = time.trim();
 const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
 if (!match) return null;
 const hour = Number(match[1]);
 const minute = Number(match[2]);
 if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
 if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
 return { hour, minute };
};

const normalizeTimeString = (time) => {
 const parsed = parseTimeString(time);
 if (!parsed) return null;
 const pad = (n) => String(n).padStart(2, '0');
 return `${pad(parsed.hour)}:${pad(parsed.minute)}`;
};


const updateRir = (i, rir) => {
 setSetsDetail((prev) => {
   const copy = [...prev];
   copy[i] = { ...copy[i], rir };
   return copy;
 });
};


const isSelectedEffort = (i, key) => setsDetail[i]?.effort === key;


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

 const isLoading =
   !authReady || dataLoading || (firebaseUser && !dataLoaded);

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
            {route === 'calendar' && <Calendar history={history} today={today} goals={goals} />}
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
            <Text style={styles.modalTitle}>
              {modal.type === 'water' && (waterLogMode === 'ml' ? 'Add water (mL)' : 'Add water (Bottles)')}
              {modal.type === 'sleep' && 'Add sleep (hr)'}
              {modal.type === 'workout' && 'Log workout'}
              {modal.type === 'electrolyte' &&
                (electrolyteMode === 'single' ? 'Add electrolyte (single)' : 'Add electrolytes (batch)')}
            </Text>


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
             </>
           )}


           {/* ELECTROLYTES: mode switch */}
           {modal.type === 'electrolyte' && (
             <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
               <SegBtn text="Single" active={electrolyteMode === 'single'} onPress={() => { setElectrolyteMode('single'); setInputValue(''); }} />
               <SegBtn text="Batch" active={electrolyteMode === 'batch'} onPress={() => setElectrolyteMode('batch')} />
             </View>
           )}


           {modal.type === 'workout' ? (
            
             <WorkoutForm />
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
               <Text style={styles.modalBtnText}>Add</Text>
             </Pressable>
           </View>
         </KeyboardAvoidingView>
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


const LineChartView = ({ labels, values, unit, color = BLUE }) => {
 const { styles } = useThemeContext();
 const width = Dimensions.get('window').width - 32;
 const height = 200;
 const pad = 16;


 const min = Math.min(...values, 0);
 const max = Math.max(...values, 1);
 const range = max - min || 1;


 const pts = values.map((v, i) => {
   const x = pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1);
   const y = pad + (height - pad * 2) * (1 - (v - min) / range);
   return { x, y };
 });


 return (
   <View style={[styles.card, { padding: 12 }]}>
     <View style={{ height, width: '100%' }}>
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
               height: 2,
               backgroundColor: color,
               transform: [{ rotateZ: `${angle}deg` }],
               transformOrigin: 'left center',
               borderRadius: 1,
             }}
           />
         );
       })}
       {pts.map((p, i) => (
         <View key={`pt-${i}`} style={[styles.dot, { left: p.x - 4, top: p.y - 4, borderColor: color }]} />
       ))}
     </View>
     <View style={styles.xLabels}>
       {labels.map((t, i) => (
         <Text key={`lbl-${i}`} style={styles.xLabelText}>
           {t}
         </Text>
       ))}
     </View>
   </View>
 );
};


/* -------------------- Donut progress (no libs) -------------------- */
const Donut = ({ percent = 0, size = 120, strokeWidth = 12 }) => {
 const { colors } = useThemeContext();
 const bounded = Math.max(0, Math.min(100, percent));
 const half = size / 2;
 const progress = useRef(new Animated.Value(0)).current;
 const listenerRef = useRef(null);
 const [displayPct, setDisplayPct] = useState(0);

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
           borderColor: '#111827',
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


 quickRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
 quickBtn: {
   flex: 1,
   paddingVertical: 14,
   borderRadius: 16,
   alignItems: 'center',
   justifyContent: 'center',
   gap: 6,
   borderWidth: 1,
   borderColor: 'rgba(255,255,255,0.1)',
   shadowColor: '#020617',
   shadowOpacity: 0.3,
   shadowRadius: 16,
   shadowOffset: { width: 0, height: 10 },
   elevation: 6,
 },
 quickText: { color: WHITE, fontWeight: '800', letterSpacing: 0.2 },

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
 cardTitle: { color: WHITE, fontSize: 16, fontWeight: '700' },
 cardValue: { color: TEXT_MUTED, fontSize: 14 },

 reminderNote: { color: TEXT_MUTED, fontSize: 12, marginBottom: 12 },
 reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
 reminderLabel: { color: WHITE, fontWeight: '700' },
 reminderSubLabel: { color: TEXT_MUTED, fontSize: 11 },
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
 periodRow: { flexDirection: 'row', gap: 8 },
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
 modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
 modalBtn: { backgroundColor: BLUE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
 modalBtnText: { color: WHITE, fontWeight: '700' },
 btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(148,163,184,0.4)' },
 btnGhostText: { color: '#e0e7ff', fontWeight: '700' },


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
  quickBtn: { borderColor: 'rgba(15,23,42,0.08)', shadowColor: 'rgba(15,23,42,0.15)' },
  analysisCard: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  analysisCardTitle: { color: '#0f172a' },
  analysisItemCategory: { color: '#475569' },
  analysisItemText: { color: '#0f172a' },
  analysisErrorText: { color: '#b91c1c' },
  emptyStateText: { color: '#475569' },
  card: { backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  cardTitle: { color: '#0f172a' },
  cardValue: { color: '#475569' },
  reminderNote: { color: '#475569' },
  reminderLabel: { color: '#0f172a' },
  reminderSubLabel: { color: '#475569' },
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


const QuickButton = ({ label, onPress, color, icon }) => {
 const { styles } = useThemeContext();
 const scale = useRef(new Animated.Value(1)).current;

 const handlePressIn = () => {
   Animated.spring(scale, {
     toValue: 0.95,
     useNativeDriver: true,
     speed: 20,
     bounciness: 6,
   }).start();
 };

 const handlePressOut = () => {
   Animated.spring(scale, {
     toValue: 1,
     useNativeDriver: true,
     speed: 20,
     bounciness: 6,
   }).start();
 };

 return (
   <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
     <Pressable
       onPress={onPress}
       onPressIn={handlePressIn}
       onPressOut={handlePressOut}
       style={({ pressed }) => [
         styles.quickBtn,
         { backgroundColor: color, opacity: pressed ? 0.88 : 1 },
       ]}
     >
       {icon}
       <Text style={styles.quickText}>{label}</Text>
     </Pressable>
   </Animated.View>
 );
};


const ProgressCard = ({ label, valueText, pct, color }) => {
 const { styles } = useThemeContext();
 const bounded = Math.max(0, Math.min(100, pct));
 const progress = useRef(new Animated.Value(bounded)).current;

 useEffect(() => {
   Animated.timing(progress, {
     toValue: bounded,
     duration: 480,
     easing: Easing.out(Easing.cubic),
     useNativeDriver: false,
   }).start();
 }, [bounded, progress]);

 const width = progress.interpolate({
   inputRange: [0, 100],
   outputRange: ['0%', '100%'],
 });

 return (
   <View style={styles.card}>
     <View style={styles.cardHeader}>
       <Text style={styles.cardTitle}>{label}</Text>
       <Text style={styles.cardValue}>{valueText}</Text>
     </View>
     <View style={styles.progressTrack}>
       <Animated.View style={[styles.progressFill, { width, backgroundColor: color }]} />
     </View>
     <Text style={styles.progressCaption}>{bounded}% of goal</Text>
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
