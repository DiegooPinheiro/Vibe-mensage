import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Linking,
  Animated,
  PanResponder,
  LayoutAnimation,
  UIManager,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Audio, type AVPlaybackStatusSuccess, Video, ResizeMode } from 'expo-av';
import { RootStackParamList } from '../navigation/types';
import { spacing } from '../theme/spacing';
import MessageBubble from '../components/MessageBubble';
import MessageInput, { type MessageInputHandle } from '../components/MessageInput';
import EmojiPickerPanel, { DEFAULT_EMOJI_PANEL_HEIGHT } from '../components/EmojiPickerPanel';
import LoadingSpinner from '../components/LoadingSpinner';
import Avatar from '../components/Avatar';
import useTheme from '../hooks/useTheme';
import useOnlineStatusByIdentity from '../hooks/useOnlineStatusByIdentity';
import {
  chatCreateConversation,
  chatDeleteConversation,
  chatDeleteManyMessages,
  chatGetMessages,
  chatUpdateMessage,
  chatUploadMedia,
} from '../services/chatApi';
import { getChatSession } from '../services/chatSession';
import { getCachedMessages, setCachedMessages } from '../services/messageCache';
import { ensureAppCacheDirectory } from '../services/appFileCache';
import { cloudinaryUpload } from '../services/cloudinaryService';
import { EmptyChatState } from '../components/EmptyChatState';
import { WallpaperPicker } from '../components/WallpaperPicker';
import { useSettings } from '../context/SettingsContext';
import { type WallpaperConfig } from '../services/wallpaperService';
import {
  markMessagesReadSocket,
  onMessagesDeleted,
  onMessageUpdated,
  onMessagesRead,
  onReceiveMessage,
  onTypingEvent,
  sendMessageSocket,
  sendStopTypingSocket,
  sendTypingSocket,
} from '../services/chatSocket';
import type { ChatApiMessage, ChatApiUser } from '../types/chatApi';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
type LocalMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';
type LocalChatMessage = ChatApiMessage & {
  localStatus?: LocalMessageStatus;
  localOnly?: boolean;
};
type ChatItem = LocalChatMessage | {
  _id: string;
  type: 'date-separator';
  dateText: string;
};
type ViewerImage = {
  uri: string;
  timestamp: number;
  senderName?: string;
};
type ActiveAudio = {
  uri: string;
  fileName: string;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  rate: number;
};

const ATTACH_SHEET_CLOSE_THRESHOLD = 92;
const ATTACH_SHEET_CLOSE_DISTANCE = Math.round(Dimensions.get('window').height * 0.42);
const ATTACH_SHEET_OPEN_OFFSET = 42;
const keyboardEaseOut = (value: number) => 1 - Math.pow(1 - value, 3);

const CustomVideoPlayer = ({ viewerVideo, onClose, insets, name }: any) => {
  const [status, setStatus] = useState<AVPlaybackStatusSuccess | null>(null);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<Video>(null);

  // Auto-Ocultar controles imersivos
  useEffect(() => {
    let timeout: any;
    if (showControls && status?.isPlaying) {
      timeout = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(timeout);
  }, [showControls, status?.isPlaying]);

  if (!viewerVideo) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Video
        ref={videoRef}
        source={{ uri: viewerVideo.uri }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls={false}
        shouldPlay
        isLooping
        onPlaybackStatusUpdate={(s) => {
          if (s.isLoaded) setStatus(s as AVPlaybackStatusSuccess);
        }}
      />
      
      {/* Hitbox para invocar e dar hide nos controles de tela */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowControls(c => !c)} />

      {showControls && (
        <SafeAreaView style={StyleSheet.absoluteFillObject} edges={['top', 'bottom']} pointerEvents="box-none">
          {/* Header Clone */}
          <View style={[styles.viewerHeader, { backgroundColor: 'rgba(0,0,0,0.55)' }]} pointerEvents="box-none">
            <TouchableOpacity activeOpacity={0.75} onPress={onClose}>
              <Ionicons name="arrow-back" size={27} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.viewerHeaderText} pointerEvents="none">
              <Text style={styles.viewerTitle} numberOfLines={1}>{viewerVideo?.senderName || name}</Text>
              <Text style={styles.viewerSubtitle}>hoje às {new Date(viewerVideo.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
            </View>

            <View style={styles.viewerActions} pointerEvents="box-none">
              <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Pincel', 'Em breve.')}>
                <Ionicons name="brush-outline" size={22} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Compartilhar', 'Em breve.')}>
                <Ionicons name="arrow-redo-outline" size={24} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Mais opções', 'Em breve.')}>
                <Ionicons name="ellipsis-vertical" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Play Center Ghost Button */}
          <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="box-none">
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => status?.isPlaying ? videoRef.current?.pauseAsync() : videoRef.current?.playAsync()}
              style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={status?.isPlaying ? "pause" : "play"} size={48} color="#fff" style={{ marginLeft: status?.isPlaying ? 0 : 6 }} />
            </TouchableOpacity>
          </View>

          {/* Seekbar Laser */}
          {status && (
            <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 13, minWidth: 45, fontWeight: '600' }}>
                {Math.max(0, Math.floor(status.positionMillis / 1000 / 60))}:{String(Math.max(0, Math.floor((status.positionMillis / 1000) % 60))).padStart(2, '0')}
              </Text>
              <View style={{ flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, marginHorizontal: 10, overflow: 'hidden' }}>
                <View style={{ width: `${(status.positionMillis / (status.durationMillis || 1)) * 100}%`, height: '100%', backgroundColor: '#fff', borderRadius: 2 }} />
              </View>
              <Text style={{ color: '#fff', fontSize: 13, minWidth: 45, fontWeight: '600' }}>
                {Math.max(0, Math.floor((status.durationMillis || 0) / 1000 / 60))}:{String(Math.max(0, Math.floor(((status.durationMillis || 0) / 1000) % 60))).padStart(2, '0')}
              </Text>
            </View>
          )}
        </SafeAreaView>
      )}
    </View>
  );
};

export default function ChatScreen({ navigation, route }: Props) {
  const EMOJI_SEARCH_LIFT = 176;
  const { colors, isDark } = useTheme();
  const { wallpaper, setWallpaper } = useSettings();
  const { 
    conversationId: initialConversationId, 
    userId: receiverId, 
    name, 
    avatar, 
    username,
    firebaseUid,
    isGroup: initialIsGroup 
  } = route.params;

  const flatListRef = useRef<FlatList>(null);
  const messageInputRef = useRef<MessageInputHandle | null>(null);
  const openingFileRef = useRef(false);
  const audioSoundRef = useRef<Audio.Sound | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const audioActionLockRef = useRef(false);
  const deletingMessagesRef = useRef(false);
  const sendingMessageRef = useRef(false);
  const sendingMediaRef = useRef(false);
  const recordingActionRef = useRef(false);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [lastKeyboardHeight, setLastKeyboardHeight] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearchFocused, setEmojiSearchFocused] = useState(false);
  const [keyboardOpening, setKeyboardOpening] = useState(false);
  const keyboardOpeningTimeoutRef = useRef<any>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [isGroup, setIsGroup] = useState<boolean>(!!initialIsGroup);
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [wallpaperModalVisible, setWallpaperModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteForBoth, setDeleteForBoth] = useState(false);
  const [viewerImage, setViewerImage] = useState<ViewerImage | null>(null);
  const [viewerVideo, setViewerVideo] = useState<ViewerImage | null>(null);
  const [openingFileUri, setOpeningFileUri] = useState<string | null>(null);
  const [activeAudio, setActiveAudio] = useState<ActiveAudio | null>(null);
  const [deletingMessages, setDeletingMessages] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessagePreview, setEditingMessagePreview] = useState('');
  const editingBarAnim = useRef(new Animated.Value(0)).current;
  const keyboardSpacerAnim = useRef(new Animated.Value(0)).current;
  const attachSheetTranslateY = useRef(new Animated.Value(ATTACH_SHEET_CLOSE_DISTANCE)).current;
  const attachSheetBackdropOpacity = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const { statusText, online } = useOnlineStatusByIdentity({
    uid: firebaseUid,
    email: username,
    enabled: !initialIsGroup && (!!firebaseUid || !!username),
  });
  const selectionMode = selectedMessageIds.length > 0;
  const selectedEditableMessage =
    selectedMessageIds.length === 1
      ? messages.find((m) => m._id === selectedMessageIds[0])
      : null;
  const canEditSelectedMessage =
    !!selectedEditableMessage &&
    extractUserId(selectedEditableMessage.senderId) === myUserId &&
    !selectedEditableMessage.mediaUrl &&
    !!selectedEditableMessage.text?.trim();

  const openAttachSheet = useCallback(() => {
    attachSheetTranslateY.setValue(ATTACH_SHEET_OPEN_OFFSET);
    attachSheetBackdropOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(attachSheetTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 240,
        mass: 0.95,
      }),
      Animated.timing(attachSheetBackdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [attachSheetBackdropOpacity, attachSheetTranslateY]);

  const resetAttachSheetPosition = useCallback(() => {
    Animated.parallel([
      Animated.spring(attachSheetTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 240,
        mass: 0.95,
      }),
      Animated.timing(attachSheetBackdropOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [attachSheetBackdropOpacity, attachSheetTranslateY]);

  const closeAttachSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(attachSheetTranslateY, {
        toValue: ATTACH_SHEET_CLOSE_DISTANCE,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(attachSheetBackdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setAttachOpen(false);
      }
    });
  }, [attachSheetBackdropOpacity, attachSheetTranslateY]);

  const attachSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !uploading,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !uploading && gestureState.dy > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          const nextValue = Math.max(0, Math.min(gestureState.dy, ATTACH_SHEET_CLOSE_DISTANCE));
          attachSheetTranslateY.setValue(nextValue);
          attachSheetBackdropOpacity.setValue(1 - Math.min(nextValue / ATTACH_SHEET_CLOSE_DISTANCE, 1));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > ATTACH_SHEET_CLOSE_THRESHOLD || gestureState.vy > 1.15) {
            closeAttachSheet();
            return;
          }

          resetAttachSheetPosition();
        },
        onPanResponderTerminate: () => {
          resetAttachSheetPosition();
        },
      }),
    [attachSheetBackdropOpacity, attachSheetTranslateY, closeAttachSheet, resetAttachSheetPosition, uploading]
  );

  // Removed setLayoutAnimationEnabledExperimental to avoid warning in New Architecture
  useEffect(() => {
    // LayoutAnimation setup if needed
  }, []);

  useEffect(() => {
    Animated.timing(editingBarAnim, {
      toValue: editingMessageId ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [editingBarAnim, editingMessageId]);

  useEffect(() => {
    setConversationId(initialConversationId ?? null);
  }, [initialConversationId]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        selectionMode ? (
          <TouchableOpacity activeOpacity={0.75} onPress={() => setSelectedMessageIds([])}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : undefined
      ),
      headerTitle: () => (
        selectionMode ? (
          <Text style={[styles.selectionTitle, { color: colors.textPrimary }]}>
            {selectedMessageIds.length}
          </Text>
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.headerTitleWrap}
            onPress={() => {
              if (isGroup && conversationId) {
                navigation.navigate('GroupProfile', {
                  conversationId,
                  name,
                  avatar,
                });
              } else {
                navigation.navigate('ContactProfile', {
                  username,
                  name,
                  avatar,
                  firebaseUid,
                  chatUserId: receiverId,
                  conversationId: conversationId || undefined,
                });
              }
            }}
          >
            <Avatar name={name} size={38} uri={avatar ?? null} online={online} />
            <View style={styles.headerTextWrap}>
              <Text style={[styles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.headerStatus, { color: colors.textSecondary }]} numberOfLines={1}>
                {otherTyping ? 'digitando...' : (loading ? 'carregando...' : (statusText || 'via Chat API'))}
              </Text>
            </View>
          </TouchableOpacity>
        )
      ),
      headerRight: () => (
        selectionMode ? (
          <View style={styles.selectionActions}>
            {canEditSelectedMessage && (
              <TouchableOpacity activeOpacity={0.75} onPress={handleStartEditingMessage} style={styles.selectionActionBtn}>
                <Ionicons name="pencil-outline" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Copiar', 'Em breve.')} style={styles.selectionActionBtn}>
              <Ionicons name="copy-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Encaminhar', 'Em breve.')} style={styles.selectionActionBtn}>
              <Ionicons name="arrow-redo-outline" size={23} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.75} onPress={() => setDeleteModalVisible(true)} style={styles.selectionActionBtn}>
              <Ionicons name="trash-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerActions}>
            <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Chamada', 'Em breve.')}>
              <Ionicons name="call-outline" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.75} onPress={() => setHeaderMenuVisible(true)}>
              <Ionicons name="ellipsis-vertical" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )
      ),
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
    });
  }, [navigation, name, colors.background, colors.textPrimary, colors.textSecondary, avatar, online, otherTyping, statusText, selectionMode, selectedMessageIds.length, loading, canEditSelectedMessage]);

  useEffect(() => {
    if (!selectionMode) {
      setDeleteModalVisible(false);
      setDeleteForBoth(false);
    }
  }, [selectionMode]);

  useEffect(() => {
    if (attachOpen) {
      openAttachSheet();
    } else {
      attachSheetTranslateY.setValue(ATTACH_SHEET_CLOSE_DISTANCE);
      attachSheetBackdropOpacity.setValue(0);
    }
  }, [attachOpen, attachSheetBackdropOpacity, attachSheetTranslateY, openAttachSheet]);

  useEffect(() => {
    return () => {
      audioSoundRef.current?.unloadAsync().catch(() => undefined);
      audioSoundRef.current = null;
      recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
      recordingRef.current = null;
    };
  }, []);

  const handleDeleteConversation = useCallback(() => {
    if (!conversationId) {
      setHeaderMenuVisible(false);
      return;
    }

    Alert.alert(
      'Excluir conversa',
      'Tem certeza que deseja excluir esta conversa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatDeleteConversation(conversationId);
              setHeaderMenuVisible(false);
              navigation.goBack();
            } catch (error: any) {
              console.error('[ChatScreen] Erro ao excluir conversa:', error);
              Alert.alert(
                'Falha ao excluir',
                'Nao foi possivel excluir a conversa no momento. Tente novamente em instantes.'
              );
            }
          },
        },
      ]
    );
  }, [conversationId, navigation]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const animateKeyboardSpacer = (toValue: number, duration = 260) => {
      Animated.timing(keyboardSpacerAnim, {
        toValue,
        duration,
        easing: keyboardEaseOut,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      const h = event.endCoordinates?.height ?? 0;
      const duration = Math.max(220, Math.min(event.duration || 280, 420));
      Keyboard.scheduleLayoutAnimation?.(event);
      LayoutAnimation.configureNext(keyboardLayoutAnimation(duration));
      setKeyboardHeight(h);
      if (h > 0) setLastKeyboardHeight(h);
      animateKeyboardSpacer(h, duration);
      setKeyboardOpening(false);
      if (keyboardOpeningTimeoutRef.current) {
        clearTimeout(keyboardOpeningTimeoutRef.current);
        keyboardOpeningTimeoutRef.current = null;
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', (event) => {
      const duration = Math.max(200, Math.min(event.duration || 240, 360));
      Keyboard.scheduleLayoutAnimation?.(event);
      LayoutAnimation.configureNext(keyboardLayoutAnimation(duration));
      setKeyboardHeight(0);
      animateKeyboardSpacer(0, duration);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardSpacerAnim]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const session = await getChatSession();
        if (!session?.userId) {
          if (active) {
            setMyUserId(null);
            setMessages([]);
          }
          return;
        }

        if (active) setMyUserId(session.userId);

        if (!conversationId) {
          if (active) {
            setMessages([]);
            setLoading(false);
          }
          return;
        }

        // Show cached messages instantly while fresh ones load
        const cached = getCachedMessages(conversationId);
        if (cached && cached.length > 0 && active) {
          setMessages(cached as LocalChatMessage[]);
          setLoading(false);
        }

        const fetched = await chatGetMessages(conversationId);
        if (active) {
          const mapped = fetched.map((message) => {
            const isMine = extractUserId(message.senderId) === session.userId;
            return {
              ...message,
              localStatus: message.read ? 'read' : (message.localStatus ? message.localStatus : (isMine ? 'sent' : 'delivered')),
            };
          }) as LocalChatMessage[];
          setMessages(mapped);
          setCachedMessages(conversationId, mapped);
          setLoading(false);
        }
      } catch (error: any) {
        console.error('[ChatScreen] Erro ao carregar mensagens:', error);
        Alert.alert('Erro de Conexao', 'Nao foi possivel carregar o historico de mensagens.');
        if (active) setLoading(false);
      }
    };

    setLoading(true);
    load();

    return () => {
      active = false;
    };
  }, [conversationId]);

  useEffect(() => {
    const unsubscribe = onReceiveMessage((message: any) => {
      if (!message || message.conversationId !== conversationId) {
        return;
      }

            const isMine = !!myUserId && extractUserId(message.senderId) === myUserId;
      const normalized: LocalChatMessage = {
        ...message,
        // socket pode enviar senderId como string (sem populate)
        senderId: message.senderId,
        clientMessageId: message.clientMessageId || null,
        createdAt: message.createdAt || new Date().toISOString(),
        updatedAt: message.updatedAt || message.createdAt || new Date().toISOString(),
        localStatus: message.read ? 'read' : (message.localStatus ? message.localStatus : (isMine ? 'sent' : 'delivered')),
      };

      const normalizedSenderId = extractUserId(normalized.senderId);
      const incomingFromOtherUser =
        !!normalizedSenderId &&
        !!myUserId &&
        normalizedSenderId !== myUserId;

      setMessages((prev) => {
        const byIdIndex = prev.findIndex((m) => m._id === normalized._id);
        if (byIdIndex >= 0) {
          const next = [...prev];
          next[byIdIndex] = {
            ...next[byIdIndex],
            ...normalized,
            localStatus: normalized.read ? 'read' : next[byIdIndex].localStatus || 'delivered',
            localOnly: false,
          };
          return next;
        }

        const optimisticIndex = prev.findIndex((m) =>
          m.localOnly &&
          (
            (!!normalized.clientMessageId && normalized.clientMessageId === m.clientMessageId) ||
            (
              extractUserId(m.senderId) === extractUserId(normalized.senderId) &&
              m.text === normalized.text &&
              m.mediaUrl === normalized.mediaUrl &&
              m.mediaType === normalized.mediaType
            )
          )
        );

        if (optimisticIndex >= 0) {
          const next = [...prev];
          next[optimisticIndex] = {
            ...normalized,
            localStatus: normalized.read ? 'read' : (normalized.localStatus ? normalized.localStatus : 'sent'),
            localOnly: false,
          };
          return next;
        }

        return [...prev, normalized];
      });

      if (incomingFromOtherUser && conversationId) {
        markMessagesReadSocket(conversationId);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [conversationId, myUserId]);

  useEffect(() => {
    const unsubscribe = onMessagesRead((payload: any) => {
      if (!payload || payload.conversationId !== conversationId || !Array.isArray(payload.messageIds)) {
        return;
      }

      const readSet = new Set(payload.messageIds.map((id: string) => String(id)));
      setMessages((prev) =>
        prev.map((message) =>
          readSet.has(String(message._id))
            ? {
                ...message,
                read: true,
                localStatus: 'read',
              }
            : message
        )
      );
    });

    return () => {
      unsubscribe?.();
    };
  }, [conversationId]);

  useEffect(() => {
    const unsubscribe = onMessagesDeleted((payload: any) => {
      if (!payload || payload.conversationId !== conversationId || !Array.isArray(payload.messageIds)) {
        return;
      }

      const deletedSet = new Set(payload.messageIds.map((id: string) => String(id)));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages((prev) => prev.filter((message) => !deletedSet.has(String(message._id))));
      setSelectedMessageIds((prev) => prev.filter((id) => !deletedSet.has(String(id))));
    });

    return () => {
      unsubscribe?.();
    };
  }, [conversationId]);

  useEffect(() => {
    const unsubscribe = onMessageUpdated((payload: any) => {
      if (!payload || payload.conversationId !== conversationId || !payload.message?._id) {
        return;
      }

      const updatedId = String(payload.message._id);
      setMessages((prev) =>
        prev.map((message) =>
          String(message._id) === updatedId
            ? {
                ...message,
                ...payload.message,
                localOnly: false,
              }
            : message
        )
      );

      if (editingMessageId === updatedId) {
        setEditingMessageId(null);
        setEditingMessagePreview('');
        messageInputRef.current?.clearText?.();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [conversationId, editingMessageId]);

  useEffect(() => {
    const unsubscribe = onTypingEvent((event, payload: any) => {
      const convId = payload?.conversationId || payload?.conversation?._id;
      if (!convId || convId !== conversationId) return;

      const sender = payload?.senderId || payload?.userId || payload?.sender?._id || payload?.sender;
      if (sender && String(sender) !== String(receiverId)) return;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      if (event === 'stop_typing' || event === 'user_stop_typing' || payload?.typing === false) {
        setOtherTyping(false);
        return;
      }

      setOtherTyping(true);
      typingTimeoutRef.current = setTimeout(() => {
        setOtherTyping(false);
      }, 4500);
    });

    return () => {
      unsubscribe?.();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [conversationId, receiverId]);

  const processedMessages = useMemo(() => {
    if (!messages || messages.length === 0) return [];

    const result: ChatItem[] = [];
    let lastDate: string | null = null;

    if (messages.length > 0) {
      const firstMsgDate = new Date(messages[0].createdAt);
      const formattedFirstDate = firstMsgDate.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
      });

      result.push({
        _id: 'date-sep-initial',
        type: 'date-separator',
        dateText: formattedFirstDate,
      });
      
      lastDate = formattedFirstDate;
    }

    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
      });

      if (msgDate !== lastDate) {
        result.push({
          _id: `date-sep-${msgDate}-${msg._id}`,
          type: 'date-separator',
          dateText: msgDate,
        });
        lastDate = msgDate;
      }

      result.push(msg);
    });

    return result;
  }, [messages, name]);

  const ensureConversationId = useCallback(async () => {
    if (conversationId) {
      return conversationId;
    }

    if (!receiverId) {
      throw new Error('Impossível iniciar conversa sem um destinatário ou ID de grupo.');
    }

    const conversation = await chatCreateConversation(receiverId as string);
    setConversationId(conversation._id);
    navigation.setParams({ conversationId: conversation._id });
    return conversation._id;
  }, [conversationId, navigation, receiverId]);

  const handleStartEditingMessage = useCallback(() => {
    if (!selectedEditableMessage?.text?.trim()) {
      return;
    }

    setEditingMessageId(String(selectedEditableMessage._id));
    setEditingMessagePreview(selectedEditableMessage.text.trim());
    setSelectedMessageIds([]);
    setDeleteModalVisible(false);
    messageInputRef.current?.setText?.(selectedEditableMessage.text.trim());
    messageInputRef.current?.focus?.();
  }, [selectedEditableMessage]);

  const handleCancelEditingMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditingMessagePreview('');
    messageInputRef.current?.clearText?.();
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!myUserId) {
        Alert.alert('Erro', 'Sessão do chat ausente. Faça login novamente.');
        return;
      }

      if (editingMessageId) {
        try {
          const response = await chatUpdateMessage(editingMessageId, { text });
          const updatedMessage = response.updatedMessage;

          setMessages((prev) =>
            prev.map((message) =>
              String(message._id) === String(editingMessageId)
                ? {
                    ...message,
                    ...updatedMessage,
                    localOnly: false,
                  }
                : message
            )
          );

          handleCancelEditingMessage();
        } catch (error: any) {
          console.error('[ChatScreen] Erro ao editar mensagem:', error);
          Alert.alert('Erro', error?.message || 'Não foi possível editar a mensagem.');
        }
        return;
      }

      if (sendingMessageRef.current) {
        return;
      }

      sendingMessageRef.current = true;

      let resolvedConversationId: string;
      try {
        resolvedConversationId = await ensureConversationId();
      } catch (error: any) {
        console.error('[ChatScreen] Erro ao iniciar conversa:', error);
        Alert.alert('Erro', error?.message || 'Não foi possível iniciar a conversa.');
        sendingMessageRef.current = false;
        return;
      }

      const optimisticMessage: LocalChatMessage = {
        _id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clientMessageId: `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId: resolvedConversationId,
        senderId: myUserId,
        text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        localStatus: 'sent',
        localOnly: true,
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        sendMessageSocket({
          conversationId: resolvedConversationId,
          senderId: myUserId,
          receiverId: receiverId || undefined,
          clientMessageId: optimisticMessage.clientMessageId || undefined,
          text,
        });
      } catch (error: any) {
        setMessages((prev) => prev.filter((m) => m._id !== optimisticMessage._id));
        console.error('[ChatScreen] Erro ao enviar mensagem:', error);
        Alert.alert('Erro', error?.message || 'Não foi possível enviar a mensagem.');
      } finally {
        setTimeout(() => {
          sendingMessageRef.current = false;
        }, 220);
      }
    },
    [editingMessageId, ensureConversationId, handleCancelEditingMessage, myUserId, receiverId]
  );

  const handleUploadAndSend = useCallback(
    async (file: { uri: string; name: string; type: string }) => {
      if (!myUserId) {
        Alert.alert('Erro', 'Sessão do chat ausente. Faça login novamente.');
        return;
      }

      if (sendingMediaRef.current) {
        return;
      }

      sendingMediaRef.current = true;

      setUploading(true);
      const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isVideo = file.type?.startsWith('video');
      const inferredType = file.type?.includes('image') ? 'image' : (isVideo ? 'video' : 'file');

      // Visualização Fantasma/Optimista (Preview imediato)
      setMessages((prev) => [
        ...prev,
        {
          _id: optimisticId,
          clientMessageId,
          conversationId: 'temp_conv', // O ensure será rodado em background
          senderId: myUserId,
          text: inferredType === 'image' || isVideo ? undefined : file.name,
          mediaUrl: file.uri, // Exibe o arquivo local do celular para Feedback visual imediato
          mediaType: inferredType,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          localStatus: 'sending' as LocalMessageStatus,
          localOnly: true,
        } as LocalChatMessage,
      ]);

      setUploading(true);
      setUploadProgress(0);

      try {
        const resolvedConversationId = await ensureConversationId();
        const uploaded = await cloudinaryUpload(file, (progress) => {
          setUploadProgress(progress);
        });
        const displayName = uploaded.fileName || file.name;
        const text = uploaded.mediaType === 'image' || uploaded.mediaType === 'video' ? undefined : displayName;

        // Atualiza a visualização local trocando do arquivo local para o hospedado com status finalizado
        setMessages((prev) => 
          prev.map((msg) => msg._id === optimisticId ? {
            ...msg,
            conversationId: resolvedConversationId,
            mediaUrl: uploaded.mediaUrl,
            mediaType: uploaded.mediaType,
            text,
            localStatus: 'sent',
          } : msg)
        );

        sendMessageSocket({
          conversationId: resolvedConversationId,
          senderId: myUserId,
          receiverId: receiverId || undefined,
          clientMessageId,
          text,
          mediaUrl: uploaded.mediaUrl,
          mediaType: uploaded.mediaType,
        });
      } catch (error: any) {
        // Se a Cloudinary ou a API falhar, arranca o balão "optimista" da tela e avisa o erro
        setMessages((prev) => prev.filter((m) => m._id !== optimisticId));
        console.error('[ChatScreen] Erro ao enviar midia:', error);
        Alert.alert('Erro no Upload', error?.message || 'Sua conexão falhou ao tentar enviar a mídia.');
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setTimeout(() => {
          sendingMediaRef.current = false;
        }, 260);
      }
    },
    [ensureConversationId, myUserId, receiverId]
  );

  const handleOpenFile = useCallback(
    async ({ uri, fileName, mediaType }: { uri: string; fileName: string; mediaType?: string }) => {
      if (openingFileRef.current) {
        return;
      }

      openingFileRef.current = true;
      setOpeningFileUri(uri);

      try {
        const normalizedName = sanitizeFileName(fileName || extractFileNameFromUrl(uri));
        const inferredMimeType = resolveMimeType(normalizedName, mediaType);

        if (Platform.OS !== 'android') {
          await Linking.openURL(uri);
          return;
        }

        const cacheDir = await ensureAppCacheDirectory();
        if (!cacheDir) {
          throw new Error('Armazenamento temporÃ¡rio indisponÃ­vel.');
        }

        const localUri = `${cacheDir}${Date.now()}-${normalizedName}`;
        const downloaded = await FileSystem.downloadAsync(uri, localUri);
        const contentUri = await FileSystem.getContentUriAsync(downloaded.uri);

        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: inferredMimeType,
          flags: 1,
        });
      } catch (error: any) {
        console.error('[ChatScreen] Erro ao abrir arquivo:', error);
        const message = String(error?.message || '');
        if (!message.includes('IntentLauncher activity is already started')) {
          Alert.alert(
            'Nao foi possivel abrir o arquivo',
            error?.message || 'Verifique se existe um aplicativo compatÃ­vel instalado no aparelho.'
          );
        }
      } finally {
        setTimeout(() => {
          openingFileRef.current = false;
          setOpeningFileUri((current) => (current === uri ? null : current));
        }, 900);
      }
    },
    []
  );

  const handleStartVoiceRecording = useCallback(async () => {
    if (recordingActionRef.current || recordingVoice || uploading) {
      return;
    }

    recordingActionRef.current = true;

    try {
      let permission = await Audio.getPermissionsAsync();
      if (!permission.granted) {
        permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permissão', 'Permita acesso ao microfone para gravar áudio.');
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });

      const recording = new Audio.Recording();
      recording.setOnRecordingStatusUpdate((status) => {
        setRecordingDurationMs(status.durationMillis || 0);
      });
      recording.setProgressUpdateInterval(200);
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setRecordingDurationMs(0);
      setRecordingVoice(true);
    } catch (error: any) {
      console.error('[ChatScreen] Erro ao iniciar gravacao:', error);
      Alert.alert('Erro', error?.message || 'NÃ£o foi possÃ­vel iniciar a gravação.');
    } finally {
      setTimeout(() => {
        recordingActionRef.current = false;
      }, 250);
    }
  }, [recordingVoice, uploading]);

  const finishVoiceRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      return null;
    }

    await recording.stopAndUnloadAsync();
    const status = await recording.getStatusAsync();
    const uri = recording.getURI();
    recordingRef.current = null;
    setRecordingVoice(false);
    setRecordingDurationMs(0);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });

    if (!uri) {
      return null;
    }

    return {
      uri,
      durationMillis: status.durationMillis || 0,
    };
  }, []);

  const handleCancelVoiceRecording = useCallback(async () => {
    if (recordingActionRef.current) {
      return;
    }

    recordingActionRef.current = true;

    try {
      const result = await finishVoiceRecording();
      if (result?.uri) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
      }
    } catch (error) {
      console.error('[ChatScreen] Erro ao cancelar gravacao:', error);
    } finally {
      setTimeout(() => {
        recordingActionRef.current = false;
      }, 220);
    }
  }, [finishVoiceRecording]);

  const handleSendVoiceRecording = useCallback(async () => {
    if (recordingActionRef.current) {
      return;
    }

    recordingActionRef.current = true;

    try {
      const result = await finishVoiceRecording();
      if (!result?.uri) {
        return;
      }

      if (result.durationMillis < 700) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        Alert.alert('Ãudio muito curto', 'Grave por pelo menos 1 segundo para enviar.');
        return;
      }

      const extension = result.uri.split('.').pop()?.toLowerCase() || 'm4a';
      await handleUploadAndSend({
        uri: result.uri,
        name: `audio-${Date.now()}.${extension}`,
        type: extension === 'caf' ? 'audio/x-caf' : extension === '3gp' ? 'audio/3gpp' : 'audio/mp4',
      });
    } catch (error: any) {
      console.error('[ChatScreen] Erro ao enviar gravacao:', error);
      Alert.alert('Erro', error?.message || 'NÃ£o foi possÃ­vel enviar o áudio.');
    } finally {
      setTimeout(() => {
        recordingActionRef.current = false;
      }, 240);
    }
  }, [finishVoiceRecording, handleUploadAndSend]);

  const handleAudioPress = useCallback(
    async ({ uri, fileName, mediaType }: { uri: string; fileName: string; mediaType?: string }) => {
      if (audioActionLockRef.current) {
        return;
      }

      audioActionLockRef.current = true;

      try {
        if (activeAudio?.uri === uri && audioSoundRef.current) {
          const status = await audioSoundRef.current.getStatusAsync();
          if (!status.isLoaded) return;

          const finished =
            typeof status.durationMillis === 'number' &&
            status.durationMillis > 0 &&
            status.positionMillis >= status.durationMillis - 180;

          if (status.isPlaying) {
            await audioSoundRef.current.pauseAsync();
            setActiveAudio((prev) => (prev ? { ...prev, isPlaying: false } : prev));
          } else if (finished) {
            await audioSoundRef.current.setPositionAsync(0);
            await audioSoundRef.current.playAsync();
            setActiveAudio((prev) =>
              prev
                ? {
                    ...prev,
                    isPlaying: true,
                    positionMillis: 0,
                  }
                : prev
            );
          } else {
            await audioSoundRef.current.playAsync();
            setActiveAudio((prev) => (prev ? { ...prev, isPlaying: true } : prev));
          }
          return;
        }

        if (audioSoundRef.current) {
          await audioSoundRef.current.unloadAsync();
          audioSoundRef.current = null;
        }

        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const { sound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (playbackStatus) => {
            if (!playbackStatus.isLoaded) {
              return;
            }

            const loadedStatus = playbackStatus as AVPlaybackStatusSuccess;
            setActiveAudio((prev) => {
              if (!prev || prev.uri !== uri) {
                return prev;
              }

              return {
                ...prev,
                isPlaying: loadedStatus.isPlaying,
                positionMillis: loadedStatus.positionMillis || 0,
                durationMillis: loadedStatus.durationMillis || prev.durationMillis || 0,
              };
            });

            if (loadedStatus.didJustFinish) {
              audioSoundRef.current
                ?.unloadAsync()
                .catch(() => undefined)
                .finally(() => {
                  audioSoundRef.current = null;
                });
              setActiveAudio((prev) => (prev && prev.uri === uri ? null : prev));
            }
          }
        );

        audioSoundRef.current = sound;
        const loadedStatus = status as AVPlaybackStatusSuccess;
        
        // Aplica a velocidade atual se for diferente de 1x
        if (activeAudio?.rate && activeAudio.rate !== 1) {
          await sound.setRateAsync(activeAudio.rate, true);
        }

        setActiveAudio({
          uri,
          fileName,
          isPlaying: loadedStatus.isPlaying ?? true,
          positionMillis: loadedStatus.positionMillis || 0,
          durationMillis: loadedStatus.durationMillis || 0,
          rate: activeAudio?.rate || 1.0,
        });
      } catch (error: any) {
        console.error('[ChatScreen] Erro ao reproduzir audio:', error);
        Alert.alert('Erro', error?.message || 'Nao foi possivel reproduzir o áudio.');
      } finally {
        setTimeout(() => {
          audioActionLockRef.current = false;
        }, 260);
      }
    },
    [activeAudio?.uri]
  );

  const handleCloseAudioPlayer = useCallback(async () => {
    try {
      if (audioSoundRef.current) {
        await audioSoundRef.current.unloadAsync();
      }
    } catch {
      // ignore
    } finally {
      audioSoundRef.current = null;
      setActiveAudio(null);
    }
  }, []);

  const handleToggleAudioRate = useCallback(async () => {
    if (!audioSoundRef.current || !activeAudio) return;

    let nextRate = 1.0;
    if (activeAudio.rate === 1.0) nextRate = 1.5;
    else if (activeAudio.rate === 1.5) nextRate = 2.0;
    else nextRate = 1.0;

    try {
      await audioSoundRef.current.setRateAsync(nextRate, true);
      setActiveAudio(prev => prev ? { ...prev, rate: nextRate } : null);
    } catch (err) {
      console.error('[ChatScreen] Erro ao mudar velocidade do audio:', err);
    }
  }, [activeAudio]);

  const pickFromGallery = useCallback(async () => {
    setAttachOpen(false);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão', 'Permita acesso Ã  galeria para enviar arquivos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
      allowsEditing: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    const name = asset.fileName || `media-${Date.now()}`;
    const type = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    await handleUploadAndSend({ uri: asset.uri, name, type });
  }, [handleUploadAndSend]);

  const takePhoto = useCallback(async () => {
    setAttachOpen(false);

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão', 'Permita acesso Ã  cÃ¢mera para enviar fotos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    const name = asset.fileName || `foto-${Date.now()}.jpg`;
    const type = asset.mimeType || 'image/jpeg';
    await handleUploadAndSend({ uri: asset.uri, name, type });
  }, [handleUploadAndSend]);

  const pickDocument = useCallback(async () => {
    setAttachOpen(false);

    const result: any = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result?.canceled) return;

    const asset = result?.assets?.[0] ?? (result?.type === 'success' ? result : null);
    if (!asset?.uri) return;

    const name = asset.name || `arquivo-${Date.now()}`;
    const type = asset.mimeType || 'application/octet-stream';
    await handleUploadAndSend({ uri: asset.uri, name, type });
  }, [handleUploadAndSend]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatItem }) => {
      if ('type' in item && item.type === 'date-separator') {
        return (
          <View style={styles.dateSeparatorContainer}>
            <View style={[styles.dateSeparatorPill, { backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.85)' }]}>
              <Text style={[styles.dateSeparatorText, { color: colors.textPrimary }]}>{item.dateText}</Text>
            </View>
          </View>
        );
      }

      const msg = item as LocalChatMessage;
      const senderId = extractUserId(msg.senderId);
      const isMine = !!myUserId && !!senderId && senderId === myUserId;

      const senderName = !isMine 
        ? (extractUserName(msg.senderId) || (initialIsGroup ? undefined : name)) 
        : undefined;
      const text = msg.text ? String(msg.text) : '';
      const timestamp = Math.floor(new Date(msg.createdAt).getTime() / 1000);
      const status = isMine
        ? (msg.read ? 'read' : msg.localStatus || 'delivered') as LocalMessageStatus
        : undefined;

      const selected = selectedMessageIds.includes(msg._id);

      return (
        <MessageBubble
          id={msg._id}
          message={text}
          mediaUrl={msg.mediaUrl}
          mediaType={msg.mediaType}
          timestamp={timestamp}
          isMine={isMine}
          senderName={senderName}
          status={status}
          fileOpening={!!msg.mediaUrl && openingFileUri === msg.mediaUrl}
          selectionMode={selectionMode}
          selected={selected}
          onFilePress={handleOpenFile}
          onAudioPress={handleAudioPress}
          isAudioPlaying={!!msg.mediaUrl && activeAudio?.uri === msg.mediaUrl && activeAudio.isPlaying}
          audioProgress={
            !!msg.mediaUrl && activeAudio?.uri === msg.mediaUrl && activeAudio.durationMillis > 0
              ? activeAudio.positionMillis / activeAudio.durationMillis
              : 0
          }
          audioPositionLabel={
            !!msg.mediaUrl && activeAudio?.uri === msg.mediaUrl
              ? formatAudioTime(activeAudio.positionMillis)
              : '0:00'
          }
          audioDurationLabel={
            !!msg.mediaUrl && activeAudio?.uri === msg.mediaUrl && activeAudio.durationMillis > 0
              ? formatAudioTime(activeAudio.durationMillis)
              : '0:00'
          }
          audioRate={!!msg.mediaUrl && activeAudio?.uri === msg.mediaUrl ? activeAudio.rate : 1.0}
          onAudioRatePress={handleToggleAudioRate}
          uploadProgress={status === 'sending' ? uploadProgress : undefined}
          onVideoPress={({ uri, timestamp: videoTimestamp, senderName: videoSenderName }) => {
            if (selectionMode) {
              setSelectedMessageIds((prev) => prev.includes(msg._id) ? prev.filter((id) => id !== msg._id) : [...prev, msg._id]);
              return;
            }
            setViewerVideo({ uri, timestamp: videoTimestamp, senderName: videoSenderName });
          }}
          onImagePress={({ uri, timestamp: imageTimestamp, senderName: imageSenderName }) => {
            if (selectionMode) {
              setSelectedMessageIds((prev) =>
                prev.includes(msg._id)
                  ? prev.filter((id) => id !== msg._id)
                  : [...prev, msg._id]
              );
              return;
            }

            setViewerImage({
              uri,
              timestamp: imageTimestamp,
              senderName: imageSenderName,
            });
          }}
          onLongPress={() => {
            setSelectedMessageIds((prev) =>
              prev.includes(msg._id) ? prev : [msg._id]
            );
          }}
          onPress={() => {
            if (!selectionMode) return;
            setSelectedMessageIds((prev) =>
              prev.includes(msg._id)
                ? prev.filter((id) => id !== msg._id)
                : [...prev, msg._id]
            );
          }}
        />
      );
    },
    [activeAudio, handleAudioPress, handleOpenFile, myUserId, name, openingFileUri, selectedMessageIds, selectionMode, isDark, colors]
  );

  const handleConfirmDeleteMessages = useCallback(async () => {
    if (deletingMessagesRef.current || selectedMessageIds.length === 0) {
      return;
    }

    deletingMessagesRef.current = true;
    setDeletingMessages(true);

    try {
      await chatDeleteManyMessages({
        messageIds: selectedMessageIds,
        deleteForEveryone: deleteForBoth,
      });

      const selectedSet = new Set(selectedMessageIds);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages((prev) => prev.filter((message) => !selectedSet.has(message._id)));
      setDeleteModalVisible(false);
      setDeleteForBoth(false);
      setSelectedMessageIds([]);
    } catch (error: any) {
      console.error('[ChatScreen] Erro ao apagar mensagens:', error);
      Alert.alert('Erro', error?.message || 'Nao foi possivel apagar as mensagens.');
    } finally {
      deletingMessagesRef.current = false;
      setDeletingMessages(false);
    }
  }, [deleteForBoth, selectedMessageIds]);



  const searchLift = emojiOpen && emojiSearchFocused && keyboardHeight > 0 ? EMOJI_SEARCH_LIFT : 0;
  const reservedBottomHeight = keyboardHeight > 0
    ? keyboardHeight + searchLift
    : emojiOpen
      ? (lastKeyboardHeight || DEFAULT_EMOJI_PANEL_HEIGHT)
      : keyboardOpening
        ? (lastKeyboardHeight || DEFAULT_EMOJI_PANEL_HEIGHT)
      : 0;
  const animatedKeyboardSpacerHeight = keyboardHeight > 0
    ? Animated.add(keyboardSpacerAnim, new Animated.Value(searchLift))
    : keyboardSpacerAnim;
  const bottomSpacerStyle = emojiOpen || keyboardOpening
    ? { height: reservedBottomHeight }
    : { height: animatedKeyboardSpacerHeight };

  const renderWallpaper = () => {
    if (wallpaper.type === 'color' || wallpaper.type === 'pattern') {
      const isDoodleBase = wallpaper.type === 'pattern' && wallpaper.value === 'chat_bg_doodle';
      const bgColor = isDoodleBase 
        ? (isDark ? '#1c2431' : '#d1e1f1') 
        : wallpaper.value;
      
      // Aplicamos o desenho se for o Doodle base ou se for uma cor (exceto o cinza de reset)
      const showPattern = isDoodleBase || (wallpaper.type === 'color' && wallpaper.value !== '#2a2f32');
      const parallaxY = scrollY.interpolate({
        inputRange: [-1, 0, 1000],
        outputRange: [0.1, 0, -50], // Sutil paralaxe (moves slower)
      });

      return (
        <Animated.View style={[styles.chatWallpaper, { backgroundColor: bgColor, transform: [{ translateY: parallaxY }] }]}>
          {showPattern && (
            <Image 
              source={require('../../assets/chat_bg_doodle.png')} 
              style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: 0.25 }]} 
              resizeMode="repeat"
            />
          )}
          {/* Vinheta sutil para dar profundidade */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)' }]} />
        </Animated.View>
      );
    }
    if (wallpaper.type === 'image') {
      return <Image source={{ uri: wallpaper.value }} style={styles.chatWallpaper} resizeMode="cover" />;
    }
    return <View style={[styles.chatWallpaper, { backgroundColor: colors.backgroundChat }]} />;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.backgroundChat }]} edges={['bottom']}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={styles.flex} keyboardVerticalOffset={headerHeight}>
          {renderWallpaper()}
          {activeAudio ? (
            <View style={styles.inlineAudioPlayer}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => handleAudioPress(activeAudio)}>
                <Ionicons
                  name={activeAudio.isPlaying ? 'pause' : 'play'}
                  size={20}
                  color="#8ea8ff"
                />
              </TouchableOpacity>
              <Text style={styles.inlineAudioText} numberOfLines={1}>
                {trimAudioFileName(activeAudio.fileName)}
              </Text>
              <TouchableOpacity activeOpacity={0.8} onPress={handleCloseAudioPlayer}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.72)" />
              </TouchableOpacity>
            </View>
          ) : null}

          {uploading && uploadProgress > 0 && uploadProgress < 1 ? (
            <View style={{ height: 3, width: '100%', backgroundColor: colors.backgroundSecondary, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(uploadProgress * 100)}%`, backgroundColor: colors.chatPrimary }} />
            </View>
          ) : null}

          <Animated.FlatList
            ref={flatListRef as any}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            style={styles.list}
            contentContainerStyle={[
              styles.messagesList,
              { paddingBottom: spacing.md + insets.bottom },
              messages.length === 0 && { justifyContent: 'center' }
            ]}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
                        ListEmptyComponent={() => (
              !loading && messages.length === 0 ? (
                <EmptyChatState 
                  type={username === 'me' ? 'saved' : isGroup ? 'group' : 'private'}
                  name={name}
                  avatar={avatar}
                  onSendWave={() => handleSend('👋')}
                />
              ) : null
            )}
          />

          {editingMessageId ? (
            <Animated.View
              style={[
                styles.editingBar,
                {
                  backgroundColor: colors.inputBackground,
                  borderTopColor: colors.separator,
                  opacity: editingBarAnim,
                  transform: [
                    {
                      translateY: editingBarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.editingBarTextWrap}>
                <Text style={[styles.editingBarTitle, { color: colors.primary }]}>Editando mensagem</Text>
                <Text style={[styles.editingBarPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {editingMessagePreview}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.75} onPress={handleCancelEditingMessage}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          <MessageInput
            ref={messageInputRef}
            onSend={handleSend}
            onAttachPress={() => {
              if (recordingVoice) return;
              setAttachOpen(true);
            }}
            recording={recordingVoice}
            recordingDurationMs={recordingDurationMs}
            onStartRecording={handleStartVoiceRecording}
            onCancelRecording={handleCancelVoiceRecording}
            onSendRecording={handleSendVoiceRecording}
            onTyping={() => {
              if (!myUserId || !conversationId) return;
              sendTypingSocket({ conversationId, senderId: myUserId, receiverId: receiverId || undefined });
            }}
            onStopTyping={() => {
              if (!myUserId || !conversationId) return;
              sendStopTypingSocket({ conversationId, senderId: myUserId, receiverId: receiverId || undefined });
            }}
            disabled={uploading}
            emojiOpen={emojiOpen}
            onEmojiOpenChange={(open) => {
              setEmojiOpen(open);

              // Ao trocar de emoji -> teclado, o teclado demora alguns ms para aparecer.
              // MantÃ©m o "espaÃ§o" reservado nesse intervalo para evitar a piscada (descer/subir rÃ¡pido).
              if (!open && keyboardHeight === 0) {
                setKeyboardOpening(true);
                if (keyboardOpeningTimeoutRef.current) {
                  clearTimeout(keyboardOpeningTimeoutRef.current);
                }
                keyboardOpeningTimeoutRef.current = setTimeout(() => {
                  setKeyboardOpening(false);
                  keyboardOpeningTimeoutRef.current = null;
                }, 320);
              } else if (open) {
                setKeyboardOpening(false);
                if (keyboardOpeningTimeoutRef.current) {
                  clearTimeout(keyboardOpeningTimeoutRef.current);
                  keyboardOpeningTimeoutRef.current = null;
                }
              }
            }}
          />

          <Animated.View style={bottomSpacerStyle}>
            {emojiOpen ? (
              <EmojiPickerPanel
                visible
                fill
                height={reservedBottomHeight}
                keyboardHeight={keyboardHeight}
                onSearchFocusChange={setEmojiSearchFocused}
                onClose={() => setEmojiOpen(false)}
                onSelectEmoji={(emoji) => messageInputRef.current?.appendText?.(emoji)}
              />
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>
          {renderWallpaper()}
          {activeAudio ? (
            <View style={styles.inlineAudioPlayer}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => handleAudioPress(activeAudio)}>
                <Ionicons
                  name={activeAudio.isPlaying ? 'pause' : 'play'}
                  size={20}
                  color="#8ea8ff"
                />
              </TouchableOpacity>
              <Text style={styles.inlineAudioText} numberOfLines={1}>
                {trimAudioFileName(activeAudio.fileName)}
              </Text>
              <TouchableOpacity activeOpacity={0.8} onPress={handleCloseAudioPlayer}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.72)" />
              </TouchableOpacity>
            </View>
          ) : null}

          {uploading && uploadProgress > 0 && uploadProgress < 1 ? (
            <View style={{ height: 3, width: '100%', backgroundColor: colors.backgroundSecondary, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(uploadProgress * 100)}%`, backgroundColor: colors.chatPrimary }} />
            </View>
          ) : null}

          <Animated.FlatList
            ref={flatListRef as any}
            data={processedMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            style={styles.list}
            contentContainerStyle={[
              styles.messagesList,
              { paddingBottom: spacing.md + insets.bottom },
              messages.length === 0 && { justifyContent: 'center' }
            ]}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
                                    ListEmptyComponent={() => (
              !loading && messages.length === 0 ? (
                <EmptyChatState 
                  type={username === 'me' ? 'saved' : isGroup ? 'group' : 'private'}
                  name={name}
                  avatar={avatar}
                  onSendWave={() => handleSend('👋')}
                />
              ) : null
            )}
          />

          {editingMessageId ? (
            <Animated.View
              style={[
                styles.editingBar,
                {
                  backgroundColor: colors.inputBackground,
                  borderTopColor: colors.separator,
                  opacity: editingBarAnim,
                  transform: [
                    {
                      translateY: editingBarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.editingBarTextWrap}>
                <Text style={[styles.editingBarTitle, { color: colors.primary }]}>Editando mensagem</Text>
                <Text style={[styles.editingBarPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {editingMessagePreview}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.75} onPress={handleCancelEditingMessage}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          <MessageInput
            ref={messageInputRef}
            onSend={handleSend}
            onAttachPress={() => {
              if (recordingVoice) return;
              setAttachOpen(true);
            }}
            recording={recordingVoice}
            recordingDurationMs={recordingDurationMs}
            onStartRecording={handleStartVoiceRecording}
            onCancelRecording={handleCancelVoiceRecording}
            onSendRecording={handleSendVoiceRecording}
            onTyping={() => {
              if (!myUserId || !conversationId) return;
              sendTypingSocket({ conversationId, senderId: myUserId, receiverId: receiverId || undefined });
            }}
            onStopTyping={() => {
              if (!myUserId || !conversationId) return;
              sendStopTypingSocket({ conversationId, senderId: myUserId, receiverId: receiverId || undefined });
            }}
            disabled={uploading}
            emojiOpen={emojiOpen}
            onEmojiOpenChange={(open) => {
              setEmojiOpen(open);

              if (!open && keyboardHeight === 0) {
                setKeyboardOpening(true);
                if (keyboardOpeningTimeoutRef.current) {
                  clearTimeout(keyboardOpeningTimeoutRef.current);
                }
                keyboardOpeningTimeoutRef.current = setTimeout(() => {
                  setKeyboardOpening(false);
                  keyboardOpeningTimeoutRef.current = null;
                }, 320);
              } else if (open) {
                setKeyboardOpening(false);
                if (keyboardOpeningTimeoutRef.current) {
                  clearTimeout(keyboardOpeningTimeoutRef.current);
                  keyboardOpeningTimeoutRef.current = null;
                }
              }
            }}
          />

          <Animated.View style={bottomSpacerStyle}>
            {emojiOpen ? (
              <EmojiPickerPanel
                visible
                fill
                height={reservedBottomHeight}
                keyboardHeight={keyboardHeight}
                onSearchFocusChange={setEmojiSearchFocused}
                onClose={() => setEmojiOpen(false)}
                onSelectEmoji={(emoji) => messageInputRef.current?.appendText?.(emoji)}
              />
            ) : null}
          </Animated.View>
        </View>
      )}

      <Modal
        transparent={false}
        animationType="fade"
        visible={!!viewerImage}
        onRequestClose={() => setViewerImage(null)}
      >
        <SafeAreaView style={styles.viewerScreen} edges={['top', 'bottom']}>
          <View style={styles.viewerHeader}>
            <TouchableOpacity activeOpacity={0.75} onPress={() => setViewerImage(null)}>
              <Ionicons name="arrow-back" size={27} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.viewerHeaderText}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                {viewerImage?.senderName || name}
              </Text>
              <Text style={styles.viewerSubtitle}>
                {viewerImage
                  ? `hoje às ${new Date(viewerImage.timestamp * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}`
                  : ''}
              </Text>
            </View>

            <View style={styles.viewerActions}>
              <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Pincel', 'Em breve.')}>
                <Ionicons name="brush-outline" size={22} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Compartilhar', 'Em breve.')}>
                <Ionicons name="arrow-redo-outline" size={24} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.75} onPress={() => Alert.alert('Mais opções', 'Em breve.')}>
                <Ionicons name="ellipsis-vertical" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.viewerCounterWrap}>
            <View style={styles.viewerCounterPill}>
              <Text style={styles.viewerCounterText}>1 de 1</Text>
            </View>
          </View>

          <View style={styles.viewerImageWrap}>
            {viewerImage ? (
              <Image
                source={{ uri: viewerImage.uri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        transparent={false}
        animationType="fade"
        visible={!!viewerVideo}
        onRequestClose={() => setViewerVideo(null)}
        supportedOrientations={['portrait', 'landscape']}
      >
        <CustomVideoPlayer 
          viewerVideo={viewerVideo} 
          onClose={() => setViewerVideo(null)} 
          insets={insets} 
          name={name} 
        />
      </Modal>

      <Modal transparent animationType="none" visible={attachOpen} onRequestClose={closeAttachSheet}>
        <Pressable style={styles.sheetOverlay} onPress={closeAttachSheet}>
          <Animated.View style={[styles.sheetOverlayBackdrop, { opacity: attachSheetBackdropOpacity }]} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.separator,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateY: attachSheetTranslateY }],
            },
          ]}
        >
          <View style={styles.sheetHandleTouchArea} {...attachSheetPanResponder.panHandlers}>
            <View style={[styles.sheetHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : colors.separator }]} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderTextWrap}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Compartilhar</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                Escolha como voce quer enviar sua midia.
              </Text>
            </View>
            {uploading ? (
              <View style={[styles.sheetStatusPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.backgroundSecondary }]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[
              styles.sheetItem,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.backgroundSecondary },
              uploading ? styles.sheetItemDisabled : null,
            ]}
            onPress={pickFromGallery}
            disabled={uploading}
          >
            <View style={[styles.sheetItemIconWrap, { backgroundColor: isDark ? 'rgba(0,136,204,0.18)' : '#E6F4FE' }]}>
              <Ionicons name="images-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.sheetItemTextWrap}>
              <Text style={[styles.sheetItemText, { color: colors.textPrimary }]}>Galeria</Text>
              <Text style={[styles.sheetItemSubtext, { color: colors.textSecondary }]}>Fotos e videos</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sheetItem,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.backgroundSecondary },
              uploading ? styles.sheetItemDisabled : null,
            ]}
            onPress={takePhoto}
            disabled={uploading}
          >
            <View style={[styles.sheetItemIconWrap, { backgroundColor: isDark ? 'rgba(76,175,80,0.16)' : '#EAF8EC' }]}>
              <Ionicons name="camera-outline" size={22} color={isDark ? '#7BD88F' : '#2E7D32'} />
            </View>
            <View style={styles.sheetItemTextWrap}>
              <Text style={[styles.sheetItemText, { color: colors.textPrimary }]}>Camera</Text>
              <Text style={[styles.sheetItemSubtext, { color: colors.textSecondary }]}>Tirar agora</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sheetItem,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.backgroundSecondary },
              uploading ? styles.sheetItemDisabled : null,
            ]}
            onPress={pickDocument}
            disabled={uploading}
          >
            <View style={[styles.sheetItemIconWrap, { backgroundColor: isDark ? 'rgba(142,133,238,0.18)' : '#F2EDFF' }]}>
              <Ionicons name="document-outline" size={22} color={isDark ? '#B8ACFF' : '#6F61D9'} />
            </View>
            <View style={styles.sheetItemTextWrap}>
              <Text style={[styles.sheetItemText, { color: colors.textPrimary }]}>Arquivo</Text>
              <Text style={[styles.sheetItemSubtext, { color: colors.textSecondary }]}>PDF, docs e mais</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sheetCancel,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.backgroundSecondary,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.separator,
              },
            ]}
            onPress={closeAttachSheet}
            disabled={uploading}
          >
            <Text style={[styles.sheetCancelText, { color: colors.textSecondary }]}>Cancelar</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      <Modal transparent visible={headerMenuVisible} animationType="fade" onRequestClose={() => setHeaderMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setHeaderMenuVisible(false)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => { setHeaderMenuVisible(false); Alert.alert('Ativar som', 'Em breve.'); }}>
              <Ionicons name="volume-mute-outline" size={24} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Ativar som</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => { setHeaderMenuVisible(false); Alert.alert('Videochamada', 'Em breve.'); }}>
              <Ionicons name="videocam-outline" size={24} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Videochamada</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => { setHeaderMenuVisible(false); Alert.alert('Buscar', 'Em breve.'); }}>
              <Ionicons name="search-outline" size={24} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Buscar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => { 
                setHeaderMenuVisible(false); 
                setWallpaperModalVisible(true);
            }}>
              <Ionicons name="image-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Papel de Parede</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => { setHeaderMenuVisible(false); Alert.alert('Limpar Histórico', 'Em breve.'); }}>
              <Ionicons name="brush-outline" size={24} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Limpar Histórico</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => { setHeaderMenuVisible(false); handleDeleteConversation(); }}>
              <Ionicons name="trash-outline" size={24} color="#ff3b30" />
              <Text style={[styles.menuText, { color: '#ff3b30' }]}>Apagar Chat</Text>
            </TouchableOpacity>

          </View>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={() => {
          if (!deletingMessages) {
            setDeleteModalVisible(false);
          }
        }}
      >
        <Pressable
          style={styles.deleteOverlay}
          onPress={() => {
            if (!deletingMessages) {
              setDeleteModalVisible(false);
            }
          }}
        >
          <Pressable
            style={[
              styles.deleteCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.separator,
              },
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.deleteTitle, { color: colors.textPrimary }]}>
              {selectedMessageIds.length > 1 ? `Apagar ${selectedMessageIds.length} mensagens?` : 'Apagar mensagem?'}
            </Text>

            <Text style={[styles.deleteDescription, { color: colors.textSecondary }]}>
              {selectedMessageIds.length > 1
                ? 'Essa acao removera as mensagens selecionadas deste chat.'
                : 'Essa acao removera a mensagem selecionada deste chat.'}
            </Text>

            <View
              style={[
                styles.deleteOptionRow,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.backgroundSecondary,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.separator,
                },
              ]}
            >
              <View style={styles.deleteOptionTextWrap}>
                <Text style={[styles.deleteOptionTitle, { color: colors.textPrimary }]}>
                  Apagar para {name} tambem
                </Text>
                <Text style={[styles.deleteOptionHint, { color: colors.textSecondary }]}>
                  Remover para ambos os lados quando isso for permitido.
                </Text>
              </View>
              <Switch
                value={deleteForBoth}
                onValueChange={setDeleteForBoth}
                disabled={deletingMessages}
                thumbColor={Platform.OS === 'android' ? (deleteForBoth ? colors.primary : '#d5d8dd') : undefined}
                trackColor={{
                  true: `${colors.primary}80`,
                  false: isDark ? 'rgba(255,255,255,0.16)' : '#d5d8dd',
                }}
              />
            </View>

            <View style={styles.deleteActions}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deletingMessages}
                style={[
                  styles.deleteButton,
                  styles.deleteButtonSecondary,
                  {
                    backgroundColor: colors.backgroundSecondary,
                    opacity: deletingMessages ? 0.55 : 1,
                  },
                ]}
              >
                <Text style={[styles.deleteButtonText, { color: colors.primary }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleConfirmDeleteMessages}
                disabled={deletingMessages}
                style={[
                  styles.deleteButton,
                  styles.deleteButtonDanger,
                  { opacity: deletingMessages ? 0.72 : 1 },
                ]}
              >
                {deletingMessages ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.deleteButtonText, styles.deleteButtonDangerText]}>Apagar</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <WallpaperPicker 
        visible={wallpaperModalVisible}
        onClose={() => setWallpaperModalVisible(false)}
        onSelect={(config) => setWallpaper(config)}
        currentWallpaper={wallpaper}
      />
    </SafeAreaView>
  );
}

const extractUserId = (value: string | ChatApiUser | any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return null;
};

const keyboardLayoutAnimation = (duration: number) => ({
  duration,
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
});

const extractUserName = (value: string | ChatApiUser | any): string | null => {
  if (!value) return null;
  if (typeof value === 'object') {
    return value.nome || value.username || null;
  }
  return null;
};

const extractFileNameFromUrl = (uri: string) => {
  const rawName = uri.split('/').pop()?.split('?')[0] || 'arquivo';
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const sanitizeFileName = (value: string) => {
  const safe = value.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_').trim();
  return safe || 'arquivo';
};

const resolveMimeType = (fileName: string, mediaType?: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (mediaType && mediaType.includes('/')) {
    return mediaType;
  }

  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'zip':
      return 'application/zip';
    case 'rar':
      return 'application/vnd.rar';
    default:
      return 'application/octet-stream';
  }
};

const formatAudioTime = (millis: number) => {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const trimAudioFileName = (value: string) => {
  return value.replace(/\.[a-z0-9]{2,5}$/i, '');
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e1621',
  },
  list: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  chatWallpaper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0e1621',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 220,
  },
  headerTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    width: 58,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerStatus: {
    fontSize: 13,
    marginTop: 1,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginRight: 4,
  },
  selectionActionBtn: {
    padding: 4,
  },
  selectionTitle: {
    color: '#9ea1aa',
    fontSize: 13,
    marginTop: 1,
  },
  messagesList: {
    paddingHorizontal: 6,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
  },
  emptyContainerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChatCard: {
    width: '85%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyChatSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyChatSticker: {
    fontSize: 72,
    textAlign: 'center',
  },
  datePill: {
    backgroundColor: 'rgba(80, 83, 92, 0.65)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  datePillText: {
    color: '#f2f2f2',
    fontSize: 13,
    fontWeight: '600',
  },
  inlineAudioPlayer: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(27,27,31,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineAudioText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  editingBar: {
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editingBarTextWrap: {
    flex: 1,
  },
  editingBarTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  editingBarPreview: {
    fontSize: 14,
    marginTop: 2,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    paddingTop: 10,
    paddingHorizontal: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    marginBottom: 16,
  },
  sheetHandleTouchArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 14,
  },
  sheetHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  sheetSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  sheetStatusPill: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 78,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 10,
  },
  sheetItemDisabled: {
    opacity: 0.55,
  },
  sheetItemIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sheetItemTextWrap: {
    flex: 1,
  },
  sheetItemText: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetItemSubtext: {
    fontSize: 13,
    marginTop: 2,
  },
  sheetCancel: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    top: 10,
    right: 14,
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
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 22,
  },
  deleteTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  deleteDescription: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 20,
  },
  deleteOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 24,
  },
  deleteOptionTextWrap: {
    flex: 1,
    paddingRight: 14,
  },
  deleteOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  deleteOptionHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  deleteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  deleteButton: {
    minWidth: 120,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonSecondary: {
    borderWidth: 0,
  },
  deleteButtonDanger: {
    backgroundColor: '#FF3B30',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButtonDangerText: {
    fontWeight: '700',
    color: '#fff',
  },
  viewerScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerHeader: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerHeaderText: {
    flex: 1,
    marginLeft: 14,
  },
  viewerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  viewerSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    marginTop: 2,
  },
  viewerActions: {
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerCounterWrap: {
    alignItems: 'center',
    paddingTop: 10,
  },
  viewerCounterPill: {
    backgroundColor: 'rgba(52,52,52,0.82)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  viewerCounterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  viewerImageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  dateSeparatorContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateSeparatorPill: {
    paddingVertical: 3,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  dateSeparatorText: {
    fontSize: 13,
    fontWeight: '500',
  },
});



