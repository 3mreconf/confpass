export interface FileAttachment {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: number;
}

export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  created_at: number;
  updated_at: number;
  category: string;
  folder_id?: string;
  tags?: string[];
  attachments?: FileAttachment[];
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  icon: string;
  parent_id?: string;
  created_at: number;
  order: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface ConfirmDialog {
  message: string;
  onConfirm: () => void;
}

export type CategoryType = 'all' | 'accounts' | 'bank_cards' | 'documents' | 'addresses' | 'notes' | 'passkeys' | 'authenticator';

export interface AuthenticatorData {
  secret: string;
  issuer: string;
  account: string;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  digits?: 6 | 8;
  period?: number;
  backupCodes?: string[];
}

export interface TauriError {
  message?: string;
  toString(): string;
}

export interface PasswordStrengthResult {
  score: number;
  strength: 'zayıf' | 'orta' | 'güçlü' | 'çok güçlü';
  feedback?: string[];
}

export interface BankCardData {
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
  cardholderName?: string;
  cardType?: string;
  cardColor?: string;
}

export interface DocumentData {
  documentType?: string;
  filePath?: string;
}

export interface AddressData {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface PasskeyData {
  username?: string;
  email?: string;
  domain?: string;
  credentialId?: string;
  backupCodes?: string[];
}

export interface TotpData {
  secret: string;
  issuer?: string;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  digits?: 6 | 8;
  period?: number;
}

export interface PasswordHistory {
  password: string;
  changed_at: number;
  changed_by?: string;
}

export interface ActivityLog {
  id: string;
  entry_id?: string;
  action: 'create' | 'update' | 'delete' | 'view' | 'copy' | 'export' | 'import' | 'unlock' | 'lock';
  timestamp: number;
  details?: string;
  ip_address?: string;
}

export interface BreachInfo {
  entry_id: string;
  breached: boolean;
  breach_count?: number;
  breach_names?: string[];
  last_checked?: number;
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  downloading?: boolean;
  downloaded?: boolean;
  error?: string | null;
  url?: string;
}
