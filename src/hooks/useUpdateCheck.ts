import { useState, useEffect, useCallback } from 'react';
import packageJson from '../../package.json';

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  url: string;
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    available: false,
    currentVersion: packageJson.version,
    latestVersion: '',
    url: 'https://github.com/3mreconf/confpass/releases'
  });
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    try {
      // Using GitHub API to check for latest release
      const response = await fetch('https://api.github.com/repos/3mreconf/confpass/releases/latest');
      if (response.ok) {
        const data = await response.json();
        const latestVersion = data.tag_name.replace('v', '');
        const currentVersion = packageJson.version;
        
        // Simple version comparison
        const isUpdateAvailable = compareVersions(currentVersion, latestVersion);
        
        setUpdateInfo({
          available: isUpdateAvailable,
          currentVersion,
          latestVersion,
          url: data.html_url || 'https://github.com/3mreconf/confpass/releases'
        });

        return isUpdateAvailable;
      }
    } catch (error) {
      console.error('Update check failed:', error);
    } finally {
      setIsChecking(false);
    }
    return false;
  }, []);

  // Helper to compare semantic versions
  const compareVersions = (current: string, latest: string): boolean => {
    const v1Parts = current.split('.').map(Number);
    const v2Parts = latest.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); ++i) {
      const v1 = v1Parts[i] || 0;
      const v2 = v2Parts[i] || 0;
      if (v2 > v1) return true;
      if (v2 < v1) return false;
    }
    return false;
  };

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return { updateInfo, checkForUpdates, isChecking };
}
