export type ChatApiUser = {
  _id: string;
  firebaseUid?: string;
  username: string;
  nome: string;
  foto?: string;
};

export type ChatApiConversation = {
  _id: string;
  participants: ChatApiUser[];
  isGroup?: boolean;
  groupName?: string;
  groupAvatar?: string;
  groupAdmin?: string;
  unreadCount?: number;
  lastMessage?: {
    _id?: string;
    text?: string;
    senderId?: string | ChatApiUser;
    createdAt?: string;
    read?: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type ChatApiMessage = {
  _id: string;
  conversationId: string;
  senderId: string | ChatApiUser;
  clientMessageId?: string | null;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  read?: boolean;
  edited?: boolean;
  localStatus?: 'sent' | 'delivered' | 'read' | 'error';
  localOnly?: boolean;
  createdAt: string;
  updatedAt: string;
};
