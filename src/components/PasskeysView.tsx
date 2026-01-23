import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Copy, Trash2, KeyRound, Search, RotateCcw, Trash, Globe, User, Mail } from 'lucide-react';
import type { PasswordEntry, PasskeyData } from '../types';

interface PasskeysViewProps {
  entries: PasswordEntry[];
  onAddNew: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  loadEntries: () => Promise<void>;
  setConfirmDialog: (dialog: { message: string; onConfirm: () => void } | null) => void;
}

interface PasskeyItem {
  entry: PasswordEntry;
  data: PasskeyData;
}

type ViewMode = 'active' | 'trash';

export default function PasskeysView({
  entries,
  onAddNew,
  showToast,
  loadEntries,
  setConfirmDialog
}: PasskeysViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Parse passkey entries
  const parsePasskeys = useCallback((): { active: PasskeyItem[]; trashed: PasskeyItem[] } => {
    const activeEntries = entries.filter(e => e.category === 'passkeys');
    const trashEntries = entries.filter(e => e.category === 'passkeys_trash');

    const parseEntries = (entryList: PasswordEntry[]): PasskeyItem[] => {
      const items: PasskeyItem[] = [];
      for (const entry of entryList) {
        try {
          let data: PasskeyData = { username: entry.username, domain: '' };
          if (entry.notes) {
            try {
              const parts = entry.notes.split('\n');
              for (const part of parts) {
                if (part.startsWith('{')) {
                  const parsed = JSON.parse(part);
                  if (parsed.username || parsed.email || parsed.domain) {
                    data = parsed;
                    break;
                  }
                }
              }
            } catch {
              // Use default data
            }
          }
          items.push({ entry, data });
        } catch (err) {
          console.error('Error parsing passkey:', err);
        }
      }
      return items;
    };

    return {
      active: parseEntries(activeEntries),
      trashed: parseEntries(trashEntries)
    };
  }, [entries]);

  const { active: passkeys, trashed: trashedPasskeys } = parsePasskeys();

  // Copy to clipboard
  const handleCopy = async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast(`${label} kopyalandı`, 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Kopyalama başarısız', 'error');
    }
  };

  // Soft delete - move to trash
  const handleSoftDelete = (entry: PasswordEntry) => {
    setConfirmDialog({
      message: `"${entry.title}" geçiş anahtarını çöp kutusuna taşımak istediğinizden emin misiniz?\n\nÇöp kutusundan geri yükleyebilirsiniz.`,
      onConfirm: async () => {
        try {
          await invoke('soft_delete_passkey', { id: entry.id });
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
      await invoke('restore_passkey', { id: entry.id });
      await loadEntries();
      showToast('Başarıyla geri yüklendi', 'success');
    } catch (err) {
      showToast('Geri yükleme başarısız: ' + String(err), 'error');
    }
  };

  // Permanent delete
  const handlePermanentDelete = (entry: PasswordEntry) => {
    setConfirmDialog({
      message: `"${entry.title}" geçiş anahtarını kalıcı olarak silmek istediğinizden emin misiniz?\n\n⚠️ Bu işlem geri alınamaz!`,
      onConfirm: async () => {
        try {
          await invoke('permanently_delete_passkey', { id: entry.id });
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
    if (trashedPasskeys.length === 0) {
      showToast('Çöp kutusu zaten boş', 'info');
      return;
    }

    setConfirmDialog({
      message: `Çöp kutusundaki ${trashedPasskeys.length} öğeyi kalıcı olarak silmek istediğinizden emin misiniz?\n\n⚠️ Bu işlem geri alınamaz!`,
      onConfirm: async () => {
        try {
          for (const item of trashedPasskeys) {
            await invoke('permanently_delete_passkey', { id: item.entry.id });
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

  // Filter by search
  const filteredPasskeys = passkeys.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      item.entry.title.toLowerCase().includes(query) ||
      (item.data.username?.toLowerCase().includes(query)) ||
      (item.data.email?.toLowerCase().includes(query)) ||
      (item.data.domain?.toLowerCase().includes(query))
    );
  });

  const filteredTrashed = trashedPasskeys.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      item.entry.title.toLowerCase().includes(query) ||
      (item.data.username?.toLowerCase().includes(query)) ||
      (item.data.email?.toLowerCase().includes(query)) ||
      (item.data.domain?.toLowerCase().includes(query))
    );
  });

  const currentItems = viewMode === 'active' ? filteredPasskeys : filteredTrashed;

  return (
    <div className="passkeys-view">
      <div className="passkeys-header">
        <div className="passkeys-title-section">
          <KeyRound size={28} style={{ color: 'var(--accent)' }} />
          <div>
            <h1>Geçiş Anahtarları</h1>
            <p className="passkeys-subtitle">
              {passkeys.length} aktif, {trashedPasskeys.length} çöp kutusunda
            </p>
          </div>
        </div>
        <div className="passkeys-actions">
          <button
            className="passkeys-add-btn"
            onClick={onAddNew}
          >
            <Plus size={18} />
            Ekle
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="passkeys-tabs">
        <button
          className={`passkey-tab ${viewMode === 'active' ? 'active' : ''}`}
          onClick={() => setViewMode('active')}
        >
          <KeyRound size={16} />
          Aktif ({passkeys.length})
        </button>
        <button
          className={`passkey-tab ${viewMode === 'trash' ? 'active' : ''}`}
          onClick={() => setViewMode('trash')}
        >
          <Trash size={16} />
          Çöp Kutusu ({trashedPasskeys.length})
        </button>
      </div>

      <div className="passkeys-search">
        <Search size={18} />
        <input
          type="text"
          placeholder="Geçiş anahtarı ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {viewMode === 'trash' && trashedPasskeys.length > 0 && (
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

      <div className="passkeys-list">
        {currentItems.length === 0 ? (
          <div className="passkeys-empty">
            {viewMode === 'trash' ? (
              <>
                <Trash size={64} style={{ opacity: 0.3 }} />
                <h3>Çöp Kutusu Boş</h3>
                <p>
                  {searchQuery
                    ? 'Arama sonucu bulunamadı'
                    : 'Silinen geçiş anahtarları burada görünecek'}
                </p>
              </>
            ) : (
              <>
                <KeyRound size={64} style={{ opacity: 0.3 }} />
                <h3>Geçiş Anahtarı Yok</h3>
                <p>
                  {searchQuery
                    ? 'Arama sonucu bulunamadı'
                    : 'Henüz geçiş anahtarı eklenmemiş'}
                </p>
                {!searchQuery && (
                  <button className="passkeys-add-btn" onClick={onAddNew}>
                    <Plus size={18} />
                    İlk Geçiş Anahtarını Ekle
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          currentItems.map((item) => (
            <div
              key={item.entry.id}
              className={`passkey-card ${copiedId === item.entry.id ? 'copied' : ''} ${viewMode === 'trash' ? 'trashed' : ''}`}
            >
              <div className="passkey-card-icon">
                <KeyRound size={24} />
              </div>
              <div className="passkey-card-info">
                <div className="passkey-card-title">{item.entry.title}</div>
                {item.data.domain && (
                  <div className="passkey-card-detail">
                    <Globe size={14} />
                    <span>{item.data.domain}</span>
                  </div>
                )}
                {item.data.username && (
                  <div className="passkey-card-detail">
                    <User size={14} />
                    <span>{item.data.username}</span>
                  </div>
                )}
                {item.data.email && (
                  <div className="passkey-card-detail">
                    <Mail size={14} />
                    <span>{item.data.email}</span>
                  </div>
                )}
              </div>
              <div className="passkey-card-actions">
                {item.data.username && (
                  <button
                    onClick={() => handleCopy(item.data.username!, item.entry.id, 'Kullanıcı adı')}
                    title="Kullanıcı Adı Kopyala"
                  >
                    <Copy size={16} />
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
          ))
        )}
      </div>

      <style>{`
        .passkeys-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary);
          animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .passkeys-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
        }

        .passkeys-title-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .passkeys-title-section h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .passkeys-subtitle {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin: 0;
        }

        .passkeys-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .passkeys-add-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border: none;
          border-radius: 12px;
          color: var(--bg-primary);
          font-family: 'Sora', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
        }

        .passkeys-add-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 25px rgba(245, 158, 11, 0.4);
        }

        .passkeys-tabs {
          display: flex;
          gap: 0.5rem;
          padding: 1rem 2rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
        }

        .passkey-tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-secondary);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .passkey-tab:hover {
          background: var(--bg-elevated);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .passkey-tab.active {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--bg-primary);
        }

        .passkeys-search {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          background: var(--bg-secondary);
        }

        .passkeys-search svg {
          color: var(--text-tertiary);
        }

        .passkeys-search input {
          flex: 1;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: var(--text-primary);
          font-size: 0.9rem;
          transition: all 0.3s ease;
        }

        .passkeys-search input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
        }

        .passkeys-search input::placeholder {
          color: var(--text-tertiary);
        }

        .empty-trash-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0.6rem 1rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 10px;
          color: #ef4444;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          margin-left: auto;
          transition: all 0.2s ease;
        }

        .empty-trash-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }

        .passkeys-list {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .passkeys-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          text-align: center;
          color: var(--text-tertiary);
        }

        .passkeys-empty h3 {
          font-family: 'Sora', sans-serif;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 1rem 0 0.5rem;
        }

        .passkeys-empty p {
          margin: 0 0 1.5rem;
          color: var(--text-tertiary);
        }

        .passkey-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem;
          background: linear-gradient(145deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
          border: 1px solid var(--border);
          border-radius: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .passkey-card:hover {
          transform: translateY(-2px);
          border-color: rgba(245, 158, 11, 0.3);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3), 0 0 30px rgba(245, 158, 11, 0.1);
        }

        .passkey-card.copied {
          border-color: #10b981;
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
        }

        .passkey-card.trashed {
          opacity: 0.85;
          border-left: 4px solid #f59e0b;
        }

        .passkey-card.trashed .passkey-card-icon {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
        }

        .passkey-card-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--bg-primary);
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        }

        .passkey-card-info {
          flex: 1;
          min-width: 0;
        }

        .passkey-card-title {
          font-family: 'Sora', sans-serif;
          font-weight: 600;
          font-size: 1rem;
          color: var(--text-primary);
          margin-bottom: 0.4rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .passkey-card-detail {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin-top: 0.25rem;
        }

        .passkey-card-detail svg {
          color: var(--text-tertiary);
        }

        .passkey-card-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .passkey-card-actions button {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .passkey-card-actions button:hover {
          background: var(--bg-elevated);
          border-color: var(--border);
          color: var(--text-primary);
        }

        .restore-btn:hover {
          background: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
          color: #10b981 !important;
        }

        .delete-btn:hover {
          background: rgba(239, 68, 68, 0.15) !important;
          border-color: rgba(239, 68, 68, 0.3) !important;
          color: #ef4444 !important;
        }

        .delete-btn.permanent:hover {
          background: #ef4444 !important;
          border-color: #ef4444 !important;
          color: white !important;
        }

        @media (max-width: 768px) {
          .passkeys-header {
            flex-direction: column;
            gap: 1rem;
            padding: 1rem;
          }

          .passkeys-tabs {
            padding: 0.75rem 1rem;
            overflow-x: auto;
          }

          .passkeys-search {
            padding: 0.75rem 1rem;
            flex-wrap: wrap;
          }

          .passkeys-list {
            padding: 1rem;
          }

          .passkey-card {
            flex-wrap: wrap;
            padding: 1rem;
          }

          .passkey-card-actions {
            width: 100%;
            justify-content: flex-end;
            margin-top: 0.75rem;
            padding-top: 0.75rem;
            border-top: 1px solid var(--border);
          }
        }
      `}</style>
    </div>
  );
}
