import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  updateProfile,
  deleteUser,
  sendPasswordResetEmail,
  PhoneAuthProvider,
  signInWithCredential,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { UserProfile } from '../types/user';
import { chatSyncFirebaseUser, chatRegisterPushToken, chatDeleteMe } from './chatApi';
import { clearChatSession, getChatSession, setChatSession } from './chatSession';
import { connectChatSocket, disconnectChatSocket } from './chatSocket';

const mapUserProfileDocument = (docSnap: { id: string; data: () => unknown }) => {
  const data = (docSnap.data() || {}) as Partial<UserProfile>;

  return {
    ...(data as UserProfile),
    uid: docSnap.id,
    firebaseUid: String(data.firebaseUid || data.uid || docSnap.id),
  } as UserProfile;
};

export const resolveUserProfileForFirebaseUid = async (
  firebaseUid: string,
  preferredProfileUid?: string | null
) => {
  const normalizedPreferredProfileUid = preferredProfileUid?.trim();

  if (normalizedPreferredProfileUid) {
    const preferredSnap = await getDoc(doc(db, 'users', normalizedPreferredProfileUid));
    if (preferredSnap.exists()) {
      return mapUserProfileDocument(preferredSnap);
    }
  }

  const byFirebaseUidQuery = query(collection(db, 'users'), where('firebaseUid', '==', firebaseUid));
  const byFirebaseUidSnapshot = await getDocs(byFirebaseUidQuery);
  if (!byFirebaseUidSnapshot.empty) {
    return mapUserProfileDocument(byFirebaseUidSnapshot.docs[0]);
  }

  const byLegacyUidQuery = query(collection(db, 'users'), where('uid', '==', firebaseUid));
  const byLegacyUidSnapshot = await getDocs(byLegacyUidQuery);
  if (!byLegacyUidSnapshot.empty) {
    return mapUserProfileDocument(byLegacyUidSnapshot.docs[0]);
  }

  const directSnap = await getDoc(doc(db, 'users', firebaseUid));
  if (directSnap.exists()) {
    return mapUserProfileDocument(directSnap);
  }

  return null;
};

export const getCurrentUserProfile = async (preferredProfileUid?: string | null) => {
  const user = auth.currentUser;
  if (!user?.uid) return null;

  return resolveUserProfileForFirebaseUid(user.uid, preferredProfileUid);
};

const syncChatUserFromFirebase = async (fallbackEmail: string, preferredProfileUid?: string | null) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sessão do Firebase ausente. Faça login novamente.');
  }

  let displayName = (user.displayName || '').trim();
  let phone: string | undefined = undefined;
  let phoneVerified = false;
  let profileUid = preferredProfileUid?.trim() || user.uid;

  const profile = await getCurrentUserProfile(preferredProfileUid);
  if (profile) {
    if (!displayName) displayName = String(profile.displayName || '').trim();
    phone = profile.phone || undefined;
    phoneVerified = !!profile.phoneVerified;
    profileUid = profile.uid;
  }

  if (!displayName) displayName = 'Usuário';

  const authRes = await chatSyncFirebaseUser({
    email: (user.email || fallbackEmail).trim().toLowerCase(),
    displayName,
    photoURL: user.photoURL || undefined,
    phone,
    phoneVerified,
  } as any);

  // Store phone verification status in local session or context if needed
  // Note: authRes now contains phoneVerified

  await setChatSession({
    userId: authRes._id,
    profileUid,
    phoneVerified: authRes.phoneVerified,
  });
  await connectChatSocket(authRes._id);
  
  return authRes;
};

export const ensureChatSessionForCurrentUser = async () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sessao do Firebase ausente. Faca login novamente.');
  }

  const session = await getChatSession();
  const profile = await getCurrentUserProfile(session?.profileUid);
  const fallbackEmail = String(profile?.email || user.email || '').trim().toLowerCase();

  return syncChatUserFromFirebase(fallbackEmail, profile?.uid || session?.profileUid || user.uid);
};

/**
 * Finaliza o cadastro de um novo usuário (Nome e opcionalmente Email).
 * O usuário já deve estar autenticado via telefone no Firebase.
 */
export const signUp = async (displayName: string, email: string = '', phone: string = '', photoURL: string = '') => {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuario nao autenticado no Firebase.');

  // Atualiza no Firebase Auth
  await updateProfile(user, { displayName, photoURL });

  // Cria ou atualiza o documento no Firestore de forma NÃO DESTRUTIVA
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    firebaseUid: user.uid,
    email: email || user.email || null,
    displayName,
    photoURL: photoURL || null,
    status: 'Hey there! I am using Vibe',
    phone: phone || (user.phoneNumber ? user.phoneNumber.replace(/\D/g, '') : ''),
    phoneVerified: true,
    bio: '',
    birthday: '',
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    online: true,
  }, { merge: true });

  try {
    // Sincroniza com a API do Chat
    return await syncChatUserFromFirebase(email, user.uid);
  } catch (error: any) {
    // Em caso de erro na API, deslogamos o usuário por segurança
    await chatRegisterPushToken('LOGGED_OUT_TOKEN').catch(() => {});
    await clearChatSession();
    disconnectChatSocket();
    await firebaseSignOut(auth);

    const msg = error?.message ? String(error.message) : 'Falha ao sincronizar na Chat API.';
    throw new Error(`Falha ao conectar no Chat API: ${msg}`);
  }
};

/**
 * Login com email e senha.
 * Atualiza status online no Firestore e sincroniza a sessão na Chat API.
 */
export const signIn = async (email: string, password: string) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  const profile = await resolveUserProfileForFirebaseUid(user.uid);
  const profileUid = profile?.uid || user.uid;

  const signInPresence = {
    uid: user.uid,
    firebaseUid: user.uid,
    email: String(user.email || email || '').trim().toLowerCase(),
    online: true,
    lastSeen: new Date().toISOString(),
  };
  const signInBatch = writeBatch(db);
  signInBatch.set(doc(db, 'users', profileUid), signInPresence, { merge: true });
  if (profileUid !== user.uid) {
    signInBatch.set(doc(db, 'users', user.uid), signInPresence, { merge: true });
  }
  await signInBatch.commit();

  try {
    return await syncChatUserFromFirebase(email, user.uid);
  } catch (error: any) {
    await clearChatSession();
    disconnectChatSocket();
    await firebaseSignOut(auth);

    const msg = error?.message ? String(error.message) : 'Falha ao sincronizar na Chat API.';
    throw new Error(`Falha ao conectar no Chat API: ${msg}`);
  }

  return user;
};

/**
 * Logout do Firebase.
 * Atualiza status offline no Firestore e limpa sessão do chat.
 */
export const signOut = async () => {
  const user = auth.currentUser;

  if (user) {
    const profile = await getCurrentUserProfile();
    const profileUid = profile?.uid || user.uid;
    const offlinePresence = {
      online: false,
      lastSeen: new Date().toISOString(),
    };

    const signOutBatch = writeBatch(db);
    signOutBatch.set(doc(db, 'users', profileUid), offlinePresence, { merge: true });
    if (profileUid !== user.uid) {
      signOutBatch.set(doc(db, 'users', user.uid), offlinePresence, { merge: true });
    }
    await signOutBatch.commit();
  }

  await chatRegisterPushToken('LOGGED_OUT_TOKEN').catch(() => {});
  await clearChatSession();
  disconnectChatSocket();
  await firebaseSignOut(auth);
};

/**
 * Observar mudanças no estado de autenticação.
 * Retorna um unsubscribe function.
 */
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Buscar perfis de usuários por uma lista de UIDs (Firestore).
 */
export const getUsersByIds = async (uids: string[]): Promise<UserProfile[]> => {
  if (!uids || uids.length === 0) return [];

  const results: UserProfile[] = [];
  const chunkSize = 30;

  try {
    for (let i = 0; i < uids.length; i += chunkSize) {
      const chunk = uids.slice(i, i + chunkSize);
      const q = query(collection(db, 'users'), where('uid', 'in', chunk));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((docSnap) => {
        results.push(docSnap.data() as UserProfile);
      });
    }
  } catch (error) {
    console.error('[AuthService] Erro ao buscar usuários no Firestore:', error);
  }

  return results;
};

/**
 * Buscar perfil de um usuário pelo UID.
 */
export const getUserProfile = async (uid: string) => {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return mapUserProfileDocument(docSnap);
};

/**
 * Buscar perfil de um usuário pelo username.
 */
export const getUserProfileByUsername = async (username: string) => {
  const normalizedUsername = username.trim().replace(/^@+/, '');
  if (!normalizedUsername) return null;

  const q = query(collection(db, 'users'), where('username', '==', normalizedUsername));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;

  const docSnap = querySnapshot.docs[0];
  return mapUserProfileDocument(docSnap);
};

/**
 * Normaliza um número de telefone para o formato padrão (com 55 se no Brasil).
 */
export const normalizePhoneNumber = (phone: string) => {
  let cleaned = phone.replace(/\D/g, '').trim();
  // Se for um número brasileiro sem o 55, adiciona.
  if (cleaned.length === 10 || cleaned.length === 11) {
    return '55' + cleaned;
  }
  return cleaned;
};

/**
 * Buscar perfil de um usuário pelo número de telefone.
 */
export const getUserByPhone = async (phone: string) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) return null;

  const q = query(collection(db, 'users'), where('phone', '==', normalizedPhone));
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    const docSnap = querySnapshot.docs[0];
    return mapUserProfileDocument(docSnap);
  }

  // FALLBACK: Se o número for brasileiro e a busca com '55' falhou, tenta sem o '55'
  // por seguranca caso o usuario tenha cadastrado antes da normalizacao.
  if (normalizedPhone.startsWith('55')) {
    const withoutDDI = normalizedPhone.substring(2);
    const qFallback = query(collection(db, 'users'), where('phone', '==', withoutDDI));
    const fallbackSnapshot = await getDocs(qFallback);
    
    if (!fallbackSnapshot.empty) {
      const docSnap = fallbackSnapshot.docs[0];
      return mapUserProfileDocument(docSnap);
    }
  }

  return null;
};

/**
 * Atualizar perfil do usuário logado.
 */
export const updateUserProfile = async (
  uid: string,
  data: {
    displayName?: string;
    photoURL?: string;
    status?: string;
    username?: string;
    phone?: string;
    bio?: string;
    birthday?: string;
  }
) => {
  const user = auth.currentUser;
  const dataToPersist = {
    ...data,
    ...(user?.uid ? { uid: user.uid, firebaseUid: user.uid } : {}),
  };

  await setDoc(doc(db, 'users', uid), dataToPersist, { merge: true });

  if (user && (data.displayName || data.photoURL !== undefined)) {
    await updateProfile(user, {
      displayName: data.displayName || user.displayName || undefined,
      photoURL: data.photoURL !== undefined ? data.photoURL : (user.photoURL || null),
    });
  }

  // Push the profile updates to the Node.js API (MongoDB) so other users can see them
  if (user) {
    const freshDoc = await getDoc(doc(db, 'users', uid));
    const freshData = freshDoc.data() || {};
    
    await chatSyncFirebaseUser({
      email: (user.email || '').trim().toLowerCase(),
      displayName: data.displayName || user.displayName || 'Usuário',
      photoURL: data.photoURL !== undefined ? data.photoURL : (user.photoURL || undefined),
      phone: data.phone !== undefined ? data.phone : (freshData.phone || undefined),
      username: data.username !== undefined ? data.username : (freshData.username || undefined),
      phoneVerified: freshData.phoneVerified || false,
    } as any);
  }
};

/**
 * Retorna o usuário atualmente logado ou null.
 */
export const getCurrentUser = () => {
  return auth.currentUser;
};

/**
 * Deletar conta do usuário.
 * Remove o perfil no Firestore e a conta no Firebase Auth.
 */
export const deleteUserAccount = async (password: string) => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Usuário não autenticado.');

  // 1. Reautenticar para poder deletar conta sensivel
  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  } catch (error: any) {
    if (error.code === 'auth/wrong-password') {
      throw new Error('Senha incorreta. Tente novamente.');
    }
    throw new Error('Erro na reautenticação: ' + error.message);
  }

  // 2. Remover do Backend (MongoDB)
  try {
    await chatDeleteMe();
  } catch (error) {
    console.error('[AuthService] Erro ao deletar no Backend:', error);
  }

  // 3. Remover do Firestore
  try {
    const profile = await getCurrentUserProfile();
    const profileUid = profile?.uid || user.uid;
    await deleteDoc(doc(db, 'users', profileUid));
  } catch (error) {
    console.error('[AuthService] Erro ao deletar documento no Firestore:', error);
  }

  // 4. Limpar sessão local
  await clearChatSession();
  disconnectChatSocket();

  // 5. Remover do Firebase Auth
  try {
    await deleteUser(user);
  } catch (error: any) {
    throw new Error('Erro ao deletar conta no Firebase: ' + error.message);
  }
};

/**
 * Enviar e-mail de redefinição de senha do Firebase.
 */
export const resetPassword = async (email: string) => {
  if (!email || !email.trim()) throw new Error('E-mail é obrigatório para redefinir a senha.');
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
};

export const setPhoneVerified = async (uid: string, phone: string) => {
  const user = auth.currentUser;
  const normalizedPhone = phone.replace(/\D/g, '');
  // 1. Atualiza no Firestore
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    uid: user?.uid || uid,
    firebaseUid: user?.uid || uid,
    phoneVerified: true,
    phone: normalizedPhone,
  });

  // 2. Sincroniza com a API do Chat (Backend)
  let chatUserId: string | null = null;
  if (user) {
    const freshProfile = await getDoc(userRef);
    const profileData = freshProfile.exists() ? mapUserProfileDocument(freshProfile) : null;

    const authRes = await chatSyncFirebaseUser({
        email: String(profileData?.email || user.email || '').trim().toLowerCase(),
        displayName: user.displayName || 'Usuário',
        photoURL: profileData?.photoURL || user.photoURL || undefined,
        phone: normalizedPhone,
        phoneVerified: true,
      } as any);
      chatUserId = authRes?._id ? String(authRes._id) : null;
  }

  // 3. Atualiza a sessão local para o AuthContext detectar a mudança
  if (!chatUserId && !user) {
    const existingSession = await getChatSession();
    chatUserId = existingSession?.userId || null;
  }

  if (!chatUserId) {
    throw new Error('NÃ£o foi possÃ­vel concluir a sessÃ£o do chat apÃ³s validar o telefone.');
  }

  await setChatSession({ userId: chatUserId, profileUid: uid, phoneVerified: true });
};

export const completePhoneVerificationLogin = async (uid: string, phone: string) => {
  const normalizedPhone = phone.replace(/\D/g, '');
  const user = auth.currentUser;

  if (!user) {
    await clearChatSession();
    throw new Error('Sessao do Firebase ausente. Faca login novamente.');
  }

  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    uid: user.uid,
    firebaseUid: user.uid,
    phoneVerified: true,
    phone: normalizedPhone,
  });

  const freshProfile = await getDoc(userRef);
  const profileData = freshProfile.exists() ? mapUserProfileDocument(freshProfile) : null;

  const authRes = await chatSyncFirebaseUser({
    email: String(profileData?.email || user.email || '').trim().toLowerCase(),
    displayName: String(profileData?.displayName || user.displayName || 'Usuario').trim(),
    photoURL: profileData?.photoURL || user.photoURL || undefined,
    phone: normalizedPhone,
    phoneVerified: true,
  } as any);

  const chatUserId = authRes?._id ? String(authRes._id) : null;
  if (!chatUserId) {
    await clearChatSession();
    throw new Error('Nao foi possivel sincronizar sua sessao com o chat apos validar o telefone.');
  }

  await setChatSession({ userId: chatUserId, profileUid: uid, phoneVerified: true });
  await connectChatSocket(chatUserId);
};

/**
 * Atualiza o status e detalhes da Verificação em Duas Etapas (2FA).
 */
export const updateTwoStepAuth = async (data: { password?: string; email?: string; enabled: boolean }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuário não autenticado.');

  const profile = await getCurrentUserProfile();
  const profileUid = profile?.uid || user.uid;
  const docRef = doc(db, 'users', profileUid);
  const updateData: any = {
    uid: user.uid,
    firebaseUid: user.uid,
    twoStepEnabled: data.enabled,
  };
  
  if (data.password !== undefined) updateData.twoStepPassword = data.password;
  if (data.email !== undefined) updateData.twoStepEmail = data.email;

  await updateDoc(docRef, updateData);
};

/**
 * Desativa a Verificação em Duas Etapas (2FA).
 */
export const disableTwoStepAuth = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuário não autenticado.');

  const profile = await getCurrentUserProfile();
  const profileUid = profile?.uid || user.uid;
  const docRef = doc(db, 'users', profileUid);
  await updateDoc(docRef, {
    uid: user.uid,
    firebaseUid: user.uid,
    twoStepEnabled: false,
    twoStepPassword: null,
    twoStepEmail: null,
  });
};
