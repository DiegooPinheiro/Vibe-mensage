import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import useAuth from '../hooks/useAuth';
import { getUserProfile, signOut, deleteUserAccount } from '../services/authService';
import Avatar from '../components/Avatar';
import { useSettings } from '../context/SettingsContext';
import useTheme from '../hooks/useTheme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { UserProfile } from '../types/user';
import CustomAlert from '../components/CustomAlert';
import PasswordModal from '../components/PasswordModal';
import { Pressable, Modal } from 'react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

import { useTranslation } from '../locales';

export default function SettingsScreen({ navigation }: Props) {
  const { displayName, photoURL, uid } = useAuth();
  const { language, setLanguage } = useSettings();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [localMenuVisible, setLocalMenuVisible] = useState(false);
  const [isPassModalVisible, setIsPassModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    isDestructive?: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const loadProfile = useCallback(async () => {
    if (!uid) return;
    try {
      const data = await getUserProfile(uid);
      if (data) {
        setProfile(data as UserProfile);
      }
    } catch (error) {
      console.error('[SettingsScreen] Erro ao carregar perfil em configuracoes:', error);
    }
  }, [uid]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleLogout = () => {
    setAlertConfig({
      visible: true,
      title: t('settings.logout'),
      message: 'Deseja realmente sair da sua conta?',
      confirmLabel: 'SAIR',
      isDestructive: true,
      onConfirm: async () => {
        hideAlert();
        try {
          await signOut();
        } catch (error: any) {
          setAlertConfig({
            visible: true,
            title: 'Erro',
            message: error.message || 'Erro ao sair',
            onConfirm: hideAlert,
          });
        }
      },
    });
  };

  const handleDeleteAccount = () => {
    setAlertConfig({
      visible: true,
      title: t('settings.deleteAccount'),
      message: 'AVISO: Isso apagará permanentemente todos os seus dados no app. Esta ação não pode ser desfeita.',
      confirmLabel: 'DELETAR',
      isDestructive: true,
      onConfirm: () => {
        hideAlert();
        setTimeout(() => setIsPassModalVisible(true), 500);
      },
    });
  };

  const onConfirmDeletion = async (password: string) => {
    setIsDeleting(true);
    try {
      await deleteUserAccount(password);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Falha ao deletar conta');
    } finally {
      setIsDeleting(false);
      setIsPassModalVisible(false);
    }
  };

  const headerPhone = profile?.phone || '+55 (XX) XXXXX-XXXX';
  const headerUsername = profile?.username ? `@${profile.username}` : '@username';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.topBarButton} onPress={() => setLocalMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}> 
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.8} style={styles.avatarContainer} onPress={() => navigation.navigate('EditProfile')}>
            <Avatar uri={profile?.photoURL || photoURL} name={profile?.displayName || displayName || 'User'} size={100} />
            <View style={[styles.cameraBadge, { borderColor: colors.background }]}>
              <Ionicons name="camera" size={18} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerName, { color: colors.textPrimary }]}>{profile?.displayName || displayName || t('settings.noName')}</Text>
          <Text style={[styles.headerPhone, { color: colors.textSecondary }]}>{`${headerPhone} • ${headerUsername}`}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SettingRow
            iconName="person"
            iconBgColor="#2A85FF"
            label={t('settings.account')}
            subtitle={t('settings.accountSub')}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingRow
            iconName="chatbubble"
            iconBgColor="#F7931A"
            label={t('settings.chatSettings')}
            subtitle={t('settings.chatSettingsSub')}
            onPress={() => navigation.navigate('ChatSettings')}
          />
          <SettingRow
            iconName="key"
            iconBgColor="#34C759"
            label={t('settings.privacy')}
            subtitle={t('settings.privacySub')}
            onPress={() => navigation.navigate('Privacy')}
          />
          <SettingRow
            iconName="notifications"
            iconBgColor="#FF3B30"
            label={t('settings.notifications')}
            subtitle={t('settings.notificationsSub')}
            onPress={() => navigation.navigate('Notifications')}
          />
          <SettingRow
            iconName="pie-chart"
            iconBgColor="#5856D6"
            label={t('settings.data')}
            subtitle={t('settings.dataSub')}
            onPress={() => navigation.navigate('DataStorage')}
          />
          <SettingRow
            iconName="laptop-outline"
            iconBgColor="#64D2FF"
            label={t('settings.devices')}
            subtitle={t('settings.devicesSub')}
            onPress={() => Alert.alert('Dispositivos', 'Gerenciamento de dispositivos em breve.')}
          />
          <SettingRow
            iconName="globe-outline"
            iconBgColor="#AF52DE"
            label={t('settings.language')}
            subtitle={language === 'pt' ? 'Português (Brasil)' : 'English'}
            onPress={() => navigation.navigate('Language')}
            isLast
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SettingRow iconName="trash-outline" iconBgColor="#FF3B30" label={t('settings.deleteAccount')} onPress={handleDeleteAccount} />
          <SettingRow iconName="exit-outline" iconBgColor="#FF3B30" label={t('settings.logout')} onPress={handleLogout} isLast />
        </View>
      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onCancel={hideAlert}
        onConfirm={alertConfig.onConfirm}
        confirmLabel={alertConfig.confirmLabel}
        isDestructive={alertConfig.isDestructive}
      />

      <PasswordModal
        visible={isPassModalVisible}
        loading={isDeleting}
        onCancel={() => setIsPassModalVisible(false)}
        onConfirm={onConfirmDeletion}
        title="Confirmação de Segurança"
        message="Por favor, digite sua senha para confirmar a exclusão permanente da sua conta."
        confirmLabel="EXCLUIR AGORA"
      />

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
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.75}
              onPress={() => {
                setLocalMenuVisible(false);
                handleLogout();
              }}
            >
              <Ionicons name="exit-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Sair</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function SettingRow({
  iconName,
  iconType = 'Ionicons',
  iconBgColor,
  label,
  subtitle,
  rightBadge,
  onPress,
  isLast = false,
}: {
  iconName: string;
  iconType?: 'Ionicons' | 'MaterialCommunityIcons';
  iconBgColor: string;
  label: string;
  subtitle?: string;
  rightBadge?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity style={[settingStyles.container, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <View style={settingStyles.row}>
        <View style={[settingStyles.iconContainer, { backgroundColor: iconBgColor }]}> 
          {iconType === 'Ionicons' ? (
            <Ionicons name={iconName as any} size={18} color="#FFF" />
          ) : (
            <MaterialCommunityIcons name={iconName as any} size={18} color="#FFF" />
          )}
        </View>
        <View style={settingStyles.content}>
          <Text style={[settingStyles.label, { color: colors.textPrimary }]}>{label}</Text>
          {subtitle && <Text style={[settingStyles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {rightBadge && <Text style={settingStyles.badgeText}>{rightBadge}</Text>}
      </View>
      {!isLast && <View style={[settingStyles.divider, { backgroundColor: colors.separator }]} />}
    </TouchableOpacity>
  );
}

const settingStyles = StyleSheet.create({
  container: {
    // Fundo da linha agora usa surface via props, removendo hardcoded
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  badgeText: {
    color: '#0A84FF',
    fontSize: 16,
    paddingHorizontal: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  topBarButton: {
    width: 36,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 16,
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 32,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#5E5CE6',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  headerName: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  headerPhone: {
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    right: 14,
    width: 180,
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
  menuText: {
    fontSize: 17,
    fontWeight: '500',
  },
});
