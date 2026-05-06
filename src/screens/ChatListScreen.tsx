import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { spacing } from '../theme/spacing';
import ChatListItem from '../components/ChatListItem';
import LoadingSpinner from '../components/LoadingSpinner';
import useTheme from '../hooks/useTheme';
import { chatDeleteConversation, chatGetConversations, chatGetMessages } from '../services/chatApi';
import { getChatSession } from '../services/chatSession';
import { onMessagesDeleted, onMessageUpdated, onMessagesRead, onReceiveMessage } from '../services/chatSocket';
import { CACHE_KEYS, loadCache, saveCache } from '../services/persistentCache';
import { useSettings } from '../context/SettingsContext';
import type { ChatApiConversation, ChatApiUser } from '../types/chatApi';
import useAuth from '../hooks/useAuth';
import { ensureChatSessionForCurrentUser } from '../services/authService';
import useOnlineStatusByIdentity from '../hooks/useOnlineStatusByIdentity';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatList'>;

export default function ChatListScreen({ navigation }: Props) {
  const { colors: themeColors } = useTheme();
  const { firebaseUid } = useAuth();
  const { setMenuVisible: setGlobalMenuVisible } = useSettings();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ChatApiConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuConversation, setMenuConversation] = useState<ChatApiConversation | null>(null);
  const hasFetchedRef = React.useRef(false);
  const myUserIdRef = React.useRef<string | null>(null);

  const loadConversations = useCallback(async (silent = false) => {
    try {
      const session = await getChatSession();
      let resolvedSession = session;

      if (firebaseUid && resolvedSession?.userId === firebaseUid) {
        await ensureChatSessionForCurrentUser();
        resolvedSession = await getChatSession();
      }

      if (!resolvedSession?.userId) {
        setMyUserId(null);
        myUserIdRef.current = null;
        setConversations([]);
        return;
      }

      setMyUserId(resolvedSession.userId);
      myUserIdRef.current = resolvedSession.userId;
      const cacheKey = `${CACHE_KEYS.CONVERSATIONS}_${resolvedSession.userId}`;

      if (!silent) {
        // Hydrate from cache instantly
        const cachedStr = await loadCache<ChatApiConversation[]>(cacheKey);
        if (cachedStr && cachedStr.length > 0) {
          setConversations(cachedStr);
          // Only show loading if cache is empty
        } else {
          setLoading(true);
        }
      }

      // Fetch fresh data in the background
      const fetched = await chatGetConversations(resolvedSession.userId);
      const fetchedWithReadReceipts = await hydrateOutgoingReadReceipts(fetched, resolvedSession.userId);
      setConversations((prev) => {
        // If data is exact same length and first item matches, maybe skip?
        // Actually, just set it and overwrite cache
        return fetchedWithReadReceipts;
      });
      await saveCache(cacheKey, fetchedWithReadReceipts);

    } catch (error: any) {
      console.error('[ChatListScreen] Erro ao carregar conversas:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [firebaseUid]);

  // Load once on mount / first focus — avoid double load
  useFocusEffect(
    useCallback(() => {
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        loadConversations();
      } else {
        // Silent refresh when returning to the screen
        loadConversations(true);
      }
      return () => {};
    }, [loadConversations])
  );

  // Socket: update conversation list locally without re-fetching
  useEffect(() => {
    const unsubReceive = onReceiveMessage((msg: any) => {
      setConversations((prev) => {
        const convId = typeof msg?.conversationId === 'object' ? msg.conversationId?._id : msg?.conversationId;
        if (!convId) {
          loadConversations(true);
          return prev;
        }
        const idx = prev.findIndex((c) => c._id === convId);
        if (idx === -1) {
          loadConversations(true);
          return prev;
        }
        const updated = {
          ...prev[idx],
          lastMessage: {
            _id: msg?._id,
            text: msg?.text,
            senderId: msg?.senderId,
            createdAt: msg?.createdAt,
            read: !!msg?.read,
          },
          updatedAt: msg.createdAt || new Date().toISOString(),
          unreadCount: (prev[idx].unreadCount || 0) + (typeof msg?.senderId === 'string' && msg.senderId !== myUserIdRef.current ? 1 : 0),
        };
        const next = [updated, ...prev.filter((_, i) => i !== idx)];
        return next;
      });
    });

    const unsubRead = onMessagesRead((payload: any) => {
      const conversationId = String(payload?.conversationId || '');
      const readMessageIds = Array.isArray(payload?.messageIds)
        ? payload.messageIds.map((id: any) => String(id))
        : [];

      if (!conversationId) return;

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation._id !== conversationId) return conversation;

          const lastMessageId = conversation.lastMessage?._id ? String(conversation.lastMessage._id) : null;
          const payloadLastMessageId = payload?.lastMessage?._id ? String(payload.lastMessage._id) : null;
          const lastMessageSenderId = extractParticipantId(conversation.lastMessage?.senderId);
          const isMyLastMessage = !!myUserIdRef.current && lastMessageSenderId === myUserIdRef.current;
          const shouldMarkLastMessageRead =
            !!payload?.read &&
            (
              (!!lastMessageId && readMessageIds.includes(lastMessageId)) ||
              (!!lastMessageId && payloadLastMessageId === lastMessageId) ||
              isMyLastMessage
            );

          if (!shouldMarkLastMessageRead) return conversation;

          return {
            ...conversation,
            lastMessage: {
              ...conversation.lastMessage,
              read: true,
            },
          };
        })
      );
    });

    const unsubDeleted = onMessagesDeleted(() => loadConversations(true));
    const unsubUpdated = onMessageUpdated(() => loadConversations(true));

    return () => {
      unsubReceive?.();
      unsubRead?.();
      unsubDeleted?.();
      unsubUpdated?.();
    };
  }, [loadConversations]);

  const filteredConversations = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return conversations;

    return conversations.filter((c) => {
      if (c.isGroup && c.groupName) {
        return c.groupName.toLowerCase().includes(normalized);
      }
      const other = getOtherParticipant(c, myUserId);
      const name = other?.nome || other?.username || '';
      return name.toLowerCase().includes(normalized);
    });
  }, [search, conversations, myUserId]);

  const renderConversation = useCallback(
    ({ item }: { item: ChatApiConversation }) => {
      const isGroup = !!item.isGroup;
      const other = !isGroup ? getOtherParticipant(item, myUserId) : null;
      
      const name = isGroup ? (item.groupName || 'Grupo') : (other?.nome || other?.username || 'Conversa');
      const avatar = isGroup ? (item.groupAvatar || null) : (other?.foto || null);

      const lastMessageText = item.lastMessage?.text ? String(item.lastMessage.text) : '';
      const lastMessageSenderId = extractParticipantId(item.lastMessage?.senderId);
      const isOutgoing = !!myUserId && !!lastMessageSenderId && lastMessageSenderId === myUserId;
      const outgoingRead = isOutgoing && !!item.lastMessage?.read;
      const unreadCount = Number(item.unreadCount || 0);
      const timestamp = item.lastMessage?.createdAt
        ? Math.floor(new Date(item.lastMessage.createdAt).getTime() / 1000)
        : Math.floor(new Date(item.updatedAt).getTime() / 1000);

      return (
        <ConversationListRow
          id={item._id}
          name={name}
          lastMessage={lastMessageText || 'Toque para abrir'}
          timestamp={timestamp}
          unreadCount={unreadCount}
          isOutgoing={isOutgoing}
          outgoingRead={outgoingRead}
          avatar={avatar}
          isGroup={isGroup}
          other={other}
          onPress={() => {
            if (!isGroup && !other?._id) {
              Alert.alert('Erro', 'Participante inválido nesta conversa.');
              return;
            }

            navigation.navigate('Chat', {
              conversationId: item._id,
              userId: other?._id,
              name,
              avatar,
              username: other?.username,
              firebaseUid: other?.firebaseUid,
              isGroup,
            });
          }}
          onLongPress={() => {
            setMenuConversation(item);
            setMenuVisible(true);
          }}
        />
      );
    },
    [navigation, myUserId]
  );

  const handleDeleteConversation = useCallback(() => {
    if (!menuConversation) return;

    Alert.alert(
      'Excluir conversa',
      'Tem certeza que deseja excluir esta conversa? Isso pode apagar as mensagens deste chat.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatDeleteConversation(menuConversation._id);
              setMenuVisible(false);
              setMenuConversation(null);
              setConversations((prev) => prev.filter((c) => c._id !== menuConversation._id));
              loadConversations();
            } catch (error: any) {
              console.error('[ChatListScreen] Erro ao excluir conversa:', error);
              Alert.alert(
                'Erro',
                error?.message ||
                  'Não foi possível excluir. Verifique se o backend possui rota DELETE /api/conversations/:id.'
              );
            }
          },
        },
      ]
    );
  }, [menuConversation, loadConversations]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
          {loading ? 'Carregando...' : 'Vibe'}
        </Text>
        <TouchableOpacity style={styles.headerAction} onPress={() => setGlobalMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={22} color={themeColors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { backgroundColor: themeColors.inputBackground }]}>
          <Ionicons name="search" size={20} color={themeColors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.textPrimary }]}
            placeholder="Buscar Chats"
            placeholderTextColor={themeColors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <FlatList
        data={filteredConversations}
        style={{ backgroundColor: themeColors.surface }}
        renderItem={renderConversation}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: themeColors.separator }]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={54}
              color={themeColors.textSecondary}
              style={styles.emptyIcon}
            />
            <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>Nenhuma conversa encontrada</Text>
          </View>
        }
      />

      <View style={[styles.fabStack, { bottom: insets.bottom + 82 }]}>
        <TouchableOpacity
          style={[
            styles.fabSmall,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.separator,
            },
          ]}
          activeOpacity={0.85}
          onPress={() => Alert.alert('Câmera', 'Abrir câmera em breve.')}
        >
          <Ionicons name="camera-outline" size={22} color={themeColors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabPrimary, { backgroundColor: themeColors.primary }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('NewChat')}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuCard, { backgroundColor: themeColors.surface, borderColor: themeColors.separator }]}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder, { borderBottomColor: themeColors.separator }]}
              activeOpacity={0.75}
              onPress={() => {
                setMenuVisible(false);
                handleDeleteConversation();
              }}
            >
              <Ionicons name="trash-outline" size={22} color={themeColors.textPrimary} />
              <Text style={[styles.menuText, { color: themeColors.textPrimary }]}>Excluir conversa</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.75}
              onPress={() => {
                setMenuVisible(false);
                setMenuConversation(null);
              }}
            >
              <Ionicons name="close-outline" size={22} color={themeColors.textSecondary} />
              <Text style={[styles.menuText, { color: themeColors.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const getOtherParticipant = (conversation: ChatApiConversation, myUserId: string | null): ChatApiUser | null => {
  if (conversation.isGroup) return null;
  if (!conversation.participants || conversation.participants.length === 0) return null;
  if (!myUserId) return conversation.participants[0];

  return conversation.participants.find((p) => p._id !== myUserId) || conversation.participants[0];
};

const extractParticipantId = (value: string | ChatApiUser | undefined): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return null;
};

const hydrateOutgoingReadReceipts = async (
  conversations: ChatApiConversation[],
  myUserId: string
): Promise<ChatApiConversation[]> => {
  const candidates = conversations
    .filter((conversation) => {
      const lastMessage = conversation.lastMessage;
      return (
        !!lastMessage?._id &&
        !lastMessage.read &&
        extractParticipantId(lastMessage.senderId) === myUserId
      );
    })
    .slice(0, 12);

  if (candidates.length === 0) {
    return conversations;
  }

  const readByConversation = new Map<string, boolean>();

  await Promise.all(
    candidates.map(async (conversation) => {
      try {
        const messages = await chatGetMessages(conversation._id);
        const lastMessageId = String(conversation.lastMessage?._id || '');
        const lastMessage = messages.find((message) => String(message._id) === lastMessageId);
        if (lastMessage?.read) {
          readByConversation.set(conversation._id, true);
        }
      } catch (error) {
        console.warn('[ChatListScreen] Nao foi possivel conferir visto da conversa:', conversation._id, error);
      }
    })
  );

  if (readByConversation.size === 0) {
    return conversations;
  }

  return conversations.map((conversation) => {
    if (!readByConversation.get(conversation._id)) {
      return conversation;
    }

    return {
      ...conversation,
      lastMessage: {
        ...conversation.lastMessage,
        read: true,
      },
    };
  });
};

function ConversationListRow({
  id,
  name,
  lastMessage,
  timestamp,
  unreadCount,
  isOutgoing,
  outgoingRead,
  avatar,
  isGroup,
  other,
  onPress,
  onLongPress,
}: {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: number;
  unreadCount: number;
  isOutgoing: boolean;
  outgoingRead: boolean;
  avatar: string | null;
  isGroup: boolean;
  other: ChatApiUser | null;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { online } = useOnlineStatusByIdentity({
    uid: other?.firebaseUid,
    email: other?.username,
    enabled: !isGroup && (!!other?.firebaseUid || !!other?.username),
  });

  return (
    <ChatListItem
      id={id}
      name={name}
      lastMessage={lastMessage}
      timestamp={timestamp}
      unreadCount={unreadCount}
      isOutgoing={isOutgoing}
      outgoingRead={outgoingRead}
      avatar={avatar}
      online={online}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerAction: {
    width: 36,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  searchWrap: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  listContent: {
    paddingVertical: spacing.xs,
    paddingBottom: 180,
    flexGrow: 1,
  },
  fabStack: {
    position: 'absolute',
    right: 18,
    alignItems: 'center',
    zIndex: 10,
  },
  fabSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1.5,
  },
  fabPrimary: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 88,
  },
  emptyContainer: {
    flex: 1,
    paddingTop: 100,
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyIcon: {
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    right: 14,
    bottom: 120,
    width: 260,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuText: {
    fontSize: 17,
    fontWeight: '500',
  },
});
