import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useTheme from '../hooks/useTheme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import useAuth from '../hooks/useAuth';

type Props = NativeStackScreenProps<RootStackParamList, 'Privacy'>;

type AutoDeleteOption = 'off' | '24h' | '7d' | '30d';
type VisibilityOption = 'everyone' | 'contacts' | 'nobody';

type PrivacySettings = {
  autoDelete: AutoDeleteOption;
  passcodeEnabled: boolean;
  passcode: string | null;
  accessKeysEnabled: boolean;
  blockedUsers: string[];
  activeDevices: number;
  phoneVisibility: VisibilityOption;
  lastSeenVisibility: VisibilityOption;
};

const STORAGE_KEY = '@vibe_privacy_security_settings';

const DEFAULT_SETTINGS: PrivacySettings = {
  autoDelete: 'off',
  passcodeEnabled: false,
  passcode: null,
  accessKeysEnabled: false,
  blockedUsers: [],
  activeDevices: 1,
  phoneVisibility: 'contacts',
  lastSeenVisibility: 'everyone',
};

const AUTO_DELETE_LABELS: Record<AutoDeleteOption, string> = {
  off: 'Desativada',
  '24h': '24 horas',
  '7d': '7 dias',
  '30d': '30 dias',
};

const VISIBILITY_LABELS: Record<VisibilityOption, string> = {
  everyone: 'Todos',
  contacts: 'Meus Contatos',
  nobody: 'Ninguem',
};

export default function PrivacyScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { userProfile, refreshProfile } = useAuth();
  const twoStepEnabled = userProfile?.twoStepEnabled ?? false;
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'create' | 'change'>('create');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  const saveSettings = async (next: PrivacySettings) => {
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const updateSettings = async (patch: Partial<PrivacySettings>) => {
    await saveSettings({ ...settings, ...patch });
  };

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  };

  const passcodeValue = settings.passcodeEnabled ? 'Ativada' : 'Desativada';
  const accessKeyValue = settings.accessKeysEnabled ? 'Ativadas' : 'Desativadas';
  const blockedValue = String(settings.blockedUsers.length);
  const devicesValue = String(settings.activeDevices);

  const closePinModal = () => {
    setPin('');
    setPinConfirm('');
    setPinModalVisible(false);
  };

  const openPinModal = (mode: 'create' | 'change') => {
    setPinMode(mode);
    setPin('');
    setPinConfirm('');
    setPinModalVisible(true);
  };

  const savePin = async () => {
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert('PIN invalido', 'Use de 4 a 6 numeros.');
      return;
    }

    if (pin !== pinConfirm) {
      Alert.alert('PIN diferente', 'Confirme o mesmo PIN nos dois campos.');
      return;
    }

    await updateSettings({ passcodeEnabled: true, passcode: pin });
    closePinModal();
    Alert.alert('Senha de bloqueio', pinMode === 'create' ? 'PIN ativado com sucesso.' : 'PIN alterado com sucesso.');
  };

  const chooseAutoDelete = () => {
    Alert.alert('Autoexcluir mensagens', 'Escolha quando apagar mensagens automaticamente neste aparelho.', [
      { text: 'Desativada', onPress: () => updateSettings({ autoDelete: 'off' }) },
      { text: '24 horas', onPress: () => updateSettings({ autoDelete: '24h' }) },
      { text: '7 dias', onPress: () => updateSettings({ autoDelete: '7d' }) },
      { text: '30 dias', onPress: () => updateSettings({ autoDelete: '30d' }) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const managePasscode = () => {
    if (!settings.passcodeEnabled) {
      openPinModal('create');
      return;
    }

    Alert.alert('Senha de bloqueio', 'Gerencie o PIN local do app.', [
      { text: 'Alterar PIN', onPress: () => openPinModal('change') },
      {
        text: 'Desativar',
        style: 'destructive',
        onPress: () => updateSettings({ passcodeEnabled: false, passcode: null }),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const manageAccessKeys = () => {
    Alert.alert(
      'Chaves de acesso',
      settings.accessKeysEnabled
        ? 'As chaves de acesso estao ativadas neste aparelho.'
        : 'Ative uma camada local para marcar este aparelho como confiavel.',
      [
        {
          text: settings.accessKeysEnabled ? 'Desativar' : 'Ativar',
          onPress: () => updateSettings({ accessKeysEnabled: !settings.accessKeysEnabled }),
          style: settings.accessKeysEnabled ? 'destructive' : 'default',
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const manageBlockedUsers = () => {
    if (settings.blockedUsers.length === 0) {
      Alert.alert('Usuarios bloqueados', 'Voce ainda nao bloqueou nenhum usuario.');
      return;
    }

    Alert.alert('Usuarios bloqueados', `${settings.blockedUsers.length} usuario(s) bloqueado(s).`, [
      { text: 'Limpar lista', style: 'destructive', onPress: () => updateSettings({ blockedUsers: [] }) },
      { text: 'OK' },
    ]);
  };

  const manageDevices = () => {
    Alert.alert('Dispositivos', `${settings.activeDevices} dispositivo(s) conectado(s).`, [
      {
        text: 'Encerrar outras sessoes',
        style: 'destructive',
        onPress: () => {
          updateSettings({ activeDevices: 1 });
          Alert.alert('Dispositivos', 'Outras sessoes foram marcadas como encerradas neste aparelho.');
        },
      },
      { text: 'OK' },
    ]);
  };

  const chooseVisibility = (
    title: string,
    field: 'phoneVisibility' | 'lastSeenVisibility',
  ) => {
    Alert.alert(title, 'Escolha quem pode ver esta informacao.', [
      { text: 'Todos', onPress: () => updateSettings({ [field]: 'everyone' }) },
      { text: 'Meus Contatos', onPress: () => updateSettings({ [field]: 'contacts' }) },
      { text: 'Ninguem', onPress: () => updateSettings({ [field]: 'nobody' }) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const statusColors = useMemo(
    () => ({
      active: colors.primary,
      inactive: colors.textSecondary,
    }),
    [colors.primary, colors.textSecondary]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollInside}>
        <View style={styles.cardSection}>
          <Text style={[styles.sectionHeader, { color: colors.primary }]}>Seguranca</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SecurityItem
              icon="shield-checkmark-outline"
              label="Verificacao em Duas Etapas"
              value={twoStepEnabled ? 'Ativada' : 'Desativada'}
              valueColor={twoStepEnabled ? statusColors.active : statusColors.inactive}
              onPress={() => {
                if (twoStepEnabled) {
                  navigation.navigate('TwoStepVerifyPasswordSettings', { mode: 'settings' });
                  return;
                }

                navigation.navigate('TwoStepIntro');
              }}
            />
            <Divider />

            <SecurityItem
              icon="timer-outline"
              label="Autoexcluir Mensagens"
              value={AUTO_DELETE_LABELS[settings.autoDelete]}
              valueColor={settings.autoDelete === 'off' ? statusColors.inactive : statusColors.active}
              onPress={chooseAutoDelete}
            />
            <Divider />

            <SecurityItem
              icon="lock-closed-outline"
              label="Senha de Bloqueio"
              value={passcodeValue}
              valueColor={settings.passcodeEnabled ? statusColors.active : statusColors.inactive}
              onPress={managePasscode}
            />
            <Divider />

            <SecurityItem
              icon="key-outline"
              label="Chaves de Acesso"
              value={accessKeyValue}
              valueColor={settings.accessKeysEnabled ? statusColors.active : statusColors.inactive}
              onPress={manageAccessKeys}
            />
            <Divider />

            <SecurityItem
              icon="hand-left-outline"
              label="Usuarios Bloqueados"
              value={blockedValue}
              valueColor={settings.blockedUsers.length > 0 ? statusColors.active : statusColors.inactive}
              onPress={manageBlockedUsers}
            />
            <Divider />

            <SecurityItem
              icon="laptop-outline"
              label="Dispositivos"
              value={devicesValue}
              valueColor={statusColors.active}
              onPress={manageDevices}
            />
          </View>

          <Text style={[styles.sectionHeader, { color: colors.primary, marginTop: 16 }]}>Privacidade</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SecurityItem
              icon="call-outline"
              label="Numero de Telefone"
              value={VISIBILITY_LABELS[settings.phoneVisibility]}
              valueColor={colors.primary}
              onPress={() => chooseVisibility('Numero de telefone', 'phoneVisibility')}
            />
            <Divider />
            <SecurityItem
              icon="time-outline"
              label="Visto por ultimo"
              value={VISIBILITY_LABELS[settings.lastSeenVisibility]}
              valueColor={colors.primary}
              onPress={() => chooseVisibility('Visto por ultimo', 'lastSeenVisibility')}
            />
          </View>
        </View>
      </ScrollView>

      <PinModal
        visible={pinModalVisible}
        title={pinMode === 'create' ? 'Criar senha de bloqueio' : 'Alterar senha de bloqueio'}
        pin={pin}
        pinConfirm={pinConfirm}
        onChangePin={setPin}
        onChangeConfirm={setPinConfirm}
        onCancel={closePinModal}
        onSave={savePin}
      />
    </SafeAreaView>
  );
}

function PinModal({
  visible,
  title,
  pin,
  pinConfirm,
  onChangePin,
  onChangeConfirm,
  onCancel,
  onSave,
}: {
  visible: boolean;
  title: string;
  pin: string;
  pinConfirm: string;
  onChangePin: (value: string) => void;
  onChangeConfirm: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
            Use um PIN local de 4 a 6 numeros.
          </Text>

          <TextInput
            value={pin}
            onChangeText={(value) => onChangePin(value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Novo PIN"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            secureTextEntry
            style={[styles.pinInput, { color: colors.textPrimary, borderColor: colors.separator }]}
          />
          <TextInput
            value={pinConfirm}
            onChangeText={(value) => onChangeConfirm(value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Confirmar PIN"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            secureTextEntry
            style={[styles.pinInput, { color: colors.textPrimary, borderColor: colors.separator }]}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalButton} onPress={onCancel} activeOpacity={0.75}>
              <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.primary }]} onPress={onSave} activeOpacity={0.75}>
              <Text style={[styles.modalButtonText, { color: colors.textOnPrimary }]}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SecurityItem({
  icon,
  label,
  value,
  valueColor,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowLeft}>
        <Ionicons name={icon as any} size={24} color={colors.textSecondary} style={styles.icon} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.value, { color: valueColor || colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
        {onPress && <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={{ marginLeft: 4 }} />}
      </View>
    </TouchableOpacity>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollInside: {
    paddingBottom: 40,
  },
  cardSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  icon: {
    marginRight: 16,
    width: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
    maxWidth: 150,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '48%',
  },
  divider: {
    height: 0.5,
    marginLeft: 56,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    marginTop: 6,
    marginBottom: 14,
  },
  pinInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 10,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalButton: {
    minWidth: 96,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
