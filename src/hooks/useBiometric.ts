import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useBiometric() {
  const [available, setAvailable] = useState<boolean>(false);
  const [checking, setChecking] = useState(false);

  const checkAvailability = useCallback(async () => {
    try {
      const isAvailable = await invoke<boolean>('check_biometric_available');
      setAvailable(isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('Biometric check error:', error);
      setAvailable(false);
      return false;
    }
  }, []);

  const authenticate = useCallback(async (reason?: string): Promise<boolean> => {
    setChecking(true);
    try {
      const result = await invoke<boolean>('biometric_authenticate', {
        reason: reason || 'Kasa kilidini açmak için kimlik doğrulama gerekli'
      });
      return result;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  return {
    available,
    checking,
    checkAvailability,
    authenticate
  };
}
