import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SectionList,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { RootStackParamList } from '../navigation/types';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';
import { NewContactModal } from '../components/NewContactModal';
import useTheme from '../hooks/useTheme';
import { chatListUsers, chatSyncContacts } from '../services/chatApi';
import { getChatSession } from '../services/chatSession';
import { CACHE_KEYS, loadCache, saveCache } from '../services/persistentCache';
import type { ChatApiUser } from '../types/chatApi';
import useOnlineStatusByIdentity from '../hooks/useOnlineStatusByIdentity';

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>;

type ContactSection = {
  title: string;
  data: ChatApiUser[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ContactsScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<ChatApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [noSession, setNoSession] = useState(false);
  const [contactsPermissionDenied, setContactsPermissionDenied] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const hasFetchedRef = useRef(false);

  const loadUsers = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        const cachedStr = await loadCache<ChatApiUser[]>(CACHE_KEYS.CONTACTS);
        if (cachedStr && cachedStr.length > 0) {
          setUsers(cachedStr);
          setNoSession(false);
          // Don't show loading spinner if we have cached data
        } else {
          setLoading(true);
          setNoSession(false);
        }
      }

      const session = await getChatSession();
      if (!session?.userId) {
        setNoSession(true);
        return;
      }
      
      let fetched: ChatApiUser[] = [];
      const { status } = await Contacts.requestPermissionsAsync();

      if (status === 'granted') {
        setContactsPermissionDenied(false);
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
        });

        const phones: string[] = [];
        data.forEach((contact) => {
          contact.phoneNumbers?.forEach((phone) => {
            if (phone.number) {
              // Limpeza básica: remove tudo que não é dígito ou +
              let clean = phone.number.replace(/[^\d+]/g, '');
              if (clean.length < 8) return;

              // Adiciona o número limpo original
              phones.push(clean);

              // Se começar com +, adiciona versão sem +
              if (clean.startsWith('+')) {
                phones.push(clean.substring(1));
              } else {
                // Se não tem +, tenta com +55 (Brasil) que é o padrão do app
                // Se o número começar com 0 (ex: 011...), remove o 0 antes de por +55
                if (clean.startsWith('0')) {
                  const noZero = clean.substring(1);
                  phones.push(`+55${noZero}`);
                  phones.push(`55${noZero}`);
                } else if (!clean.startsWith('55')) {
                  // Se não tem 55, adiciona tanto com +55 quanto com 55
                  phones.push(`+55${clean}`);
                  phones.push(`55${clean}`);
                } else {
                  // Se já começa com 55 mas não tem +, adiciona com +
                  phones.push(`+${clean}`);
                }
              }
            }
          });
        });

        if (phones.length > 0) {
          // Remove duplicatas e valores vazios
          const uniquePhones = Array.from(new Set(phones)).filter(p => !!p && p.length >= 8);
          fetched = await chatSyncContacts(uniquePhones);
        } else {
          fetched = await chatListUsers();
        }
      } else {
        // Se negar a permissão, lista vazia e bloqueada
        setContactsPermissionDenied(true);
        fetched = [];
      }

      setUsers(fetched);
      await saveCache(CACHE_KEYS.CONTACTS, fetched);
    } catch (error: any) {
      console.error('[ContactsScreen] Erro ao buscar contatos:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers])
  );

  const handleSaveContact = async (data: { firstName: string, lastName: string, phone: string, syncWithPhone: boolean }) => {
    try {
      if (data.syncWithPhone) {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
          // Normaliza o número para garantir o +55 se necessário
          let formattedPhone = data.phone.replace(/[^\d+]/g, '');
          if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('0')) {
              formattedPhone = `+55${formattedPhone.substring(1)}`;
            } else if (!formattedPhone.startsWith('55')) {
              formattedPhone = `+55${formattedPhone}`;
            } else {
              formattedPhone = `+${formattedPhone}`;
            }
          }

          const contact: any = {
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumbers: [{
              label: 'mobile',
              number: formattedPhone
            }],
          };
          
          await Contacts.addContactAsync(contact);
          loadUsers(true); // Tenta um re-sync silencioso
        } else {
          Alert.alert('Permissão Negada', 'Não temos permissão para salvar contatos na sua agenda.');
        }
      } else {
        Alert.alert('Aviso', 'A sincronização com o celular está desativada. Para que o contato apareça aqui, ele precisa ser salvo na sua agenda.');
      }
    } catch (error) {
      console.error('[ContactsScreen] Erro ao salvar contato:', error);
      Alert.alert('Erro', 'Não foi possível salvar o contato na sua agenda.');
    }
  };

  const filteredUsers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((u) => {
      const nome = (u.nome || '').toLowerCase();
      const username = (u.username || '').toLowerCase();
      return nome.includes(normalized) || username.includes(normalized);
    });
  }, [search, users]);

  const sections = useMemo<ContactSection[]>(() => {
    const sorted = [...filteredUsers].sort((a, b) => (a.nome || a.username).localeCompare(b.nome || b.username));
    const grouped = new Map<string, ChatApiUser[]>();

    sorted.forEach((user) => {
      const display = user.nome || user.username;
      const first = display.trim().charAt(0).toUpperCase() || '#';
      const key = /[A-Z]/.test(first) ? first : '#';

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(user);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, data]) => ({ title, data }));
  }, [filteredUsers]);

  const startChat = (user: ChatApiUser) => {
    navigation.navigate('Chat', {
      userId: user._id,
      name: user.nome || user.username,
      avatar: user.foto || null,
      username: user.username,
      firebaseUid: user.firebaseUid,
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Fixed Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {loading ? 'Carregando...' : 'Contatos'}
        </Text>
        <TouchableOpacity style={styles.headerAction} onPress={() => loadUsers()}>
          <MaterialCommunityIcons name="playlist-check" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {noSession ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>
            Sessão não encontrada. Faça login novamente.
          </Text>
          <TouchableOpacity
            onPress={() => loadUsers()}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : contactsPermissionDenied ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Ionicons name="people-circle-outline" size={80} color={colors.textSecondary} style={{ marginBottom: 16 }} />
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 }}>
            Encontre seus Amigos
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
            Para conversar com seus amigos no Vibe, você precisa permitir o acesso aos contatos da sua agenda.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openSettings()}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Permitir Acesso</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.sectionContent, { flexGrow: 1 }]}
          style={{ flex: 1 }}
          ListHeaderComponent={
            <View>
              <View style={[styles.searchWrap, { backgroundColor: isDark ? '#1C1C1E' : '#E5E5EA' }]}>
                <Ionicons name="search-outline" size={20} color={colors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  placeholder="Buscar Contatos"
                  placeholderTextColor={colors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>

              <View style={[styles.actionsCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
                <TouchableOpacity 
                  style={[styles.actionRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]} 
                  activeOpacity={0.7}
                  onPress={() => Alert.alert('Convidar Amigos', 'O envio de links de convite pelo WhatsApp/SMS estará disponível em breve!')}
                >
                  <View style={[styles.sideLetterWrap, { alignItems: 'flex-start' }]}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#2196F3' }]}>
                      <Ionicons name="person-add" size={16} color="#FFF" />
                    </View>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.actionText, { color: colors.textPrimary }]}>Convidar Amigos</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]} 
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('NewGroup')}
                >
                  <View style={[styles.sideLetterWrap, { alignItems: 'flex-start' }]}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#4CAF50' }]}>
                      <Ionicons name="people" size={16} color="#FFF" />
                    </View>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.actionText, { color: colors.textPrimary }]}>Novo Grupo</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]} 
                  activeOpacity={0.7}
                  onPress={() => Alert.alert('Chamadas Recentes', 'O sistema de Voz e Vídeo por WebRTC será lançado em breve!')}
                >
                  <View style={[styles.sideLetterWrap, { alignItems: 'flex-start' }]}>
                    <View style={[styles.actionIconBg, { backgroundColor: '#FF9800' }]}>
                      <Ionicons name="call" size={16} color="#FFF" />
                    </View>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.actionText, { color: colors.textPrimary }]}>Chamadas recentes</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.actionRow} 
                  activeOpacity={0.7}
                  onPress={async () => {
                    const session = await getChatSession();
                    if (session?.userId) {
                      navigation.navigate('Chat', {
                        userId: session.userId,
                        name: 'Mensagens Salvas',
                        avatar: null,
                        username: 'me',
                      });
                    }
                  }}
                >
                  <View style={[styles.sideLetterWrap, { alignItems: 'flex-start' }]}>
                    <View style={[styles.actionIconBg, { backgroundColor: colors.primary }]}>
                      <Ionicons name="bookmark" size={16} color="#FFF" />
                    </View>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.actionText, { color: colors.textPrimary }]}>Mensagens Salvas</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[styles.listCardTop, { backgroundColor: colors.surface }]}>
                <Text style={[styles.listTitle, { color: colors.primary }]}>Listado por Nome</Text>
              </View>
            </View>
          }
          renderItem={({ item, index, section }) => {
            const displayName = item.nome || item.username;
            return (
              <View style={[styles.contactRowWrap, { backgroundColor: colors.surface }]}>
                {index === 0 ? (
                  <View style={styles.sideLetterWrap}>
                    <Text style={[styles.sideLetter, { color: colors.textSecondary }]}>{section.title}</Text>
                  </View>
                ) : (
                  <View style={styles.sideLetterWrap} />
                )}
                <ContactPresenceRow user={item} displayName={displayName} onPress={() => startChat(item)} />
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={[styles.emptyStateWrap, { backgroundColor: colors.surface }]}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nenhum contato encontrado</Text>
            </View>
          }
          ListFooterComponent={<View style={[styles.listCardBottom, { backgroundColor: colors.surface, marginTop: -1 }]} />}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 82, backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="person-add" size={24} color="#ffffff" />
      </TouchableOpacity>

      <NewContactModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSaveContact}
      />
    </SafeAreaView>
  );
}

function ContactPresenceRow({
  user,
  displayName,
  onPress,
}: {
  user: ChatApiUser;
  displayName: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { online, statusText } = useOnlineStatusByIdentity({
    uid: user.firebaseUid,
    email: user.username,
    enabled: !!user.firebaseUid || !!user.username,
  });

  return (
    <TouchableOpacity style={styles.contactRow} activeOpacity={0.75} onPress={onPress}>
      <Avatar uri={user.foto || null} name={displayName} size={42} online={online} />
      <View style={styles.contactInfo}>
        <Text style={[styles.contactName, { color: colors.textPrimary }]}>{displayName}</Text>
        <Text style={[styles.contactStatus, { color: colors.textSecondary }]} numberOfLines={1}>
          {statusText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
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
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  actionsCard: {
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  listCardTop: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  listCardBottom: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    height: 16,
  },
  emptyStateWrap: {
    paddingBottom: 24,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionContent: {
    paddingBottom: 120,
  },
  contactRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sideLetterWrap: {
    width: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideLetter: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  contactRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  contactInfo: {
    marginLeft: 14,
    flex: 1,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  contactStatus: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
  },
});
