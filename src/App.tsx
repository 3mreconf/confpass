import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { Lock, Unlock, Plus, Search, Key, Shield, Settings as SettingsIcon, Home, CheckCircle, XCircle, Info, AlertCircle, ChevronDown, Minus, Maximize2, X, Grid3x3, Star, Download, HelpCircle, AlertTriangle, Clock, KeyRound, Fingerprint, Folder as FolderIcon, FolderPlus, MoreHorizontal, Edit3, Trash2, ChevronRight } from 'lucide-react';
import { version as appVersion } from '../package.json';
import { CATEGORY_NAMES, CATEGORY_OPTIONS, DEBOUNCE_DELAY, AUTO_LOCK_TIMEOUT, TOAST_DURATION } from './constants';
import { validateUrl } from './utils';
import type { PasswordEntry, ToastMessage, ConfirmDialog, BankCardData, DocumentData, AddressData, PasskeyData, Folder } from './types';
import EntryCard from './components/EntryCard';
import Settings from './components/Settings';
import PasswordGeneratorModal from './components/PasswordGeneratorModal';
import TotpModal from './components/TotpModal';
import ActivityLogModal from './components/ActivityLogModal';
import AuthenticatorView from './components/AuthenticatorView';
import AddAuthenticatorModal from './components/AddAuthenticatorModal';
import PasskeysView from './components/PasskeysView';
import Dashboard from './components/Dashboard';
import SecurityCheckPage from './components/SecurityCheckPage';
import { usePasswordSecurity } from './hooks/usePasswordSecurity';
import { useDebounce } from './hooks/useDebounce';
import { useBiometric } from './hooks/useBiometric';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import './App.css';
import AppLogo from './assets/logo.svg';

// Folder color presets
const FOLDER_COLORS = [
  '#f59e0b', // amber
  '#ef4444', // red
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

interface FolderModalProps {
  folder: Folder | null;
  folders: Folder[];
  onClose: () => void;
  onCreate: (name: string, color: string, icon: string, parentId?: string) => Promise<void>;
  onUpdate: (id: string, name: string, color: string, icon: string) => Promise<void>;
}

const FolderModal = memo(({ folder, folders, onClose, onCreate, onUpdate }: FolderModalProps) => {
  const [name, setName] = useState(folder?.name || '');
  const [color, setColor] = useState(folder?.color || FOLDER_COLORS[0]);
  const [parentId, setParentId] = useState<string>(folder?.parent_id || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      if (folder) {
        await onUpdate(folder.id, name.trim(), color, 'folder');
      } else {
        await onCreate(name.trim(), color, 'folder', parentId || undefined);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content folder-modal">
        <div className="modal-header">
          <h3>{folder ? 'Klasörü Düzenle' : 'Yeni Klasör'}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="folder-form">
          <div className="form-group">
            <label>Klasör Adı</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Klasör adı girin..."
              autoFocus
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label>Renk</label>
            <div className="folder-color-picker">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`folder-color-option ${color === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {!folder && folders.length > 0 && (
            <div className="form-group">
              <label>Üst Klasör (Opsiyonel)</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="folder-parent-select"
              >
                <option value="">Kök klasör</option>
                {folders.filter(f => !f.parent_id).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="folder-preview">
            <div className="folder-preview-item">
              <div
                className="folder-color-dot"
                style={{ backgroundColor: color }}
              />
              <span>{name || 'Klasör Adı'}</span>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name.trim() || loading}
            >
              {loading ? 'Kaydediliyor...' : folder ? 'Güncelle' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

function App() {
  const [vaultLocked, setVaultLocked] = useState(true);
  const [masterPassword, setMasterPassword] = useState('');
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, DEBOUNCE_DELAY);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordGenerator, setShowPasswordGenerator] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [editingEntry, setEditingEntry] = useState<PasswordEntry | null>(null);
  const [totpModal, setTotpModal] = useState<{ secret: string; issuer?: string; account?: string } | null>(null);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const autoLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [unlockError, setUnlockError] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [displayTitle, setDisplayTitle] = useState('');
  const [displaySubtitle, setDisplaySubtitle] = useState('');
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'favorites' | 'entries'>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState<'home' | 'settings' | 'password-check' | 'authenticator' | 'passkeys'>('home');
  const [showAddAuthenticator, setShowAddAuthenticator] = useState(false);
  const [showAddPasskey, setShowAddPasskey] = useState(false);
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [detectedPasskey, setDetectedPasskey] = useState<{ rpId: string; userName: string; userDisplayName: string } | null>(null);

  // Folder system state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Bulk operations state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), TOAST_DURATION);
  }, []);

  const { passwordSecurity } = usePasswordSecurity(entries, vaultLocked);
  const { available: biometricAvailable, checkAvailability } = useBiometric();
  const { updateInfo } = useUpdateCheck();

  useEffect(() => {
    if (updateInfo.available) {
      const sendNotification = () => {
        new Notification('Güncelleme Mevcut', {
          body: `Yeni sürüm ${updateInfo.latestVersion} indirilebilir.`,
          icon: '/pwa-192x192.png'
        });
      };

      if (Notification.permission === 'granted') {
        sendNotification();
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            sendNotification();
          }
        });
      }
    }
  }, [updateInfo.available, updateInfo.latestVersion]);

  useEffect(() => {
    if (vaultLocked) {
      checkAvailability();
    }
  }, [vaultLocked, checkAvailability]);

  useEffect(() => {
    const setupPasskeyListeners = async () => {
      console.log('[Passkey Listener] Setting up passkey listeners...');
      try {
        // Listen for passkey detection events from backend (JSON object format)
        interface PasskeyEvent {
          rpId: string;
          rpName?: string;
          userName: string;
          userDisplayName: string;
          credentialId?: string;
          url?: string;
          timestamp?: number;
        }

        const unlistenDetected = await listen<PasskeyEvent>('passkey-detected', (event) => {
          console.log('[Passkey Listener] passkey-detected event received:', event.payload);

          const payload = event.payload;
          if (payload && payload.rpId && payload.userName) {
            console.log('[Passkey Listener] Parsed passkey:', payload);
            setDetectedPasskey({
              rpId: payload.rpId,
              userName: payload.userName,
              userDisplayName: payload.userDisplayName || payload.userName
            });
          } else {
            console.error('[Passkey Listener] Invalid payload format:', event.payload);
          }
        });

        // Listen for passkey-saved events (from browser extension via HTTP API)
        const unlistenSaved = await listen<PasskeyEvent>('passkey-saved', async (event) => {
          console.log('[Passkey Listener] passkey-saved event received:', event.payload);

          const payload = event.payload;
          if (payload && payload.rpId) {
            // Show toast notification
            const serviceName = payload.rpName || payload.rpId;
            showToast(`Geçiş anahtarı kaydedildi: ${serviceName}`, 'success');

            // Reload entries to show the new passkey in UI
            try {
              const loadedEntries = await invoke<PasswordEntry[]>('get_password_entries');
              setEntries(loadedEntries);
            } catch (err) {
              console.error('[Passkey Listener] Failed to reload entries:', err);
            }
          }
        });

        // Listen for entries-updated events (from browser extension auto-save)
        interface EntriesUpdatedEvent {
          action: string;
          entry_id: string;
          category?: string;
        }
        const unlistenEntriesUpdated = await listen<EntriesUpdatedEvent>('entries-updated', async (event) => {
          console.log('[Entries Listener] entries-updated event received:', event.payload);

          // Reload entries to show the new entry in UI
          try {
            const loadedEntries = await invoke<PasswordEntry[]>('get_password_entries');
            setEntries(loadedEntries);

            // Show category-specific toast message
            const category = event.payload.category || 'accounts';
            const toastMessages: Record<string, string> = {
              'accounts': 'Yeni şifre kaydedildi',
              'bank_cards': 'Yeni kart kaydedildi',
              'addresses': 'Yeni adres kaydedildi',
              'passkeys': 'Yeni geçiş anahtarı kaydedildi',
              'authenticator': 'Yeni doğrulayıcı kaydedildi',
              'notes': 'Yeni not kaydedildi',
              'documents': 'Yeni belge kaydedildi'
            };
            showToast(toastMessages[category] || 'Yeni kayıt eklendi', 'success');
          } catch (err) {
            console.error('[Entries Listener] Failed to reload entries:', err);
          }
        });

        console.log('[Passkey Listener] Listeners set up successfully');
        return () => {
          unlistenDetected();
          unlistenSaved();
          unlistenEntriesUpdated();
        };
      } catch (error) {
        console.error('[Passkey Listener] Failed to set up listeners:', error);
      }
    };

    setupPasskeyListeners().catch(console.error);
  }, [showToast]);

  const loadEntries = useCallback(async () => {
    try {
      const loadedEntries = await invoke<PasswordEntry[]>('get_password_entries');
      setEntries(loadedEntries);

      await invoke('log_activity', {
        action: 'view',
        entry_id: null,
        details: 'Tüm kayıtlar görüntülendi'
      });
    } catch (error) {
      console.error('Error loading entries:', error);
      const errorStr = String(error || '');
      const errorMessage = errorStr.includes('Kasa kilitli')
        ? 'Kasa kilitli'
        : 'Kayıtlar yüklenemedi';
      showToast(errorMessage, 'error');
    }
  }, [showToast]);

  // Bulk operations
  const toggleSelection = useCallback((id: string) => {
    setSelectedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedEntries.size === 0) return;

    setConfirmDialog({
      message: `${selectedEntries.size} kaydı silmek istediğinize emin misiniz?`,
      onConfirm: async () => {
        try {
          const ids = Array.from(selectedEntries);
          const deleted = await invoke<number>('bulk_delete_entries', { ids });
          showToast(`${deleted} kayıt silindi`, 'success');
          setSelectedEntries(new Set());
          setSelectionMode(false);
          loadEntries();
          setConfirmDialog(null);
        } catch (error) {
          const errorStr = String(error || '');
          showToast(errorStr || 'Toplu silme hatası', 'error');
          setConfirmDialog(null);
        }
      }
    });
  }, [selectedEntries, showToast, loadEntries]);

  const handleBulkMove = useCallback(async (folderId: string | null) => {
    if (selectedEntries.size === 0) return;

    try {
      const ids = Array.from(selectedEntries);
      const moved = await invoke<number>('bulk_move_to_folder', { ids, folderId });
      showToast(`${moved} kayıt taşındı`, 'success');
      setSelectedEntries(new Set());
      setSelectionMode(false);
      loadEntries();
    } catch (error) {
      const errorStr = String(error || '');
      showToast(errorStr || 'Toplu taşıma hatası', 'error');
    }
  }, [selectedEntries, showToast, loadEntries]);

  const selectAll = useCallback((filteredIds: string[]) => {
    const allIds = new Set(filteredIds);
    setSelectedEntries(allIds);
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedEntries(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedEntries(new Set());
  }, []);

  // Folder functions
  const loadFolders = useCallback(async () => {
    try {
      const loadedFolders = await invoke<Folder[]>('get_folders');
      setFolders(loadedFolders);
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  }, []);

  const createFolder = useCallback(async (name: string, color: string, icon: string, parentId?: string) => {
    try {
      await invoke('create_folder', { name, color, icon, parentId: parentId || null });
      await loadFolders();
      showToast('Klasör oluşturuldu', 'success');
    } catch (error) {
      console.error('Error creating folder:', error);
      showToast('Klasör oluşturulamadı', 'error');
    }
  }, [loadFolders, showToast]);

  const updateFolder = useCallback(async (id: string, name: string, color: string, icon: string) => {
    try {
      await invoke('update_folder', { id, name, color, icon });
      await loadFolders();
      showToast('Klasör güncellendi', 'success');
    } catch (error) {
      console.error('Error updating folder:', error);
      showToast('Klasör güncellenemedi', 'error');
    }
  }, [loadFolders, showToast]);

  const deleteFolder = useCallback(async (id: string) => {
    try {
      await invoke('delete_folder', { id });
      await loadFolders();
      if (selectedFolder === id) {
        setSelectedFolder(null);
      }
      showToast('Klasör silindi', 'success');
    } catch (error) {
      console.error('Error deleting folder:', error);
      showToast('Klasör silinemedi', 'error');
    }
  }, [loadFolders, selectedFolder, showToast]);

  const moveEntryToFolder = useCallback(async (entryId: string, folderId: string | null) => {
    try {
      await invoke('move_entry_to_folder', { entryId: entryId, folderId: folderId });
      await loadEntries();
      showToast(folderId ? 'Kayıt klasöre taşındı' : 'Kayıt klasörden çıkarıldı', 'success');
    } catch (error) {
      console.error('Error moving entry to folder:', error);
      showToast('Kayıt taşınamadı', 'error');
    }
  }, [loadEntries, showToast]);

  // Drag & Drop handlers
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, entryId: string) => {
    e.dataTransfer.setData('text/plain', entryId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolder(null);
    const entryId = e.dataTransfer.getData('text/plain');
    if (entryId) {
      await moveEntryToFolder(entryId, folderId);
    }
  }, [moveEntryToFolder]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolder(folderId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolder(null);
  }, []);

  // Expose moveEntryToFolder for development/debugging
  useEffect(() => {
    (window as unknown as { moveEntryToFolder: typeof moveEntryToFolder }).moveEntryToFolder = moveEntryToFolder;
  }, [moveEntryToFolder]);

  const handleBiometricUnlock = useCallback(async () => {
    try {
      const success = await invoke<boolean>('unlock_vault_biometric');
      if (success) {
        setVaultLocked(false);
        setMasterPassword('');
        setUnlockError(false);
        await loadEntries();
        await loadFolders();
        showToast('Kasa başarıyla açıldı', 'success');
      }
    } catch (error) {
      console.error('Biometric unlock error:', error);
      const errorStr = String(error || '');
      showToast(errorStr || 'Biyometrik kimlik doğrulama hatası', 'error');
    }
  }, [loadEntries, loadFolders, showToast]);

  const checkVaultStatus = useCallback(async () => {
    try {
      const locked = await invoke<boolean>('is_vault_locked');
      setVaultLocked(locked);
      if (!locked) {
        await loadEntries();
        await loadFolders();
      }
    } catch (error) {
      console.error('Error checking vault status:', error);
      showToast('Kasa durumu kontrol edilemedi', 'error');
    }
  }, [loadEntries, loadFolders, showToast]);

  const handleLock = useCallback(async () => {
    try {
      await invoke('lock_vault');
      setVaultLocked(true);
      setEntries([]);
      setFolders([]);
      setSelectedFolder(null);
      setMasterPassword('');
      showToast('Kasa kilitlendi', 'info');
    } catch (error) {
      console.error('Error locking vault:', error);
      showToast('Kasa kilitlenemedi', 'error');
    }
  }, [showToast]);

  const handleUnlock = useCallback(async () => {
    if (!masterPassword.trim()) {
      showToast('Lütfen ana şifrenizi girin', 'error');
      setUnlockError(true);
      return;
    }
    
    setUnlockError(false);
    try {
      const success = await invoke<boolean>('unlock_vault', { masterPassword });
      if (success) {
        setVaultLocked(false);
        setMasterPassword('');
        setUnlockError(false);
        await loadEntries();
        await loadFolders();
        showToast('Kasa başarıyla açıldı', 'success');
      }
    } catch (error) {
      let errorMessage = 'Kasa açılamadı';
      const errorStr = String(error || '');

      if (errorStr.includes('Yanlış ana şifre')) {
        errorMessage = 'Yanlış ana şifre';
        setUnlockError(true);
      } else if (errorStr.includes('Vault dosyası bulunamadı')) {
        errorMessage = 'Vault dosyası bulunamadı. Lütfen ilk kurulumu yapın.';
        setUnlockError(true);
      } else if (errorStr.includes('Vault yüklenemedi')) {
        errorMessage = 'Vault yüklenemedi. Dosya bozuk olabilir.';
        setUnlockError(true);
      } else if (errorStr.includes('Decrypt hatası')) {
        errorMessage = 'Yanlış ana şifre veya bozuk veri';
        setUnlockError(true);
      } else if (errorStr.includes('Çok fazla deneme')) {
        errorMessage = 'Çok fazla deneme. Lütfen bekleyin.';
        setUnlockError(true);
      } else if (errorStr) {
        errorMessage = errorStr;
        setUnlockError(true);
      }

      showToast(errorMessage, 'error');
      setUnlockError(true);
    }
  }, [masterPassword, loadEntries, loadFolders, showToast]);

  useEffect(() => {
    checkVaultStatus();
    const savedFavorites = localStorage.getItem('confpass_favorites');
    if (savedFavorites) {
      try {
        setFavorites(new Set(JSON.parse(savedFavorites)));
      } catch (e) {
        console.error('Failed to load favorites:', e);
      }
    }
  }, [checkVaultStatus]);

  useEffect(() => {
    localStorage.setItem('confpass_favorites', JSON.stringify(Array.from(favorites)));
  }, [favorites]);


  useEffect(() => {
    if (vaultLocked) {
      const title = `ConfPass v${appVersion}`;
      const subtitle = 'Gelişmiş Güvenlik & Şifre Yönetimi';
      
      setDisplayTitle('');
      setDisplaySubtitle('');
      
      let titleIndex = 0;
      const titleInterval = setInterval(() => {
        if (titleIndex < title.length) {
          setDisplayTitle(title.substring(0, titleIndex + 1));
          titleIndex++;
        } else {
          clearInterval(titleInterval);
          
          let subtitleIndex = 0;
          const subtitleInterval = setInterval(() => {
            if (subtitleIndex < subtitle.length) {
              setDisplaySubtitle(subtitle.substring(0, subtitleIndex + 1));
              subtitleIndex++;
            } else {
              clearInterval(subtitleInterval);
            }
          }, 50);
        }
      }, 80);
      
      return () => {
        clearInterval(titleInterval);
      };
    }
  }, [vaultLocked]);

  useEffect(() => {
    if (vaultLocked) {
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
      return;
    }
    
    const handleActivity = () => {
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
      }
      
      autoLockTimerRef.current = setTimeout(() => {
        handleLock();
      }, AUTO_LOCK_TIMEOUT);
    };
    
    handleActivity();
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
    };
  }, [vaultLocked, handleLock]);

  const filteredEntries = useMemo(() => {
    // Helper function to detect if entry has TOTP data
    const hasTotpData = (entry: PasswordEntry): boolean => {
      if (!entry.notes) return false;
      try {
        const parts = entry.notes.split('\n');
        for (const part of parts) {
          if (part.startsWith('{') && part.includes('totp')) {
            const data = JSON.parse(part);
            if (data.totp && data.totp.secret) {
              return true;
            }
          }
        }
      } catch {
        return false;
      }
      return false;
    };

    const query = debouncedSearchQuery.toLowerCase().trim();
    let filtered = entries.filter(entry => {
      const matchesSearch = !query ||
        entry.title.toLowerCase().includes(query) ||
        entry.username.toLowerCase().includes(query) ||
        entry.url?.toLowerCase().includes(query) ||
        entry.notes?.toLowerCase().includes(query);
      const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
      const matchesView = viewMode === 'all' || viewMode === 'entries' || favorites.has(entry.id);

      // Folder filtering logic
      // Klasör seçiliyse: sadece o klasördeki kayıtları göster
      // "Tüm Kayıtlar" seçiliyse: tüm kayıtları göster (klasörlü + klasörsüz)
      // Kategori seçiliyse (hesaplar, kartlar vs.): sadece klasörsüz kayıtları göster
      const matchesFolder = selectedFolder
        ? entry.folder_id === selectedFolder
        : selectedCategory === 'all'
          ? true
          : !entry.folder_id;

      // TOTP filtering logic
      const hasTotp = hasTotpData(entry);
      const isTotpCategory = selectedCategory === 'authenticator';

      // If in authenticator category, only show entries with TOTP data
      // If NOT in authenticator category, exclude entries with TOTP data
      const matchesTotpFilter = isTotpCategory ? hasTotp : !hasTotp;

      return matchesSearch && matchesCategory && matchesView && matchesTotpFilter && matchesFolder;
    });
    return filtered;
  }, [entries, debouncedSearchQuery, selectedCategory, viewMode, favorites, selectedFolder]);


  const categoryCounts = useMemo(() => {
    const counts = {
      all: entries.length,
      accounts: 0,
      bank_cards: 0,
      documents: 0,
      addresses: 0,
      notes: 0,
      passkeys: 0,
      authenticator: 0,
    };

    for (const entry of entries) {
      switch (entry.category) {
        case 'accounts':
          counts.accounts++;
          break;
        case 'bank_cards':
          counts.bank_cards++;
          break;
        case 'documents':
          counts.documents++;
          break;
        case 'addresses':
          counts.addresses++;
          break;
        case 'notes':
          counts.notes++;
          break;
        case 'passkeys':
          counts.passkeys++;
          break;
        case 'authenticator':
          counts.authenticator++;
          break;
      }
    }

    return counts;
  }, [entries]);

  // Calculate folder entry counts
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.folder_id) {
        counts[entry.folder_id] = (counts[entry.folder_id] || 0) + 1;
      }
    }
    return counts;
  }, [entries]);

  // Organize folders hierarchically
  const rootFolders = useMemo(() => {
    return folders.filter(f => !f.parent_id).sort((a, b) => a.order - b.order);
  }, [folders]);

  const getChildFolders = useCallback((parentId: string) => {
    return folders.filter(f => f.parent_id === parentId).sort((a, b) => a.order - b.order);
  }, [folders]);

  const handleMinimize = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.error('Failed to maximize/unmaximize window:', error);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('Close error:', error);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('.search-input-main') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  if (vaultLocked) {
    return (
      <div className="app unlock-screen">
        <div className="unlock-container">
          <div className="lock-icon">
            <img src={AppLogo} alt="ConfPass" style={{ width: 80, height: 80 }} />
          </div>
          <h1 className="typing-title">
            {displayTitle}
            <span className="typing-cursor">|</span>
          </h1>
          <p className="subtitle typing-subtitle">
            {displaySubtitle}
            {displayTitle === 'ConfPass' && displaySubtitle.length < 'Güvenli Şifre Yöneticisi'.length && <span className="typing-cursor">|</span>}
          </p>
          <div className="unlock-form">
            <input
              type="password"
              placeholder="Ana Şifre"
              value={masterPassword}
              onChange={(e) => {
                setMasterPassword(e.target.value);
                setUnlockError(false);
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              className={`master-password-input ${unlockError ? 'error' : ''}`}
              autoFocus
            />
            <button onClick={handleUnlock} className="unlock-button">
              <Unlock size={20} />
              Kasa Aç
            </button>
            {biometricAvailable && (
              <button 
                onClick={handleBiometricUnlock} 
                className="unlock-button"
                style={{ 
                  marginTop: '0.75rem',
                  background: 'transparent',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  fontWeight: '600',
                  boxShadow: '0 4px 15px rgba(138, 75, 243, 0.1)'
                }}
              >
                <Fingerprint size={20} />
                Biyometrik ile Aç
              </button>
            )}
          </div>
          <p className="hint">İlk kullanımda master şifre oluşturulacaktır</p>
          <button 
            onClick={() => setShowForgotPasswordModal(true)}
            style={{
              marginTop: '1.5rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '0.5rem'
            }}
          >
            Ana parolanızı mı unuttunuz?
          </button>
        </div>
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.type === 'success' && <CheckCircle size={20} />}
            {toast.type === 'error' && <XCircle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
            <span>{toast.message}</span>
          </div>
        )}
        
        {showForgotPasswordModal && (
          <ForgotPasswordModal
            onClose={() => setShowForgotPasswordModal(false)}
            onReset={async () => {
              try {
                await invoke('reset_vault');
                setShowForgotPasswordModal(false);
                setMasterPassword('');
                showToast('Kasa sıfırlandı. Yeni bir kasa oluşturabilirsiniz.', 'success');
              } catch (error) {
                showToast('Kasa sıfırlanırken hata oluştu', 'error');
                console.error('Reset vault error:', error);
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="custom-titlebar" data-tauri-drag-region>
        <div className="titlebar-title">
          <img src={AppLogo} alt="ConfPass" style={{ width: 16, height: 16 }} />
          <span>ConfPass - Password Manager</span>
        </div>
        <div className="titlebar-controls">
          <button className="titlebar-button" onClick={handleMinimize} title="Küçült">
            <Minus size={14} />
          </button>
          <button className="titlebar-button" onClick={handleMaximize} title="Büyüt/Küçült">
            <Maximize2 size={14} />
          </button>
          <button className="titlebar-button titlebar-button-close" onClick={handleClose} title="Kapat">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="app-body">
        <div 
          className="sidebar"
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={AppLogo} alt="ConfPass" className="sidebar-logo-img" style={{ width: 42, height: 42 }} />
            <div>
              <h2 style={{ margin: 0 }}>ConfPass</h2>
              <p className="sidebar-subtitle">Password Manager</p>
            </div>
          </div>
          <button onClick={handleLock} className="lock-button" title="Kasa Kilitle">
            <Lock size={18} />
          </button>
        </div>
        
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${selectedCategory === 'all' && currentPage === 'home' && viewMode === 'all' ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage('home');
              setSelectedCategory('all');
              setViewMode('all');
            }}
          >
            <Home size={18} />
            <span>Ana Sayfa</span>
          </button>
          <button 
            className={`nav-item ${selectedCategory === 'accounts' && currentPage === 'home' ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage('home');
              setSelectedCategory('accounts');
            }}
          >
            <Shield size={18} />
            <span>Hesaplar</span>
            {categoryCounts.accounts > 0 && <span className="nav-count">{categoryCounts.accounts}</span>}
          </button>
          <button 
            className={`nav-item ${selectedCategory === 'bank_cards' && currentPage === 'home' ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage('home');
              setSelectedCategory('bank_cards');
            }}
          >
            <Key size={18} />
            <span>Banka kartları</span>
            {categoryCounts.bank_cards > 0 && <span className="nav-count">{categoryCounts.bank_cards}</span>}
          </button>
          <button 
            className={`nav-item ${selectedCategory === 'documents' && currentPage === 'home' ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage('home');
              setSelectedCategory('documents');
            }}
          >
            <Key size={18} />
            <span>Belgeler</span>
            {categoryCounts.documents > 0 && <span className="nav-count">{categoryCounts.documents}</span>}
          </button>
          <button 
            className={`nav-item ${selectedCategory === 'addresses' && currentPage === 'home' ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage('home');
              setSelectedCategory('addresses');
            }}
          >
            <Key size={18} />
            <span>Adresler</span>
            {categoryCounts.addresses > 0 && <span className="nav-count">{categoryCounts.addresses}</span>}
          </button>
          <button 
            className={`nav-item ${selectedCategory === 'notes' && currentPage === 'home' ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage('home');
              setSelectedCategory('notes');
            }}
          >
            <Key size={18} />
            <span>Notlar</span>
            {categoryCounts.notes > 0 && <span className="nav-count">{categoryCounts.notes}</span>}
          </button>
          <button
            className={`nav-item ${currentPage === 'passkeys' ? 'active' : ''}`}
            onClick={() => setCurrentPage('passkeys')}
          >
            <KeyRound size={18} />
            <span>Geçiş Anahtarları</span>
            {categoryCounts.passkeys > 0 && <span className="nav-count">{categoryCounts.passkeys}</span>}
          </button>
          <button
            className={`nav-item ${currentPage === 'authenticator' ? 'active' : ''}`}
            onClick={() => setCurrentPage('authenticator')}
          >
            <Shield size={18} />
            <span>Kimlik Doğrulayıcı</span>
            {categoryCounts.authenticator > 0 && <span className="nav-count">{categoryCounts.authenticator}</span>}
          </button>
          <button className="nav-item" onClick={() => setShowPasswordGenerator(true)}>
            <Key size={18} />
            <span>Parola Oluşturucu</span>
          </button>
          <button 
            className={`nav-item ${currentPage === 'password-check' ? 'active' : ''}`}
            onClick={() => setCurrentPage('password-check')}
          >
            <Shield size={18} />
            <span>Parola Kontrolü</span>
            {passwordSecurity && (passwordSecurity.atRisk.length > 0 || passwordSecurity.weak.length > 0) && (
              <span className="nav-count nav-count-warning">
                {passwordSecurity.atRisk.length + passwordSecurity.weak.length}
              </span>
            )}
          </button>
          <button 
            className="nav-item"
            onClick={() => setShowActivityLog(true)}
          >
            <Clock size={18} />
            <span>Etkinlik Geçmişi</span>
          </button>
        </nav>

        {/* Folders Section */}
        <div className="sidebar-folders">
          <div className="sidebar-folders-header">
            <span className="sidebar-folders-title">Klasörler</span>
            <button
              className="sidebar-folder-add"
              onClick={() => {
                setEditingFolder(null);
                setShowFolderModal(true);
              }}
              title="Yeni Klasör"
            >
              <FolderPlus size={16} />
            </button>
          </div>
          <div className="sidebar-folders-list">
            {folders.length === 0 ? (
              <div className="sidebar-folders-empty">
                <FolderIcon size={20} />
                <span>Henüz klasör yok</span>
              </div>
            ) : (
              <>
                {/* All entries option */}
                <button
                  className={`folder-item ${!selectedFolder ? 'active' : ''} ${dragOverFolder === 'root' ? 'drag-over' : ''}`}
                  onClick={() => setSelectedFolder(null)}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, 'root')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, null)}
                >
                  <FolderIcon size={16} />
                  <span>Tüm Kayıtlar</span>
                </button>
                {/* Render root folders */}
                {rootFolders.map(folder => (
                  <div key={folder.id} className="folder-item-wrapper">
                    <div
                      className={`folder-item ${selectedFolder === folder.id ? 'active' : ''} ${dragOverFolder === folder.id ? 'drag-over' : ''}`}
                      onClick={() => setSelectedFolder(folder.id)}
                      style={{ '--folder-color': folder.color } as React.CSSProperties}
                      onDragOver={handleDragOver}
                      onDragEnter={(e) => handleDragEnter(e, folder.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, folder.id)}
                    >
                      {getChildFolders(folder.id).length > 0 && (
                        <button
                          className="folder-expand"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedFolders(prev => {
                              const next = new Set(prev);
                              if (next.has(folder.id)) {
                                next.delete(folder.id);
                              } else {
                                next.add(folder.id);
                              }
                              return next;
                            });
                          }}
                        >
                          <ChevronRight
                            size={14}
                            className={expandedFolders.has(folder.id) ? 'rotated' : ''}
                          />
                        </button>
                      )}
                      <div
                        className="folder-color-dot"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="folder-name">{folder.name}</span>
                      {folderCounts[folder.id] > 0 && (
                        <span className="folder-count">{folderCounts[folder.id]}</span>
                      )}
                      <button
                        className="folder-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id);
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                    {folderMenuOpen === folder.id && (
                      <div className="folder-menu">
                        <button
                          onClick={() => {
                            setEditingFolder(folder);
                            setShowFolderModal(true);
                            setFolderMenuOpen(null);
                          }}
                        >
                          <Edit3 size={14} />
                          <span>Düzenle</span>
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            setConfirmDialog({
                              message: `"${folder.name}" klasörünü silmek istediğinize emin misiniz?`,
                              onConfirm: () => {
                                deleteFolder(folder.id);
                                setConfirmDialog(null);
                                setFolderMenuOpen(null);
                              }
                            });
                          }}
                        >
                          <Trash2 size={14} />
                          <span>Sil</span>
                        </button>
                      </div>
                    )}
                    {/* Child folders */}
                    {expandedFolders.has(folder.id) && getChildFolders(folder.id).map(child => (
                      <div
                        key={child.id}
                        className={`folder-item folder-item-child ${selectedFolder === child.id ? 'active' : ''}`}
                        onClick={() => setSelectedFolder(child.id)}
                        style={{ '--folder-color': child.color } as React.CSSProperties}
                      >
                        <div
                          className="folder-color-dot"
                          style={{ backgroundColor: child.color }}
                        />
                        <span className="folder-name">{child.name}</span>
                        {folderCounts[child.id] > 0 && (
                          <span className="folder-count">{folderCounts[child.id]}</span>
                        )}
                        <button
                          className="folder-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderMenuOpen(folderMenuOpen === child.id ? null : child.id);
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button 
            className="sidebar-footer-icon" 
            onClick={() => setCurrentPage('settings')}
            title="Ayarlar"
          >
            <SettingsIcon size={20} />
          </button>
          <button className="sidebar-footer-icon" title="Yardım">
            <HelpCircle size={20} />
          </button>
        </div>
      </div>

      <div className="main-content">
        {currentPage === 'settings' ? (
          <Settings
            onBack={() => setCurrentPage('home')}
            showToast={showToast}
            onResetComplete={() => {
              setCurrentPage('home');
              setEntries([]);
              setVaultLocked(true);
            }}
          />
        ) : currentPage === 'password-check' ? (
          <SecurityCheckPage
            entries={entries}
            onBack={() => setCurrentPage('home')}
            onEdit={setEditingEntry}
            showToast={showToast}
          />
        ) : currentPage === 'authenticator' ? (
          <AuthenticatorView
            entries={entries}
            onAddNew={() => setShowAddAuthenticator(true)}
            showToast={showToast}
            loadEntries={loadEntries}
            setConfirmDialog={setConfirmDialog}
          />
        ) : currentPage === 'passkeys' ? (
          <PasskeysView
            entries={entries}
            showToast={showToast}
            loadEntries={loadEntries}
            setConfirmDialog={setConfirmDialog}
          />
        ) : selectedCategory === 'all' && viewMode === 'all' ? (
          <Dashboard
            entries={entries}
            favorites={favorites}
            passwordSecurity={passwordSecurity}
            onNavigateToCategory={(category) => {
              setSelectedCategory(category);
            }}
            onNavigateToPasswordCheck={() => setCurrentPage('password-check')}
            onNavigateToSettings={() => setCurrentPage('settings')}
            showToast={showToast}
            updateInfo={updateInfo}
          />
        ) : (
        <>
        <div className="main-header">
          <h1 className="main-title">
            {selectedFolder
              ? (folders.find(f => f.id === selectedFolder)?.name || 'Klasör')
              : viewMode === 'favorites'
                ? 'Favoriler'
                : CATEGORY_NAMES[selectedCategory] || 'Tüm Girişler'}
            {filteredEntries.length > 0 && (
              <span className="main-title-count"> ({filteredEntries.length})</span>
            )}
          </h1>
          <div className="main-header-actions">
            <div className="add-button-wrapper">
              {selectedFolder ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddDropdown(!showAddDropdown);
                    }}
                    className="add-button-primary"
                  >
                    <Plus size={18} />
                    Klasöre Ekle
                    <ChevronDown size={14} className={showAddDropdown ? 'open' : ''} />
                  </button>
                  {showAddDropdown && (
                    <div className="add-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                      {CATEGORY_OPTIONS.filter(opt => opt.value !== 'passkeys' && opt.value !== 'authenticator').map(option => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setShowAddModal(true);
                            setShowAddDropdown(false);
                            setTimeout(() => {
                              const event = new CustomEvent('setAddCategory', { detail: option.value });
                              window.dispatchEvent(event);
                            }, 100);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : selectedCategory === 'all' ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddDropdown(!showAddDropdown);
                    }}
                    className="add-button-primary"
                  >
                    <Plus size={18} />
                    Ekle
                    <ChevronDown size={14} className={showAddDropdown ? 'open' : ''} />
                  </button>
                  {showAddDropdown && (
                    <div className="add-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                      {CATEGORY_OPTIONS.filter(opt => opt.value !== 'passkeys' && opt.value !== 'authenticator').map(option => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setShowAddModal(true);
                            setShowAddDropdown(false);
                            setTimeout(() => {
                              const event = new CustomEvent('setAddCategory', { detail: option.value });
                              window.dispatchEvent(event);
                            }, 100);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowAddModal(true);
                    setTimeout(() => {
                      const event = new CustomEvent('setAddCategory', { detail: selectedCategory });
                      window.dispatchEvent(event);
                    }, 100);
                  }}
                  className="add-button-primary"
                  style={{ display: selectedCategory === 'passkeys' ? 'none' : 'flex' }}
                >
                  <Plus size={18} />
                  {CATEGORY_NAMES[selectedCategory]} Ekle
                </button>
              )}
            </div>
            <div className="import-export-wrapper">
              <button 
                className="icon-header-button" 
                title="Dışa Aktar"
                onClick={async () => {
                  try {
                    const data = await invoke<string>('export_vault');
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `confpass-export-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Kasa başarıyla dışa aktarıldı', 'success');
                  } catch (error) {
                    const errorStr = String(error || '');
                    showToast(errorStr || 'Dışa aktarma hatası', 'error');
                  }
                }}
              >
                <Download size={18} />
              </button>
            </div>
            <div className="view-options">
              <button
                className={`view-option ${viewMode === 'entries' || (viewMode === 'all' && selectedCategory !== 'all') ? 'active' : ''}`}
                onClick={() => setViewMode('entries')}
                title="Tümü"
              >
                <Grid3x3 size={18} />
              </button>
              <button
                className={`view-option ${viewMode === 'favorites' ? 'active' : ''}`}
                onClick={() => setViewMode('favorites')}
                title="Favoriler"
              >
                <Star size={18} />
              </button>
            </div>
            <div className="search-container-main">
              <Search size={18} />
              <input
                type="text"
                placeholder="Ara (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input-main"
              />
            </div>
            {filteredEntries.length > 0 && !selectionMode && (
              <button
                className="selection-mode-btn"
                onClick={() => setSelectionMode(true)}
                title="Çoklu seçim modu"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s'
                }}
              >
                <Grid3x3 size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="content-area" onClick={() => {
          showAddDropdown && setShowAddDropdown(false);
        }} onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setShowAddDropdown(false);
          }
        }}>
          {/* Bulk Operations Bar */}
          {selectionMode && (
            <div className="bulk-operations-bar">
              <div className="selection-info">
                <span className="selection-count">{selectedEntries.size}</span>
                <span>kayıt seçildi</span>
                <button className="bulk-btn" onClick={() => selectAll(filteredEntries.map(e => e.id))}>
                  Tümünü Seç
                </button>
                <button className="bulk-btn" onClick={deselectAll}>
                  Seçimi Temizle
                </button>
              </div>
              <div className="bulk-actions">
                {folders.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    <select
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'remove') {
                          handleBulkMove(null);
                        } else if (val) {
                          handleBulkMove(val);
                        }
                        e.target.value = '';
                      }}
                      defaultValue=""
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="" disabled>Klasöre Taşı</option>
                      <option value="remove">Klasörden Çıkar</option>
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button className="bulk-btn danger" onClick={handleBulkDelete}>
                  <Trash2 size={16} />
                  Seçilenleri Sil
                </button>
                <button className="bulk-btn exit" onClick={exitSelectionMode}>
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
          <div className="entries-grid">
            {filteredEntries.length === 0 ? (
              <div className="empty-state">
                <Key size={64} />
                <p>
                  {viewMode === 'favorites'
                    ? 'Favori kayıt yok'
                    : searchQuery
                      ? 'Arama sonucu bulunamadı'
                      : 'Henüz kayıt yok'}
                </p>
                <p className="empty-subtitle">
                  {viewMode === 'favorites'
                    ? 'Favorilere eklemek için kayıt kartındaki yıldız ikonuna tıklayın'
                    : searchQuery
                      ? 'Farklı bir arama terimi deneyin'
                      : 'Üstteki ekle butonunu kullanarak ilk şifrenizi ekleyin'}
                </p>
              </div>
            ) : (
              <>
                {filteredEntries.map(entry => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    isPasswordVisible={!!showPasswords[entry.id]}
                    onTogglePassword={(id) => setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }))}
                    onEdit={setEditingEntry}
                    showToast={showToast}
                    loadEntries={loadEntries}
                    setConfirmDialog={setConfirmDialog}
                    isSelected={selectedEntries.has(entry.id)}
                    isFavorite={favorites.has(entry.id)}
                    onToggleFavorite={(id) => {
                      setFavorites(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(id)) {
                          newSet.delete(id);
                          if (viewMode === 'favorites') {
                            showToast('Favorilerden kaldırıldı', 'info');
                          }
                        } else {
                          newSet.add(id);
                          showToast('Favorilere eklendi', 'success');
                        }
                        return newSet;
                      });
                    }}
                    onShowTotp={(secret, issuer, account) => {
                      setTotpModal({ secret, issuer, account });
                    }}
                    selectionMode={selectionMode}
                    onToggleSelect={toggleSelection}
                    onDragStart={handleDragStart}
                  />
                ))}
              </>
            )}
          </div>
        </div>
        </>
        )}
      </div>
      </div>

      {showAddModal && (
        <AddEntryModal
          onClose={() => {
            setShowAddModal(false);
            loadEntries();
          }}
          showToast={showToast}
          initialCategory={selectedCategory === 'all' || selectedCategory === 'favorites' ? 'accounts' : selectedCategory}
          selectedFolder={selectedFolder}
        />
      )}

      {showPasswordGenerator && (
        <PasswordGeneratorModal
          onClose={() => setShowPasswordGenerator(false)}
          showToast={showToast}
        />
      )}

      {totpModal && (
        <TotpModal
          secret={totpModal.secret}
          issuer={totpModal.issuer}
          account={totpModal.account}
          onClose={() => setTotpModal(null)}
          showToast={showToast}
        />
      )}

      {showActivityLog && (
        <ActivityLogModal
          onClose={() => setShowActivityLog(false)}
        />
      )}

      {showAddAuthenticator && (
        <AddAuthenticatorModal
          onClose={() => setShowAddAuthenticator(false)}
          showToast={showToast}
          loadEntries={loadEntries}
        />
      )}

      {showAddPasskey && (
        <div className="modal-overlay">
          <div className="modal-content modal-card-form">
            <button type="button" className="modal-close-btn" onClick={() => setShowAddPasskey(false)} style={{ position: 'absolute', top: '16px', right: '16px' }}>
              <X size={20} />
            </button>
            <AddPasskeyModal
              onClose={() => {
                setShowAddPasskey(false);
                loadEntries();
              }}
              showToast={showToast}
            />
          </div>
        </div>
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => {
            setEditingEntry(null);
            loadEntries();
          }}
          showToast={showToast}
        />
      )}

      {/* Folder Modal */}
      {showFolderModal && (
        <FolderModal
          folder={editingFolder}
          folders={folders}
          onClose={() => {
            setShowFolderModal(false);
            setEditingFolder(null);
          }}
          onCreate={createFolder}
          onUpdate={updateFolder}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={20} />}
          {toast.type === 'error' && <XCircle size={20} />}
          {toast.type === 'info' && <Info size={20} />}
          <span>{toast.message}</span>
        </div>
      )}

      {detectedPasskey && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', position: 'relative' }}>
            <button type="button" className="modal-close-btn" onClick={() => setDetectedPasskey(null)} style={{ position: 'absolute', top: '16px', right: '16px' }}>
              <X size={20} />
            </button>
            <h2>Geçiş Anahtarı Algılandı</h2>
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Yeni bir geçiş anahtarı kaydı algılandı. Bu geçiş anahtarını ConfPass'e eklemek ister misiniz?
              </p>
              <div style={{ 
                background: 'var(--bg-tertiary)', 
                padding: '1rem', 
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Servis:</strong> {detectedPasskey.rpId}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Kullanıcı:</strong> {detectedPasskey.userName}
                </div>
                {detectedPasskey.userDisplayName && (
                  <div>
                    <strong>Görünen Ad:</strong> {detectedPasskey.userDisplayName}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="cancel-button" 
                onClick={() => setDetectedPasskey(null)}
              >
                İptal
              </button>
              <button 
                className="submit-button" 
                onClick={async () => {
                  if (!detectedPasskey) return;
                  
                  try {
                    const passkeyData: PasskeyData = {
                      username: detectedPasskey.userName,
                      email: detectedPasskey.userDisplayName.includes('@') ? detectedPasskey.userDisplayName : undefined,
                      domain: detectedPasskey.rpId,
                    };

                    let url = detectedPasskey.rpId;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                      url = `https://${url}`;
                    }

                    await invoke('add_password_entry', {
                      title: detectedPasskey.rpId.split('.')[0] || detectedPasskey.rpId,
                      username: detectedPasskey.userName,
                      password: '',
                      url: url,
                      notes: JSON.stringify(passkeyData),
                      category: 'passkeys',
                    });
                    
                    try {
                      await invoke('log_activity', {
                        action: 'create',
                        entry_id: null,
                        details: `Geçiş anahtarı otomatik eklendi: ${detectedPasskey.rpId}`
                      });
                    } catch (logError) {
                      console.error('Activity log error:', logError);
                    }
                    
                    showToast('Geçiş anahtarı başarıyla eklendi', 'success');
                    setDetectedPasskey(null);
                    loadEntries();
                  } catch (error) {
                    const errorStr = String(error || '');
                    let errorMessage = 'Geçiş anahtarı eklenirken hata oluştu';
                    
                    if (errorStr.includes('Kasa kilitli')) {
                      errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
                    } else if (errorStr) {
                      errorMessage = errorStr;
                    }
                    
                    showToast(errorMessage, 'error');
                  }
                }}
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="modal-overlay">
          <div className="confirm-dialog">
            <div className="confirm-dialog-header">
              <AlertCircle size={24} />
              <h3>Onay</h3>
            </div>
            <p className="confirm-dialog-message">{confirmDialog.message}</p>
            <div className="confirm-dialog-actions">
              <button className="cancel-button" onClick={() => setConfirmDialog(null)}>
                İptal
              </button>
              <button className="submit-button" onClick={confirmDialog.onConfirm}>
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddEntryModal({ onClose, showToast, initialCategory = 'accounts', selectedFolder }: { onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void; initialCategory?: string; selectedFolder?: string | null }) {
  const [category, setCategory] = useState(initialCategory);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    const handleSetCategory = (e: CustomEvent) => {
      setCategory(e.detail);
    };
    window.addEventListener('setAddCategory' as any, handleSetCategory as EventListener);
    return () => {
      window.removeEventListener('setAddCategory' as any, handleSetCategory as EventListener);
    };
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-card-form">
        <button type="button" className="modal-close-btn" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px' }}>
          <X size={20} />
        </button>
        {category === 'accounts' && <AddAccountModal onClose={onClose} showToast={showToast} folderId={selectedFolder} />}
        {category === 'bank_cards' && <AddBankCardModal onClose={onClose} showToast={showToast} folderId={selectedFolder} />}
        {category === 'documents' && <AddDocumentModal onClose={onClose} showToast={showToast} folderId={selectedFolder} />}
        {category === 'addresses' && <AddAddressModal onClose={onClose} showToast={showToast} folderId={selectedFolder} />}
        {category === 'notes' && <AddNoteModal onClose={onClose} showToast={showToast} folderId={selectedFolder} />}
        {category === 'passkeys' && <AddPasskeyModal onClose={onClose} showToast={showToast} folderId={selectedFolder} />}
      </div>
    </div>
  );
}

function AddAccountModal({ onClose, showToast, folderId }: { onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void; folderId?: string | null }) {
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const generatePassword = async () => {
    try {
      const pwd = await invoke<string>('generate_password', {
        length: 16,
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: true,
      });
      setPassword(pwd);
    } catch (error) {
      console.error('Error generating password:', error);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !username.trim() || !password.trim()) {
      showToast('Lütfen tüm zorunlu alanları doldurun', 'error');
      return;
    }

    if (url.trim() && !validateUrl(url.trim())) {
      showToast('Geçersiz URL formatı. http:// veya https:// ile başlamalı', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await invoke('add_password_entry', {
        title: title.trim(),
        username: username.trim(),
        password,
        url: url.trim() || null,
        notes: notes.trim() || null,
        category: 'accounts',
        extraFields: null,
        folderId: folderId || null,
      });

      try {
        await invoke('log_activity', {
          action: 'create',
          entry_id: null,
          details: `Hesap eklendi: ${title.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }

      showToast('Hesap başarıyla eklendi', 'success');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Kayıt eklenirken hata oluştu';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Kayıt eklendi ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h2>Yeni Hesap Ekle</h2>
      <div className="form-group">
        <label>Başlık *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="örn: Gmail Hesabı"
        />
      </div>
      <div className="form-group">
        <label>Kullanıcı Adı *</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="kullanıcı adı veya e-posta"
        />
      </div>
      <div className="form-group">
        <label>Şifre *</label>
        <div className="password-input-group">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="şifre"
          />
          <button onClick={generatePassword} className="generate-password-btn">
            Oluştur
          </button>
        </div>
      </div>
      <div className="form-group">
        <label>Web Sitesi Adresi</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </div>
      <div className="form-group">
        <label>Notlar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ek notlar..."
          rows={3}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </>
  );
}

function AddBankCardModal({ onClose, showToast, folderId }: { onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void; folderId?: string | null }) {
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [cardType, setCardType] = useState('visa');
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const cardGradients: Record<string, string> = {
    visa: 'linear-gradient(135deg, #1a1f71 0%, #2d35a8 50%, #1a1f71 100%)',
    mastercard: 'linear-gradient(135deg, #eb001b 0%, #f79e1b 100%)',
    amex: 'linear-gradient(135deg, #006fcf 0%, #00a1e0 100%)',
    discover: 'linear-gradient(135deg, #ff6000 0%, #ffab00 100%)',
    other: 'linear-gradient(135deg, #2d3436 0%, #636e72 100%)',
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g) || [];
    return groups.join(' ').slice(0, 19);
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  const detectCardType = (number: string) => {
    const cleaned = number.replace(/\D/g, '');
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^6(?:011|5)/.test(cleaned)) return 'discover';
    return 'other';
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
    setCardType(detectCardType(formatted));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d/]/g, '');
    if (value.length <= 5) {
      setExpiry(formatExpiry(value.replace('/', '')));
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCvv(value);
  };

  const displayCardNumber = () => {
    const cleaned = cardNumber.replace(/\s/g, '');
    const padded = cleaned.padEnd(16, '•');
    return padded.match(/.{1,4}/g)?.join(' ') || '•••• •••• •••• ••••';
  };

  const handleSubmit = async () => {
    if (!cardName.trim() || !cardNumber.trim() || !expiry || !cvv.trim() || !cardholderName.trim()) {
      showToast('Lütfen tüm zorunlu alanları doldurun', 'error');
      return;
    }

    if (cardNumber.replace(/\s/g, '').length < 13) {
      showToast('Kart numarası en az 13 haneli olmalıdır', 'error');
      return;
    }

    if (expiry.length !== 5) {
      showToast('Geçerli bir son kullanma tarihi girin (AA/YY)', 'error');
      return;
    }

    if (cvv.length < 3) {
      showToast('CVV en az 3 haneli olmalıdır', 'error');
      return;
    }

    const cardData = {
      cardNumber: cardNumber.replace(/\s/g, ''),
      expiry,
      cvv,
      cardholderName,
      cardType,
    };

    setIsSubmitting(true);
    try {
      await invoke('add_password_entry', {
        title: cardName.trim(),
        username: cardNumber.replace(/\s/g, ''),
        password: cvv,
        url: null,
        notes: JSON.stringify(cardData),
        category: 'bank_cards',
        folderId: folderId || null,
      });

      try {
        await invoke('log_activity', {
          action: 'create',
          entry_id: null,
          details: `Banka kartı eklendi: ${cardName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }

      showToast('Banka kartı başarıyla eklendi', 'success');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Kart eklenirken hata oluştu';

      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Kart eklendi ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }

      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bank-card-modal">
      <h2>Yeni Kart Ekle</h2>

      {/* 3D Card Preview */}
      <div className="card-preview-container">
        <div className={`card-3d ${isFlipped ? 'flipped' : ''}`}>
          {/* Front */}
          <div className="card-face card-front" style={{ background: cardGradients[cardType] }}>
            <div className="card-shine"></div>
            <div className="card-chip">
              <div className="chip-line"></div>
              <div className="chip-line"></div>
              <div className="chip-line"></div>
              <div className="chip-line"></div>
            </div>
            <div className="card-contactless">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3"/>
                <path d="M7 12c0-2.76 2.24-5 5-5v2c-1.66 0-3 1.34-3 3H7zm5-3c1.66 0 3 1.34 3 3h2c0-2.76-2.24-5-5-5v2z"/>
              </svg>
            </div>
            <div className="card-type-logo">
              {cardType === 'visa' && <span className="visa-logo">VISA</span>}
              {cardType === 'mastercard' && <div className="mc-logo"><span></span><span></span></div>}
              {cardType === 'amex' && <span className="amex-logo">AMEX</span>}
              {cardType === 'discover' && <span className="discover-logo">DISCOVER</span>}
              {cardType === 'other' && <span className="other-logo">CARD</span>}
            </div>
            <div className={`card-number ${focusedField === 'cardNumber' ? 'focused' : ''}`}>
              {displayCardNumber()}
            </div>
            <div className="card-bottom">
              <div className="card-holder">
                <span className="label">Kart Sahibi</span>
                <span className={`value ${focusedField === 'cardholderName' ? 'focused' : ''}`}>
                  {cardholderName || 'AD SOYAD'}
                </span>
              </div>
              <div className="card-expiry">
                <span className="label">Son Kullanma</span>
                <span className={`value ${focusedField === 'expiry' ? 'focused' : ''}`}>
                  {expiry || 'AA/YY'}
                </span>
              </div>
            </div>
          </div>

          {/* Back */}
          <div className="card-face card-back" style={{ background: cardGradients[cardType] }}>
            <div className="card-shine"></div>
            <div className="card-stripe"></div>
            <div className="card-cvv-section">
              <div className="cvv-label">CVV</div>
              <div className={`cvv-band ${focusedField === 'cvv' ? 'focused' : ''}`}>
                {cvv ? '•'.repeat(cvv.length) : '•••'}
              </div>
            </div>
            <div className="card-back-text">
              Kartınızın arkasındaki 3 haneli güvenlik kodu
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="card-form">
        <div className="form-row">
          <div className="form-field full">
            <label>Kart Adı</label>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Örn: Ana Param"
              className="card-input"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field full">
            <label>Kart Numarası</label>
            <input
              type="text"
              value={cardNumber}
              onChange={handleCardNumberChange}
              onFocus={() => { setFocusedField('cardNumber'); setIsFlipped(false); }}
              onBlur={() => setFocusedField(null)}
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              className="card-input mono"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field full">
            <label>Kart Sahibi</label>
            <input
              type="text"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
              onFocus={() => { setFocusedField('cardholderName'); setIsFlipped(false); }}
              onBlur={() => setFocusedField(null)}
              placeholder="AD SOYAD"
              className="card-input uppercase"
            />
          </div>
        </div>

        <div className="form-row two-col">
          <div className="form-field">
            <label>Son Kullanma</label>
            <input
              type="text"
              value={expiry}
              onChange={handleExpiryChange}
              onFocus={() => { setFocusedField('expiry'); setIsFlipped(false); }}
              onBlur={() => setFocusedField(null)}
              placeholder="AA/YY"
              maxLength={5}
              className="card-input mono center"
            />
          </div>
          <div className="form-field">
            <label>CVV</label>
            <input
              type="password"
              value={cvv}
              onChange={handleCvvChange}
              onFocus={() => { setFocusedField('cvv'); setIsFlipped(true); }}
              onBlur={() => setFocusedField(null)}
              placeholder="•••"
              maxLength={4}
              className="card-input mono center"
            />
          </div>
        </div>
      </div>

      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor...' : 'Kartı Kaydet'}
        </button>
      </div>
    </div>
  );
}

function AddDocumentModal({ onClose, showToast, folderId }: { onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void; folderId?: string | null }) {
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [filePath, setFilePath] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!documentName.trim()) {
      showToast('Lütfen belge adını girin', 'error');
      return;
    }

    const documentData = {
      documentType,
      filePath,
    };

    setIsSubmitting(true);
    try {
      await invoke('add_password_entry', {
        title: documentName.trim(),
        username: documentType || 'Belge',
        password: 'document',
        url: null,
        notes: JSON.stringify(documentData) + (notes.trim() ? '\n' + notes.trim() : ''),
        category: 'documents',
        folderId: folderId || null,
      });

      try {
        await invoke('log_activity', {
          action: 'create',
          entry_id: null,
          details: `Belge eklendi: ${documentName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }

      showToast('Belge başarıyla eklendi', 'success');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Belge eklenirken hata oluştu';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Belge eklendi ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h2>Belge Ekle</h2>
      <div className="form-group">
        <label>Belge Adı *</label>
        <input
          type="text"
          value={documentName}
          onChange={(e) => setDocumentName(e.target.value)}
          placeholder="örn: Pasaport, Kimlik"
        />
      </div>
      <div className="form-group">
        <label>Belge Tipi</label>
        <input
          type="text"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          placeholder="örn: Pasaport, Sürücü Belgesi"
        />
      </div>
      <div className="form-group">
        <label>Dosya Yolu</label>
        <input
          type="text"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="C:\Users\...\belge.pdf"
        />
      </div>
      <div className="form-group">
        <label>Notlar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ek notlar..."
          rows={3}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </>
  );
}

function AddAddressModal({ onClose, showToast, folderId }: { onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void; folderId?: string | null }) {
  const [addressName, setAddressName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('Türkiye');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!addressName.trim() || !streetAddress.trim() || !city.trim()) {
      showToast('Lütfen zorunlu alanları doldurun', 'error');
      return;
    }

    const addressData = {
      street: streetAddress,
      city,
      state,
      postalCode,
      country,
    };

    setIsSubmitting(true);
    try {
      await invoke('add_password_entry', {
        title: addressName.trim(),
        username: streetAddress.trim(),
        password: '',
        url: null,
        notes: JSON.stringify(addressData) + (notes.trim() ? '\n' + notes.trim() : ''),
        category: 'addresses',
        folderId: folderId || null,
      });

      try {
        await invoke('log_activity', {
          action: 'create',
          entry_id: null,
          details: `Adres eklendi: ${addressName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }

      showToast('Adres başarıyla eklendi', 'success');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Adres eklenirken hata oluştu';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Adres eklendi ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h2>Adres Ekle</h2>
      <div className="form-group">
        <label>Adres Adı *</label>
        <input
          type="text"
          value={addressName}
          onChange={(e) => setAddressName(e.target.value)}
          placeholder="örn: Ev Adresim, İş Adresim"
        />
      </div>
      <div className="form-group">
        <label>Sokak Adresi *</label>
        <input
          type="text"
          value={streetAddress}
          onChange={(e) => setStreetAddress(e.target.value)}
          placeholder="Sokak, cadde, mahalle"
        />
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Şehir *</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="İstanbul"
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>İlçe/Eyalet</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Kadıköy"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Posta Kodu</label>
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="34000"
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Ülke</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Türkiye"
          />
        </div>
      </div>
      <div className="form-group">
        <label>Notlar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ek notlar..."
          rows={3}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </>
  );
}

function AddPasskeyModal({ onClose, showToast, folderId }: { onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void; folderId?: string | null }) {
  const [serviceName, setServiceName] = useState('');
  const [domain, setDomain] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!serviceName.trim() || !domain.trim()) {
      showToast('Lütfen servis adı ve domain girin', 'error');
      return;
    }

    if (!username.trim() && !email.trim()) {
      showToast('Lütfen kullanıcı adı veya e-posta girin', 'error');
      return;
    }

    if (domain.trim() && !validateUrl(domain.trim()) && !domain.trim().includes('.')) {
      showToast('Geçersiz domain formatı', 'error');
      return;
    }

    const passkeyData: PasskeyData = {
      username: username.trim() || undefined,
      email: email.trim() || undefined,
      domain: domain.trim(),
    };

    setIsSubmitting(true);
    try {
      let url = domain.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      await invoke('add_password_entry', {
        title: serviceName.trim(),
        username: username.trim() || email.trim() || '',
        password: '',
        url: url,
        notes: JSON.stringify(passkeyData),
        category: 'passkeys',
        folderId: folderId,
      });
      
      try {
        await invoke('log_activity', {
          action: 'create',
          entry_id: null,
          details: `Geçiş anahtarı eklendi: ${serviceName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
      
      showToast('Geçiş anahtarı başarıyla eklendi', 'success');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Geçiş anahtarı eklenirken hata oluştu';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Geçiş anahtarı eklendi ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h2>Geçiş Anahtarı Ekle</h2>
      <div className="form-group">
        <label>Servis Adı *</label>
        <input
          type="text"
          value={serviceName}
          onChange={(e) => setServiceName(e.target.value)}
          placeholder="Örn: Google, GitHub, Discord"
          disabled={isSubmitting}
          autoFocus
        />
      </div>
      <div className="form-group">
        <label>Domain/URL *</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Örn: google.com veya https://google.com"
          disabled={isSubmitting}
        />
      </div>
      <div className="form-group">
        <label>Kullanıcı Adı</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Kullanıcı adı (opsiyonel)"
          disabled={isSubmitting}
        />
      </div>
      <div className="form-group">
        <label>E-posta</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-posta adresi (opsiyonel)"
          disabled={isSubmitting}
        />
      </div>
      <div style={{
        background: 'rgba(0, 217, 255, 0.1)',
        border: '1px solid rgba(0, 217, 255, 0.2)',
        borderRadius: '8px',
        padding: '1rem',
        marginTop: '1rem',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.6
      }}>
        <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: '0.5rem' }}>Geçiş Anahtarları Hakkında</strong>
        Geçiş anahtarları, parolalara göre daha güvenli bir alternatiftir. Biyometrik kimlik doğrulama veya cihaz PIN'i ile çalışırlar. Bu bilgiler sadece referans amaçlıdır; gerçek geçiş anahtarı cihazınızda saklanır.
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </>
  );
}

function AddNoteModal({ onClose, showToast, folderId }: { onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void; folderId?: string | null }) {
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      showToast('Lütfen başlık ve içerik girin', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await invoke('add_password_entry', {
        title: noteTitle.trim(),
        username: '',
        password: '',
        url: null,
        notes: noteContent.trim(),
        category: 'notes',
        folderId: folderId,
      });
      try {
        await invoke('log_activity', {
          action: 'create',
          entry_id: null,
          details: `Not eklendi: ${noteTitle.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
      
      showToast('Not başarıyla eklendi', 'success');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Not eklenirken hata oluştu';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Not eklendi ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h2>Not Ekle</h2>
      <div className="form-group">
        <label>Başlık *</label>
        <input
          type="text"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          placeholder="Not başlığı"
        />
      </div>
      <div className="form-group">
        <label>İçerik *</label>
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Not içeriğinizi buraya yazın..."
          rows={8}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </>
  );
}

function EditEntryModal({ entry, onClose, showToast }: { entry: PasswordEntry; onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-card-form">
        <button type="button" className="modal-close-btn" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px' }}>
          <X size={20} />
        </button>
        {entry.category === 'accounts' && <EditAccountModal entry={entry} onClose={onClose} showToast={showToast} />}
        {entry.category === 'bank_cards' && <EditBankCardModal entry={entry} onClose={onClose} showToast={showToast} />}
        {entry.category === 'documents' && <EditDocumentModal entry={entry} onClose={onClose} showToast={showToast} />}
        {entry.category === 'addresses' && <EditAddressModal entry={entry} onClose={onClose} showToast={showToast} />}
        {entry.category === 'notes' && <EditNoteModal entry={entry} onClose={onClose} showToast={showToast} />}
        {entry.category === 'passkeys' && <EditPasskeyModal entry={entry} onClose={onClose} showToast={showToast} />}
      </div>
    </div>
  );
}

function EditAccountModal({ entry, onClose, showToast }: { entry: PasswordEntry; onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  const [title, setTitle] = useState(entry.title);
  const [username, setUsername] = useState(entry.username);
  const [password, setPassword] = useState(entry.password);
  const [url, setUrl] = useState(entry.url || '');
  const [notes, setNotes] = useState(entry.notes || '');

  const generatePassword = async () => {
    try {
      const pwd = await invoke<string>('generate_password', {
        length: 16,
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: true,
      });
      setPassword(pwd);
    } catch (error) {
      console.error('Error generating password:', error);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !username.trim() || !password.trim()) {
      showToast('Lütfen tüm zorunlu alanları doldurun', 'error');
      return;
    }

    if (url.trim() && !validateUrl(url.trim())) {
      showToast('Geçersiz URL formatı. http:// veya https:// ile başlamalı', 'error');
      return;
    }

    try {
      await invoke('update_password_entry', {
        id: entry.id,
        title: title.trim() !== entry.title ? title.trim() : null,
        username: username.trim() !== entry.username ? username.trim() : null,
        password: password !== entry.password ? password : null,
        url: url.trim() !== (entry.url || '') ? (url.trim() || null) : null,
        notes: notes.trim() !== (entry.notes || '') ? (notes.trim() || null) : null,
        category: null,
      });
      
      try {
        await invoke('log_activity', {
          action: 'update',
          entry_id: entry.id,
          details: `Hesap güncellendi: ${title.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
      
      showToast('Hesap başarıyla güncellendi', 'success');
      onClose();
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Güncelleme hatası';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Güncelleme yapıldı ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
    }
  };

  return (
    <>
      <h2>Hesap Düzenle</h2>
      <div className="form-group">
        <label>Başlık *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="örn: Gmail Hesabı"
        />
      </div>
      <div className="form-group">
        <label>Kullanıcı Adı *</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="kullanıcı adı veya e-posta"
        />
      </div>
      <div className="form-group">
        <label>Şifre *</label>
        <div className="password-input-group">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="şifre"
          />
          <button onClick={generatePassword} className="generate-password-btn">
            Oluştur
          </button>
        </div>
      </div>
      <div className="form-group">
        <label>Web Sitesi Adresi</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </div>
      <div className="form-group">
        <label>Notlar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ek notlar..."
          rows={3}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button">İptal</button>
        <button onClick={handleSubmit} className="submit-button">Güncelle</button>
      </div>
    </>
  );
}

function EditBankCardModal({ entry, onClose, showToast }: { entry: PasswordEntry; onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  let cardData: BankCardData = {};
  try {
    if (entry.notes) {
      cardData = JSON.parse(entry.notes) as BankCardData;
    }
  } catch (e) {
    cardData = {};
  }

  // Parse existing expiry - could be MM/YY or MM/YYYY format
  const parseExpiry = (expiryStr: string | undefined) => {
    if (!expiryStr) return '';
    const parts = expiryStr.split('/');
    if (parts.length === 2) {
      const month = parts[0].padStart(2, '0');
      const year = parts[1].length === 4 ? parts[1].slice(2) : parts[1];
      return `${month}/${year}`;
    }
    return expiryStr;
  };

  const formatCardNumberDisplay = (num: string) => {
    const cleaned = num.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g) || [];
    return groups.join(' ').slice(0, 19);
  };

  const [cardName, setCardName] = useState(entry.title);
  const [cardNumber, setCardNumber] = useState(formatCardNumberDisplay(entry.username || cardData.cardNumber || ''));
  const [expiry, setExpiry] = useState(parseExpiry(cardData.expiry));
  const [cvv, setCvv] = useState(entry.password || '');
  const [cardholderName, setCardholderName] = useState(cardData.cardholderName || '');
  const [cardType, setCardType] = useState(() => {
    const type = cardData.cardType?.toLowerCase() || '';
    if (type.includes('visa')) return 'visa';
    if (type.includes('master')) return 'mastercard';
    if (type.includes('amex') || type.includes('american')) return 'amex';
    if (type.includes('discover')) return 'discover';
    return 'other';
  });
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const cardGradients: Record<string, string> = {
    visa: 'linear-gradient(135deg, #1a1f71 0%, #2d35a8 50%, #1a1f71 100%)',
    mastercard: 'linear-gradient(135deg, #eb001b 0%, #f79e1b 100%)',
    amex: 'linear-gradient(135deg, #006fcf 0%, #00a1e0 100%)',
    discover: 'linear-gradient(135deg, #ff6000 0%, #ffab00 100%)',
    other: 'linear-gradient(135deg, #2d3436 0%, #636e72 100%)',
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g) || [];
    return groups.join(' ').slice(0, 19);
  };

  const formatExpiryInput = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  const detectCardType = (number: string) => {
    const cleaned = number.replace(/\D/g, '');
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^6(?:011|5)/.test(cleaned)) return 'discover';
    return 'other';
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
    setCardType(detectCardType(formatted));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d/]/g, '');
    if (value.length <= 5) {
      setExpiry(formatExpiryInput(value.replace('/', '')));
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCvv(value);
  };

  const displayCardNumber = () => {
    const cleaned = cardNumber.replace(/\s/g, '');
    const padded = cleaned.padEnd(16, '•');
    return padded.match(/.{1,4}/g)?.join(' ') || '•••• •••• •••• ••••';
  };

  const handleSubmit = async () => {
    if (!cardName.trim() || !cardNumber.trim() || !expiry || !cvv.trim() || !cardholderName.trim()) {
      showToast('Lütfen tüm zorunlu alanları doldurun', 'error');
      return;
    }

    if (cardNumber.replace(/\s/g, '').length < 13) {
      showToast('Kart numarası en az 13 haneli olmalıdır', 'error');
      return;
    }

    if (expiry.length !== 5) {
      showToast('Geçerli bir son kullanma tarihi girin (AA/YY)', 'error');
      return;
    }

    if (cvv.length < 3) {
      showToast('CVV en az 3 haneli olmalıdır', 'error');
      return;
    }

    const newCardData = {
      cardNumber: cardNumber.replace(/\s/g, ''),
      expiry,
      cvv,
      cardholderName,
      cardType,
    };

    setIsSubmitting(true);
    try {
      await invoke('update_password_entry', {
        id: entry.id,
        title: cardName.trim() !== entry.title ? cardName.trim() : null,
        username: cardNumber.replace(/\s/g, '') !== entry.username ? cardNumber.replace(/\s/g, '') : null,
        password: cvv !== entry.password ? cvv : null,
        url: null,
        notes: JSON.stringify(newCardData),
        category: null,
      });

      try {
        await invoke('log_activity', {
          action: 'update',
          entry_id: entry.id,
          details: `Banka kartı güncellendi: ${cardName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }

      showToast('Banka kartı başarıyla güncellendi', 'success');
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Güncelleme hatası';

      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Güncelleme yapıldı ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }

      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bank-card-modal">
      <h2>Kartı Düzenle</h2>

      {/* 3D Card Preview */}
      <div className="card-preview-container">
        <div className={`card-3d ${isFlipped ? 'flipped' : ''}`}>
          {/* Front */}
          <div className="card-face card-front" style={{ background: cardGradients[cardType] }}>
            <div className="card-shine"></div>
            <div className="card-chip">
              <div className="chip-line"></div>
              <div className="chip-line"></div>
              <div className="chip-line"></div>
              <div className="chip-line"></div>
            </div>
            <div className="card-contactless">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" opacity="0.3"/>
                <path d="M7 12c0-2.76 2.24-5 5-5v2c-1.66 0-3 1.34-3 3H7zm5-3c1.66 0 3 1.34 3 3h2c0-2.76-2.24-5-5-5v2z"/>
              </svg>
            </div>
            <div className="card-type-logo">
              {cardType === 'visa' && <span className="visa-logo">VISA</span>}
              {cardType === 'mastercard' && <div className="mc-logo"><span></span><span></span></div>}
              {cardType === 'amex' && <span className="amex-logo">AMEX</span>}
              {cardType === 'discover' && <span className="discover-logo">DISCOVER</span>}
              {cardType === 'other' && <span className="other-logo">CARD</span>}
            </div>
            <div className={`card-number ${focusedField === 'cardNumber' ? 'focused' : ''}`}>
              {displayCardNumber()}
            </div>
            <div className="card-bottom">
              <div className="card-holder">
                <span className="label">Kart Sahibi</span>
                <span className={`value ${focusedField === 'cardholderName' ? 'focused' : ''}`}>
                  {cardholderName || 'AD SOYAD'}
                </span>
              </div>
              <div className="card-expiry">
                <span className="label">Son Kullanma</span>
                <span className={`value ${focusedField === 'expiry' ? 'focused' : ''}`}>
                  {expiry || 'AA/YY'}
                </span>
              </div>
            </div>
          </div>

          {/* Back */}
          <div className="card-face card-back" style={{ background: cardGradients[cardType] }}>
            <div className="card-shine"></div>
            <div className="card-stripe"></div>
            <div className="card-cvv-section">
              <div className="cvv-label">CVV</div>
              <div className={`cvv-band ${focusedField === 'cvv' ? 'focused' : ''}`}>
                {cvv ? '•'.repeat(cvv.length) : '•••'}
              </div>
            </div>
            <div className="card-back-text">
              Kartınızın arkasındaki 3 haneli güvenlik kodu
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="card-form">
        <div className="form-row">
          <div className="form-field full">
            <label>Kart Adı</label>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Örn: Ana Param"
              className="card-input"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field full">
            <label>Kart Numarası</label>
            <input
              type="text"
              value={cardNumber}
              onChange={handleCardNumberChange}
              onFocus={() => { setFocusedField('cardNumber'); setIsFlipped(false); }}
              onBlur={() => setFocusedField(null)}
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              className="card-input mono"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field full">
            <label>Kart Sahibi</label>
            <input
              type="text"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
              onFocus={() => { setFocusedField('cardholderName'); setIsFlipped(false); }}
              onBlur={() => setFocusedField(null)}
              placeholder="AD SOYAD"
              className="card-input uppercase"
            />
          </div>
        </div>

        <div className="form-row two-col">
          <div className="form-field">
            <label>Son Kullanma</label>
            <input
              type="text"
              value={expiry}
              onChange={handleExpiryChange}
              onFocus={() => { setFocusedField('expiry'); setIsFlipped(false); }}
              onBlur={() => setFocusedField(null)}
              placeholder="AA/YY"
              maxLength={5}
              className="card-input mono center"
            />
          </div>
          <div className="form-field">
            <label>CVV</label>
            <input
              type="password"
              value={cvv}
              onChange={handleCvvChange}
              onFocus={() => { setFocusedField('cvv'); setIsFlipped(true); }}
              onBlur={() => setFocusedField(null)}
              placeholder="•••"
              maxLength={4}
              className="card-input mono center"
            />
          </div>
        </div>
      </div>

      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Güncelleniyor...' : 'Güncelle'}
        </button>
      </div>
    </div>
  );
}

function EditDocumentModal({ entry, onClose, showToast }: { entry: PasswordEntry; onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  let docData: DocumentData = {};
  let extraNotes = '';
  try {
    if (entry.notes) {
      const parts = entry.notes.split('\n');
      if (parts[0].startsWith('{')) {
        docData = JSON.parse(parts[0]) as DocumentData;
        extraNotes = parts.slice(1).join('\n');
      } else {
        extraNotes = entry.notes;
      }
    }
  } catch (e) {
    extraNotes = entry.notes || '';
  }

  const [documentName, setDocumentName] = useState(entry.title);
  const [documentType, setDocumentType] = useState(entry.username !== 'Belge' ? entry.username : docData.documentType || '');
  const [filePath, setFilePath] = useState(docData.filePath || '');
  const [notes, setNotes] = useState(extraNotes);

  const handleSubmit = async () => {
    if (!documentName.trim()) {
      showToast('Lütfen belge adını girin', 'error');
      return;
    }

    const documentData = {
      documentType,
      filePath,
    };

    try {
      await invoke('update_password_entry', {
        id: entry.id,
        title: documentName.trim() !== entry.title ? documentName.trim() : null,
        username: documentType !== entry.username ? (documentType || 'Belge') : null,
        password: null,
        url: null,
        notes: JSON.stringify(documentData) + (notes.trim() ? '\n' + notes.trim() : ''),
        category: null,
      });
      
      try {
        await invoke('log_activity', {
          action: 'update',
          entry_id: entry.id,
          details: `Belge güncellendi: ${documentName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
      
      showToast('Belge başarıyla güncellendi', 'success');
      onClose();
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Güncelleme hatası';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Güncelleme yapıldı ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
    }
  };

  return (
    <>
      <h2>Belge Düzenle</h2>
      <div className="form-group">
        <label>Belge Adı *</label>
        <input
          type="text"
          value={documentName}
          onChange={(e) => setDocumentName(e.target.value)}
          placeholder="örn: Pasaport, Kimlik"
        />
      </div>
      <div className="form-group">
        <label>Belge Tipi</label>
        <input
          type="text"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          placeholder="örn: Pasaport, Sürücü Belgesi"
        />
      </div>
      <div className="form-group">
        <label>Dosya Yolu</label>
        <input
          type="text"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="C:\Users\...\belge.pdf"
        />
      </div>
      <div className="form-group">
        <label>Notlar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ek notlar..."
          rows={3}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button">İptal</button>
        <button onClick={handleSubmit} className="submit-button">Güncelle</button>
      </div>
    </>
  );
}

function EditAddressModal({ entry, onClose, showToast }: { entry: PasswordEntry; onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  let addressData: AddressData = {};
  let extraNotes = '';
  try {
    if (entry.notes) {
      const parts = entry.notes.split('\n');
      if (parts[0].startsWith('{')) {
        addressData = JSON.parse(parts[0]) as AddressData;
        extraNotes = parts.slice(1).join('\n');
      } else {
        extraNotes = entry.notes;
      }
    }
  } catch (e) {
    extraNotes = entry.notes || '';
  }

  const [addressName, setAddressName] = useState(entry.title);
  const [streetAddress, setStreetAddress] = useState(entry.username || addressData.street || '');
  const [city, setCity] = useState(addressData.city || '');
  const [state, setState] = useState(addressData.state || '');
  const [postalCode, setPostalCode] = useState(entry.password || addressData.postalCode || '');
  const [country, setCountry] = useState(addressData.country || 'Türkiye');
  const [notes, setNotes] = useState(extraNotes);

  const handleSubmit = async () => {
    if (!addressName.trim() || !streetAddress.trim() || !city.trim()) {
      showToast('Lütfen zorunlu alanları doldurun', 'error');
      return;
    }

    const newAddressData = {
      street: streetAddress,
      city,
      state,
      postalCode,
      country,
    };

    try {
      await invoke('update_password_entry', {
        id: entry.id,
        title: addressName.trim() !== entry.title ? addressName.trim() : null,
        username: streetAddress.trim() !== entry.username ? streetAddress.trim() : null,
        password: '',
        url: null,
        notes: JSON.stringify(newAddressData) + (notes.trim() ? '\n' + notes.trim() : ''),
        category: null,
      });
      
      try {
        await invoke('log_activity', {
          action: 'update',
          entry_id: entry.id,
          details: `Adres güncellendi: ${addressName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
      
      showToast('Adres başarıyla güncellendi', 'success');
      onClose();
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Güncelleme hatası';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Güncelleme yapıldı ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
    }
  };

  return (
    <>
      <h2>Adres Düzenle</h2>
      <div className="form-group">
        <label>Adres Adı *</label>
        <input
          type="text"
          value={addressName}
          onChange={(e) => setAddressName(e.target.value)}
          placeholder="örn: Ev Adresim, İş Adresim"
        />
      </div>
      <div className="form-group">
        <label>Sokak Adresi *</label>
        <input
          type="text"
          value={streetAddress}
          onChange={(e) => setStreetAddress(e.target.value)}
          placeholder="Sokak, cadde, mahalle"
        />
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Şehir *</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="İstanbul"
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>İlçe/Eyalet</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Kadıköy"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Posta Kodu</label>
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="34000"
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Ülke</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Türkiye"
          />
        </div>
      </div>
      <div className="form-group">
        <label>Notlar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ek notlar..."
          rows={3}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button">İptal</button>
        <button onClick={handleSubmit} className="submit-button">Güncelle</button>
      </div>
    </>
  );
}

function EditPasskeyModal({ entry, onClose, showToast }: { entry: PasswordEntry; onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  let passkeyData: PasskeyData | null = null;
  let extraNotes = '';
  try {
    if (entry.notes) {
      const parts = entry.notes.split('\n');
      if (parts[0].startsWith('{')) {
        passkeyData = JSON.parse(parts[0]) as PasskeyData;
        extraNotes = parts.slice(1).join('\n');
      } else {
        extraNotes = entry.notes;
      }
    }
  } catch (e) {
    extraNotes = entry.notes || '';
  }

  const [serviceName, setServiceName] = useState(entry.title);
  const [domain, setDomain] = useState(entry.url || passkeyData?.domain || '');
  const [username, setUsername] = useState(passkeyData?.username || entry.username || '');
  const [email, setEmail] = useState(passkeyData?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!serviceName.trim() || !domain.trim()) {
      showToast('Lütfen servis adı ve domain girin', 'error');
      return;
    }

    if (!username.trim() && !email.trim()) {
      showToast('Lütfen kullanıcı adı veya e-posta girin', 'error');
      return;
    }

    if (domain.trim() && !validateUrl(domain.trim()) && !domain.trim().includes('.')) {
      showToast('Geçersiz domain formatı', 'error');
      return;
    }

    const newPasskeyData: PasskeyData = {
      username: username.trim() || undefined,
      email: email.trim() || undefined,
      domain: domain.trim(),
    };

    setIsSubmitting(true);
    try {
      let url = domain.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      await invoke('update_password_entry', {
        id: entry.id,
        title: serviceName.trim() !== entry.title ? serviceName.trim() : null,
        username: username.trim() || email.trim() || '',
        password: null,
        url: url !== entry.url ? url : null,
        notes: JSON.stringify(newPasskeyData) + (extraNotes.trim() ? '\n' + extraNotes.trim() : ''),
        category: null,
      });
      
      try {
        await invoke('log_activity', {
          action: 'update',
          entry_id: entry.id,
          details: `Geçiş anahtarı güncellendi: ${serviceName.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
      
      showToast('Geçiş anahtarı başarıyla güncellendi', 'success');
      onClose();
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Güncelleme hatası';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Güncelleme yapıldı ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h2>Geçiş Anahtarı Düzenle</h2>
      <div className="form-group">
        <label>Servis Adı *</label>
        <input
          type="text"
          value={serviceName}
          onChange={(e) => setServiceName(e.target.value)}
          placeholder="Örn: Google, GitHub, Discord"
          disabled={isSubmitting}
          autoFocus
        />
      </div>
      <div className="form-group">
        <label>Domain/URL *</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Örn: google.com veya https://google.com"
          disabled={isSubmitting}
        />
      </div>
      <div className="form-group">
        <label>Kullanıcı Adı</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Kullanıcı adı (opsiyonel)"
          disabled={isSubmitting}
        />
      </div>
      <div className="form-group">
        <label>E-posta</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-posta adresi (opsiyonel)"
          disabled={isSubmitting}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button" disabled={isSubmitting}>İptal</button>
        <button onClick={handleSubmit} className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </>
  );
}

function EditNoteModal({ entry, onClose, showToast }: { entry: PasswordEntry; onClose: () => void; showToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  const [noteTitle, setNoteTitle] = useState(entry.title);
  const [noteContent, setNoteContent] = useState(entry.notes || '');

  const handleSubmit = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      showToast('Lütfen başlık ve içerik girin', 'error');
      return;
    }

    try {
      await invoke('update_password_entry', {
        id: entry.id,
        title: noteTitle.trim() !== entry.title ? noteTitle.trim() : null,
        username: null,
        password: null,
        url: null,
        notes: noteContent.trim() !== (entry.notes || '') ? noteContent.trim() : null,
        category: null,
      });
      
      try {
        await invoke('log_activity', {
          action: 'update',
          entry_id: entry.id,
          details: `Not güncellendi: ${noteTitle.trim()}`
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
      
      showToast('Not başarıyla güncellendi', 'success');
      onClose();
    } catch (error) {
      const errorStr = String(error || '');
      let errorMessage = 'Güncelleme hatası';
      
      if (errorStr.includes('Kasa kilitli')) {
        errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
      } else if (errorStr.includes('kaydedilemedi')) {
        errorMessage = 'Güncelleme yapıldı ancak kaydedilemedi. Lütfen tekrar deneyin.';
      } else if (errorStr.includes('Master password')) {
        errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
      } else if (errorStr) {
        errorMessage = errorStr;
      }
      
      showToast(errorMessage, 'error');
    }
  };

  return (
    <>
      <h2>Not Düzenle</h2>
      <div className="form-group">
        <label>Başlık *</label>
        <input
          type="text"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          placeholder="Not başlığı"
        />
      </div>
      <div className="form-group">
        <label>İçerik *</label>
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Not içeriğinizi buraya yazın..."
          rows={8}
        />
      </div>
      <div className="modal-actions">
        <button onClick={onClose} className="cancel-button">İptal</button>
        <button onClick={handleSubmit} className="submit-button">Güncelle</button>
      </div>
    </>
  );
}

function ForgotPasswordModal({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px', position: 'relative' }}>
        <button type="button" className="modal-close-btn" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px' }}>
          <X size={20} />
        </button>
        <h2>Ana parolanızı mı unuttunuz?</h2>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Eski ana parolanızı hatırlıyorsanız verileri geri yüklemek için kasanızın bir yedeğini kaydedin. Yedek oluşturmak için önce kasa kilidini açmanız gerekir.
          </p>
        </div>

        <div style={{
          background: 'rgba(255, 71, 87, 0.1)',
          border: '1px solid rgba(255, 71, 87, 0.3)',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <AlertTriangle size={20} style={{ color: '#ff4757', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ color: '#ff4757', fontWeight: 600, margin: 0, marginBottom: '0.5rem' }}>
                Tüm verileriniz uygulamadan silinecek.
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                Uygulama tek bir veritabanı ile etkileşim kurmak üzere tasarlanmıştır. Yeni bir kasa oluşturursanız var olan kasa silinecektir.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="cancel-button">
            İptal
          </button>
          <button 
            onClick={onReset}
            className="submit-button"
            style={{ background: '#ff4757', borderColor: '#ff4757' }}
          >
            Yeni Kasa Oluştur
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
