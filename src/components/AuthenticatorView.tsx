import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Copy, Trash2, Shield, RefreshCw, Clock, Eye, EyeOff, Search, RotateCcw, Trash } from 'lucide-react';
import type { PasswordEntry, AuthenticatorData } from '../types';

interface AuthenticatorViewProps {
  entries: PasswordEntry[];
  onAddNew: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  loadEntries: () => Promise<void>;
  setConfirmDialog: (dialog: { message: string; onConfirm: () => void } | null) => void;
}

interface AuthenticatorItem {
  entry: PasswordEntry;
  data: AuthenticatorData;
  code: string;
}

type ViewMode = 'active' | 'trash';

export default function AuthenticatorView({
  entries,
  onAddNew,
  showToast,
  loadEntries,
  setConfirmDialog
}: AuthenticatorViewProps) {
  const [authenticators, setAuthenticators] = useState<AuthenticatorItem[]>([]);
  const [trashedAuthenticators, setTrashedAuthenticators] = useState<AuthenticatorItem[]>([]);
  const [timeLeft, setTimeLeft] = useState(30);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCodes, setShowCodes] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filter authenticator entries and parse data
  const parseAuthenticators = useCallback(async () => {
    const activeEntries = entries.filter(e => e.category === 'authenticator');
    const trashEntries = entries.filter(e => e.category === 'authenticator_trash');

    const parseEntries = async (entryList: PasswordEntry[]): Promise<AuthenticatorItem[]> => {
      const items: AuthenticatorItem[] = [];
      for (const entry of entryList) {
        try {
          const data: AuthenticatorData = entry.notes
            ? JSON.parse(entry.notes)
            : { secret: entry.password, issuer: entry.title, account: entry.username };

          let code = '------';
          try {
            code = await invoke<string>('generate_totp_code', { secret: data.secret });
          } catch (err) {
            console.error('TOTP generation error:', err);
          }

          items.push({ entry, data, code });
        } catch (err) {
          console.error('Error parsing authenticator:', err);
        }
      }
      return items;
    };

    const [active, trashed] = await Promise.all([
      parseEntries(activeEntries),
      parseEntries(trashEntries)
    ]);

    setAuthenticators(active);
    setTrashedAuthenticators(trashed);
  }, [entries]);

  // Refresh all codes
  const refreshCodes = useCallback(async () => {
    const refreshItems = async (items: AuthenticatorItem[]): Promise<AuthenticatorItem[]> => {
      return Promise.all(
        items.map(async (item) => {
          try {
            const code = await invoke<string>('generate_totp_code', { secret: item.data.secret });
            return { ...item, code };
          } catch {
            return item;
          }
        })
      );
    };

    const [active, trashed] = await Promise.all([
      refreshItems(authenticators),
      refreshItems(trashedAuthenticators)
    ]);

    setAuthenticators(active);
    setTrashedAuthenticators(trashed);
  }, [authenticators, trashedAuthenticators]);

  // Initialize authenticators
  useEffect(() => {
    parseAuthenticators();
  }, [parseAuthenticators]);

  // Timer for countdown and code refresh
  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = 30 - (now % 30);
      setTimeLeft(remaining);

      if (remaining === 30) {
        refreshCodes();
      }
    };

    updateTimer();
    intervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshCodes]);

  // Copy code to clipboard
  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      showToast('Kod panoya kopyalandı', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Kopyalama başarısız', 'error');
    }
  };

  // Soft delete - move to trash
  const handleSoftDelete = (entry: PasswordEntry) => {
    setConfirmDialog({
      message: `"${entry.title}" kimlik doğrulayıcısını çöp kutusuna taşımak istediğinizden emin misiniz?\n\nÇöp kutusundan geri yükleyebilirsiniz.`,
      onConfirm: async () => {
        try {
          await invoke('soft_delete_authenticator', { id: entry.id });
          await loadEntries();
          showToast('Çöp kutusuna taşındı', 'success');
        } catch (err) {
          showToast('İşlem başarısız: ' + String(err), 'error');
        }
        setConfirmDialog(null);
      }
    });
  };

  // Restore from trash
  const handleRestore = async (entry: PasswordEntry) => {
    try {
      await invoke('restore_authenticator', { id: entry.id });
      await loadEntries();
      showToast('Başarıyla geri yüklendi', 'success');
    } catch (err) {
      showToast('Geri yükleme başarısız: ' + String(err), 'error');
    }
  };

  // Permanent delete
  const handlePermanentDelete = (entry: PasswordEntry) => {
    setConfirmDialog({
      message: `"${entry.title}" kimlik doğrulayıcısını kalıcı olarak silmek istediğinizden emin misiniz?\n\n⚠️ Bu işlem geri alınamaz!`,
      onConfirm: async () => {
        try {
          await invoke('permanently_delete_authenticator', { id: entry.id });
          await loadEntries();
          showToast('Kalıcı olarak silindi', 'success');
        } catch (err) {
          showToast('Silme başarısız: ' + String(err), 'error');
        }
        setConfirmDialog(null);
      }
    });
  };

  // Empty trash
  const handleEmptyTrash = () => {
    if (trashedAuthenticators.length === 0) {
      showToast('Çöp kutusu zaten boş', 'info');
      return;
    }

    setConfirmDialog({
      message: `Çöp kutusundaki ${trashedAuthenticators.length} öğeyi kalıcı olarak silmek istediğinizden emin misiniz?\n\n⚠️ Bu işlem geri alınamaz!`,
      onConfirm: async () => {
        try {
          for (const item of trashedAuthenticators) {
            await invoke('permanently_delete_authenticator', { id: item.entry.id });
          }
          await loadEntries();
          showToast('Çöp kutusu boşaltıldı', 'success');
        } catch (err) {
          showToast('İşlem başarısız: ' + String(err), 'error');
        }
        setConfirmDialog(null);
      }
    });
  };

  // Toggle code visibility
  const toggleCodeVisibility = (id: string) => {
    setShowCodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter by search
  const filteredAuthenticators = authenticators.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      item.data.issuer.toLowerCase().includes(query) ||
      item.data.account.toLowerCase().includes(query) ||
      item.entry.title.toLowerCase().includes(query)
    );
  });

  const filteredTrashed = trashedAuthenticators.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      item.data.issuer.toLowerCase().includes(query) ||
      item.data.account.toLowerCase().includes(query) ||
      item.entry.title.toLowerCase().includes(query)
    );
  });

  // Progress bar percentage
  const progressPercent = (timeLeft / 30) * 100;

  const currentItems = viewMode === 'active' ? filteredAuthenticators : filteredTrashed;

  return (
    <div className="authenticator-view">
      <div className="authenticator-header">
        <div className="authenticator-title-section">
          <Shield size={28} style={{ color: 'var(--accent)' }} />
          <div>
            <h1>Kimlik Doğrulayıcı</h1>
            <p className="authenticator-subtitle">
              {authenticators.length} aktif, {trashedAuthenticators.length} çöp kutusunda
            </p>
          </div>
        </div>
        <div className="authenticator-actions">
          <div className="authenticator-timer">
            <Clock size={16} />
            <span>{timeLeft}s</span>
            <div className="timer-progress">
              <div
                className="timer-progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <button
            className="authenticator-refresh-btn"
            onClick={refreshCodes}
            title="Kodları Yenile"
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="authenticator-add-btn"
            onClick={onAddNew}
          >
            <Plus size={18} />
            Ekle
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="authenticator-tabs">
        <button
          className={`auth-tab ${viewMode === 'active' ? 'active' : ''}`}
          onClick={() => setViewMode('active')}
        >
          <Shield size={16} />
          Aktif ({authenticators.length})
        </button>
        <button
          className={`auth-tab ${viewMode === 'trash' ? 'active' : ''}`}
          onClick={() => setViewMode('trash')}
        >
          <Trash size={16} />
          Çöp Kutusu ({trashedAuthenticators.length})
        </button>
      </div>

      <div className="authenticator-search">
        <Search size={18} />
        <input
          type="text"
          placeholder="Hesap ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {viewMode === 'trash' && trashedAuthenticators.length > 0 && (
          <button
            className="empty-trash-btn"
            onClick={handleEmptyTrash}
            title="Çöp Kutusunu Boşalt"
          >
            <Trash2 size={16} />
            Boşalt
          </button>
        )}
      </div>

      <div className="authenticator-list">
        {currentItems.length === 0 ? (
          <div className="authenticator-empty">
            {viewMode === 'trash' ? (
              <>
                <Trash size={64} style={{ opacity: 0.3 }} />
                <h3>Çöp Kutusu Boş</h3>
                <p>
                  {searchQuery
                    ? 'Arama sonucu bulunamadı'
                    : 'Silinen kimlik doğrulayıcılar burada görünecek'}
                </p>
              </>
            ) : (
              <>
                <Shield size={64} style={{ opacity: 0.3 }} />
                <h3>Kimlik Doğrulayıcı Yok</h3>
                <p>
                  {searchQuery
                    ? 'Arama sonucu bulunamadı'
                    : 'Henüz kimlik doğrulayıcı eklenmemiş'}
                </p>
                {!searchQuery && (
                  <button className="authenticator-add-btn" onClick={onAddNew}>
                    <Plus size={18} />
                    İlk Doğrulayıcını Ekle
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          currentItems.map((item) => (
            <div
              key={item.entry.id}
              className={`authenticator-card ${copiedId === item.entry.id ? 'copied' : ''} ${viewMode === 'trash' ? 'trashed' : ''}`}
            >
              <div className="authenticator-card-icon">
                {item.data.issuer.charAt(0).toUpperCase()}
              </div>
              <div className="authenticator-card-info">
                <div className="authenticator-card-issuer">{item.data.issuer}</div>
                <div className="authenticator-card-account">{item.data.account}</div>
              </div>
              <div className="authenticator-card-code-section">
                <div
                  className="authenticator-card-code"
                  onClick={() => handleCopy(item.code, item.entry.id)}
                >
                  {showCodes[item.entry.id] !== false ? (
                    <>
                      <span>{item.code.slice(0, 3)}</span>
                      <span className="code-separator"> </span>
                      <span>{item.code.slice(3)}</span>
                    </>
                  ) : (
                    <span className="code-hidden">••• •••</span>
                  )}
                </div>
                <div className="authenticator-card-timer">
                  <div
                    className="mini-progress"
                    style={{
                      background: `conic-gradient(var(--accent) ${progressPercent}%, transparent ${progressPercent}%)`
                    }}
                  />
                </div>
              </div>
              <div className="authenticator-card-actions">
                <button
                  onClick={() => toggleCodeVisibility(item.entry.id)}
                  title={showCodes[item.entry.id] !== false ? 'Kodu Gizle' : 'Kodu Göster'}
                >
                  {showCodes[item.entry.id] !== false ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  onClick={() => handleCopy(item.code, item.entry.id)}
                  title="Kopyala"
                >
                  <Copy size={16} />
                </button>
                {viewMode === 'trash' ? (
                  <>
                    <button
                      onClick={() => handleRestore(item.entry)}
                      className="restore-btn"
                      title="Geri Yükle"
                    >
                      <RotateCcw size={16} />
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item.entry)}
                      className="delete-btn permanent"
                      title="Kalıcı Sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleSoftDelete(item.entry)}
                    className="delete-btn"
                    title="Çöp Kutusuna Taşı"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
