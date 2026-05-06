import * as FileSystem from 'expo-file-system/legacy';

const APP_CACHE_DIR_NAME = 'vibe-message';

export const getAppCacheDirUri = () => {
  if (!FileSystem.cacheDirectory) {
    return null;
  }

  return `${FileSystem.cacheDirectory}${APP_CACHE_DIR_NAME}/`;
};

export const ensureAppCacheDirectory = async () => {
  const cacheDir = getAppCacheDirUri();
  if (!cacheDir) {
    throw new Error('Armazenamento temporario indisponivel.');
  }

  const info = await FileSystem.getInfoAsync(cacheDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
  }

  return cacheDir;
};

export const getAppFileCacheSize = async () => {
  const cacheDir = getAppCacheDirUri();
  if (!cacheDir) {
    return 0;
  }

  return getDirectorySize(cacheDir);
};

export const clearAppFileCache = async () => {
  const cacheDir = getAppCacheDirUri();
  if (!cacheDir) {
    return;
  }

  const info = await FileSystem.getInfoAsync(cacheDir);
  if (!info.exists) {
    return;
  }

  await FileSystem.deleteAsync(cacheDir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
};

const getDirectorySize = async (uri: string): Promise<number> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return 0;
    }

    if (!info.isDirectory) {
      return info.size || 0;
    }

    const children = await FileSystem.readDirectoryAsync(uri);
    const sizes = await Promise.all(children.map((name) => getDirectorySize(`${uri}${name}`)));
    return sizes.reduce((total, size) => total + size, 0);
  } catch {
    return 0;
  }
};
