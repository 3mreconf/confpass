import { useCallback } from 'react';

export function useErrorHandler(
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
) {
  return useCallback((error: unknown, context?: string) => {
    const message = error instanceof Error 
      ? error.message 
      : typeof error === 'string'
      ? error
      : 'Beklenmeyen bir hata oluştu';
    
    console.error(`[${context || 'App'}]`, error);
    showToast(message, 'error');
  }, [showToast]);
}
