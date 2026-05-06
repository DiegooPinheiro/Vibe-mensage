import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { getUserProfile, getUserProfileByUsername } from '../services/authService';
import { chatGetConversations, chatGetMessages, chatListUsers } from '../services/chatApi';
import { getChatSession } from '../services/chatSession';
import type { ChatApiMessage, ChatApiUser } from '../types/chatApi';
import useOnlineStatusByIdentity from '../hooks/useOnlineStatusByIdentity';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';
import { UserProfile } from '../types/user';
import { Ionicons } from '@expo/vector-icons';
import useTheme from '../hooks/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'ContactProfile'>;

const PROFILE_TABS = ['Midias', 'Arquivos', 'Musicas', 'Voz'] as const;
type ProfileTab = typeof PROFILE_TABS[number];

type SharedItem = {
  id: string;
  tab: ProfileTab;
  title: string;
  subtitle: string;
  mediaUrl: string;
  mediaType?: string;
  createdAt: string;
  isImage: boolean;
  isVideo: boolean;
};

const EMPTY_STATE_BY_TAB: Record<ProfileTab, { icon: keyof typeof Ionicons.glyphMap; title: string; description: string }> = {
  Midias: {
    icon: 'images-outline',
    title: 'Nenhuma midia compartilhada',
    description: 'Imagens e videos enviados nesta conversa aparecerao aqui.',
  },
  Arquivos: {
    icon: 'document-outline',
    title: 'Nenhum arquivo compartilhado',
    description: 'Documentos enviados nesta conversa aparecerao aqui.',
  },
  Musicas: {
    icon: 'musical-notes-outline',
    title: 'Nenhuma musica compartilhada',
    description: 'Arquivos de audio enviados como musica aparecerao aqui.',
  },
  Voz: {
    icon: 'mic-outline',
    title: 'Nenhuma mensagem de voz',
    description: 'Gravacoes de voz enviadas nesta conversa aparecerao aqui.',
  },
};

export default function ContactProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [localMenuVisible, setLocalMenuVisible] = useState(false);

  const routeUid = route.params?.uid || null;
  const routeUsername = route.params?.username || '';
  const routeName = route.params?.name || '';
  const routeAvatar = route.params?.avatar || null;
  const routeFirebaseUid = route.params?.firebaseUid || null;
  const routeChatUserId = route.params?.chatUserId || null;
  const routeConversationId = route.params?.conversationId || null;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [chatUser, setChatUser] = useState<ChatApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Midias');
  const [sharedItems, setSharedItems] = useState<SharedItem[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [resolvedConversationId, setResolvedConversationId] = useState<string | null>(routeConversationId);
  const { statusText, online } = useOnlineStatusByIdentity({
    uid: profile?.firebaseUid || profile?.uid || routeFirebaseUid || routeUid,
    email: profile?.email || routeUsername,
  });

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const loadProfile = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      let profileData: UserProfile | null = null;

      const firestoreData = routeUid
        ? await getUserProfile(routeUid)
        : routeUsername
          ? await getUserProfileByUsername(routeUsername)
          : null;

      if (firestoreData) {
        profileData = firestoreData as UserProfile;
        setProfile(profileData);
      }

      const fallbackChatUser: ChatApiUser | null = routeChatUserId
        ? {
            _id: routeChatUserId,
            username: profileData?.username || routeUsername || '',
            firebaseUid: profileData?.firebaseUid || routeFirebaseUid || undefined,
            nome: profileData?.displayName || routeName || routeUsername || 'Contato',
            foto: profileData?.photoURL || routeAvatar || undefined,
          }
        : null;

      const searchTerm = profileData?.email || profileData?.username || routeUsername;
      let resolvedChatUser = fallbackChatUser;

      if (searchTerm) {
        const chatUsers = await chatListUsers(searchTerm);
        const found = chatUsers.find((user) =>
          user._id === routeChatUserId ||
          user.username === profileData?.username ||
          user.nome === profileData?.displayName ||
          user.username === routeUsername
        );
        resolvedChatUser = found || chatUsers[0] || fallbackChatUser;
      }

      setChatUser(resolvedChatUser || null);
    } catch (error) {
      console.error('[ContactProfileScreen] Erro ao carregar perfil do contato:', error);
    } finally {
      setLoading(false);
    }
  }, [routeAvatar, routeChatUserId, routeName, routeUid, routeUsername]);

  const loadSharedContent = useCallback(async (targetChatId?: string | null) => {
    const resolvedTargetChatId = targetChatId || routeChatUserId;

    if (!resolvedTargetChatId && !routeConversationId) {
      setSharedItems([]);
      setResolvedConversationId(null);
      return;
    }

    try {
      setSharedLoading(true);

      const session = await getChatSession();
      if (!session?.userId) {
        setSharedItems([]);
        setResolvedConversationId(null);
        return;
      }

      let nextConversationId = routeConversationId;

      if (!nextConversationId && resolvedTargetChatId) {
        const conversations = await chatGetConversations(session.userId);
        const existingConversation = conversations.find(
          (conversation) =>
            !conversation.isGroup &&
            conversation.participants.some((participant) => participant._id === resolvedTargetChatId)
        );
        nextConversationId = existingConversation?._id || null;
      }

      setResolvedConversationId(nextConversationId || null);

      if (!nextConversationId) {
        setSharedItems([]);
        return;
      }

      const messages = await chatGetMessages(nextConversationId);
      setSharedItems(buildSharedItems(messages));
    } catch (error) {
      console.error('[ContactProfileScreen] Erro ao carregar conteudo compartilhado:', error);
      setSharedItems([]);
    } finally {
      setSharedLoading(false);
    }
  }, [routeChatUserId, routeConversationId]);

  useEffect(() => {
    loadProfile(true);
  }, [loadProfile]);

  useEffect(() => {
    loadSharedContent(chatUser?._id || routeChatUserId);
  }, [chatUser?._id, loadSharedContent, routeChatUserId]);

  useFocusEffect(
    useCallback(() => {
      loadProfile(false);
      loadSharedContent(chatUser?._id || routeChatUserId);
    }, [chatUser?._id, loadProfile, loadSharedContent, routeChatUserId])
  );

  const displayName =
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    routeName?.trim() ||
    'Sem nome';
  const profilePhoto = profile?.photoURL || routeAvatar || chatUser?.foto || null;
  const phoneText = profile?.phone?.trim() || 'Nao informado';
  const bioText = profile?.bio?.trim() || 'Nenhuma biografia disponivel.';
  const targetChatId = chatUser?._id || routeChatUserId || null;
  const activeItems = useMemo(
    () => sharedItems.filter((item) => item.tab === activeTab),
    [activeTab, sharedItems]
  );

  if (!profile && loading) {
    return <LoadingSpinner message="Carregando perfil..." />;
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setLocalMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}>
        <View style={styles.profileHeader}>
          <Avatar uri={profilePhoto} name={displayName} size={90} online={online} />
          <Text style={[styles.name, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.status, { color: colors.textSecondary }]}>
            {statusText || 'visto recentemente'}
          </Text>
        </View>

        <View style={styles.contactActionsRow}>
          <TouchableOpacity
            style={[styles.contactActionButton, { backgroundColor: colors.surface }]}
            onPress={() => {
              if (targetChatId) {
                navigation.navigate('Chat', {
                  conversationId: resolvedConversationId || undefined,
                  userId: targetChatId,
                  name: displayName,
                  avatar: profilePhoto,
                  username: profile?.username || routeUsername,
                });
              }
            }}
          >
            <Ionicons name="chatbubble" size={22} color={colors.textPrimary} />
            <Text style={[styles.contactActionText, { color: colors.textPrimary }]}>Mensagem</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.contactActionButton, { backgroundColor: colors.surface }]}>
            <Ionicons name="notifications-off" size={22} color={colors.textPrimary} />
            <Text style={[styles.contactActionText, { color: colors.textPrimary }]}>Ativar som</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.contactActionButton, { backgroundColor: colors.surface }]}>
            <Ionicons name="call" size={22} color={colors.textPrimary} />
            <Text style={[styles.contactActionText, { color: colors.textPrimary }]}>Ligar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.contactActionButton, { backgroundColor: colors.surface }]}>
            <Ionicons name="videocam" size={22} color={colors.textPrimary} />
            <Text style={[styles.contactActionText, { color: colors.textPrimary }]}>Video</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <View style={styles.infoBlock}>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{phoneText}</Text>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Celular</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />
          <View style={[styles.infoBlock, { marginBottom: 0 }]}>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{bioText}</Text>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Biografia</Text>
          </View>
        </View>

        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabsScrollContent, { backgroundColor: colors.surface }]}
          >
            {PROFILE_TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.tab,
                    isActive
                      ? { backgroundColor: isDark ? '#33435C' : '#E5E5EA' }
                      : null,
                  ]}
                  activeOpacity={0.82}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text
                    style={[
                      isActive ? styles.tabTextActive : styles.tabTextInactive,
                      { color: isActive ? (isDark ? '#8aa4ff' : colors.primary) : colors.textSecondary },
                    ]}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.sharedContentSection}>
          {sharedLoading ? (
            <View style={[styles.emptyStateCard, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.emptyFilesText, { color: colors.textSecondary, marginTop: 12 }]}>
                Carregando conteudo compartilhado...
              </Text>
            </View>
          ) : activeItems.length === 0 ? (
            <View style={[styles.emptyStateCard, { backgroundColor: colors.surface }]}>
              <Ionicons
                name={EMPTY_STATE_BY_TAB[activeTab].icon}
                size={30}
                color={colors.textSecondary}
              />
              <Text style={[styles.emptyFilesTitle, { color: colors.textPrimary }]}>
                {EMPTY_STATE_BY_TAB[activeTab].title}
              </Text>
              <Text style={[styles.emptyFilesText, { color: colors.textSecondary }]}>
                {EMPTY_STATE_BY_TAB[activeTab].description}
              </Text>
            </View>
          ) : activeTab === 'Midias' ? (
            <View style={styles.mediaGrid}>
              {activeItems.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.mediaCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.separator,
                    },
                  ]}
                >
                  {item.isImage ? (
                    <Image source={{ uri: item.mediaUrl }} style={styles.mediaThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.videoThumb, { backgroundColor: isDark ? '#1f2a39' : '#EEF2F7' }]}>
                      <Ionicons name="videocam-outline" size={28} color={colors.primary} />
                      <Text style={[styles.videoThumbLabel, { color: colors.textSecondary }]}>Video</Text>
                    </View>
                  )}

                  <View style={styles.mediaMeta}>
                    <Text style={[styles.mediaTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.mediaSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.sharedList}>
              {activeItems.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.sharedRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.separator,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.sharedIconBox,
                      {
                        backgroundColor: getSharedIconBackground(activeTab, isDark),
                      },
                    ]}
                  >
                    <Ionicons
                      name={getSharedIconName(activeTab)}
                      size={22}
                      color={getSharedIconColor(activeTab, isDark, colors.primary)}
                    />
                  </View>

                  <View style={styles.sharedTextWrap}>
                    <Text style={[styles.sharedTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.sharedSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal transparent visible={localMenuVisible} animationType="fade" onRequestClose={() => setLocalMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setLocalMenuVisible(false)}>
          <View
            style={[
              styles.menuCard,
              {
                top: insets.top + 6,
                backgroundColor: colors.surface,
                borderColor: colors.separator,
              },
            ]}
          >
            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="timer-outline" size={22} color={colors.textPrimary} />
              <View style={styles.menuItemTextRow}>
                <Text style={[styles.menuText, { color: colors.textPrimary }]}>Autoexcluir</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="share-social-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Compartilhar contato</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="ban-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Bloquear usuario</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="pencil-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Editar contato</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="trash-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Apagar contato</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="gift-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Enviar um presente</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="lock-closed-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Iniciar chat secreto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="eye-off-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Desativar compartilhamento</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setLocalMenuVisible(false)}>
              <Ionicons name="add-circle-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Adicionar a tela inicial</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const buildSharedItems = (messages: ChatApiMessage[]): SharedItem[] => {
  const items: SharedItem[] = [];

  messages
    .filter((message) => !!message.mediaUrl)
    .forEach((message) => {
      const fileName = getSharedFileName(message);
      const normalizedType = normalizeMediaType(message.mediaType, fileName);
      const tab = resolveSharedTab(normalizedType, fileName);

      if (!tab || !message.mediaUrl) {
        return;
      }

      const title =
        normalizedType === 'image'
          ? message.text?.trim() || 'Imagem'
          : normalizedType === 'video'
            ? message.text?.trim() || 'Video'
            : fileName;

      items.push({
        id: message._id,
        tab,
        title,
        subtitle: formatSharedSubtitle(normalizedType, message.createdAt),
        mediaUrl: message.mediaUrl,
        mediaType: message.mediaType,
        createdAt: message.createdAt,
        isImage: normalizedType === 'image',
        isVideo: normalizedType === 'video',
      });
    });

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const getSharedFileName = (message: ChatApiMessage) => {
  const textValue = message.text?.trim();
  if (textValue) {
    return textValue;
  }

  if (!message.mediaUrl) {
    return 'Arquivo';
  }

  const lastChunk = message.mediaUrl.split('/').pop()?.split('?')[0] || 'Arquivo';
  try {
    return decodeURIComponent(lastChunk);
  } catch {
    return lastChunk;
  }
};

const normalizeMediaType = (mediaType?: string, fileName?: string) => {
  const normalized = (mediaType || '').toLowerCase();
  if (normalized === 'image' || normalized.startsWith('image/')) return 'image';
  if (normalized === 'video' || normalized.startsWith('video/')) return 'video';
  if (normalized === 'audio' || normalized.startsWith('audio/')) return 'audio';

  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'caf', '3gp'].includes(ext)) return 'audio';
  return 'file';
};

const resolveSharedTab = (mediaType: string, fileName: string): ProfileTab | null => {
  if (mediaType === 'image' || mediaType === 'video') return 'Midias';
  if (mediaType === 'file') return 'Arquivos';

  if (mediaType === 'audio') {
    return isVoiceFile(fileName) ? 'Voz' : 'Musicas';
  }

  return null;
};

const isVoiceFile = (fileName: string) => /^audio-\d+\.[a-z0-9]+$/i.test(fileName);

const formatSharedSubtitle = (mediaType: string, createdAt: string) => {
  const mediaLabel =
    mediaType === 'image'
      ? 'Imagem'
      : mediaType === 'video'
        ? 'Video'
        : mediaType === 'audio'
          ? 'Audio'
          : 'Arquivo';

  const date = new Date(createdAt);
  const dateLabel = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });

  return `${mediaLabel} • ${dateLabel}`;
};

const getSharedIconName = (tab: ProfileTab): keyof typeof Ionicons.glyphMap => {
  switch (tab) {
    case 'Arquivos':
      return 'document-outline';
    case 'Musicas':
      return 'musical-notes-outline';
    case 'Voz':
      return 'mic-outline';
    default:
      return 'images-outline';
  }
};

const getSharedIconBackground = (tab: ProfileTab, isDark: boolean) => {
  switch (tab) {
    case 'Arquivos':
      return isDark ? 'rgba(142,133,238,0.18)' : '#F2EDFF';
    case 'Musicas':
      return isDark ? 'rgba(76,175,80,0.16)' : '#EAF8EC';
    case 'Voz':
      return isDark ? 'rgba(0,136,204,0.18)' : '#E6F4FE';
    default:
      return isDark ? 'rgba(0,136,204,0.18)' : '#E6F4FE';
  }
};

const getSharedIconColor = (tab: ProfileTab, isDark: boolean, primaryColor: string) => {
  switch (tab) {
    case 'Arquivos':
      return isDark ? '#B8ACFF' : '#6F61D9';
    case 'Musicas':
      return isDark ? '#7BD88F' : '#2E7D32';
    case 'Voz':
      return primaryColor;
    default:
      return primaryColor;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 26,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 14,
  },
  status: {
    fontSize: 14,
    marginTop: 4,
  },
  contactActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 8,
  },
  contactActionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactActionText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  },
  infoCard: {
    borderRadius: 12,
    marginHorizontal: 16,
    paddingLeft: 16,
    marginBottom: 26,
  },
  infoBlock: {
    paddingVertical: 14,
    paddingRight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  infoValue: {
    fontSize: 16,
    marginBottom: 2,
  },
  infoLabel: {
    fontSize: 14,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  tabsScrollContent: {
    flexDirection: 'row',
    borderRadius: 24,
    padding: 3,
    alignSelf: 'center',
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  tabTextActive: {
    fontSize: 15,
    fontWeight: '700',
  },
  tabTextInactive: {
    fontSize: 15,
    fontWeight: '500',
  },
  sharedContentSection: {
    paddingHorizontal: 16,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mediaCard: {
    width: '48.2%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 14,
  },
  mediaThumb: {
    width: '100%',
    height: 148,
  },
  videoThumb: {
    width: '100%',
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumbLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  mediaMeta: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  mediaTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  mediaSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  sharedList: {
    gap: 12,
  },
  sharedRow: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sharedIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sharedTextWrap: {
    flex: 1,
  },
  sharedTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sharedSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  emptyStateCard: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyFilesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyFilesText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    right: 14,
    width: 280,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    paddingVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  menuItemTextRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuText: {
    fontSize: 15.5,
    fontWeight: '500',
  },
});
