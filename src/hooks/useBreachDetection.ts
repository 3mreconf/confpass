import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface BreachResult {
  breached: boolean;
  count: number;
}

export function useBreachDetection() {
  const [checking, setChecking] = useState(false);
  const [breachResults, setBreachResults] = useState<Map<string, BreachResult>>(new Map());

  const checkPassword = useCallback(async (password: string, entryId: string): Promise<BreachResult> => {
    if (breachResults.has(entryId)) {
      return breachResults.get(entryId)!;
    }

    setChecking(true);
    try {
      const result = await invoke<BreachResult>('check_password_breach', { password });
      setBreachResults(prev => new Map(prev).set(entryId, result));
      return result;
    } catch (error) {
      console.error('Breach check error:', error);
      return { breached: false, count: 0 };
    } finally {
      setChecking(false);
    }
  }, [breachResults]);

  const checkMultiplePasswords = useCallback(async (entries: Array<{ id: string; password: string }>) => {
    setChecking(true);
    try {
      const results = await Promise.allSettled(
        entries.map(entry =>
          invoke<BreachResult>('check_password_breach', { password: entry.password })
            .then(result => ({ entryId: entry.id, result }))
        )
      );

      const newResults = new Map(breachResults);
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          newResults.set(result.value.entryId, result.value.result);
        }
      });
      setBreachResults(newResults);
    } catch (error) {
      console.error('Batch breach check error:', error);
    } finally {
      setChecking(false);
    }
  }, [breachResults]);

  return {
    checkPassword,
    checkMultiplePasswords,
    checking,
    breachResults
  };
}
