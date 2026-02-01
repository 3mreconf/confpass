import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { UpdateInfo } from '../types';
import packageJson from '../../package.json';

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    available: false,
    currentVersion: packageJson.version,
    latestVersion: '',
    downloading: false,
    downloaded: false,
    error: null
  });
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setUpdateInfo(prev => ({ ...prev, error: null }));

    try {
      const update = await check();

      if (update) {
        setUpdateInfo({
          available: true,
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          downloading: false,
          downloaded: false,
          error: null
        });
        return update;
      } else {
        setUpdateInfo(prev => ({
          ...prev,
          available: false,
          error: null
        }));
        return null;
      }
    } catch (error) {
      console.error('Update check failed:', error);
      setUpdateInfo(prev => ({
        ...prev,
        error: String(error || 'Güncelleme kontrolü başarısız')
      }));
      return null;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    try {
      setUpdateInfo(prev => ({ ...prev, downloading: true, error: null }));

      const update = await check();
      if (!update) {
        setUpdateInfo(prev => ({
          ...prev,
          downloading: false,
          error: 'Güncelleme bulunamadı'
        }));
        return false;
      }

      // Download and install the update
      await update.downloadAndInstall();

      setUpdateInfo(prev => ({
        ...prev,
        downloading: false,
        downloaded: true
      }));

      // Relaunch the app to apply the update
      await relaunch();
      return true;
    } catch (error) {
      console.error('Update download/install failed:', error);
      setUpdateInfo(prev => ({
        ...prev,
        downloading: false,
        error: String(error || 'Güncelleme indirilemedi')
      }));
      return false;
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return { updateInfo, checkForUpdates, downloadAndInstall, isChecking };
}

