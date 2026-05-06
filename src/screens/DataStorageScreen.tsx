import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAppFileCache, getAppFileCacheSize } from '../services/appFileCache';
import { clearAllAppCaches } from '../services/persistentCache';
import { spacing } from '../theme/spacing';
import useTheme from '../hooks/useTheme';
import { AutoDownloadPreference, MediaRetentionPreference, useSettings } from '../context/SettingsContext';

const AUTO_DOWNLOAD_LABELS: Record<AutoDownloadPreference, string> = {
  none: 'Nenhuma midia',
  photos: 'Fotos',
  media: 'Fotos, videos e arquivos',
};

const RETENTION_LABELS: Record<MediaRetentionPreference, string> = {
  '3days': '3 dias',
  '1week': '1 semana',
  '1month': '1 mes',
  forever: 'Para sempre',
};

export default function DataStorageScreen() {
  const { colors } = useTheme();
  const {
    autoDownloadMobile,
    setAutoDownloadMobile,
    autoDownloadWifi,
    setAutoDownloadWifi,
    autoDownloadRoaming,
    setAutoDownloadRoaming,
    dataSaverEnabled,
    setDataSaverEnabled,
    saveIncomingMedia,
    setSaveIncomingMedia,
    mediaRetention,
    setMediaRetention,
  } = useSettings();

  const [cacheSize, setCacheSize] = useState('Calculando...');
  const [isClearing, setIsClearing] = useState(false);

  const refreshCacheSize = useCallback(async () => {
    const size = await getCacheSize();
    setCacheSize(formatBytes(size));
  }, []);

  useEffect(() => {
    refreshCacheSize();
  }, [refreshCacheSize]);

  useFocusEffect(
    useCallback(() => {
      refreshCacheSize();
    }, [refreshCacheSize])
  );

  const chooseAutoDownload = (
    title: string,
    current: AutoDownloadPreference,
    onChange: (value: AutoDownloadPreference) => void,
  ) => {
    Alert.alert(title, 'Escolha o que baixar automaticamente.', [
      { text: 'Nenhuma midia', onPress: () => onChange('none'), style: current === 'none' ? 'cancel' : 'default' },
      { text: 'Fotos', onPress: () => onChange('photos'), style: current === 'photos' ? 'cancel' : 'default' },
      { text: 'Fotos, videos e arquivos', onPress: () => onChange('media'), style: current === 'media' ? 'cancel' : 'default' },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const chooseRetention = () => {
    Alert.alert('Manter midias', 'Escolha por quanto tempo manter arquivos em cache.', [
      { text: '3 dias', onPress: () => setMediaRetention('3days'), style: mediaRetention === '3days' ? 'cancel' : 'default' },
      { text: '1 semana', onPress: () => setMediaRetention('1week'), style: mediaRetention === '1week' ? 'cancel' : 'default' },
      { text: '1 mes', onPress: () => setMediaRetention('1month'), style: mediaRetention === '1month' ? 'cancel' : 'default' },
      { text: 'Para sempre', onPress: () => setMediaRetention('forever'), style: mediaRetention === 'forever' ? 'cancel' : 'default' },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const clearCache = () => {
    Alert.alert('Limpar cache', 'Isso remove conversas em cache e arquivos temporarios baixados pelo app. Suas mensagens na nuvem nao serao apagadas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          setIsClearing(true);
          try {
            await clearAllAppCaches();
            await clearAppFileCache();
            await refreshCacheSize();
            Alert.alert('Cache limpo', 'Os arquivos temporarios foram removidos.');
          } catch (error: any) {
            Alert.alert('Erro', error?.message || 'Nao foi possivel limpar o cache agora.');
          } finally {
            setIsClearing(false);
          }
        },
      },
    ]);
  };

  const resetSettings = () => {
    Alert.alert('Redefinir dados e armazenamento', 'Voltar para as configuracoes padrao?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Redefinir',
        onPress: () => {
          setAutoDownloadMobile('photos');
          setAutoDownloadWifi('media');
          setAutoDownloadRoaming('none');
          setDataSaverEnabled(false);
          setSaveIncomingMedia(false);
          setMediaRetention('1month');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Uso de disco</Text>
          <InfoRow
            icon="folder-outline"
            label="Cache do app"
            value={cacheSize}
          />
          <ActionRow
            icon="trash-outline"
            label="Limpar cache"
            subtitle="Remove listas, mensagens em cache e temporarios"
            actionColor="#FF3B30"
            loading={isClearing}
            onPress={clearCache}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Download automatico</Text>
          <OptionRow
            icon="phone-portrait-outline"
            label="Ao usar dados moveis"
            value={AUTO_DOWNLOAD_LABELS[autoDownloadMobile]}
            onPress={() => chooseAutoDownload('Dados moveis', autoDownloadMobile, setAutoDownloadMobile)}
          />
          <Divider />
          <OptionRow
            icon="wifi-outline"
            label="Ao usar Wi-Fi"
            value={AUTO_DOWNLOAD_LABELS[autoDownloadWifi]}
            onPress={() => chooseAutoDownload('Wi-Fi', autoDownloadWifi, setAutoDownloadWifi)}
          />
          <Divider />
          <OptionRow
            icon="airplane-outline"
            label="Em roaming"
            value={AUTO_DOWNLOAD_LABELS[autoDownloadRoaming]}
            onPress={() => chooseAutoDownload('Roaming', autoDownloadRoaming, setAutoDownloadRoaming)}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Uso de dados</Text>
          <ToggleRow
            label="Economia de dados"
            subtitle="Reduz downloads automaticos fora do Wi-Fi"
            value={dataSaverEnabled}
            onValueChange={setDataSaverEnabled}
          />
          <Divider />
          <ToggleRow
            label="Salvar midia recebida"
            subtitle="Mantem downloads recebidos no dispositivo"
            value={saveIncomingMedia}
            onValueChange={setSaveIncomingMedia}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Armazenamento de midia</Text>
          <OptionRow
            icon="time-outline"
            label="Manter midias"
            value={RETENTION_LABELS[mediaRetention]}
            onPress={chooseRetention}
          />
        </View>

        <TouchableOpacity style={[styles.resetButton, { backgroundColor: colors.surface }]} activeOpacity={0.75} onPress={resetSettings}>
          <Text style={styles.resetText}>Redefinir configuracoes</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon as any} size={22} color={colors.textSecondary} style={styles.icon} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <Text style={[styles.value, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

function OptionRow({ icon, label, value, onPress }: { icon: string; label: string; value: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon as any} size={22} color={colors.textSecondary} style={styles.icon} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.value, { color: colors.primary }]} numberOfLines={1}>{value}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

function ActionRow({
  icon,
  label,
  subtitle,
  actionColor,
  loading,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle: string;
  actionColor: string;
  loading: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.actionRow} activeOpacity={0.75} disabled={loading} onPress={onPress}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon as any} size={22} color={actionColor} style={styles.icon} />
        <View style={styles.textBlock}>
          <Text style={[styles.label, { color: actionColor }]}>{label}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator size="small" color={actionColor} /> : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
    </TouchableOpacity>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onValueChange,
}: {
  label: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.actionRow}>
      <View style={styles.textBlock}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#767577', true: colors.primary + '80' }}
        thumbColor={value ? colors.primary : '#f4f3f4'}
      />
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
}

async function getCacheSize() {
  const asyncStorageBytes = await getAsyncStorageCacheSize();
  const fileSystemBytes = await getAppFileCacheSize();
  return asyncStorageBytes + fileSystemBytes;
}

async function getAsyncStorageCacheSize() {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((key) => key.includes('cache') || key.startsWith('@chat_'));
  if (cacheKeys.length === 0) return 0;

  const entries = await AsyncStorage.multiGet(cacheKeys);
  return entries.reduce((total, [, value]) => total + (value?.length || 0), 0);
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowRight: {
    maxWidth: '54%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    width: 28,
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 40,
    marginVertical: 2,
  },
  resetButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
