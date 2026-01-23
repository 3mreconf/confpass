export const clearClipboard = async (text: string, delay: number = 30000) => {
  try {
    await navigator.clipboard.writeText(text);
    setTimeout(async () => {
      try {
        await navigator.clipboard.writeText('');
      } catch (error) {
        console.error('Failed to clear clipboard:', error);
      }
    }, delay);
  } catch (error) {
    console.error('Clipboard operation failed:', error);
  }
};

export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

export const validateUrl = (url: string): boolean => {
  if (!url.trim()) return true;
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
