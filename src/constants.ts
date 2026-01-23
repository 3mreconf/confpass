export const CATEGORIES = ['all', 'accounts', 'bank_cards', 'documents', 'addresses', 'notes', 'passkeys', 'authenticator'] as const;

export const CATEGORY_NAMES: Record<string, string> = {
  'all': 'Tümü',
  'accounts': 'Hesaplar',
  'bank_cards': 'Banka Kartları',
  'documents': 'Belgeler',
  'addresses': 'Adresler',
  'notes': 'Notlar',
  'passkeys': 'Geçiş Anahtarları',
  'authenticator': 'Kimlik Doğrulayıcı'
};

export const VALID_CATEGORIES = ['accounts', 'bank_cards', 'documents', 'addresses', 'notes', 'passkeys', 'authenticator'] as const;

export const CATEGORY_OPTIONS = VALID_CATEGORIES.map(cat => ({
  value: cat,
  label: CATEGORY_NAMES[cat]
}));

export const DEBOUNCE_DELAY = 300;

export const AUTO_LOCK_TIMEOUT = 5 * 60 * 1000;

export const TOAST_DURATION = 3000;
