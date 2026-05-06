import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { spacing } from '../theme/spacing';
import { formatChatDate } from '../utils/formatDate';
import useTheme from '../hooks/useTheme';

interface ChatListItemProps {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: number;
  unreadCount: number;
  isOutgoing?: boolean;
  outgoingRead?: boolean;
  avatar?: string | null;
  online: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}

export default function ChatListItem({
  name,
  lastMessage,
  timestamp,
  unreadCount,
  isOutgoing = false,
  outgoingRead = false,
  avatar,
  online,
  onPress,
  onLongPress,
  selected = false,
}: ChatListItemProps) {
  const { colors, isDark } = useTheme();
  const metaColor = unreadCount > 0
    ? (isDark ? '#6ab7ff' : colors.primary)
    : (isDark ? '#aeb7be' : colors.textSecondary);
  const checkColor = outgoingRead
    ? (isDark ? '#53bdeb' : colors.primary)
    : (isDark ? '#aeb7be' : colors.textSecondary);

  return (
    <TouchableOpacity
      style={[styles.container, selected && { backgroundColor: isDark ? '#2b2d33' : '#e8f0ff' }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
    >
      <Avatar uri={avatar} name={name} size={58} online={online} />

      <View style={styles.content}>
        <View style={styles.mainInfo}>
          <View style={styles.topRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.timeContainer}>
              {isOutgoing && (
                <Ionicons
                  name={outgoingRead ? "checkmark-done" : "checkmark"}
                  size={16}
                  color={checkColor}
                  style={styles.checkIcon}
                />
              )}
              <Text
                style={[
                  styles.time,
                  { color: metaColor },
                ]}
              >
                {formatChatDate(timestamp)}
              </Text>
            </View>
          </View>

          <View style={styles.bottomRow}>
            <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={1}>
              {lastMessage}
            </Text>
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: isDark ? '#4F7CFF' : colors.primary }]}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  content: {
    flex: 1,
    marginLeft: 14,
    height: 60,
    justifyContent: 'center',
  },
  mainInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 17,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 58,
    justifyContent: 'flex-end',
  },
  time: {
    fontSize: 13,
    fontWeight: '500',
  },
  checkIcon: {
    marginRight: 2,
  },
  message: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
