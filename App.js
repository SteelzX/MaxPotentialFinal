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
 const [notificationStatus, setNotificationStatus] = useState(null);
const saveTimerRef = useRef(null);
useEffect(() => {
  const timer = setInterval(() => {
    const key = getTodayKey();
    setToday((prev) => (prev.dateKey === key ? prev : makeDefaultToday(key)));
  }, 60 * 1000);
  return () => clearInterval(timer);
}, []);
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
        } else {
          setGoals(() => ({ ...defaultGoals }));
          setToday(makeDefaultToday());
          setElectrolytePackets(() => [...defaultElectrolytePackets]);
          setHistory(defaultHistory());
          setReminders({ ...defaultReminders });
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
}, [firebaseUser, dataLoaded, goals, today, history, electrolytePackets, triggerDailyAnalysis]);

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
   <View style={styles.scroll}>
     <View style={styles.hero}>
       <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
         <MaterialCommunityIcons name="lightning-bolt" size={20} color="#fff" />
         <Text style={styles.appName}>MaxPot</Text>
       </View>
       <Text style={styles.heroText}>Hit your daily targets.</Text>
     </View>


     {/* Quick actions */}
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
     <View style={styles.quickRow}>
       <QuickButton
         color={ELECTROLYTE}
         icon={<MaterialCommunityIcons name="lightning-bolt" size={20} color="#fff" />}
         label="Log electrolytes"
         onPress={() => openModal('electrolyte')}
       />
     </View>


     <ProgressCard
       label="Water"
       valueText={`${today.waterMl} / ${goals.waterMl} mL`}
       pct={waterProgressPct}
       color={WATER}
     />
     <ProgressCard
       label="Electrolytes"
       valueText={`${electrolytePct}% balance`}
       pct={electrolyteProgressPct}
       color={ELECTROLYTE}
     />
     <ProgressCard
       label="Sleep"
       valueText={`${today.sleepHr} / ${goals.sleepHr} hr`}
       pct={sleepProgressPct}
       color={SLEEP}
     />
     <ProgressCard
       label="Workouts"
       valueText={`${today.workoutSessions.length} / ${goals.workout}`}
       pct={workoutProgressPct}
       color={WORKOUT}
     />
   </View>
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
     <View style={styles.scroll}>
       {view === 'overview' ? (
         <>
           <Text style={styles.screenTitle}>Performance Overview</Text>
           <Bars
             data={[
               { label: 'Sleep', value: sleepScoreDisplay, color: SLEEP },
               { label: 'Hydration', value: hydrationScoreDisplay, color: WATER },
               { label: 'Electrolytes', value: electrolyteScoreDisplay, color: ELECTROLYTE },
               { label: 'Effective Hydration', value: Math.round(effectiveHydrationPct), color: BLUE },
               { label: 'Workouts', value: workoutPct, color: WORKOUT },
             ]}
           />
           <Donut percent={readinessDisplay} size={140} strokeWidth={14} />

           {analysisLoading && (
             <View style={{ marginTop: 12, alignItems: 'center' }}>
               <ActivityIndicator color={BLUE} />
               <Text style={styles.loadingText}>Updating insights...</Text>
             </View>
           )}
           {analysisError ? <Text style={styles.analysisErrorText}>{analysisError}</Text> : null}

           {insightsList.length > 0 && (
             <View style={styles.analysisCard}>
               <Text style={styles.analysisCardTitle}>Insights</Text>
               {insightsList.map((item, idx) => (
                 <View key={`ins-${idx}`} style={styles.analysisItem}>
                   <Text style={styles.analysisItemCategory}>{item.category.toUpperCase()}</Text>
                   <Text style={styles.analysisItemText}>{item.message}</Text>
                 </View>
               ))}
             </View>
           )}

           {recommendationsList.length > 0 && (
             <View style={styles.analysisCard}>
               <Text style={styles.analysisCardTitle}>Suggested Actions</Text>
               {recommendationsList.map((item, idx) => (
                 <View key={`rec-${idx}`} style={styles.analysisItem}>
                   <Text style={styles.analysisItemCategory}>{item.category.toUpperCase()}</Text>
                   <Text style={styles.analysisItemText}>{item.message}</Text>
                 </View>
               ))}
             </View>
           )}


           <View style={styles.switchRow}>
             <SwitchPill text="Sleep" onPress={() => setView('sleep')} />
             <SwitchPill text="Workouts" onPress={() => setView('workouts')} />
             <SwitchPill text="Water" onPress={() => setView('water')} />
           </View>
         </>
       ) : (
         <>
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


           {isSeriesEmpty ? (
             <Text style={styles.emptyStateText}>Log your first {view} entry to unlock trends.</Text>
           ) : (
             <>
               <LineChartView
                 labels={labels}
                 values={values}
                 unit={view === 'sleep' ? 'h' : view === 'water' ? 'mL' : ''}
                 color={lineColor}
               />


               {insight && <Text style={styles.insight}>{insight}</Text>}


               {view === 'water' && (
                 <Text style={styles.insight}>
                   {electrolyteScoreDisplay >= 70
                     ? '✅ Hydration strong: Electrolytes are balanced.'
                     : '⚠️ Hydration incomplete: Water logged, but electrolytes may be low — risk of cramping.'}
                 </Text>
               )}
             </>
           )}


           <TouchableOpacity onPress={() => setView('overview')} style={styles.backBtn}>
             <Text style={styles.backText}>Back to Overview</Text>
           </TouchableOpacity>
         </>
       )}
     </View>
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
          trackColor={{ false: '#374151', true: BLUE }}
          thumbColor="#f9fafb"
          ios_backgroundColor="#1f2937"
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
       <Text style={{ color: 'white', marginBottom: 6 }}>{label} (mg)</Text>
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
     <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
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

       <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 16, opacity: 0.5 }} />

       <View style={styles.card}>
         <Text style={styles.cardTitle}>Daily reminders</Text>
         <Text style={styles.reminderNote}>Set 24-hour times for your nudges.</Text>
         {Object.keys(reminderLabels).map((key) => (
           <ReminderRow key={key} reminderKey={key} />
         ))}
       </View>


       {/* Divider */}
       <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 16, opacity: 0.5 }} />


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
                 <Text style={{ color: 'white', fontWeight: '700' }}>{p.name}</Text>
                 <Text style={{ color: '#9ca3af', fontSize: 12 }}>
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
             <Text style={{ color: 'white', marginBottom: 6 }}>Set {i + 1}</Text>
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
     <SafeAreaView style={styles.loadingScreen}>
       <StatusBar style="light" />
       <ActivityIndicator size="large" color={BLUE} />
       <Text style={styles.loadingText}>Syncing with Firebase...</Text>
     </SafeAreaView>
   );
 }

 if (!firebaseUser) {
   return (
     <SafeAreaView style={styles.authScreen}>
       <StatusBar style="light" />
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
             <ActivityIndicator color="#fff" />
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
   );
 }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />

      {authError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{authError}</Text>
        </View>
      ) : null}

      <ScreenTransition routeKey={route}>
       {route === 'home' && <Home />}
       {route === 'analyze' && <Analyze />}
       {route === 'settings' && <Settings />}
     </ScreenTransition>


     {/* Bottom nav with icons */}
     <View style={styles.tabRow}>
       <TabBtn label="Analyze" icon="analytics-outline" active={route === 'analyze'} onPress={() => setRoute('analyze')} />
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
               <Text style={{ color: '#9ca3af', marginBottom: 6 }}>
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
                     <Text style={{ color: 'white', marginBottom: 6, textTransform: 'capitalize' }}>{k} (mg)</Text>
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
               <Text style={{ color: '#9ca3af', marginTop: 4 }}>
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
 );
}


/* -------------------- Charts (no libs) -------------------- */


const Bars = ({ data }) => (
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


const LineChartView = ({ labels, values, unit, color = BLUE }) => {
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
 const p = Math.max(0, Math.min(100, percent));
 const half = size / 2;


 const overHalf = p > 50;
 const rightRotation = (p > 50 ? 180 : (p / 50) * 180) + 'deg';
 const leftRotation = (overHalf ? ((p - 50) / 50) * 180 : 0) + 'deg';


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
         <View
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
         <View
           style={{
             position: 'absolute',
             width: size,
             height: size,
             borderRadius: half,
             borderWidth: strokeWidth,
             borderColor: BLUE,
             left: 0,
             transform: [{ rotateZ: leftRotation }],
           }}
         />
       </View>


       {/* center label */}
       <Text style={{ color: 'white', fontWeight: '800', fontSize: 20 }}>{p}%</Text>
       <Text style={{ color: '#9ca3af', fontSize: 12 }}>Readiness</Text>
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
const CARD = '#0b0b0b';
const TEXT_MUTED = '#9CA3AF';
const BORDER = '#1f2937';


// metric colors
const WATER = '#0ea5e9'; // sky-500
const SLEEP = '#8b5cf6'; // violet-500
const WORKOUT = '#f59e0b'; // amber-500
const ELECTROLYTE = '#22c55e'; // green-500


const styles = StyleSheet.create({
 screen: { flex: 1, backgroundColor: BLACK, justifyContent: 'space-between' },
 loadingScreen: {
   flex: 1,
   backgroundColor: BLACK,
   alignItems: 'center',
   justifyContent: 'center',
   paddingHorizontal: 24,
 },
 loadingText: { marginTop: 12, color: TEXT_MUTED, fontSize: 14 },
 authScreen: {
   flex: 1,
   backgroundColor: BLACK,
   alignItems: 'center',
   justifyContent: 'center',
   paddingHorizontal: 20,
   paddingBottom: 40,
 },
 authCard: {
   width: '100%',
   maxWidth: 420,
   backgroundColor: CARD,
   borderRadius: 16,
   borderWidth: 1,
   borderColor: BORDER,
   padding: 24,
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


 hero: {
   padding: 16,
   borderRadius: 14,
   marginTop: 8,
   marginBottom: 16,
   borderWidth: 1,
   borderColor: 'rgba(255,255,255,0.08)',
   backgroundColor: BLUE,
 },
 appName: { color: WHITE, fontSize: 16, fontWeight: '700' },
 heroText: { color: 'white', fontSize: 18, marginTop: 6 },


 quickRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
 quickBtn: {
   flex: 1,
   paddingVertical: 14,
   borderRadius: 12,
   alignItems: 'center',
   justifyContent: 'center',
   gap: 6,
 },
 quickText: { color: WHITE, fontWeight: '700' },

 analysisCard: {
   backgroundColor: '#0f172a',
   borderWidth: 1,
   borderColor: BORDER,
   borderRadius: 14,
   padding: 16,
   marginTop: 12,
 },
 analysisCardTitle: { color: WHITE, fontSize: 16, fontWeight: '700', marginBottom: 8 },
 analysisItem: { marginBottom: 8 },
 analysisItemCategory: { color: TEXT_MUTED, fontSize: 11, letterSpacing: 1.2 },
 analysisItemText: { color: WHITE, fontSize: 14 },
 analysisErrorText: { color: '#fca5a5', textAlign: 'center', marginTop: 12 },
 emptyStateText: { color: TEXT_MUTED, textAlign: 'center', marginTop: 32 },

 card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 12 },
 cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
 cardTitle: { color: WHITE, fontSize: 16, fontWeight: '700' },
 cardValue: { color: TEXT_MUTED, fontSize: 14 },

 reminderNote: { color: TEXT_MUTED, fontSize: 12, marginBottom: 12 },
 reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
 reminderLabel: { color: WHITE, fontWeight: '700' },
 reminderSubLabel: { color: TEXT_MUTED, fontSize: 11 },
 reminderTimeBox: { width: 72, backgroundColor: '#0b0f1a', borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingVertical: 6, paddingHorizontal: 10 },
 reminderTimeInput: { color: WHITE, fontSize: 16, textAlign: 'center' },


 progressTrack: { height: 10, backgroundColor: '#111827', borderRadius: 999, overflow: 'hidden' },
 progressFill: { height: '100%', borderRadius: 999 },
 progressCaption: { color: TEXT_MUTED, fontSize: 12, marginTop: 8 },


 screenTitle: { color: WHITE, fontSize: 22, fontWeight: '800', marginBottom: 10, marginTop: 8 },
 switchRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 },


 pill: {
   paddingVertical: 10,
   paddingHorizontal: 14,
   borderRadius: 999,
   backgroundColor: '#111827',
   borderWidth: 1,
   borderColor: BORDER,
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


 tabRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#111827', backgroundColor: BLACK, paddingVertical: 10 },
 tabItem: { flex: 1, alignItems: 'center', gap: 4 },
 tabText: { color: '#9ca3af', fontSize: 12 },
 tabTextActive: { color: BLUE, fontWeight: '700' },
 tabActive: { borderBottomWidth: 2, borderBottomColor: BLUE },


 inputLabel: { color: TEXT_MUTED, fontSize: 12, marginBottom: 6 },
 inputBox: { backgroundColor: '#0b0f1a', borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
 input: { color: WHITE, fontSize: 16 },


 saveBtn: { marginTop: 16, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
 saveBtnText: { color: WHITE, fontWeight: '700' },


 modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 16 },
 modalCard: { width: '100%', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16 },
 modalTitle: { color: WHITE, fontSize: 18, fontWeight: '800', marginBottom: 10 },
 modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
 modalBtn: { backgroundColor: BLUE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
 modalBtnText: { color: WHITE, fontWeight: '700' },
 btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: BORDER },
 btnGhostText: { color: TEXT_MUTED, fontWeight: '700' },


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


/* -------- small UI bits -------- */


const QuickButton = ({ label, onPress, color, icon }) => (
 <Pressable
   onPress={onPress}
   style={({ pressed }) => [styles.quickBtn, { backgroundColor: color, opacity: pressed ? 0.88 : 1 }]}
 >
   {icon}
   <Text style={styles.quickText}>{label}</Text>
 </Pressable>
);


const ProgressCard = ({ label, valueText, pct, color }) => (
 <View style={styles.card}>
   <View style={styles.cardHeader}>
     <Text style={styles.cardTitle}>{label}</Text>
     <Text style={styles.cardValue}>{valueText}</Text>
   </View>
   <View style={styles.progressTrack}>
     <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
   </View>
   <Text style={styles.progressCaption}>{pct}% of goal</Text>
 </View>
);


const SwitchPill = ({ text, onPress }) => (
 <TouchableOpacity onPress={onPress} style={styles.pill}>
   <Text style={styles.pillText}>{text}</Text>
 </TouchableOpacity>
);


const GoalInput = ({ label, value, onChange }) => (
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


const PeriodBtn = ({ text, on, active }) => (
 <TouchableOpacity onPress={on} style={[styles.periodBtn, active && styles.periodBtnActive]}>
   <Text style={[styles.periodText, active && styles.periodTextActive]}>{text}</Text>
 </TouchableOpacity>
);


const ElectrolytePicker = ({ selected, onSelect }) => {
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


const SegBtn = ({ text, active, onPress }) => (
 <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]}>
   <Text style={[styles.segText, active && styles.segTextActive]}>{text}</Text>
 </Pressable>
);


const TabBtn = ({ label, icon, active, onPress }) => (
 <TouchableOpacity onPress={onPress} style={[styles.tabItem, active && styles.tabActive]}>
   <Ionicons name={icon} size={18} color={active ? BLUE : '#9ca3af'} />
   <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
 </TouchableOpacity>
);
