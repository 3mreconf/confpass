import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ArrowLeft, Power, Lock, Download, Upload, Info, ChevronDown, CheckCircle, RefreshCw, ExternalLink, AlertTriangle, Trash2 } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import packageJson from '../../package.json';
import './Settings.css';

interface SettingsProps {
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onResetComplete?: () => void;
}

function Settings({ onBack, showToast, onResetComplete }: SettingsProps) {
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState(300);
  const [useBiometric, setUseBiometric] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [streamProtection, setStreamProtection] = useState(false);
  const [streamingDetected, setStreamingDetected] = useState(false);
  const [detectedApps, setDetectedApps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTimeoutDropdownOpen, setIsTimeoutDropdownOpen] = useState(false);
  const timeoutDropdownRef = useRef<HTMLDivElement>(null);
  const [currentVersion] = useState(packageJson.version);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const timeoutOptions = [
    { value: 60, label: '1 dakika' },
    { value: 300, label: '5 dakika' },
    { value: 600, label: '10 dakika' },
    { value: 1800, label: '30 dakika' },
    { value: 3600, label: '1 saat' },
    { value: 0, label: 'Devre dışı' },
  ];

  useEffect(() => {
    loadSettings();
    checkForUpdates();
    loadStreamProtectionStatus();

    // Stream protection event listener
    const unlisten = listen<{
      streaming_detected: boolean;
      protected: boolean;
      detected_apps: string[];
    }>('stream-protection-changed', (event) => {
      setStreamingDetected(event.payload.streaming_detected);
      setDetectedApps(event.payload.detected_apps);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdate(true);
    try {
      const response = await fetch('https://api.github.com/repos/3mreconf/confpass/releases/latest');
      if (response.ok) {
        const data = await response.json();
        const latest = data.tag_name.replace('v', '');
        setLatestVersion(latest);
      }
    } catch (error) {
      console.error('Güncelleme kontrolü başarısız:', error);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  const handleUpdate = useCallback(async () => {
    try {
      await openUrl('https://github.com/3mreconf/confpass/releases/latest');
      showToast('Tarayıcıda güncelleme sayfası açıldı', 'info');
    } catch (error) {
      showToast('Güncelleme sayfası açılamadı', 'error');
      console.error('Update error:', error);
    }
  }, [showToast]);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await invoke<{
        minimize_to_tray: boolean;
        auto_start: boolean;
        auto_lock_timeout: number;
        use_biometric: boolean;
        stream_protection: boolean;
      }>('get_settings');
      setMinimizeToTray(settings.minimize_to_tray);
      setAutoStart(settings.auto_start);
      setAutoLockTimeout(settings.auto_lock_timeout);
      setUseBiometric(settings.use_biometric);
      setStreamProtection(settings.stream_protection);

      const available = await invoke<boolean>('check_biometric_available');
      console.log('Biometric availability:', available);
      setIsBiometricAvailable(available);
    } catch (error) {
      console.error('Ayarlar yüklenemedi:', error);
    }
  }, []);

  const handleUseBiometric = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    try {
      await invoke('set_use_biometric', { enabled });
      setUseBiometric(enabled);
      showToast(enabled ? 'Windows Hello etkinleştirildi' : 'Windows Hello devre dışı bırakıldı', 'success');
    } catch (error) {
      showToast('Ayarlar kaydedilemedi', 'error');
      console.error('Biometric settings error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const loadStreamProtectionStatus = useCallback(async () => {
    try {
      const status = await invoke<{
        enabled: boolean;
        streaming_detected: boolean;
        protected: boolean;
        detected_apps: string[];
      }>('get_stream_protection_status');
      setStreamProtection(status.enabled);
      setStreamingDetected(status.streaming_detected);
      setDetectedApps(status.detected_apps);
    } catch (error) {
      console.error('Stream protection durumu yüklenemedi:', error);
    }
  }, []);

  const handleStreamProtection = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    try {
      await invoke('set_stream_protection', { enabled });
      setStreamProtection(enabled);
      showToast(
        enabled
          ? 'Yayın koruması etkinleştirildi - Ekran paylaşımında görünmez olacak'
          : 'Yayın koruması devre dışı bırakıldı',
        'success'
      );
      // Refresh status
      await loadStreamProtectionStatus();
    } catch (error) {
      showToast('Ayarlar kaydedilemedi', 'error');
      console.error('Stream protection error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast, loadStreamProtectionStatus]);

  const handleMinimizeToTray = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    try {
      await invoke('set_minimize_to_tray', { enabled });
      setMinimizeToTray(enabled);
      showToast(enabled ? 'Simge durumuna küçültme etkinleştirildi' : 'Simge durumuna küçültme devre dışı bırakıldı', 'success');
    } catch (error) {
      showToast('Ayarlar kaydedilemedi', 'error');
      console.error('Minimize to tray hatası:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const handleAutoStart = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    try {
      await invoke('set_auto_start', { enabled });
      setAutoStart(enabled);
      showToast(enabled ? 'Başlangıçta otomatik açılma etkinleştirildi' : 'Başlangıçta otomatik açılma devre dışı bırakıldı', 'success');
    } catch (error) {
      showToast('Ayarlar kaydedilemedi', 'error');
      console.error('Auto start hatası:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const handleAutoLockTimeout = useCallback(async (timeout: number) => {
    setIsLoading(true);
    try {
      await invoke('set_auto_lock_timeout', { timeout });
      setAutoLockTimeout(timeout);
      showToast('Otomatik kilitleme süresi güncellendi', 'success');
    } catch (error) {
      showToast('Ayarlar kaydedilemedi', 'error');
      console.error('Auto lock timeout hatası:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const handleExport = useCallback(async () => {
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
  }, [showToast]);

  const parseTxtVaultData = (text: string) => {
    const entries: any[] = [];
    const blocks = text.split('---');
    
    for (const block of blocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) continue;

      const entry: any = {
        id: `entry_${crypto.randomUUID()}`,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        category: 'accounts',
        title: '',
        username: '',
        password: '',
      };

      let hasData = false;

      for (const line of lines) {
        if (line.startsWith('Website name:')) {
          entry.title = line.substring('Website name:'.length).trim();
          hasData = true;
        } else if (line.startsWith('Website URL:')) {
          const url = line.substring('Website URL:'.length).trim();
          if (url) entry.url = url;
        } else if (line.startsWith('Login:')) {
          entry.username = line.substring('Login:'.length).trim();
          hasData = true;
        } else if (line.startsWith('Password:')) {
          entry.password = line.substring('Password:'.length).trim();
          hasData = true;
        } else if (line.startsWith('Comment:')) {
          const notes = line.substring('Comment:'.length).trim();
          if (notes) entry.notes = notes;
        }
      }

      if (hasData && entry.title && entry.password) {
        entries.push(entry);
      }
    }
    return entries;
  };

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        let jsonData: string;

        if (file.name.toLowerCase().endsWith('.txt')) {
          const entries = parseTxtVaultData(text);
          if (entries.length === 0) {
            showToast('Geçerli bir veri bulunamadı veya format yanlış', 'error');
            return;
          }
          jsonData = JSON.stringify({ entries });
        } else {
          jsonData = text;
        }

        const count = await invoke<number>('import_vault', { jsonData });
        showToast(`${count} kayıt başarıyla içe aktarıldı`, 'success');
      } catch (error) {
        const errorStr = String(error || '');
        showToast(errorStr || 'İçe aktarma hatası', 'error');
      }
    };
    input.click();
  }, [showToast]);

  const handleResetVault = useCallback(async () => {
    if (!resetPassword.trim()) {
      showToast('Lütfen ana şifrenizi girin', 'error');
      return;
    }

    setIsResetting(true);
    try {
      await invoke('reset_vault_with_password', { masterPassword: resetPassword });
      showToast('Uygulama başarıyla sıfırlandı', 'success');
      setShowResetDialog(false);
      setShowResetConfirm(false);
      setResetPassword('');
      if (onResetComplete) {
        onResetComplete();
      }
    } catch (error) {
      const errorStr = String(error || '');
      if (errorStr.includes('Yanlış ana şifre')) {
        showToast('Yanlış ana şifre', 'error');
      } else {
        showToast(errorStr || 'Sıfırlama başarısız', 'error');
      }
    } finally {
      setIsResetting(false);
    }
  }, [resetPassword, showToast, onResetComplete]);

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="settings-back-button" onClick={onBack}>
          <ArrowLeft size={20} />
          Geri
        </button>
        <h1 className="settings-title">Ayarlar</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h2 className="settings-section-title">
            <Power size={20} />
            Uygulama Ayarları
          </h2>
          
          <div className="settings-item">
            <div className="settings-item-info">
              <h3>Simge Durumuna Küçült</h3>
              <p>Pencereyi kapatırken sistem tepsisine küçült</p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={minimizeToTray}
                onChange={(e) => handleMinimizeToTray(e.target.checked)}
                disabled={isLoading}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <h3>Başlangıçta Otomatik Aç</h3>
              <p>Windows başladığında uygulamayı otomatik olarak aç</p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => handleAutoStart(e.target.checked)}
                disabled={isLoading}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">
            <Lock size={20} />
            Güvenlik Ayarları
          </h2>
          
          <div className="settings-item">
            <div className="settings-item-info">
              <h3>Otomatik Kilitleme</h3>
              <p>Belirtilen süre boyunca kullanılmadığında kasayı otomatik kilitle</p>
            </div>
            <div className="settings-time-selector" ref={timeoutDropdownRef}>
              <button
                type="button"
                className="custom-dropdown-button"
                onClick={() => setIsTimeoutDropdownOpen(!isTimeoutDropdownOpen)}
                disabled={isLoading}
              >
                <span>{timeoutOptions.find(opt => opt.value === autoLockTimeout)?.label || '5 dakika'}</span>
                <ChevronDown size={16} className={isTimeoutDropdownOpen ? 'open' : ''} />
              </button>
              {isTimeoutDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {timeoutOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`custom-dropdown-item ${autoLockTimeout === option.value ? 'selected' : ''}`}
                      onClick={() => {
                        handleAutoLockTimeout(option.value);
                        setIsTimeoutDropdownOpen(false);
                      }}
                    >
                      {option.label}
                      {autoLockTimeout === option.value && <CheckCircle size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <h3>Windows Hello</h3>
              <p>Kasa kilidini Windows Hello (Parmak izi, Yüz tanıma veya PIN) ile aç</p>
              {!isBiometricAvailable && (
                <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                  Sisteminizde Windows Hello mevcut değil veya yapılandırılmamış
                </span>
              )}
            </div>
            <label className={`toggle-switch ${!isBiometricAvailable ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={useBiometric}
                onChange={(e) => handleUseBiometric(e.target.checked)}
                disabled={isLoading || !isBiometricAvailable}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>Yayın Koruması</h3>
                {streamingDetected && streamProtection && (
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '0.2rem 0.5rem',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    borderRadius: '9999px',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    lineHeight: 1
                  }}>
                    Koruma Aktif
                  </span>
                )}
              </div>
              <p style={{ marginTop: '0.25rem' }}>Discord, OBS, Zoom gibi uygulamalarda ekran paylaşırken pencereyi gizle</p>
              {streamingDetected && detectedApps.length > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
                  Algılanan: {detectedApps.join(', ')}
                </span>
              )}
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={streamProtection}
                onChange={(e) => handleStreamProtection(e.target.checked)}
                disabled={isLoading}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">
            <Download size={20} />
            Veri Yönetimi
          </h2>
          
          <div className="settings-item">
            <div className="settings-item-info">
              <h3>Kasayı Dışa Aktar</h3>
              <p>Tüm şifrelerinizi JSON formatında dışa aktarın</p>
            </div>
            <button className="settings-action-button" onClick={handleExport}>
              <Download size={18} />
              Dışa Aktar
            </button>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <h3>Kasayı İçe Aktar</h3>
              <p>JSON veya TXT dosyasından şifrelerinizi içe aktarın</p>
            </div>
            <button className="settings-action-button" onClick={handleImport}>
              <Upload size={18} />
              İçe Aktar
            </button>
          </div>
        </div>

        <div className="settings-section danger-section">
          <h2 className="settings-section-title" style={{ color: '#ef4444' }}>
            <AlertTriangle size={20} />
            Tehlikeli Bölge
          </h2>

          <div className="settings-item">
            <div className="settings-item-info">
              <h3 style={{ color: '#ef4444' }}>Uygulamayı Sıfırla</h3>
              <p>Tüm hesaplar, ayarlar ve kayıtlı veriler kalıcı olarak silinir</p>
            </div>
            <button
              className="settings-action-button danger-button"
              onClick={() => setShowResetDialog(true)}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderColor: '#ef4444',
                color: '#ef4444'
              }}
            >
              <Trash2 size={18} />
              Sıfırla
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">
            <Info size={20} />
            Bilgi
          </h2>
          
          <div className="settings-info-item">
            <span className="settings-info-label">Mevcut Sürüm:</span>
            <span className="settings-info-value">{currentVersion}</span>
          </div>
          
          {latestVersion && (
            <div className="settings-info-item">
              <span className="settings-info-label">Son Sürüm:</span>
              <span className={`settings-info-value ${latestVersion !== currentVersion ? 'update-available' : ''}`}>
                {latestVersion}
                {latestVersion !== currentVersion && (
                  <span style={{ marginLeft: '0.5rem', color: 'var(--accent)', fontSize: '0.85rem' }}>
                    (Güncelleme mevcut)
                  </span>
                )}
              </span>
            </div>
          )}
          
          <div className="settings-item" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div className="settings-item-info">
              <h3>Güncellemeler</h3>
              <p>GitHub'dan son sürümü kontrol edin ve indirin</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button 
                className="settings-action-button" 
                onClick={checkForUpdates}
                disabled={isCheckingUpdate}
                style={{ minWidth: 'auto', padding: '0.5rem 1rem' }}
              >
                <RefreshCw size={16} style={{ animation: isCheckingUpdate ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              {(latestVersion && latestVersion !== currentVersion) || !latestVersion ? (
                <button className="settings-action-button" onClick={handleUpdate}>
                  <Download size={18} />
                  {latestVersion && latestVersion !== currentVersion ? 'Güncelle' : 'İndir'}
                </button>
              ) : null}
            </div>
          </div>
          
          <div className="settings-info-item" style={{ marginTop: '1rem' }}>
            <span className="settings-info-label">Geliştirici:</span>
            <span className="settings-info-value">3mreconf</span>
          </div>
          
          <div className="settings-info-item">
            <a 
              href="https://github.com/3mreconf/confpass/releases" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ 
                color: 'var(--accent)', 
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem'
              }}
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await openUrl('https://github.com/3mreconf/confpass/releases');
                } catch (error) {
                  console.error('Failed to open URL:', error);
                }
              }}
            >
              <ExternalLink size={14} />
              GitHub Releases
            </a>
          </div>
        </div>
      </div>

      {/* Reset Dialog */}
      {showResetDialog && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)',
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '450px',
            width: '90%',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            {!showResetConfirm ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Uygulamayı Sıfırla</h2>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Bu işlem geri alınamaz
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#ef4444' }}>
                    ⚠️ Aşağıdaki veriler kalıcı olarak silinecek:
                  </p>
                  <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <li>Tüm kayıtlı hesaplar ve şifreler</li>
                    <li>Kimlik doğrulayıcılar (2FA)</li>
                    <li>Banka kartları ve adresler</li>
                    <li>Geçiş anahtarları (Passkeys)</li>
                    <li>Notlar ve belgeler</li>
                    <li>Tüm uygulama ayarları</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Ana Şifrenizi Girin
                  </label>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Ana şifre"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && resetPassword.trim()) {
                        setShowResetConfirm(true);
                      }
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => {
                      setShowResetDialog(false);
                      setResetPassword('');
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                  >
                    İptal
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={!resetPassword.trim()}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: resetPassword.trim() ? '#ef4444' : 'rgba(239, 68, 68, 0.3)',
                      color: 'white',
                      cursor: resetPassword.trim() ? 'pointer' : 'not-allowed',
                      fontWeight: 500
                    }}
                  >
                    Devam Et
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem'
                  }}>
                    <AlertTriangle size={32} style={{ color: '#ef4444' }} />
                  </div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Emin misiniz?</h2>
                  <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)' }}>
                    Bu işlem tüm verilerinizi kalıcı olarak silecek ve geri alınamaz.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    disabled={isResetting}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      cursor: isResetting ? 'not-allowed' : 'pointer',
                      fontWeight: 500
                    }}
                  >
                    Geri
                  </button>
                  <button
                    onClick={handleResetVault}
                    disabled={isResetting}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#ef4444',
                      color: 'white',
                      cursor: isResetting ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    {isResetting ? (
                      <>
                        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Sıfırlanıyor...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Evet, Sıfırla
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
