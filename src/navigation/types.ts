export type RootStackParamList = {
  // Auth
  Login: undefined;
  Register: { phone: string };
  PhoneVerification: { isChangingNumber?: boolean; mode?: 'login' | 'register'; phone?: string } | undefined;

  // Flows
  MainFlow: { screen?: string; params?: any };
  MainTabs:
    | {
        showChatActions?: boolean;
        onDeleteSelected?: () => void;
      }
    | undefined;

  // Screens
  ChatList: undefined;
  Chat: {
    conversationId?: string;
    userId?: string;
    name: string;
    avatar?: string | null;
    username?: string;
    firebaseUid?: string;
    isGroup?: boolean;
  };
  Profile: { uid?: string };
  ContactProfile: {
    uid?: string;
    username?: string;
    name?: string;
    avatar?: string | null;
    firebaseUid?: string;
    chatUserId?: string;
    conversationId?: string;
  };
  Settings: undefined;
  Contacts: undefined;
  NewChat: undefined;
  NewGroup: undefined;
  EditProfile: undefined;
  Notifications: undefined;
  Privacy: undefined;
  DataStorage: undefined;
  Help: undefined;
  Language: undefined;
  ChangePhone: undefined;
  ChangeUsername: undefined;
  ChangeBirthday: undefined;
  ChatSettings: undefined;
  TwoStepIntro: undefined;
  TwoStepPassword: { mode?: 'setup' | 'change' } | undefined;
  TwoStepEmail: { password: string; mode?: 'setup' | 'change' };
  TwoStepVerify: { password: string; email: string; code: string; mode?: 'setup' | 'change' };
  TwoStepSuccess: { title?: string; description?: string } | undefined;
  TwoStepSettings: undefined;
  TwoStepVerifyPassword: { mode?: 'settings' | 'login' | 'change'; phoneNumber?: string; targetUid?: string };
  TwoStepVerifyPasswordSettings: { mode?: 'settings' | 'login' | 'change'; phoneNumber?: string; targetUid?: string } | undefined;
  GroupProfile: {
    conversationId: string;
    name: string;
    avatar?: string | null;
    membersCount?: number;
  };
};
