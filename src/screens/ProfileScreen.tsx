import React, { useState, useEffect, useCallback } from "react";
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, Modal } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from "../navigation/types";
import { getUserProfile } from "../services/authService";
import Avatar from "../components/Avatar";
import LoadingSpinner from "../components/LoadingSpinner";
import { UserProfile } from "../types/user";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import useAuth from "../hooks/useAuth";
import useTheme from "../hooks/useTheme";
import { useSettings } from "../context/SettingsContext";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export default function ProfileScreen({ navigation }: Props) {
  const { uid: currentUserId, displayName: authName, photoURL: authPhoto } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { setMenuVisible: setGlobalMenuVisible } = useSettings();
  const [localMenuVisible, setLocalMenuVisible] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const loadProfile = useCallback(async (isInitial = false) => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }
    try {
      if (isInitial) setLoading(true);
      const data = await getUserProfile(currentUserId);
      if (data) {
        setProfile(data as UserProfile);
      }
    } catch (error) {
      console.error('[ProfileScreen] Erro ao carregar perfil:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadProfile(true);
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile(false);
    }, [loadProfile])
  );

  const displayName = profile?.displayName?.trim() || authName || "Sem Nome";
  const photo = profile?.photoURL || authPhoto || null;
  const username = profile?.username?.trim() ? `@${profile.username}` : "@username";
  const phone = profile?.phone?.trim() || "Adicionar Celular";
  const birthday = profile?.birthday?.trim() || "Adicionar Aniversário";

  if (!profile && loading) {
    return <LoadingSpinner message="Carregando perfil..." />;
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.topBarButton}
          activeOpacity={0.75}
          onPress={() => Alert.alert("Em breve", "O QR Code do perfil ainda está em desenvolvimento.")}
        >
          <Ionicons name="qr-code-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarButton} onPress={() => setLocalMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}>
        <View style={styles.profileHeader}>
          <Avatar
            uri={photo}
            name={displayName}
            size={90}
            online={false}
          />
          <Text style={[styles.name, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.status, { color: colors.textSecondary }]}>online</Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.surface }]} 
            onPress={() => navigation.navigate("EditProfile")}
          >
            <MaterialIcons name="add-a-photo" size={22} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Definir Foto</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <MaterialIcons name="edit" size={22} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Editar Informações</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate("Settings")}
          >
            <MaterialIcons name="settings" size={22} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Configurações</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <View style={styles.infoBlock}>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{phone}</Text>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Celular</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{username}</Text>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Nome de Usuário</Text>
          </View>

          <View style={[styles.infoBlock, { marginBottom: 0 }]}>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{birthday}</Text>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Aniversário</Text>
          </View>
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


            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.75}
              onPress={() => setLocalMenuVisible(false)}
            >
              <Ionicons name="link-outline" size={22} color={colors.textPrimary} />
              <Text style={[styles.menuText, { color: colors.textPrimary }]}>Copiar link do perfil</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 10,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  topBarButton: {
    width: 36,
    height: 36,
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 16,
  },
  profileHeader: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 24,
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 12,
  },
  status: {
    fontSize: 14,
    marginTop: 4,
  },
  actionButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
  },
  infoCard: {
    borderRadius: 12,
    marginHorizontal: 16,
    padding: 16,
    marginBottom: 24,
  },
  infoBlock: {
    marginBottom: 16,
  },
  infoValue: {
    fontSize: 16,
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
  },

  menuBackdrop: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute',
    right: 14,
    width: 250,
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
    fontSize: 16,
    fontWeight: '500',
  },
});
