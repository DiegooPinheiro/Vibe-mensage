import React from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../theme/spacing';
import useTheme from '../hooks/useTheme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import useAuth from '../hooks/useAuth';

type Props = NativeStackScreenProps<RootStackParamList, 'Privacy'>;

export default function PrivacyScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { userProfile, refreshProfile } = useAuth();
  const twoStepEnabled = userProfile?.twoStepEnabled ?? false;

  useFocusEffect(
    React.useCallback(() => {
      refreshProfile();
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollInside}>
        <View style={styles.cardSection}>
          
          {/* Seção Segurança */}
          <Text style={[styles.sectionHeader, { color: colors.primary }]}>Segurança</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            
            <SecurityItem 
              icon="shield-checkmark-outline" 
              label="Verificação em Duas Etapas" 
              value={twoStepEnabled ? "Ativada" : "Desativada"} 
              valueColor={twoStepEnabled ? colors.primary : colors.textSecondary}
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
              value="Desativada" 
            />
            <Divider />

            <SecurityItem 
              icon="lock-closed-outline" 
              label="Senha de Bloqueio" 
              value="Desativada" 
            />
            <Divider />

            <SecurityItem 
              icon="key-outline" 
              label="Chaves de Acesso" 
              value="Desativada" 
            />
            <Divider />

            <SecurityItem 
              icon="hand-left-outline" 
              label="Usuários Bloqueados" 
              value="160" 
              valueColor={colors.primary}
            />
            <Divider />

            <SecurityItem 
              icon="laptop-outline" 
              label="Dispositivos" 
              value="1" 
              valueColor={colors.primary}
              onPress={() => Alert.alert('Dispositivos', 'Gerenciamento de dispositivos em breve.')}
            />
          </View>

          {/* Seção Privacidade */}
          <Text style={[styles.sectionHeader, { color: colors.primary, marginTop: 16 }]}>Privacidade</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <SecurityItem 
              icon="call-outline" 
              label="Número de Telefone" 
              value="Meus Contatos" 
              valueColor={colors.primary}
            />
            <Divider />
            <SecurityItem 
              icon="time-outline" 
              label="Visto por último" 
              value="Todos" 
              valueColor={colors.primary}
            />
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SecurityItem({ 
  icon, 
  label, 
  value, 
  valueColor, 
  onPress
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
        <Text style={[styles.value, { color: valueColor || colors.textSecondary }]}>{value}</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: 0.5,
    marginLeft: 56,
  },
});
