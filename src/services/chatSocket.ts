import { io, Socket } from 'socket.io-client';
import { CHAT_API_CONFIG } from '../config/chatApiConfig';
import { auth } from '../config/firebaseConfig';
import type { ChatApiMessage } from '../types/chatApi';

type ReceiveMessageHandler = (message: ChatApiMessage | any) => void;
type MessagesReadPayload = {
  conversationId: string;
  readerId: string;
  messageIds: string[];
  read: boolean;
  lastMessage?: any;
};
type MessagesReadHandler = (payload: MessagesReadPayload | any) => void;
type MessagesDeletedPayload = {
  conversationId: string;
  messageIds: string[];
  deletedBy: string;
  deleteForEveryone?: boolean;
  lastMessage?: any;
};
type MessagesDeletedHandler = (payload: MessagesDeletedPayload | any) => void;
type MessageUpdatedPayload = {
  conversationId: string;
  message: ChatApiMessage;
  updatedBy: string;
  lastMessage?: any;
};
type MessageUpdatedHandler = (payload: MessageUpdatedPayload | any) => void;
type TypingEvent =
  | 'typing'
  | 'stop_typing'
  | 'user_typing'
  | 'user_stop_typing'
  | 'typing_status'
  | 'typingStatus';

type TypingHandler = (event: TypingEvent, payload: any) => void;

let socket: Socket | null = null;
let currentUserId: string | null = null;
const receiveHandlers = new Set<ReceiveMessageHandler>();
const messagesReadHandlers = new Set<MessagesReadHandler>();
const messagesDeletedHandlers = new Set<MessagesDeletedHandler>();
const messageUpdatedHandlers = new Set<MessageUpdatedHandler>();
const typingHandlers = new Set<TypingHandler>();
const typingWrappers = new Map<
  TypingHandler,
  {
    typing: (payload: any) => void;
    stop_typing: (payload: any) => void;
    user_typing: (payload: any) => void;
    user_stop_typing: (payload: any) => void;
    typing_status: (payload: any) => void;
    typingStatus: (payload: any) => void;
  }
>();

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const ensureTypingListeners = (handler: TypingHandler) => {
  if (!typingWrappers.has(handler)) {
    typingWrappers.set(handler, {
      typing: (payload) => handler('typing', payload),
      stop_typing: (payload) => handler('stop_typing', payload),
      user_typing: (payload) => handler('user_typing', payload),
      user_stop_typing: (payload) => handler('user_stop_typing', payload),
      typing_status: (payload) => handler('typing_status', payload),
      typingStatus: (payload) => handler('typingStatus', payload),
    });
  }

  const wrappers = typingWrappers.get(handler)!;
  socket?.on('typing', wrappers.typing);
  socket?.on('stop_typing', wrappers.stop_typing);
  socket?.on('user_typing', wrappers.user_typing);
  socket?.on('user_stop_typing', wrappers.user_stop_typing);
  socket?.on('typing_status', wrappers.typing_status);
  socket?.on('typingStatus', wrappers.typingStatus);
};

const removeTypingListeners = (handler: TypingHandler) => {
  const wrappers = typingWrappers.get(handler);
  if (!wrappers) return;

  socket?.off('typing', wrappers.typing);
  socket?.off('stop_typing', wrappers.stop_typing);
  socket?.off('user_typing', wrappers.user_typing);
  socket?.off('user_stop_typing', wrappers.user_stop_typing);
  socket?.off('typing_status', wrappers.typing_status);
  socket?.off('typingStatus', wrappers.typingStatus);
};

export const connectChatSocket = async (userId: string) => {
  if (socket && currentUserId === userId) {
    return socket;
  }

  disconnectChatSocket();

  const firebaseToken = await auth.currentUser?.getIdToken();
  if (!firebaseToken) {
    throw new Error('Sessão do Firebase ausente. Não foi possível conectar o socket.');
  }

  currentUserId = userId;
  socket = io(normalizeBaseUrl(CHAT_API_CONFIG.BASE_URL), {
    transports: ['websocket'],
    autoConnect: true,
    auth: {
      token: firebaseToken,
    },
  });

  socket.on('connect', () => {
    socket?.emit('connect_user', userId);
  });

  for (const handler of receiveHandlers) {
    socket.on('receive_message', handler);
  }

  for (const handler of messagesReadHandlers) {
    socket.on('messages_read', handler);
  }

  for (const handler of messagesDeletedHandlers) {
    socket.on('messages_deleted', handler);
  }

  for (const handler of messageUpdatedHandlers) {
    socket.on('message_updated', handler);
  }

  for (const handler of typingHandlers) {
    ensureTypingListeners(handler);
  }

  return socket;
};

export const disconnectChatSocket = () => {
  if (!socket) {
    currentUserId = null;
    return;
  }

  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  currentUserId = null;
};

export const onReceiveMessage = (handler: ReceiveMessageHandler) => {
  receiveHandlers.add(handler);
  socket?.on('receive_message', handler);

  return () => {
    receiveHandlers.delete(handler);
    socket?.off('receive_message', handler);
  };
};

export const onMessagesRead = (handler: MessagesReadHandler) => {
  messagesReadHandlers.add(handler);
  socket?.on('messages_read', handler);

  return () => {
    messagesReadHandlers.delete(handler);
    socket?.off('messages_read', handler);
  };
};

export const onMessagesDeleted = (handler: MessagesDeletedHandler) => {
  messagesDeletedHandlers.add(handler);
  socket?.on('messages_deleted', handler);

  return () => {
    messagesDeletedHandlers.delete(handler);
    socket?.off('messages_deleted', handler);
  };
};

export const onMessageUpdated = (handler: MessageUpdatedHandler) => {
  messageUpdatedHandlers.add(handler);
  socket?.on('message_updated', handler);

  return () => {
    messageUpdatedHandlers.delete(handler);
    socket?.off('message_updated', handler);
  };
};

export const onTypingEvent = (handler: TypingHandler) => {
  typingHandlers.add(handler);
  ensureTypingListeners(handler);

  return () => {
    typingHandlers.delete(handler);
    removeTypingListeners(handler);
  };
};

export const sendMessageSocket = (payload: {
  conversationId: string;
  senderId: string;
  receiverId?: string;
  clientMessageId?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
}) => {
  if (!socket) {
    throw new Error('Socket não conectado.');
  }

  socket.emit('send_message', payload);
};

export const markMessagesReadSocket = (conversationId: string) => {
  if (!socket || !conversationId) return;
  socket.emit('mark_messages_read', { conversationId });
};

export const sendTypingSocket = (payload: { conversationId: string; senderId: string; receiverId?: string }) => {
  if (!socket) return;
  socket.emit('typing', { ...payload, typing: true });
  socket.emit('typing_status', { ...payload, typing: true });
  socket.emit('typingStatus', { ...payload, typing: true });
};

export const sendStopTypingSocket = (payload: { conversationId: string; senderId: string; receiverId?: string }) => {
  if (!socket) return;
  socket.emit('stop_typing', { ...payload, typing: false });
  socket.emit('typing_status', { ...payload, typing: false });
  socket.emit('typingStatus', { ...payload, typing: false });
};

export const isSocketConnected = () => {
  return !!socket?.connected;
};
