import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Animated,
  Platform,
  Dimensions,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useSettings } from '../context/SettingsContext';
import useTheme from '../hooks/useTheme';
import MessageBubble from '../components/MessageBubble';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { WallpaperPicker } from '../components/WallpaperPicker';
import { type WallpaperConfig } from '../services/wallpaperService';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatSettings'>;

export default function ChatSettingsScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const {
    wallpaper, setWallpaper,
    chatThemeColor, setChatThemeColor,
    textSize, setTextSize,
    bubbleRadius, setBubbleRadius,
    chatListView, setChatListView,
    animationsEnabled, setAnimationsEnabled,
    autoNightMode, setAutoNightMode,
    raiseToListen, setRaiseToListen,
    raiseToSpeak, setRaiseToSpeak,
    pauseOnRecording, setPauseOnRecording,
    tapNextMedia, setTapNextMedia,
    directShare, setDirectShare,
    showAdultContent, setShowAdultContent,
    stickerSuggestions, setStickerSuggestions,
    emojiSuggestions, setEmojiSuggestions,
    reactionsEnabled, setReactionsEnabled,
    sendWithEnter, setSendWithEnter,
    distanceUnit, setDistanceUnit,
    toggleTheme,
  } = useSettings();

  const [wallpaperModalVisible, setWallpaperModalVisible] = useState(false);

  const THEMES = [
    { id: 'cyan', color: '#0088cc', bgLight: '#e6f4fe', bgDark: '#1c2431', label: 'Cyan' },
    { id: 'purple', color: '#8e85ee', bgLight: '#f0e6ff', bgDark: '#232d31', label: 'Purple' },
    { id: 'mint', color: '#4fdca5', bgLight: '#e5fcf3', bgDark: '#1c312a', label: 'Mint' },
    { id: 'orange', color: '#f27a21', bgLight: '#fef2e6', bgDark: '#31271c', label: 'Orange' },
    { id: 'dark', color: '#314151', bgLight: '#f0f2f5', bgDark: '#0e1621', label: 'Dark' },
    { id: 'pink', color: '#e0549c', bgLight: '#fcecf5', bgDark: '#311c26', label: 'Pink' },
  ];

  const handleThemeSelect = (themeId: string) => {
    const selected = THEMES.find(t => t.id === themeId);
    if (!selected) return;

    // 1. Atualiza apenas a cor temática (balões, acentos)
    setChatThemeColor(selected.color);
  };

  const showStickerSettings = () => {
    Alert.alert('Stickers e Emojis', 'Escolha o que deseja ajustar.', [
      {
        text: `${stickerSuggestions ? 'Desativar' : 'Ativar'} sugestoes de stickers`,
        onPress: () => setStickerSuggestions(!stickerSuggestions),
      },
      {
        text: `${emojiSuggestions ? 'Desativar' : 'Ativar'} sugestoes de emojis`,
        onPress: () => setEmojiSuggestions(!emojiSuggestions),
      },
      {
        text: `${reactionsEnabled ? 'Desativar' : 'Ativar'} reacoes`,
        onPress: () => setReactionsEnabled(!reactionsEnabled),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const chooseDistanceUnit = () => {
    Alert.alert('Unidade de distancia', 'Escolha como mostrar distancias no app.', [
      { text: 'Automatico', onPress: () => setDistanceUnit('automatic') },
      { text: 'Quilometros', onPress: () => setDistanceUnit('metric') },
      { text: 'Milhas', onPress: () => setDistanceUnit('imperial') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionHeader, { color: colors.primary }]}>{title}</Text>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Configurações de Chats</Text>
        <TouchableOpacity style={styles.menuBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollInside} 
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {/* CHAT PREVIEW - AGORA DENTRO DO SCROLLVIEW PARA EVITAR VAZAMENTOS E ROLAR NATURAMENTE */}
        <View style={[
          styles.previewContainer, 
          { backgroundColor: wallpaper.type === 'color' ? wallpaper.value : (isDark ? '#1c2431' : '#d6e8c4') }
        ]}>
          {(wallpaper.type === 'pattern' || wallpaper.type === 'color') && (
            <Image 
              source={require('../../assets/chat_bg_doodle.png')} 
              style={[StyleSheet.absoluteFill, { opacity: 0.25 }]} 
              resizeMode="repeat"
            />
          )}
          {wallpaper.type === 'image' && (
            <Image 
              source={{ uri: wallpaper.value }} 
              style={StyleSheet.absoluteFill} 
              resizeMode="cover"
            />
          )}
          <View style={[styles.previewMessageWrap, { padding: 16 }]}>
            <MessageBubble
              message={"Bom dia! 👋\nVocê sabe que horas são?"}
              timestamp={Date.now() / 1000 - 3600}
              isMine={false}
              senderName="D H"
            />
            <MessageBubble
              message="É manhã em Tóquio 😎"
              timestamp={Date.now() / 1000}
              isMine={true}
              status="read"
            />
          </View>
        </View>

        <View style={styles.cardSection}>
        {/* TEXT SIZE SECTION */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {renderSectionHeader('Tamanho do texto das mensagens')}
          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              minimumValue={12}
              maximumValue={30}
              step={1}
              value={textSize}
              onValueChange={setTextSize}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.separator}
              thumbTintColor={colors.primary}
            />
            <Text style={[styles.sliderValue, { color: colors.textPrimary }]}>{textSize}</Text>
          </View>

          <View style={styles.actionRows}>
            <TouchableOpacity 
              style={styles.actionRow} 
              activeOpacity={0.7}
              onPress={() => setWallpaperModalVisible(true)}
            >
              <Ionicons name="images-outline" size={24} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Alterar Papel de Parede</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* THEMES SECTION */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {renderSectionHeader('Tema de cores')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themesList}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.themeItem,
                  { backgroundColor: t.color },
                  chatThemeColor === t.color && { borderColor: colors.primary, borderWidth: 3 }
                ]}
                onPress={() => handleThemeSelect(t.id)}
              >
                {/* Mini bubbles inside theme card to match the requested model */}
                <View style={[styles.miniBubbleTheirs, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)' }]} />
                <View style={[styles.miniBubbleMine, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)' }]} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.actionRows}>
             <TouchableOpacity style={styles.actionRow} onPress={toggleTheme}>
              <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
                Trocar para Modo {isDark ? 'Claro' : 'Escuro'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PREFERENCE SECTION */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <PreferenceRow 
            icon="moon-outline" 
            label="Modo Noturno Automático" 
            value={autoNightMode} 
            subtitle={autoNightMode ? "Ativado" : "Desativado"}
            onToggle={setAutoNightMode}
          />
          <PreferenceRow 
            icon="play-circle-outline" 
            label="Animações" 
            value={animationsEnabled} 
            subtitle="Ajuste efeitos para economizar energia"
            onToggle={setAnimationsEnabled}
          />
          <TouchableOpacity style={styles.actionRowFull} activeOpacity={0.75} onPress={showStickerSettings}>
             <Ionicons name="happy-outline" size={22} color={colors.textSecondary} />
             <View style={styles.actionTextWrap}>
                <Text style={[styles.actionLabelMain, { color: colors.textPrimary }]}>Stickers e Emojis</Text>
                <Text style={styles.actionSublabel}>
                  {[
                    stickerSuggestions ? 'Stickers' : null,
                    emojiSuggestions ? 'Emojis' : null,
                    reactionsEnabled ? 'Reacoes' : null,
                  ].filter(Boolean).join(', ') || 'Tudo desativado'}
                </Text>
             </View>
             <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* MEDIA AND SOUNDS SECTION */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
           <Text style={[styles.sectionTitleSmall, { color: colors.primary }]}>Mídias e Sons</Text>
           <PreferenceRow label="Toque para ver a próxima mídia" value={tapNextMedia} onToggle={setTapNextMedia} isSubtle subtitle="Toque perto da borda para navegar" />
           <PreferenceRow label="Levantar Para Ouvir" value={raiseToListen} onToggle={setRaiseToListen} isSubtle subtitle="O som muda para o auricular ao levar ao ouvido" />
           <PreferenceRow label="Levantar para Falar" value={raiseToSpeak} onToggle={setRaiseToSpeak} isSubtle subtitle="Grava mensagens de voz ao levar o telefone ao ouvido" />
           <PreferenceRow label="Pausar música durante a gravação" value={pauseOnRecording} onToggle={setPauseOnRecording} isSubtle subtitle="Pausa música ao iniciar gravação" />
        </View>

        {/* OTHER SETTINGS */}
        <View style={[styles.card, { backgroundColor: colors.surface, marginBottom: 40 }]}>
           <Text style={[styles.sectionTitleSmall, { color: colors.primary }]}>Outras Configurações</Text>
           <PreferenceRow label="Compartilhamento Direto" value={directShare} onToggle={setDirectShare} isSubtle subtitle="Mostra chats recentes no menu compartilhar" />
           <PreferenceRow label="Mostrar Conteúdo +18" value={showAdultContent} onToggle={setShowAdultContent} isSubtle subtitle="Não ocultar mídias (+18)" />
           <PreferenceRow label="Enviar com Enter" value={sendWithEnter} onToggle={setSendWithEnter} isSubtle />
           <PreferenceRow
             label="Unidade de Distancia"
             value={false}
             isSubtle
             isLink
             valueLabel={distanceUnit === 'automatic' ? 'Automatico' : distanceUnit === 'metric' ? 'Quilometros' : 'Milhas'}
             onPress={chooseDistanceUnit}
           />
        </View>
        </View>

      </ScrollView>

      <WallpaperPicker 
        visible={wallpaperModalVisible}
        onClose={() => setWallpaperModalVisible(false)}
        onSelect={(config: WallpaperConfig) => {
          setWallpaper(config);
        }}
        currentWallpaper={wallpaper}
      />
    </SafeAreaView>
  );
}

interface PreferenceRowProps {
  icon?: any;
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle?: (val: boolean) => void;
  isSubtle?: boolean;
  isLink?: boolean;
  valueLabel?: string;
  onPress?: () => void;
}

function PreferenceRow({ 
  icon, 
  label, 
  subtitle, 
  value, 
  onToggle, 
  isSubtle = false,
  isLink = false,
  valueLabel = '',
  onPress,
}: PreferenceRowProps) {
  const { colors } = useTheme();
  const RowContainer = isLink ? TouchableOpacity : View;
  
  return (
    <RowContainer style={styles.prefRow} activeOpacity={0.75} onPress={onPress as any}>
       <View style={styles.prefLeft}>
          {icon && <Ionicons name={icon} size={22} color={colors.textSecondary} style={styles.prefIcon} />}
          <View style={styles.prefTextWrap}>
             <Text style={[isSubtle ? styles.prefLabelSubtle : styles.actionLabelMain, { color: colors.textPrimary }]}>{label}</Text>
             {subtitle && <Text style={styles.actionSublabel}>{subtitle}</Text>}
          </View>
       </View>
       {isLink ? (
         <View style={styles.prefLinkRight}>
           <Text style={[styles.prefValueLink, { color: colors.primary }]}>{valueLabel}</Text>
           <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
         </View>
       ) : (
         <Switch 
           value={value} 
           onValueChange={onToggle}
           thumbColor={Platform.OS === 'android' ? (value ? colors.primary : '#ccc') : undefined}
           trackColor={{ true: colors.primary + '80', false: '#ccc' }}
         />
       )}
    </RowContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 56,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 16,
  },
  menuBtn: {
    padding: 8,
  },
  scrollInside: {
    paddingBottom: 40,
  },
  cardSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    width: 24,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
  },
  previewContainer: {
    width: '100%',
    padding: 0,
    height: 200,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  previewMessageWrap: {
    paddingVertical: 10,
  },
  actionRows: {
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    marginLeft: 16,
    fontWeight: '500',
  },
  divider: {
    height: 0.5,
    marginLeft: 40,
  },
  themesList: {
    paddingVertical: 8,
  },
  themeItem: {
    width: 65,
    height: 95,
    borderRadius: 10,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 10,
    justifyContent: 'flex-start',
  },
  miniBubbleTheirs: {
    width: 28,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 6,
  },
  miniBubbleMine: {
    width: 28,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignSelf: 'flex-end',
    marginTop: 'auto',
    marginBottom: 10,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  prefLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
  },
  prefIcon: {
    marginRight: 16,
  },
  prefTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  actionLabelMain: {
    fontSize: 16,
    fontWeight: '500',
  },
  prefLabelSubtle: {
    fontSize: 16,
    fontWeight: '400',
  },
  actionSublabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  actionRowFull: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  actionTextWrap: {
    marginLeft: 16,
    flex: 1,
  },
  sectionTitleSmall: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  prefValueLink: {
    fontSize: 16,
    fontWeight: '500',
  },
  prefLinkRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  }
});
