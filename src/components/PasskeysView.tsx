import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Copy, Trash2, KeyRound, Search, RotateCcw, Trash, Globe, User, Mail, HelpCircle, X, Shield, Chrome, ChevronDown, ChevronUp, FileText, Save } from 'lucide-react';
import type { PasswordEntry, PasskeyData } from '../types';

interface PasskeysViewProps {
  entries: PasswordEntry[];
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
  showToast,
  loadEntries,
  setConfirmDialog
}: PasskeysViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showBackupModal, setShowBackupModal] = useState<{ entry: PasswordEntry; data: PasskeyData } | null>(null);
  const [backupCodesInput, setBackupCodesInput] = useState('');

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
  const openBackupModal = (entry: PasswordEntry, data: PasskeyData) => {
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
      // Update the entry notes with backup codes
      const entry = showBackupModal.entry;
      let notesData: PasskeyData = showBackupModal.data;
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
            className="passkeys-help-btn"
            onClick={() => setShowHelp(true)}
            title="Nasıl Eklenir?"
          >
            <HelpCircle size={20} />
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
                  <button className="passkeys-help-link" onClick={() => setShowHelp(true)}>
                    <HelpCircle size={16} />
                    Nasıl Eklenir?
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
                className={`passkey-card ${copiedId === item.entry.id ? 'copied' : ''} ${viewMode === 'trash' ? 'trashed' : ''} ${isExpanded ? 'expanded' : ''}`}
              >
                <div className="passkey-card-main">
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
                    {hasBackupCodes && (
                      <div className="passkey-card-detail backup-badge">
                        <FileText size={14} />
                        <span>{item.data.backupCodes!.length} yedek kod</span>
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
                    {viewMode === 'active' && (
                      <button
                        onClick={() => openBackupModal(item.entry, item.data)}
                        className="backup-btn"
                        title="Yedek Kodlar"
                      >
                        <FileText size={16} />
                      </button>
                    )}
                    {hasBackupCodes && (
                      <button
                        onClick={() => toggleCardExpansion(item.entry.id)}
                        className="expand-btn"
                        title={isExpanded ? 'Daralt' : 'Genişlet'}
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
                  <div className="passkey-backup-codes">
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

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-content help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrapper">
                <KeyRound size={24} style={{ color: 'var(--accent)' }} />
                <h2>Geçiş Anahtarı Nasıl Eklenir?</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setShowHelp(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="help-content">
              <div className="help-step">
                <div className="step-icon">
                  <Chrome size={24} />
                </div>
                <div className="step-info">
                  <h3>1. Eklenti Kurulumu</h3>
                  <p>ConfPass tarayıcı uzantısının tarayıcınızda kurulu ve aktif olduğundan emin olun.</p>
                </div>
              </div>

              <div className="step-arrow">↓</div>

              <div className="help-step">
                <div className="step-icon">
                  <Globe size={24} />
                </div>
                <div className="step-info">
                  <h3>2. Web Sitesine Giriş</h3>
                  <p>Geçiş anahtarı eklemek istediğiniz web sitesine (örn. Google, GitHub) tarayıcınızdan giriş yapın.</p>
                </div>
              </div>

              <div className="step-arrow">↓</div>

              <div className="help-step">
                <div className="step-icon">
                  <Shield size={24} />
                </div>
                <div className="step-info">
                  <h3>3. Anahtar Oluşturma</h3>
                  <p>Sitenin güvenlik ayarlarına gidin. "Geçiş Anahtarı" (Passkey) veya "Güvenlik Anahtarı" ekle seçeneğini seçin.</p>
                </div>
              </div>

              <div className="step-arrow">↓</div>

              <div className="help-step highlight">
                <div className="step-icon">
                  <KeyRound size={24} />
                </div>
                <div className="step-info">
                  <h3>4. Otomatik Algılama</h3>
                  <p>Siz işlemi başlattığınızda, ConfPass uzantısı otomatik olarak devreye girecek ve anahtarı kasanıza kaydedecektir.</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowHelp(false)}>
                Anlaşıldı
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackupModal && (
        <div className="modal-overlay" onClick={() => setShowBackupModal(null)}>
          <div className="modal-content backup-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrapper">
                <FileText size={24} style={{ color: 'var(--accent)' }} />
                <div>
                  <h2>Yedek Kodlar</h2>
                  <p className="modal-subtitle">{showBackupModal.entry.title}</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowBackupModal(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="backup-modal-content">
              <p className="backup-description">
                Yedek kodlarınızı her satıra bir kod gelecek şekilde yapıştırın.
                Bu kodlar geçiş anahtarınızı kaybettiğinizde hesabınıza erişmenizi sağlar.
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
        .passkeys-help-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .passkeys-help-btn:hover {
          background: var(--bg-elevated);
          color: var(--accent);
          border-color: var(--accent);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .passkeys-help-link {
          margin-top: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 12px;
          color: var(--accent);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .passkeys-help-link:hover {
          background: var(--bg-elevated);
          border-color: var(--accent);
          transform: translateY(-2px);
        }

        /* Help Modal Styles */
        .help-modal {
          max-width: 500px;
        }

        .modal-title-wrapper {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .help-content {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 2rem;
        }

        .help-step {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 12px;
          transition: all 0.3s ease;
        }

        .help-step:hover {
          background: var(--bg-elevated);
          border-color: var(--border-hover);
        }

        .help-step.highlight {
          background: linear-gradient(145deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%);
          border-color: rgba(245, 158, 11, 0.3);
        }

        .step-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: var(--bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          flex-shrink: 0;
          border: 1px solid var(--border);
        }

        .highlight .step-icon {
          background: var(--accent-muted);
          color: var(--accent);
          border-color: rgba(245, 158, 11, 0.3);
        }

        .step-info h3 {
          font-family: 'Sora', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 0.25rem 0;
        }

        .step-info p {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }

        .step-arrow {
          text-align: center;
          color: var(--text-tertiary);
          font-weight: bold;
          font-size: 1.2rem;
          margin: -0.25rem 0;
        }

        .modal-footer {
          display: flex;
          justify-content: center;
        }

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
          flex-direction: column;
          background: linear-gradient(145deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
          border: 1px solid var(--border);
          border-radius: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }

        .passkey-card:hover {
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

        .passkey-card.expanded {
          border-color: rgba(245, 158, 11, 0.3);
        }

        .passkey-card-main {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem;
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

        .passkey-card-detail.backup-badge {
          color: var(--accent);
        }

        .passkey-card-detail.backup-badge svg {
          color: var(--accent);
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

        .backup-btn:hover {
          background: rgba(245, 158, 11, 0.15) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
          color: var(--accent) !important;
        }

        .expand-btn:hover {
          background: rgba(245, 158, 11, 0.15) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
          color: var(--accent) !important;
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

        /* Backup Codes Section */
        .passkey-backup-codes {
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
          font-size: 0.65rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .code-value {
          flex: 1;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
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

        /* Backup Modal */
        .backup-modal {
          max-width: 480px;
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
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9rem;
          line-height: 1.6;
          resize: vertical;
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

        .backup-stats {
          margin-top: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-tertiary);
        }

        .btn-secondary {
          padding: 0.75rem 1.25rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-secondary);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
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

          .passkey-card-main {
            flex-wrap: wrap;
            padding: 1rem;
          }

          .passkey-card-actions {
            width: 100%;
            justify-content: flex-end;
            margin-top: 0.75rem;
            padding-top: 0.75rem;

          .backup-codes-grid {
            grid-template-columns: 1fr;
          }
            border-top: 1px solid var(--border);
          }
        }
      `}</style>
    </div>
  );
}