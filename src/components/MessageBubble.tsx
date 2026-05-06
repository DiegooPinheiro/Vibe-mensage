import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import useTheme from '../hooks/useTheme';
import { useSettings } from '../context/SettingsContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface MessageBubbleProps {
  id?: string;
  message: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: number;
  isMine: boolean;
  senderName?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  selectionMode?: boolean;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onImagePress?: (payload: { uri: string; timestamp: number; senderName?: string }) => void;
  onVideoPress?: (payload: { uri: string; timestamp: number; senderName?: string }) => void;
  onFilePress?: (payload: { uri: string; fileName: string; mediaType?: string }) => void;
  onAudioPress?: (payload: { uri: string; fileName: string; mediaType?: string }) => void;
  fileOpening?: boolean;
  isAudioPlaying?: boolean;
  audioProgress?: number;
  audioPositionLabel?: string;
  audioDurationLabel?: string;
  audioRate?: number;
  onAudioRatePress?: () => void;
  uploadProgress?: number;
}

export default function MessageBubble({
  id,
  message,
  mediaUrl,
  mediaType,
  timestamp,
  isMine,
  senderName,
  status = 'delivered',
  selectionMode = false,
  selected = false,
  onPress,
  onLongPress,
  onImagePress,
  onVideoPress,
  onFilePress,
  onAudioPress,
  fileOpening = false,
  isAudioPlaying = false,
  audioProgress = 0,
  audioPositionLabel = '0:00',
  audioDurationLabel = '0:00',
  audioRate = 1.0,
  onAudioRatePress,
  uploadProgress,
}: MessageBubbleProps) {
  const { colors, isDark } = useTheme();
  const { textSize, bubbleRadius, dataSaverEnabled } = useSettings();
  const selectAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [mediaPreviewLoaded, setMediaPreviewLoaded] = useState(false);

  useEffect(() => {
    Animated.spring(selectAnim, {
      toValue: selected ? 1 : 0,
      damping: 16,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [selectAnim, selected]);

  useEffect(() => {
    if (!mediaUrl || mediaType !== 'image' || (dataSaverEnabled && !isMine && !mediaPreviewLoaded)) {
      setImageSize(null);
      return;
    }

    let active = true;

    Image.getSize(
      mediaUrl,
      (width, height) => {
        if (!active || !width || !height) return;
        setImageSize({ width, height });
      },
      () => {
        if (!active) return;
        setImageSize(null);
      }
    );

    return () => {
      active = false;
    };
  }, [dataSaverEnabled, isMine, mediaPreviewLoaded, mediaType, mediaUrl]);

  useEffect(() => {
    setMediaPreviewLoaded(false);
  }, [mediaUrl]);
  
  const time = new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const isImage = !!mediaUrl && mediaType === 'image';
  const isVideo = !!mediaUrl && mediaType === 'video';
  const shouldDeferMediaPreview = dataSaverEnabled && !isMine && (isImage || isVideo) && !mediaPreviewLoaded;
  const isAudio = !!mediaUrl && isAudioMedia(mediaType, fileNameFromMessage(message, mediaUrl));
  const showText = !!message?.trim();
  const metaColor = isMine
    ? 'rgba(255, 255, 255, 0.7)' // Sugestão Premium: Branco suave para fundos vibrantes
    : (isDark ? '#7f91a4' : colors.textTimestamp);
  const statusColor = status === 'read'
    ? (isDark ? '#8ec3f5' : '#4fa3f7')
    : status === 'error'
      ? '#ff3b30'
      : isMine
        ? 'rgba(255, 255, 255, 0.7)'
        : colors.chatPrimary;
  const statusIconName =
    status === 'sending'
      ? 'clock-outline'
      : status === 'error'
        ? 'alert-circle-outline'
        : status === 'sent'
          ? 'check'
          : 'check-all';
  const selectionScale = selectAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const selectionOpacity = selectAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });
  const imageFrame = useMemo(() => {
    const maxWidth = 250;
    const maxHeight = 340;
    const minWidth = 160;

    if (!imageSize?.width || !imageSize?.height) {
      return { width: 240, height: 240 };
    }

    const ratio = imageSize.width / imageSize.height;
    let width = imageSize.width;
    let height = imageSize.height;

    if (width > maxWidth) {
      width = maxWidth;
      height = width / ratio;
    }

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    if (width < minWidth) {
      width = minWidth;
      height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }, [imageSize]);
  const bubbleBg = useMemo(() => {
    if (selected) {
      return isMine ? (isDark ? '#6f8ec8' : '#dce7ff') : (isDark ? '#2a3950' : '#edf3ff');
    }
    if (mediaUrl && !showText && isAudio) {
      return isMine ? '#69a9de' : '#5f96d2';
    }
    return isMine ? colors.bubbleMine : colors.bubbleTheirs;
  }, [selected, isMine, isDark, mediaUrl, showText, isAudio, colors]);
  const fileName = useMemo(() => fileNameFromMessage(message, mediaUrl), [mediaUrl, message]);
  const fileExtension = useMemo(() => {
    const parts = fileName.split('.');
    if (parts.length < 2) return 'DOC';
    return parts.pop()!.slice(0, 4).toUpperCase();
  }, [fileName]);
  const fileSubtitle = useMemo(() => {
    if (fileExtension === 'PDF') return 'Documento PDF';
    if (['DOC', 'DOCX'].includes(fileExtension)) return 'Documento';
    if (['XLS', 'XLSX', 'CSV'].includes(fileExtension)) return 'Planilha';
    if (['ZIP', 'RAR', '7Z'].includes(fileExtension)) return 'Arquivo compactado';
    if (['TXT', 'MD'].includes(fileExtension)) return 'Arquivo de texto';
    return 'Toque para abrir';
  }, [fileExtension]);

  return (
    <TouchableOpacity
      key={id}
      activeOpacity={selectionMode ? 0.8 : 0.95}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        selectionMode ? styles.rowSelectionMode : null,
      ]}
    >
      {selectionMode ? (
        <View style={styles.selectionRailLeft}>
          <Animated.View
            style={[
              styles.selectionCircle,
              selected ? styles.selectionCircleActive : null,
              {
                opacity: selectionOpacity,
                transform: [{ scale: selectionScale }],
              },
            ]}
          >
            {selected ? <MaterialCommunityIcons name="check" size={16} color="#fff" /> : null}
          </Animated.View>
        </View>
      ) : null}

      <View style={[styles.wrapper, isMine ? styles.wrapperMine : styles.wrapperTheirs]}>
        <View
          style={[
            styles.container,
            isMine ? styles.mine : styles.theirs,
            mediaUrl && styles.containerMedia,
            {
              backgroundColor: bubbleBg,
              shadowOpacity: isDark ? 0.22 : 0.1,
              shadowRadius: isDark ? 4 : 2,
              borderRadius: bubbleRadius,
              borderBottomRightRadius: isMine ? Math.min(bubbleRadius, 12) : bubbleRadius,
              borderBottomLeftRadius: !isMine ? Math.min(bubbleRadius, 12) : bubbleRadius,
            },
          ]}
        >
        {!isMine && senderName && (
          <Text style={[styles.senderName, { color: colors.chatPrimary, paddingHorizontal: mediaUrl ? 12 : 0, paddingTop: mediaUrl ? 8 : 0 }]}>{senderName}</Text>
        )}
        {isMine && senderName && (
          <Text style={[styles.senderName, { color: '#ffffff', paddingHorizontal: mediaUrl ? 12 : 0, paddingTop: mediaUrl ? 8 : 0 }]}>{senderName}</Text>
        )}

        {mediaUrl ? (
          (isImage || isVideo) ? (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => {
                if (!mediaUrl) return;
                if (shouldDeferMediaPreview) {
                  setMediaPreviewLoaded(true);
                  return;
                }
                if (isVideo) {
                  onVideoPress?.({ uri: mediaUrl, timestamp, senderName });
                } else {
                  onImagePress?.({ uri: mediaUrl, timestamp, senderName });
                }
              }}
              style={[styles.imageWrap, imageFrame, { marginBottom: showText ? 0 : 0 }]}
            >
              {shouldDeferMediaPreview ? (
                <View style={[styles.deferredMedia, imageFrame]}>
                  <MaterialCommunityIcons name={isVideo ? 'video-outline' : 'image-outline'} size={34} color="#ffffff" />
                  <Text style={styles.deferredMediaTitle}>{isVideo ? 'Video' : 'Imagem'}</Text>
                  <Text style={styles.deferredMediaSubtitle}>Toque para carregar</Text>
                </View>
              ) : (
                <Image 
                  source={{ uri: isVideo ? getVideoThumbnail(mediaUrl) : mediaUrl }} 
                  style={[styles.image, imageFrame]} 
                  resizeMode="cover" 
                />
              )}
              
              {!shouldDeferMediaPreview && status === 'sending' && uploadProgress !== undefined ? (
                <View style={styles.sendingMediaOverlay}>
                  <View style={styles.circularProgressWrap}>
                    <ActivityIndicator size="large" color="#ffffff" />
                    <Text style={styles.sendingPercentText}>
                      {Math.round(uploadProgress * 100)}%
                    </Text>
                  </View>
                </View>
              ) : !shouldDeferMediaPreview && isVideo ? (
                <View style={styles.videoOverlay}>
                  <View style={styles.playButtonCircle}>
                    <MaterialCommunityIcons name="play" size={32} color="#ffffff" style={{ marginLeft: 3 }} />
                  </View>
                  <Text style={styles.videoBadge}>Vídeo</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : isAudio ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => {
                if (selectionMode) {
                  onPress?.();
                  return;
                }
                if (!mediaUrl) return;
                onAudioPress?.({ uri: mediaUrl, fileName, mediaType });
              }}
              style={[styles.audioRow, { backgroundColor: bubbleBg }]}
              disabled={fileOpening}
            >
              <View style={styles.audioThumb}>
                <MaterialCommunityIcons
                  name={isAudioPlaying ? 'pause' : 'play'}
                  size={26}
                  color="#ffffff"
                />
              </View>

              <View style={styles.audioBody}>
                <View style={styles.audioMetaRow}>
                  <Text style={styles.audioTitle} numberOfLines={1}>
                    {trimAudioTitle(fileName)}
                  </Text>
                  {isAudioPlaying && (
                    <TouchableOpacity 
                      activeOpacity={0.7} 
                      onPress={onAudioRatePress} 
                      style={styles.ratePill}
                    >
                      <Text style={styles.rateText}>{audioRate}x</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.audioWaveformContainer}>
                  {Array.from({ length: 32 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: 4 + (Math.abs(Math.sin((i + (id?.length || 0)) * 0.8)) * 14),
                          backgroundColor:
                            i / 32 < audioProgress 
                              ? '#ffffff' 
                              : 'rgba(255,255,255,0.35)',
                        },
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.audioTime}>
                  {audioPositionLabel} / {audioDurationLabel}
                </Text>
              </View>

              <MaterialCommunityIcons
                name="dots-vertical"
                size={20}
                color={showText ? metaColor : '#ffffff'}
                style={styles.audioMenuIcon}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => {
                if (selectionMode) {
                  onPress?.();
                  return;
                }

                if (!mediaUrl) return;
                onFilePress?.({
                  uri: mediaUrl,
                  fileName,
                  mediaType,
                });
              }}
              style={[styles.fileRow, { backgroundColor: isMine ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}
              disabled={fileOpening}
            >
              <View style={styles.fileIconCircle}>
                {fileOpening ? (
                  <ActivityIndicator size="small" color={isMine ? '#6f8ec8' : colors.primary} />
                ) : (
                  <MaterialCommunityIcons
                    name={fileExtension === 'PDF' ? 'file-pdf-box' : 'file-document-outline'}
                    size={28}
                    color={isMine ? '#6f8ec8' : colors.primary}
                  />
                )}
              </View>

              <View style={styles.fileBody}>
                <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {fileName}
                </Text>
                <Text style={[styles.fileSubtitle, { color: metaColor }]} numberOfLines={1}>
                  {fileOpening ? 'Abrindo arquivo...' : fileSubtitle}
                </Text>
              </View>

              <MaterialCommunityIcons
                name="dots-vertical"
                size={20}
                color={metaColor}
                style={styles.fileMenuIcon}
              />
            </TouchableOpacity>
          )
        ) : null}

        {showText && (!mediaUrl || (isImage || isVideo)) ? (
          <Text
            style={[
              styles.messageText,
              isMine ? styles.messageTextMine : null,
              mediaUrl ? styles.messageTextWithMedia : (isMine ? styles.messageTextWithMetaMine : styles.messageTextWithMetaTheirs),
              { color: isMine ? '#ffffff' : colors.textPrimary, fontSize: textSize, lineHeight: textSize * 1.35 },
            ]}
          >
            {message}
          </Text>
        ) : null}

        <View 
          style={[
            styles.metaRow, 
            isMine ? styles.metaRowMine : styles.metaRowTheirs,
            (mediaUrl && !showText) && styles.metaRowOnMedia
          ]}
        >
          <Text
            style={[
              styles.timestamp,
              { color: (mediaUrl && !showText) ? '#ffffff' : metaColor },
            ]}
          >
            {time}
          </Text>
          {isMine ? (
            <MaterialCommunityIcons
              name={statusIconName}
              size={14}
              color={(mediaUrl && !showText) ? '#ffffff' : statusColor}
              style={styles.statusIcon}
            />
          ) : null}
        </View>

        </View>


      </View>

    </TouchableOpacity>
  );
}

const fileNameFromMessage = (message: string, mediaUrl?: string) => {
  if (message?.trim()) {
    return message.trim();
  }

  if (!mediaUrl) {
    return 'Arquivo';
  }

  const lastChunk = mediaUrl.split('/').pop()?.split('?')[0] || 'Arquivo';
  try {
    return decodeURIComponent(lastChunk);
  } catch {
    return lastChunk;
  }
};

const isAudioMedia = (mediaType?: string, fileName?: string) => {
  if (mediaType === 'audio' || mediaType?.startsWith?.('audio/')) {
    return true;
  }

  const ext = fileName?.split('.').pop()?.toLowerCase();
  return ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(ext || '');
};

const trimAudioTitle = (value: string) => {
  return value.replace(/\.[a-z0-9]{2,5}$/i, '');
};

const getVideoThumbnail = (url: string) => {
  // Cloudinary permite trocar a extensão do arquivo na URL para obter um thumbnail frame automático
  if (url.includes('cloudinary.com')) {
    return url.replace(/\.(mp4|mov|avi|wmv|flv|mkv)$/i, '.jpg');
  }
  return url; // Fallback
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  rowSelectionMode: {
    paddingHorizontal: 6,
  },
  wrapper: {
    maxWidth: '84%',
    marginVertical: 2,
    paddingHorizontal: 4,
  },
  wrapperMine: {
    alignSelf: 'flex-end',
  },
  wrapperTheirs: {
    alignSelf: 'flex-start',
  },
  container: {
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 6,
    borderRadius: 19,
    position: 'relative',
    minWidth: 90,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  mine: {
    borderBottomRightRadius: 12,
    paddingTop: 9,
    paddingBottom: 7,
  },
  theirs: {
    borderBottomLeftRadius: 12,
  },
  containerMedia: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    minWidth: 120,
  },
  messageContent: {
    // No specific layout needed, let the Text handle it
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 0,
  },
  messageTextMine: {
    marginTop: 0,
  },
  messageTextWithMetaMine: {
    paddingRight: 44,
    paddingBottom: 6,
  },
  messageTextWithMetaTheirs: {
    paddingRight: 38,
    paddingBottom: 6,
  },
  timestamp: {
    fontSize: 11,
    lineHeight: 11,
    fontWeight: '500',
  },
  statusIcon: {
    marginLeft: 3,
  },
  messageTextWithMedia: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    fontSize: 16,
    lineHeight: 20,
  },
  metaRowOnMedia: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    right: 8,
    bottom: 8,
  },
  metaRow: {
    position: 'absolute',
    right: 12,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  metaRowMine: {
    right: 12,
  },
  metaRowTheirs: {
    right: 12,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  imageWrap: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sendingMediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)', // fundo esfumaçado durante o envio
    justifyContent: 'center',
    alignItems: 'center',
  },
  circularProgressWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sendingPercentText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 4,
    position: 'absolute',
    bottom: -20, // Texto logo abaixo do circulo
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  image: {
    width: '100%',
  },
  deferredMedia: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    padding: 16,
  },
  deferredMediaTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  deferredMediaSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    marginTop: 3,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 220,
    maxWidth: 290,
  },
  fileIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileBody: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '700',
  },
  fileSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
  },
  fileMenuIcon: {
    marginLeft: 8,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 230,
    maxWidth: 300,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 8,
  },
  audioThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  audioBody: {
    flex: 1,
    minWidth: 0,
  },
  audioTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  audioMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ratePill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 6,
  },
  rateText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  audioWaveformContainer: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1.5,
    marginVertical: 4,
  },
  waveformBar: {
    width: 2.2,
    borderRadius: 1,
  },
  audioTime: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '500',
  },
  audioMenuIcon: {
    marginLeft: 8,
  },

  selectionRailLeft: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionRailRight: {
    width: 0,
  },
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  selectionCircleActive: {
    borderColor: '#4caf50',
    backgroundColor: '#4caf50',
  },
});
