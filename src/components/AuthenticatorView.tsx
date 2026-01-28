import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Copy, Trash2, Shield, RefreshCw, Clock, Eye, EyeOff, Search, RotateCcw, Trash, FileText, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showBackupModal, setShowBackupModal] = useState<{ entry: PasswordEntry; data: AuthenticatorData } | null>(null);
  const [backupCodesInput, setBackupCodesInput] = useState('');
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
  const handleCopy = async (code: string, id: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      showToast(label ? `${label} kopyalandı` : 'Kod panoya kopyalandı', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Kopyalama başarısız', 'error');
    }
  };

  // Toggle card expansion
  const toggleCardExpansion = (id: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Open backup codes modal
  const openBackupModal = (entry: PasswordEntry, data: AuthenticatorData) => {
    setBackupCodesInput(data.backupCodes?.join('\n') || '');
    setShowBackupModal({ entry, data });
  };

  // Save backup codes
  const handleSaveBackupCodes = async () => {
    if (!showBackupModal) return;

    const codes = backupCodesInput
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    try {
      const entry = showBackupModal.entry;
      let notesData: AuthenticatorData = showBackupModal.data;
      notesData.backupCodes = codes;

      const updatedNotes = JSON.stringify(notesData);

      await invoke('update_password_entry', {
        id: entry.id,
        title: entry.title,
        username: entry.username,
        password: entry.password,
        url: entry.url || '',
        notes: updatedNotes,
        category: entry.category
      });

      await loadEntries();
      showToast(`${codes.length} yedek kod kaydedildi`, 'success');
      setShowBackupModal(null);
      setBackupCodesInput('');
    } catch (err) {
      showToast('Yedek kodlar kaydedilemedi: ' + String(err), 'error');
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
          currentItems.map((item) => {
            const isExpanded = expandedCards.has(item.entry.id);
            const hasBackupCodes = item.data.backupCodes && item.data.backupCodes.length > 0;

            return (
              <div
                key={item.entry.id}
                className={`authenticator-card ${copiedId === item.entry.id ? 'copied' : ''} ${viewMode === 'trash' ? 'trashed' : ''} ${isExpanded ? 'expanded' : ''}`}
              >
                <div className="authenticator-card-main">
                  <div className="authenticator-card-icon">
                    {item.data.issuer.charAt(0).toUpperCase()}
                  </div>
                  <div className="authenticator-card-info">
                    <div className="authenticator-card-issuer">{item.data.issuer}</div>
                    <div className="authenticator-card-account">
                      {item.data.account}
                      {hasBackupCodes && (
                        <span className="backup-badge-inline">
                          <FileText size={12} />
                          {item.data.backupCodes!.length} yedek
                        </span>
                      )}
                    </div>
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
                    {viewMode === 'active' && (
                      <button
                        onClick={() => openBackupModal(item.entry, item.data)}
                        title="Yedek Kodlar"
                        className={hasBackupCodes ? 'has-backup' : ''}
                      >
                        <FileText size={16} />
                      </button>
                    )}
                    {hasBackupCodes && viewMode === 'active' && (
                      <button
                        onClick={() => toggleCardExpansion(item.entry.id)}
                        title={isExpanded ? 'Yedek Kodları Gizle' : 'Yedek Kodları Göster'}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
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
                {isExpanded && hasBackupCodes && (
                  <div className="authenticator-backup-codes">
                    <div className="backup-codes-header">
                      <FileText size={16} />
                      <span>Yedek Kodlar</span>
                      <button
                        className="copy-all-btn"
                        onClick={() => handleCopy(item.data.backupCodes!.join('\n'), item.entry.id + '-backup', 'Tüm yedek kodlar')}
                      >
                        <Copy size={14} />
                        Tümünü Kopyala
                      </button>
                    </div>
                    <div className="backup-codes-grid">
                      {item.data.backupCodes!.map((code, idx) => (
                        <div
                          key={idx}
                          className="backup-code-item"
                          onClick={() => handleCopy(code, item.entry.id + '-code-' + idx, 'Yedek kod')}
                        >
                          <span className="code-number">{idx + 1}</span>
                          <span className="code-value">{code}</span>
                          <Copy size={12} className="code-copy-icon" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Backup Codes Modal */}
      {showBackupModal && (
        <div className="modal-overlay" onClick={() => setShowBackupModal(null)}>
          <div className="modal-content backup-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrapper">
                <FileText size={24} style={{ color: 'var(--accent)' }} />
                <div>
                  <h2>Yedek Kodlar</h2>
                  <p className="modal-subtitle">{showBackupModal.data.issuer} - {showBackupModal.data.account}</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowBackupModal(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="backup-modal-content">
              <p className="backup-description">
                Yedek kodlarınızı her satıra bir kod gelecek şekilde yapıştırın.
                Bu kodlar kimlik doğrulayıcınıza erişemediğinizde hesabınıza girmenizi sağlar.
              </p>
              <textarea
                value={backupCodesInput}
                onChange={(e) => setBackupCodesInput(e.target.value)}
                placeholder="Yedek kodlarınızı buraya yapıştırın...&#10;Her satıra bir kod&#10;Örnek:&#10;ABCD-1234-EFGH&#10;IJKL-5678-MNOP"
                rows={8}
              />
              <div className="backup-stats">
                <span>{backupCodesInput.split('\n').filter(c => c.trim()).length} kod girildi</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowBackupModal(null)}>
                İptal
              </button>
              <button className="btn-primary" onClick={handleSaveBackupCodes}>
                <Save size={16} />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Override base authenticator-card styles for new structure */
        .authenticator-view .authenticator-card {
          display: block !important;
          padding: 0 !important;
        }

        .authenticator-card-main {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
        }

        .authenticator-card-main .authenticator-card-info {
          flex: 1;
          min-width: 0;
        }

        .authenticator-card-main .authenticator-card-actions {
          margin-left: auto;
          width: auto !important;
          border-top: none !important;
          padding-top: 0 !important;
          margin-top: 0 !important;
        }

        .authenticator-card.expanded {
          border-color: rgba(245, 158, 11, 0.3);
        }

        .backup-badge-inline {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-left: 8px;
          padding: 2px 8px;
          background: rgba(245, 158, 11, 0.1);
          border-radius: 4px;
          font-size: 11px;
          color: var(--accent);
        }

        .has-backup {
          color: var(--accent) !important;
        }

        .authenticator-backup-codes {
          padding: 1rem 1.25rem 1.25rem;
          background: var(--bg-primary);
          border-top: 1px solid var(--border);
          animation: slideDown 0.2s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .backup-codes-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-weight: 500;
        }

        .backup-codes-header svg {
          color: var(--accent);
        }

        .copy-all-btn {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .copy-all-btn:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
        }

        .backup-codes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.5rem;
        }

        .backup-code-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 0.75rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .backup-code-item:hover {
          background: var(--bg-tertiary);
          border-color: rgba(245, 158, 11, 0.3);
        }

        .code-number {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          background: var(--accent-muted);
          color: var(--accent);
          font-size: 10px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .code-value {
          flex: 1;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 12px;
          color: var(--text-primary);
          letter-spacing: 0.02em;
        }

        .code-copy-icon {
          color: var(--text-tertiary);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .backup-code-item:hover .code-copy-icon {
          opacity: 1;
        }

        .backup-modal {
          max-width: 480px;
        }

        .modal-title-wrapper {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .modal-subtitle {
          font-size: 0.85rem;
          color: var(--text-tertiary);
          margin: 0;
        }

        .backup-modal-content {
          margin-bottom: 1.5rem;
        }

        .backup-description {
          font-size: 0.9rem;
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0 0 1rem 0;
        }

        .backup-modal-content textarea {
          width: 100%;
          padding: 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 12px;
          color: var(--text-primary);
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 0.9rem;
          line-height: 1.6;
          resize: vertical;
          min-height: 180px;
          transition: all 0.2s ease;
        }

        .backup-modal-content textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
        }

        .backup-modal-content textarea::placeholder {
          color: var(--text-tertiary);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }

        .backup-stats {
          margin-top: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-tertiary);
        }
      `}</style>
    </div>
  );
}
