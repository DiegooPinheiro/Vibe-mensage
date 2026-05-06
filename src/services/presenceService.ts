import { AppState, type AppStateStatus } from 'react-native';
import { doc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { getCurrentUserProfile } from './authService';

const setPresence = async (online: boolean) => {
  const user = auth.currentUser;
  if (!user?.uid) return;

  try {
    const profile = await getCurrentUserProfile();
    const profileUid = profile?.uid || user.uid;
    const email = String(profile?.email || user.email || '').trim().toLowerCase();
    const presencePayload = {
      uid: user.uid,
      firebaseUid: user.uid,
      ...(email ? { email } : {}),
      online,
      lastSeen: new Date().toISOString(),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', profileUid), presencePayload, { merge: true });
    if (profileUid !== user.uid) {
      batch.set(doc(db, 'users', user.uid), presencePayload, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    console.warn('[Presence] Falha ao atualizar presença:', error);
  }
};

/**
 * Atualiza `users/{uid}.online` no Firestore conforme o app vai para background/foreground.
 * Isso reduz muito o "fica online pra sempre" quando a pessoa sai do app.
 */
export const startPresenceTracking = () => {
  let lastState: AppStateStatus = AppState.currentState;
  let lastWrite = 0;

  const write = (online: boolean) => {
    const now = Date.now();
    // Evita writes demais (Android pode disparar vários eventos rápidos)
    if (now - lastWrite < 1500) return;
    lastWrite = now;
    setPresence(online);
  };

  // Marca online ao iniciar tracking (se já tiver usuário logado)
  write(true);

  const sub = AppState.addEventListener('change', (nextState) => {
    if (nextState === lastState) return;
    lastState = nextState;

    if (nextState === 'active') {
      write(true);
    } else {
      // background / inactive
      write(false);
    }
  });

  return () => {
    sub.remove();
    // Ao sair do app (logout/navegação), tenta marcar offline
    write(false);
  };
};

