import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PasswordEntry, PasswordStrengthResult } from '../types';
import { debounce } from './useDebounce';

interface PasswordSecurity {
  atRisk: PasswordEntry[];
  weak: PasswordEntry[];
  total: number;
}

export function usePasswordSecurity(entries: PasswordEntry[], vaultLocked: boolean) {
  const [passwordSecurity, setPasswordSecurity] = useState<PasswordSecurity | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkPasswordSecurity = useCallback(
    debounce(async (entriesToCheck: PasswordEntry[]) => {
      if (entriesToCheck.length === 0) {
        setPasswordSecurity(null);
        return;
      }

      setIsChecking(true);

      try {
        const results = await Promise.allSettled(
          entriesToCheck.map(entry =>
            invoke<PasswordStrengthResult>('check_password_strength', { password: entry.password })
              .then(result => ({ entry, result }))
              .catch(error => {
                console.error('Error checking password strength for entry:', entry.id, error);
                return null;
              })
          )
        );

        const atRisk: PasswordEntry[] = [];
        const weak: PasswordEntry[] = [];

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            const { entry, result: strength } = result.value;
            if (strength.score <= 2) {
              atRisk.push(entry);
            } else if (strength.score <= 4) {
              weak.push(entry);
            }
          }
        });

        setPasswordSecurity({
          atRisk,
          weak,
          total: entriesToCheck.length
        });
      } catch (error) {
        console.error('Error in password security check:', error);
        setPasswordSecurity(null);
      } finally {
        setIsChecking(false);
      }
    }, 500),
    []
  );

  useEffect(() => {
    if (!vaultLocked && entries.length > 0) {
      const accountEntries = entries.filter(entry => entry.category === 'accounts');
      checkPasswordSecurity(accountEntries);
    } else {
      setPasswordSecurity(null);
    }
  }, [entries, vaultLocked, checkPasswordSecurity]);

  return { passwordSecurity, isChecking };
}
