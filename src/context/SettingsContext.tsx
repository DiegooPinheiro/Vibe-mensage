import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadWallpaper, saveWallpaper, WallpaperConfig, DEFAULT_WALLPAPER } from '../services/wallpaperService';

type Theme = 'light' | 'dark';
type Language = 'pt' | 'en';
export type AutoDownloadPreference = 'none' | 'photos' | 'media';
export type MediaRetentionPreference = '3days' | '1week' | '1month' | 'forever';

interface SettingsContextType {
  theme: Theme;
  language: Language;
  toggleTheme: () => void;
  setLanguage: (lang: Language) => void;
  menuVisible: boolean;
  setMenuVisible: (visible: boolean) => void;
  
  // Novas configurações de chat
  wallpaper: WallpaperConfig;
  setWallpaper: (config: WallpaperConfig) => void;
  textSize: number;
  setTextSize: (size: number) => void;
  bubbleRadius: number;
  setBubbleRadius: (radius: number) => void;
  chatListView: 'two' | 'three';
  setChatListView: (view: 'two' | 'three') => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  internalBrowser: boolean;
  setInternalBrowser: (enabled: boolean) => void;
  raiseToListen: boolean;
  setRaiseToListen: (enabled: boolean) => void;
  raiseToSpeak: boolean;
  setRaiseToSpeak: (enabled: boolean) => void;
  pauseOnRecording: boolean;
  setPauseOnRecording: (enabled: boolean) => void;
  tapNextMedia: boolean;
  setTapNextMedia: (enabled: boolean) => void;
  directShare: boolean;
  setDirectShare: (enabled: boolean) => void;
  showAdultContent: boolean;
  setShowAdultContent: (enabled: boolean) => void;
  autoNightMode: boolean;
  setAutoNightMode: (enabled: boolean) => void;
  stickerSuggestions: boolean;
  setStickerSuggestions: (enabled: boolean) => void;
  emojiSuggestions: boolean;
  setEmojiSuggestions: (enabled: boolean) => void;
  reactionsEnabled: boolean;
  setReactionsEnabled: (enabled: boolean) => void;
  sendWithEnter: boolean;
  setSendWithEnter: (enabled: boolean) => void;
  distanceUnit: 'automatic' | 'metric' | 'imperial';
  setDistanceUnit: (unit: 'automatic' | 'metric' | 'imperial') => void;
  chatThemeColor: string;
  setChatThemeColor: (color: string) => void;
  autoDownloadMobile: AutoDownloadPreference;
  setAutoDownloadMobile: (value: AutoDownloadPreference) => void;
  autoDownloadWifi: AutoDownloadPreference;
  setAutoDownloadWifi: (value: AutoDownloadPreference) => void;
  autoDownloadRoaming: AutoDownloadPreference;
  setAutoDownloadRoaming: (value: AutoDownloadPreference) => void;
  dataSaverEnabled: boolean;
  setDataSaverEnabled: (enabled: boolean) => void;
  saveIncomingMedia: boolean;
  setSaveIncomingMedia: (enabled: boolean) => void;
  mediaRetention: MediaRetentionPreference;
  setMediaRetention: (value: MediaRetentionPreference) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
  const [language, setLanguageState] = useState<Language>('pt');
  const [menuVisible, setMenuVisible] = useState(false);

  // Estados das novas configurações
  const [wallpaper, setWallpaperState] = useState<WallpaperConfig>(DEFAULT_WALLPAPER);
  const [textSize, setTextSizeState] = useState(17);
  const [bubbleRadius, setBubbleRadiusState] = useState(17);
  const [chatListView, setChatListViewState] = useState<'two' | 'three'>('two');
  const [animationsEnabled, setAnimationsEnabledState] = useState(true);
  const [internalBrowser, setInternalBrowserState] = useState(true);
  const [raiseToListen, setRaiseToListenState] = useState(true);
  const [raiseToSpeak, setRaiseToSpeakState] = useState(false);
  const [pauseOnRecording, setPauseOnRecordingState] = useState(true);
  const [tapNextMedia, setTapNextMediaState] = useState(true);
  const [directShare, setDirectShareState] = useState(true);
  const [showAdultContent, setShowAdultContentState] = useState(false);
  const [autoNightMode, setAutoNightModeState] = useState(false);
  const [stickerSuggestions, setStickerSuggestionsState] = useState(true);
  const [emojiSuggestions, setEmojiSuggestionsState] = useState(true);
  const [reactionsEnabled, setReactionsEnabledState] = useState(true);
  const [sendWithEnter, setSendWithEnterState] = useState(false);
  const [distanceUnit, setDistanceUnitState] = useState<'automatic' | 'metric' | 'imperial'>('automatic');
  const [chatThemeColor, setChatThemeColorState] = useState('#0088cc');
  const [autoDownloadMobile, setAutoDownloadMobileState] = useState<AutoDownloadPreference>('photos');
  const [autoDownloadWifi, setAutoDownloadWifiState] = useState<AutoDownloadPreference>('media');
  const [autoDownloadRoaming, setAutoDownloadRoamingState] = useState<AutoDownloadPreference>('none');
  const [dataSaverEnabled, setDataSaverEnabledState] = useState(false);
  const [saveIncomingMedia, setSaveIncomingMediaState] = useState(false);
  const [mediaRetention, setMediaRetentionState] = useState<MediaRetentionPreference>('1month');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('app_theme');
      const savedLang = await AsyncStorage.getItem('app_lang');
      const s_textSize = await AsyncStorage.getItem('app_text_size');
      const s_bubbleRadius = await AsyncStorage.getItem('app_bubble_radius');
      const s_chatListView = await AsyncStorage.getItem('app_chat_list_view');
      const s_animations = await AsyncStorage.getItem('app_animations');
      const s_browser = await AsyncStorage.getItem('app_internal_browser');
      const s_raise = await AsyncStorage.getItem('app_raise_to_listen');
      const s_raiseSpeak = await AsyncStorage.getItem('app_raise_to_speak');
      const s_pause = await AsyncStorage.getItem('app_pause_on_recording');
      const s_tapNext = await AsyncStorage.getItem('app_tap_next_media');
      const s_directShare = await AsyncStorage.getItem('app_direct_share');
      const s_adultContent = await AsyncStorage.getItem('app_show_adult_content');
      const s_autoNight = await AsyncStorage.getItem('app_auto_night_mode');
      const s_stickers = await AsyncStorage.getItem('app_sticker_suggestions');
      const s_emojis = await AsyncStorage.getItem('app_emoji_suggestions');
      const s_reactions = await AsyncStorage.getItem('app_reactions_enabled');
      const s_enter = await AsyncStorage.getItem('app_send_with_enter');
      const s_unit = await AsyncStorage.getItem('app_distance_unit');
      const s_chatTheme = await AsyncStorage.getItem('app_chat_theme_color');
      const s_autoMobile = await AsyncStorage.getItem('app_auto_download_mobile');
      const s_autoWifi = await AsyncStorage.getItem('app_auto_download_wifi');
      const s_autoRoaming = await AsyncStorage.getItem('app_auto_download_roaming');
      const s_dataSaver = await AsyncStorage.getItem('app_data_saver');
      const s_saveIncoming = await AsyncStorage.getItem('app_save_incoming_media');
      const s_retention = await AsyncStorage.getItem('app_media_retention');
      
      const loadedWallpaper = await loadWallpaper();
      setWallpaperState(loadedWallpaper);

      if (savedTheme) setTheme(savedTheme as Theme);
      if (savedLang) setLanguageState(savedLang as Language);
      if (s_textSize) setTextSizeState(parseInt(s_textSize, 10));
      if (s_bubbleRadius) setBubbleRadiusState(parseInt(s_bubbleRadius, 10));
      if (s_chatListView) setChatListViewState(s_chatListView as 'two' | 'three');
      if (s_animations) setAnimationsEnabledState(s_animations === 'true');
      if (s_browser) setInternalBrowserState(s_browser === 'true');
      if (s_raise) setRaiseToListenState(s_raise === 'true');
      if (s_raiseSpeak) setRaiseToSpeakState(s_raiseSpeak === 'true');
      if (s_pause) setPauseOnRecordingState(s_pause === 'true');
      if (s_tapNext) setTapNextMediaState(s_tapNext === 'true');
      if (s_directShare) setDirectShareState(s_directShare === 'true');
      if (s_adultContent) setShowAdultContentState(s_adultContent === 'true');
      if (s_autoNight) setAutoNightModeState(s_autoNight === 'true');
      if (s_stickers) setStickerSuggestionsState(s_stickers === 'true');
      if (s_emojis) setEmojiSuggestionsState(s_emojis === 'true');
      if (s_reactions) setReactionsEnabledState(s_reactions === 'true');
      if (s_enter) setSendWithEnterState(s_enter === 'true');
      if (s_unit) setDistanceUnitState(s_unit as 'automatic' | 'metric' | 'imperial');
      if (s_chatTheme) setChatThemeColorState(s_chatTheme);
      if (s_autoMobile) setAutoDownloadMobileState(s_autoMobile as AutoDownloadPreference);
      if (s_autoWifi) setAutoDownloadWifiState(s_autoWifi as AutoDownloadPreference);
      if (s_autoRoaming) setAutoDownloadRoamingState(s_autoRoaming as AutoDownloadPreference);
      if (s_dataSaver) setDataSaverEnabledState(s_dataSaver === 'true');
      if (s_saveIncoming) setSaveIncomingMediaState(s_saveIncoming === 'true');
      if (s_retention) setMediaRetentionState(s_retention as MediaRetentionPreference);
    } catch (e) {
      console.error('[SettingsContext] Erro ao carregar configuracoes:', e);
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    await AsyncStorage.setItem('app_theme', newTheme);
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await AsyncStorage.setItem('app_lang', lang);
  };

  // Funções de Setter
  const setWallpaper = async (config: WallpaperConfig) => {
    setWallpaperState(config);
    await saveWallpaper(config);
  };

  const setTextSize = async (size: number) => {
    setTextSizeState(size);
    await AsyncStorage.setItem('app_text_size', String(size));
  };

  const setBubbleRadius = async (radius: number) => {
    setBubbleRadiusState(radius);
    await AsyncStorage.setItem('app_bubble_radius', String(radius));
  };

  const setChatListView = async (view: 'two' | 'three') => {
    setChatListViewState(view);
    await AsyncStorage.setItem('app_chat_list_view', view);
  };

  const setAnimationsEnabled = async (enabled: boolean) => {
    setAnimationsEnabledState(enabled);
    await AsyncStorage.setItem('app_animations', String(enabled));
  };

  const setInternalBrowser = async (enabled: boolean) => {
    setInternalBrowserState(enabled);
    await AsyncStorage.setItem('app_internal_browser', String(enabled));
  };

  const setRaiseToListen = async (enabled: boolean) => {
    setRaiseToListenState(enabled);
    await AsyncStorage.setItem('app_raise_to_listen', String(enabled));
  };

  const setRaiseToSpeak = async (enabled: boolean) => {
    setRaiseToSpeakState(enabled);
    await AsyncStorage.setItem('app_raise_to_speak', String(enabled));
  };

  const setPauseOnRecording = async (enabled: boolean) => {
    setPauseOnRecordingState(enabled);
    await AsyncStorage.setItem('app_pause_on_recording', String(enabled));
  };

  const setTapNextMedia = async (enabled: boolean) => {
    setTapNextMediaState(enabled);
    await AsyncStorage.setItem('app_tap_next_media', String(enabled));
  };

  const setDirectShare = async (enabled: boolean) => {
    setDirectShareState(enabled);
    await AsyncStorage.setItem('app_direct_share', String(enabled));
  };

  const setShowAdultContent = async (enabled: boolean) => {
    setShowAdultContentState(enabled);
    await AsyncStorage.setItem('app_show_adult_content', String(enabled));
  };

  const setAutoNightMode = async (enabled: boolean) => {
    setAutoNightModeState(enabled);
    await AsyncStorage.setItem('app_auto_night_mode', String(enabled));
  };

  const setStickerSuggestions = async (enabled: boolean) => {
    setStickerSuggestionsState(enabled);
    await AsyncStorage.setItem('app_sticker_suggestions', String(enabled));
  };

  const setEmojiSuggestions = async (enabled: boolean) => {
    setEmojiSuggestionsState(enabled);
    await AsyncStorage.setItem('app_emoji_suggestions', String(enabled));
  };

  const setReactionsEnabled = async (enabled: boolean) => {
    setReactionsEnabledState(enabled);
    await AsyncStorage.setItem('app_reactions_enabled', String(enabled));
  };

  const setSendWithEnter = async (enabled: boolean) => {
    setSendWithEnterState(enabled);
    await AsyncStorage.setItem('app_send_with_enter', String(enabled));
  };

  const setDistanceUnit = async (unit: 'automatic' | 'metric' | 'imperial') => {
    setDistanceUnitState(unit);
    await AsyncStorage.setItem('app_distance_unit', unit);
  };

  const setChatThemeColor = async (color: string) => {
    setChatThemeColorState(color);
    await AsyncStorage.setItem('app_chat_theme_color', color);
  };

  const setAutoDownloadMobile = async (value: AutoDownloadPreference) => {
    setAutoDownloadMobileState(value);
    await AsyncStorage.setItem('app_auto_download_mobile', value);
  };

  const setAutoDownloadWifi = async (value: AutoDownloadPreference) => {
    setAutoDownloadWifiState(value);
    await AsyncStorage.setItem('app_auto_download_wifi', value);
  };

  const setAutoDownloadRoaming = async (value: AutoDownloadPreference) => {
    setAutoDownloadRoamingState(value);
    await AsyncStorage.setItem('app_auto_download_roaming', value);
  };

  const setDataSaverEnabled = async (enabled: boolean) => {
    setDataSaverEnabledState(enabled);
    await AsyncStorage.setItem('app_data_saver', String(enabled));
  };

  const setSaveIncomingMedia = async (enabled: boolean) => {
    setSaveIncomingMediaState(enabled);
    await AsyncStorage.setItem('app_save_incoming_media', String(enabled));
  };

  const setMediaRetention = async (value: MediaRetentionPreference) => {
    setMediaRetentionState(value);
    await AsyncStorage.setItem('app_media_retention', value);
  };

  return (
    <SettingsContext.Provider 
      value={{ 
        theme, language, toggleTheme, setLanguage, menuVisible, setMenuVisible,
        wallpaper, setWallpaper,
        textSize, setTextSize,
        bubbleRadius, setBubbleRadius,
        chatListView, setChatListView,
        animationsEnabled, setAnimationsEnabled,
        internalBrowser, setInternalBrowser,
        raiseToListen, setRaiseToListen,
        raiseToSpeak, setRaiseToSpeak,
        pauseOnRecording, setPauseOnRecording,
        tapNextMedia, setTapNextMedia,
        directShare, setDirectShare,
        showAdultContent, setShowAdultContent,
        autoNightMode, setAutoNightMode,
        stickerSuggestions, setStickerSuggestions,
        emojiSuggestions, setEmojiSuggestions,
        reactionsEnabled, setReactionsEnabled,
        sendWithEnter, setSendWithEnter,
        distanceUnit, setDistanceUnit,
        chatThemeColor, setChatThemeColor,
        autoDownloadMobile, setAutoDownloadMobile,
        autoDownloadWifi, setAutoDownloadWifi,
        autoDownloadRoaming, setAutoDownloadRoaming,
        dataSaverEnabled, setDataSaverEnabled,
        saveIncomingMedia, setSaveIncomingMedia,
        mediaRetention, setMediaRetention
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings deve ser usado dentro de um SettingsProvider');
  }
  return context;
}
