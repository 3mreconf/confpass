import { memo, useCallback, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Edit, Eye, EyeOff, Trash2, Copy, ExternalLink, Star, MoreVertical, Globe, AlertTriangle, Shield, ShieldCheck, CreditCard, KeyRound, MapPin, Building2, Mail, FileText, FolderOpen, Map } from 'lucide-react';
import { clearClipboard } from '../utils';
import type { PasswordEntry, TotpData, PasskeyData } from '../types';

interface EntryCardProps {
  entry: PasswordEntry;
  isPasswordVisible: boolean;
  onTogglePassword: (id: string) => void;
  onEdit: (entry: PasswordEntry) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  loadEntries: () => void;
  setConfirmDialog: (dialog: { message: string; onConfirm: () => void } | null) => void;
  isSelected?: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onShowTotp?: (secret: string, issuer?: string, account?: string) => void;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, entryId: string) => void;
}

const EntryCard = memo(function EntryCard({
  entry,
  isPasswordVisible,
  onTogglePassword,
  onEdit,
  showToast,
  loadEntries,
  setConfirmDialog,
  isSelected = false,
  isFavorite,
  onToggleFavorite,
  onShowTotp,
  selectionMode = false,
  onToggleSelect,
  onDragStart
}: EntryCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{ strength: string; score: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (entry.category === 'accounts' && entry.password) {
      const checkStrength = async () => {
        try {
          const result = await invoke<any>('check_password_strength', { password: entry.password });
          setPasswordStrength({ strength: result.strength, score: result.score });
        } catch (error) {
          console.error('Error checking password strength:', error);
        }
      };
      checkStrength();
    } else {
      setPasswordStrength(null);
    }
  }, [entry.password, entry.category]);

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'Çok Güçlü':
      case 'Güçlü':
        return '#00d9ff';
      case 'Orta':
        return '#ffa726';
      case 'Zayıf':
        return '#ff4757';
      default:
        return '#707070';
    }
  };

  const getStrengthIcon = (strength: string) => {
    if (strength === 'Çok Güçlü' || strength === 'Güçlü') {
      return <ShieldCheck size={12} />;
    }
    if (strength === 'Zayıf') {
      return <AlertTriangle size={12} />;
    }
    return <Shield size={12} />;
  };

  const handleCopyUsername = useCallback(async () => {
    try {
      await clearClipboard(entry.username, 60000);
      showToast('Kullanıcı adı kopyalandı', 'success');
    } catch (error) {
      console.error('Copy failed:', error);
      showToast('Kopyalama başarısız', 'error');
    }
  }, [entry.username, showToast]);

  const handleCopyPassword = useCallback(async () => {
    try {
      await clearClipboard(entry.password, 30000);
      showToast('Şifre kopyalandı (30 saniye sonra temizlenecek)', 'success');
    } catch (error) {
      console.error('Copy failed:', error);
      showToast('Kopyalama başarısız', 'error');
    }
  }, [entry.password, showToast]);

  const handleDelete = useCallback(() => {
    setConfirmDialog({
      message: 'Bu kaydı silmek istediğinize emin misiniz?',
      onConfirm: async () => {
        try {
          await invoke('delete_password_entry', { id: entry.id });
          
          try {
            await invoke('log_activity', {
              action: 'delete',
              entry_id: entry.id,
              details: `Kayıt silindi: ${entry.title}`
            });
          } catch (logError) {
            console.error('Activity log error:', logError);
          }
          
          loadEntries();
          showToast('Kayıt başarıyla silindi', 'success');
          setConfirmDialog(null);
        } catch (error) {
          const errorStr = String(error || '');
          let errorMessage = 'Silme hatası';
          
          if (errorStr.includes('Kasa kilitli')) {
            errorMessage = 'Kasa kilitli. Lütfen önce kasa kilidini açın.';
          } else if (errorStr.includes('kaydedilemedi')) {
            errorMessage = 'Kayıt silindi ancak kaydedilemedi. Lütfen tekrar deneyin.';
          } else if (errorStr.includes('Master password')) {
            errorMessage = 'Master password bulunamadı. Lütfen kasa kilidini açın.';
          } else if (errorStr) {
            errorMessage = errorStr;
          }
          
          showToast(errorMessage, 'error');
          setConfirmDialog(null);
        }
      }
    });
  }, [entry.id, entry.title, loadEntries, showToast, setConfirmDialog]);

  const handleOpenUrl = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (entry.url) {
      try {
        await openUrl(entry.url);
      } catch (error) {
        console.error('Failed to open URL:', error);
        showToast('URL açılamadı', 'error');
      }
    }
  }, [entry.url, showToast]);

  const handleToggleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(entry.id);
    showToast(isFavorite ? 'Favorilerden kaldırıldı' : 'Favorilere eklendi', 'info');
  }, [isFavorite, showToast, onToggleFavorite, entry.id]);

  const handleMenuToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(prev => !prev);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showMenu && !target.closest('.entry-menu') && !target.closest('.menu-button')) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const extractDomain = (url?: string): string => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const formatCardNumber = (cardNumber: string): string => {
    const cleaned = cardNumber.replace(/\s/g, '');
    if (cleaned.length <= 4) return cleaned;
    const last4 = cleaned.slice(-4);
    return `**** **** **** ${last4}`;
  };

  const getCardData = () => {
    if (entry.category !== 'bank_cards' || !entry.notes) return null;
    try {
      return JSON.parse(entry.notes);
    } catch {
      return null;
    }
  };

  const cardData = getCardData();
  const isBankCard = entry.category === 'bank_cards';

  const getTotpData = (): TotpData | null => {
    if (!entry.notes) return null;
    try {
      const parts = entry.notes.split('\n');
      for (const part of parts) {
        if (part.startsWith('{') && part.includes('totp')) {
          const data = JSON.parse(part);
          if (data.totp && data.totp.secret) {
            return data.totp;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const getAddressData = () => {
    if (entry.category !== 'addresses' || !entry.notes) return null;
    try {
      const parts = entry.notes.split('\n');
      for (const part of parts) {
        if (part.startsWith('{') && (part.includes('street') || part.includes('city'))) {
          const data = JSON.parse(part);
          if (data.street || data.city) {
            return data;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const getDocumentData = () => {
    if (entry.category !== 'documents' || !entry.notes) return null;
    try {
      const parts = entry.notes.split('\n');
      for (const part of parts) {
        if (part.startsWith('{') && (part.includes('documentType') || part.includes('filePath'))) {
          const data = JSON.parse(part);
          if (data.documentType || data.filePath) {
            return data;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const getPlainNotes = () => {
    if (!entry.notes) return null;
    // Filter out JSON data for ALL categories (including TOTP data)
    const parts = entry.notes.split('\n');
    const jsonPart = parts.find(p => p.startsWith('{'));
    if (jsonPart) {
      const remainingParts = parts.filter(p => !p.startsWith('{'));
      return remainingParts.length > 0 ? remainingParts.join('\n') : null;
    }
    return entry.notes;
  };

  const getPasskeyData = (): PasskeyData | null => {
    if (entry.category !== 'passkeys' || !entry.notes) return null;
    try {
      const parts = entry.notes.split('\n');
      for (const part of parts) {
        if (part.startsWith('{') && (part.includes('username') || part.includes('email') || part.includes('domain'))) {
          const data = JSON.parse(part);
          if (data.username || data.email || data.domain) {
            return data;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const totpData = getTotpData();
  const hasTotp = totpData !== null;
  const addressData = getAddressData();
  const documentData = getDocumentData();
  const passkeyData = getPasskeyData();
  const plainNotes = getPlainNotes();
  const isPasskey = entry.category === 'passkeys';

  const getFullAddress = useCallback(() => {
    if (!addressData) return '';
    const parts = [
      addressData.street,
      addressData.city,
      addressData.state,
      addressData.postalCode,
      addressData.country
    ].filter(Boolean);
    return parts.join(', ');
  }, [addressData]);

  const handleOpenInMaps = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!addressData) {
      console.warn('Address data not available');
      return;
    }
    const parts = [
      addressData.street,
      addressData.city,
      addressData.state,
      addressData.postalCode,
      addressData.country
    ].filter(Boolean);
    const fullAddress = parts.join(', ');
    if (fullAddress) {
      try {
        const encodedAddress = encodeURIComponent(fullAddress);
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
        console.log('Opening maps URL:', mapsUrl);
        await openUrl(mapsUrl);
      } catch (error) {
        console.error('Failed to open maps URL:', error);
      }
    } else {
      console.warn('No address data to open in maps');
    }
  }, [addressData]);

  const handleShowTotp = useCallback(() => {
    if (totpData && onShowTotp) {
      onShowTotp(totpData.secret, totpData.issuer, entry.title);
    }
  }, [totpData, onShowTotp, entry.title]);

  const handleCopyCardNumber = useCallback(async () => {
    try {
      const cardNum = entry.username || (cardData?.cardNumber || '');
      await clearClipboard(cardNum, 60000);
      showToast('Kart numarası kopyalandı', 'success');
    } catch (error) {
      console.error('Copy failed:', error);
      showToast('Kopyalama başarısız', 'error');
    }
  }, [entry.username, cardData, showToast]);

  const handleCopyCvv = useCallback(async () => {
    try {
      await clearClipboard(entry.password, 30000);
      showToast('CVV kopyalandı (30 saniye sonra temizlenecek)', 'success');
    } catch (error) {
      console.error('Copy failed:', error);
      showToast('Kopyalama başarısız', 'error');
    }
  }, [entry.password, showToast]);

  const handleCopyField = useCallback(async (value: string, label: string) => {
    try {
      await clearClipboard(value, 60000);
      showToast(`${label} kopyalandı`, 'success');
    } catch (error) {
      console.error('Copy failed:', error);
      showToast('Kopyalama başarısız', 'error');
    }
  }, [showToast]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if (selectionMode && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(entry.id);
    }
  }, [selectionMode, onToggleSelect, entry.id]);

  return (
    <div
      className={`entry-card ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${selectionMode ? 'selection-mode' : ''}`}
      data-category={entry.category}
      draggable={!selectionMode}
      onDragStart={(e) => onDragStart?.(e, entry.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      <div className="entry-card-top">
        {selectionMode ? (
          <div
            className={`selection-checkbox ${isSelected ? 'checked' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(entry.id);
            }}
          >
            {isSelected && <span>✓</span>}
          </div>
        ) : (
          <button
            className={`favorite-button ${isFavorite ? 'active' : ''}`}
            onClick={handleToggleFavorite}
            title={isFavorite ? 'Favorilerden kaldır' : 'Favorilere ekle'}
          >
            <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
        <button
          className="menu-button"
          onClick={handleMenuToggle}
          title="Menü"
        >
          <MoreVertical size={16} />
        </button>
        {showMenu && (
          <div className="entry-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { onEdit(entry); setShowMenu(false); }}>
              <Edit size={14} />
              Düzenle
            </button>
            <button onClick={() => { handleDelete(); setShowMenu(false); }}>
              <Trash2 size={14} />
              Sil
            </button>
          </div>
        )}
      </div>
      
      <div className="entry-card-content">
        <div className="entry-title-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isBankCard && <CreditCard size={18} />}
            <h3>{entry.title}</h3>
          </div>
          {entry.url && (
            <div className="entry-url">
              <Globe size={14} />
              <span>{extractDomain(entry.url)}</span>
            </div>
          )}
          {isBankCard && cardData && (
            <div className="entry-card-type" style={{ 
              display: 'inline-block',
              padding: '0.25rem 0.5rem',
              background: 'var(--bg-tertiary)',
              borderRadius: '4px',
              fontSize: '0.75rem',
              marginTop: '0.5rem'
            }}>
              {cardData.cardType || 'Visa'}
            </div>
          )}
        </div>

        <div className="entry-credentials">
          {isBankCard ? (
            <>
              <div className="credential-row">
                <span className="credential-label">Kart Numarası</span>
                <div className="credential-value">
                  <span className="password-display">
                    {isPasswordVisible ? (entry.username || '') : formatCardNumber(entry.username || '')}
                  </span>
                  <div className="password-actions">
                    <button
                      className="eye-icon-btn"
                      onClick={() => onTogglePassword(entry.id)}
                      title={isPasswordVisible ? 'Gizle' : 'Göster'}
                    >
                      {isPasswordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      className="copy-icon-btn"
                      onClick={handleCopyCardNumber}
                      title="Kopyala"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              </div>
              {cardData?.cardholderName && (
                <div className="credential-row">
                  <span className="credential-label">Kart Sahibi</span>
                  <div className="credential-value">
                    <span>{cardData.cardholderName}</span>
                  </div>
                </div>
              )}
              {cardData?.expiry && (
                <div className="credential-row">
                  <span className="credential-label">Son Kullanma</span>
                  <div className="credential-value">
                    <span>{cardData.expiry}</span>
                  </div>
                </div>
              )}
              <div className="credential-row">
                <span className="credential-label">CVC2/CVV2</span>
                <div className="credential-value">
                  <span className="password-display">
                    {isPasswordVisible ? entry.password : '•••'}
                  </span>
                  <div className="password-actions">
                    <button
                      className="eye-icon-btn"
                      onClick={() => onTogglePassword(entry.id)}
                      title={isPasswordVisible ? 'Gizle' : 'Göster'}
                    >
                      {isPasswordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      className="copy-icon-btn"
                      onClick={handleCopyCvv}
                      title="Kopyala"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : isPasskey ? (
            <>
              <div style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '1rem',
                boxShadow: '0 2px 8px rgba(0, 217, 255, 0.3)'
              }}>
                Geçiş Anahtarı
              </div>
              {passkeyData?.username && (
                <div className="credential-row">
                  <span className="credential-label">Kullanıcı Adı</span>
                  <div className="credential-value">
                    <span>{passkeyData.username}</span>
                    <button
                      className="copy-icon-btn"
                      onClick={() => handleCopyField(passkeyData.username!, 'Kullanıcı adı')}
                      title="Kopyala"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
              {passkeyData?.email && (
                <div className="credential-row">
                  <span className="credential-label">E-posta</span>
                  <div className="credential-value">
                    <span>{passkeyData.email}</span>
                    <button
                      className="copy-icon-btn"
                      onClick={() => handleCopyField(passkeyData.email!, 'E-posta')}
                      title="Kopyala"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (entry.category === 'notes' || entry.category === 'addresses' || entry.category === 'documents') ? (
            entry.category === 'notes' && (
              <div className="note-content" style={{
                padding: '1rem',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                fontSize: '0.95rem'
              }}>
                {entry.notes || 'İçerik yok'}
              </div>
            )
          ) : (
            <>
              <div className="credential-row">
                <span className="credential-label">Kullanıcı Adı</span>
                <div className="credential-value">
                  <span>{entry.username}</span>
                  <button
                    className="copy-icon-btn"
                    onClick={handleCopyUsername}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              <div className="credential-row">
                <span className="credential-label">Şifre</span>
                <div className="credential-value">
                  <span className="password-display">
                    {isPasswordVisible ? entry.password : '••••••••'}
                  </span>
                  <div className="password-actions">
                    <button
                      className="eye-icon-btn"
                      onClick={() => onTogglePassword(entry.id)}
                      title={isPasswordVisible ? 'Gizle' : 'Göster'}
                    >
                      {isPasswordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      className="copy-icon-btn"
                      onClick={handleCopyPassword}
                      title="Kopyala"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                {passwordStrength && (
                  <div 
                    className="password-strength-indicator"
                    style={{ color: getStrengthColor(passwordStrength.strength) }}
                  >
                    {getStrengthIcon(passwordStrength.strength)}
                    <span>{passwordStrength.strength}</span>
                  </div>
                )}
              </div>
              {hasTotp && (
                <button
                  className="totp-button"
                  onClick={handleShowTotp}
                  style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--accent)',
                    borderRadius: '8px',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    width: '100%',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--accent)';
                  }}
                >
                  <KeyRound size={16} />
                  2FA Kodu
                </button>
              )}
            </>
          )}
        </div>

        {entry.category === 'addresses' && addressData && (
          <div className="entry-notes" style={{ 
            background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(0, 217, 255, 0.05) 100%)',
            borderRadius: '16px', 
            padding: '1.25rem',
            marginTop: '1rem',
            border: '1px solid rgba(0, 217, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            animation: 'fadeInUp 0.4s ease-out'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 217, 255, 0.15)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1.25rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 auto', minWidth: '200px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0, 217, 255, 0.3)',
                  flexShrink: 0
                }}>
                  <MapPin size={20} style={{ color: '#ffffff' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <span className="notes-label" style={{ fontSize: '1.1rem', fontWeight: 600, display: 'block' }}>Adres Bilgileri</span>
                  {getFullAddress() && (
                    <span style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginTop: '0.35rem',
                      lineHeight: 1.4
                    }}>
                      {getFullAddress()}
                    </span>
                  )}
                </div>
              </div>
              {getFullAddress() && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenInMaps(e);
                  }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.15) 0%, rgba(0, 217, 255, 0.1) 100%)',
                    border: '1px solid rgba(0, 217, 255, 0.25)',
                    borderRadius: '10px',
                    padding: '0.65rem 1.25rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    color: 'var(--accent)',
                    transition: 'all 0.2s ease',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 217, 255, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 217, 255, 0.15) 0%, rgba(0, 217, 255, 0.1) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.25)';
                    e.currentTarget.style.color = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  title="Haritada Aç"
                >
                  <Map size={16} />
                  <span>Haritada Aç</span>
                </button>
              )}
            </div>
            <div className="notes-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {addressData.street && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <MapPin size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Sokak</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{addressData.street}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyField(addressData.street, 'Sokak')}
                    style={{
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      width: '36px',
                      height: '36px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
              {addressData.city && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Building2 size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Şehir</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{addressData.city}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyField(addressData.city, 'Şehir')}
                    style={{
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      width: '36px',
                      height: '36px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
              {addressData.state && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Building2 size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>İl/İlçe</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{addressData.state}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyField(addressData.state, 'İl/İlçe')}
                    style={{
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      width: '36px',
                      height: '36px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
              {addressData.postalCode && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Mail size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Posta Kodu</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{addressData.postalCode}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyField(addressData.postalCode, 'Posta Kodu')}
                    style={{
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      width: '36px',
                      height: '36px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
              {addressData.country && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Globe size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Ülke</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{addressData.country}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyField(addressData.country, 'Ülke')}
                    style={{
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      width: '36px',
                      height: '36px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>
            {plainNotes && (
              <div className="notes-content" style={{ 
                marginTop: '1rem', 
                paddingTop: '1rem', 
                borderTop: '1px solid var(--border)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)'
              }}>
                {plainNotes}
              </div>
            )}
          </div>
        )}

        {entry.category === 'documents' && documentData && (
          <div className="entry-notes" style={{ 
            background: 'linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(0, 217, 255, 0.05) 100%)',
            borderRadius: '16px', 
            padding: '1.25rem',
            marginTop: '1rem',
            border: '1px solid rgba(0, 217, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            animation: 'fadeInUp 0.4s ease-out'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 217, 255, 0.15)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.25rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 217, 255, 0.3)'
              }}>
                <FileText size={18} style={{ color: '#ffffff' }} />
              </div>
              <span className="notes-label" style={{ fontSize: '1rem', fontWeight: 600 }}>Belge Bilgileri</span>
            </div>
            <div className="notes-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {documentData.documentType && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <FileText size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Belge Türü</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{documentData.documentType}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyField(documentData.documentType, 'Belge Türü')}
                    style={{
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      width: '36px',
                      height: '36px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
              {documentData.filePath && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                  e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(0, 217, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Dosya Yolu</div>
                      <div style={{ 
                        fontSize: '0.95rem', 
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        wordBreak: 'break-all',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>{documentData.filePath}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyField(documentData.filePath, 'Dosya Yolu')}
                    style={{
                      background: 'rgba(0, 217, 255, 0.1)',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      width: '36px',
                      height: '36px',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(0, 217, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Kopyala"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>
            {plainNotes && (
              <div className="notes-content" style={{ 
                marginTop: '1rem', 
                paddingTop: '1rem', 
                borderTop: '1px solid var(--border)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)'
              }}>
                {plainNotes}
              </div>
            )}
          </div>
        )}

        {entry.notes && !isBankCard && !hasTotp && entry.category !== 'addresses' && entry.category !== 'documents' && entry.category !== 'passkeys' && entry.category !== 'notes' && (
          <div className="entry-notes">
            <span className="notes-label">Notlar:</span>
            <span className="notes-content">{entry.notes}</span>
          </div>
        )}

        {entry.url && (
          <button 
            className="open-browser-btn" 
            onClick={(e) => {
              e.stopPropagation();
              handleOpenUrl(e);
            }}
          >
            <ExternalLink size={16} />
            Tarayıcıda Aç
          </button>
        )}
      </div>
    </div>
  );
});

export default EntryCard;
