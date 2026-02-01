import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ArrowLeft, Power, Lock, Download, Upload, Info, ChevronDown, CheckCircle, RefreshCw, ExternalLink, AlertTriangle, Trash2, Timer } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import packageJson from '../../package.json';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
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
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [showEncryptedImportModal, setShowEncryptedImportModal] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [encryptedFileContent, setEncryptedFileContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [passwordRotationTimeout, setPasswordRotationTimeout] = useState(0);
  const [isRotationDropdownOpen, setIsRotationDropdownOpen] = useState(false);
  const rotationDropdownRef = useRef<HTMLDivElement>(null);
  const { updateInfo, checkForUpdates, downloadAndInstall, isChecking } = useUpdateCheck();

  const timeoutOptions = [
    { value: 60, label: '1 dakika' },
    { value: 300, label: '5 dakika' },
    { value: 600, label: '10 dakika' },
    { value: 1800, label: '30 dakika' },
    { value: 3600, label: '1 saat' },
    { value: 0, label: 'Devre dışı' },
  ];

  const rotationTimeoutOptions = [
    { value: 0, label: 'Devre dışı' },
    { value: 900, label: '15 dakika' },
    { value: 1800, label: '30 dakika' },
    { value: 3600, label: '1 saat' },
    { value: 7200, label: '2 saat' },
    { value: 14400, label: '4 saat' },
  ];

  useEffect(() => {
    loadSettings();
    loadStreamProtectionStatus();
    loadPasswordRotation();

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

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeoutDropdownRef.current && !timeoutDropdownRef.current.contains(event.target as Node)) {
        setIsTimeoutDropdownOpen(false);
      }
      if (rotationDropdownRef.current && !rotationDropdownRef.current.contains(event.target as Node)) {
        setIsRotationDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



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

  const loadPasswordRotation = useCallback(async () => {
    try {
      const timeout = await invoke<number>('get_password_rotation_timeout');
      setPasswordRotationTimeout(timeout);
    } catch (error) {
      console.error('Password rotation yüklenemedi:', error);
    }
  }, []);

  const handlePasswordRotationTimeout = useCallback(async (timeout: number) => {
    setIsLoading(true);
    try {
      await invoke('set_password_rotation_timeout', { seconds: timeout });
      setPasswordRotationTimeout(timeout);
      showToast(
        timeout === 0
          ? 'Ana şifre sıfırlama devre dışı bırakıldı'
          : 'Ana şifre sıfırlama süresi güncellendi',
        'success'
      );
    } catch (error) {
      showToast('Ayarlar kaydedilemedi', 'error');
      console.error('Password rotation hatası:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

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
    setShowExportModal(true);
  }, []);

  const handleExportUnencrypted = useCallback(async () => {
    try {
      const data = await invoke<string>('export_vault');
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `confpass-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
      showToast('Kasa başarıyla dışa aktarıldı', 'success');
    } catch (error) {
      const errorStr = String(error || '');
      showToast(errorStr || 'Dışa aktarma hatası', 'error');
    }
  }, [showToast]);

  const handleExportEncrypted = useCallback(async () => {
    if (exportPassword.length < 8) {
      showToast('Şifre en az 8 karakter olmalı', 'error');
      return;
    }
    if (exportPassword !== exportPasswordConfirm) {
      showToast('Şifreler eşleşmiyor', 'error');
      return;
    }

    setIsExporting(true);
    try {
      const data = await invoke<string>('export_vault_encrypted', { exportPassword });
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `confpass-encrypted-${new Date().toISOString().split('T')[0]}.cpvault`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
      setExportPassword('');
      setExportPasswordConfirm('');
      showToast('Şifreli yedek başarıyla oluşturuldu', 'success');
    } catch (error) {
      const errorStr = String(error || '');
      showToast(errorStr || 'Dışa aktarma hatası', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [exportPassword, exportPasswordConfirm, showToast]);

  const handleImportEncryptedFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cpvault,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        // Check if it's an encrypted file
        const parsed = JSON.parse(text);
        if (parsed.format === 'confpass_encrypted_v1') {
          setEncryptedFileContent(text);
          setShowEncryptedImportModal(true);
          setShowImportModal(false);
        } else {
          // Regular import
          const count = await invoke<number>('import_vault', { jsonData: text });
          showToast(`${count} kayıt başarıyla içe aktarıldı`, 'success');
          setShowImportModal(false);
        }
      } catch (error) {
        const errorStr = String(error || '');
        showToast(errorStr || 'İçe aktarma hatası', 'error');
      }
    };
    input.click();
  }, [showToast]);

  const handleImportEncrypted = useCallback(async () => {
    if (!importPassword) {
      showToast('Lütfen şifre girin', 'error');
      return;
    }

    setIsImporting(true);
    try {
      const count = await invoke<number>('import_vault_encrypted', {
        encryptedJson: encryptedFileContent,
        importPassword
      });
      showToast(`${count} kayıt başarıyla içe aktarıldı`, 'success');
      setShowEncryptedImportModal(false);
      setImportPassword('');
      setEncryptedFileContent('');
    } catch (error) {
      const errorStr = String(error || '');
      showToast(errorStr || 'İçe aktarma hatası', 'error');
    } finally {
      setIsImporting(false);
    }
  }, [importPassword, encryptedFileContent, showToast]);

  // CSV Parser - handles quoted fields and commas within quotes
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      if (!line.trim()) continue;

      const row: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current.trim());
      rows.push(row);
    }
    return rows;
  };

  // LastPass CSV Parser
  const parseLastPassCSV = (text: string) => {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase());
    const urlIdx = headers.indexOf('url');
    const usernameIdx = headers.indexOf('username');
    const passwordIdx = headers.indexOf('password');
    const totpIdx = headers.indexOf('totp');
    const extraIdx = headers.indexOf('extra');
    const nameIdx = headers.indexOf('name');

    const entries: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;

      const name = nameIdx >= 0 ? row[nameIdx] : '';
      const url = urlIdx >= 0 ? row[urlIdx] : '';
      const username = usernameIdx >= 0 ? row[usernameIdx] : '';
      const password = passwordIdx >= 0 ? row[passwordIdx] : '';
      const notes = extraIdx >= 0 ? row[extraIdx] : '';
      const totp = totpIdx >= 0 ? row[totpIdx] : '';

      if (!password && !username) continue;

      entries.push({
        id: `entry_${crypto.randomUUID()}`,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        category: 'accounts',
        title: name || (url ? new URL(url).hostname : 'Unnamed'),
        url: url || '',
        username: username || '',
        password: password || '',
        notes: notes || '',
        totp_secret: totp || undefined,
      });
    }
    return entries;
  };

  // Bitwarden CSV Parser
  const parseBitwardenCSV = (text: string) => {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z_]/g, ''));
    const nameIdx = headers.indexOf('name');
    const uriIdx = headers.findIndex(h => h.includes('uri') || h.includes('url'));
    const usernameIdx = headers.findIndex(h => h.includes('username'));
    const passwordIdx = headers.findIndex(h => h.includes('password'));
    const totpIdx = headers.findIndex(h => h.includes('totp'));
    const notesIdx = headers.indexOf('notes');

    const entries: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;

      const name = nameIdx >= 0 ? row[nameIdx] : '';
      const url = uriIdx >= 0 ? row[uriIdx] : '';
      const username = usernameIdx >= 0 ? row[usernameIdx] : '';
      const password = passwordIdx >= 0 ? row[passwordIdx] : '';
      const notes = notesIdx >= 0 ? row[notesIdx] : '';
      const totp = totpIdx >= 0 ? row[totpIdx] : '';

      if (!password && !username) continue;

      let parsedUrl = url;
      try {
        if (url && !url.startsWith('http')) {
          parsedUrl = 'https://' + url;
        }
      } catch { }

      entries.push({
        id: `entry_${crypto.randomUUID()}`,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        category: 'accounts',
        title: name || (parsedUrl ? new URL(parsedUrl).hostname : 'Unnamed'),
        url: parsedUrl || '',
        username: username || '',
        password: password || '',
        notes: notes || '',
        totp_secret: totp || undefined,
      });
    }
    return entries;
  };

  // 1Password CSV Parser
  const parse1PasswordCSV = (text: string) => {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase());
    const titleIdx = headers.indexOf('title');
    const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('website'));
    const usernameIdx = headers.findIndex(h => h.includes('username'));
    const passwordIdx = headers.findIndex(h => h.includes('password'));
    const otpIdx = headers.findIndex(h => h.includes('otp') || h.includes('totp'));
    const notesIdx = headers.findIndex(h => h.includes('notes') || h.includes('notesplain'));

    const entries: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;

      const title = titleIdx >= 0 ? row[titleIdx] : '';
      const url = urlIdx >= 0 ? row[urlIdx] : '';
      const username = usernameIdx >= 0 ? row[usernameIdx] : '';
      const password = passwordIdx >= 0 ? row[passwordIdx] : '';
      const notes = notesIdx >= 0 ? row[notesIdx] : '';
      const totp = otpIdx >= 0 ? row[otpIdx] : '';

      if (!password && !username) continue;

      entries.push({
        id: `entry_${crypto.randomUUID()}`,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        category: 'accounts',
        title: title || (url ? new URL(url).hostname : 'Unnamed'),
        url: url || '',
        username: username || '',
        password: password || '',
        notes: notes || '',
        totp_secret: totp || undefined,
      });
    }
    return entries;
  };

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

  const handleImportFile = useCallback((source: 'confpass' | 'lastpass' | 'bitwarden' | '1password') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = source === 'confpass' ? '.json,.txt' : '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        let entries: any[] = [];

        if (source === 'confpass') {
          if (file.name.toLowerCase().endsWith('.txt')) {
            entries = parseTxtVaultData(text);
          } else {
            // JSON format
            const count = await invoke<number>('import_vault', { jsonData: text });
            showToast(`${count} kayıt başarıyla içe aktarıldı`, 'success');
            setShowImportModal(false);
            return;
          }
        } else if (source === 'lastpass') {
          entries = parseLastPassCSV(text);
        } else if (source === 'bitwarden') {
          entries = parseBitwardenCSV(text);
        } else if (source === '1password') {
          entries = parse1PasswordCSV(text);
        }

        if (entries.length === 0) {
          showToast('Geçerli bir veri bulunamadı veya format yanlış', 'error');
          return;
        }

        const jsonData = JSON.stringify({ entries });
        const count = await invoke<number>('import_vault', { jsonData });
        showToast(`${count} kayıt başarıyla içe aktarıldı`, 'success');
        setShowImportModal(false);
      } catch (error) {
        const errorStr = String(error || '');
        showToast(errorStr || 'İçe aktarma hatası', 'error');
      }
    };
    input.click();
  }, [showToast]);

  const handleImport = useCallback(() => {
    setShowImportModal(true);
  }, []);

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

          <div className="settings-item">
            <div className="settings-item-info">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>Ana Şifre Sıfırlama</h3>
                {passwordRotationTimeout > 0 && (
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
                    Aktif
                  </span>
                )}
              </div>
              <p style={{ marginTop: '0.25rem' }}>Belirtilen süre sonunda ana şifreyi bellekten sil (yeniden giriş gerektirir)</p>
            </div>
            <div className="settings-time-selector" ref={rotationDropdownRef}>
              <button
                type="button"
                className="custom-dropdown-button"
                onClick={() => setIsRotationDropdownOpen(!isRotationDropdownOpen)}
                disabled={isLoading}
              >
                <Timer size={16} style={{ marginRight: '0.5rem', opacity: 0.7 }} />
                <span>{rotationTimeoutOptions.find(opt => opt.value === passwordRotationTimeout)?.label || 'Devre dışı'}</span>
                <ChevronDown size={16} className={isRotationDropdownOpen ? 'open' : ''} />
              </button>
              {isRotationDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {rotationTimeoutOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`custom-dropdown-item ${passwordRotationTimeout === option.value ? 'selected' : ''}`}
                      onClick={() => {
                        handlePasswordRotationTimeout(option.value);
                        setIsRotationDropdownOpen(false);
                      }}
                    >
                      {option.label}
                      {passwordRotationTimeout === option.value && <CheckCircle size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              <p>ConfPass, LastPass, Bitwarden veya 1Password'dan aktarın</p>
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

          {updateInfo.latestVersion && (
            <div className="settings-info-item">
              <span className="settings-info-label">Son Sürüm:</span>
              <span className={`settings-info-value ${updateInfo.available ? 'update-available' : ''}`}>
                {updateInfo.latestVersion}
                {updateInfo.available && (
                  <span style={{ marginLeft: '0.5rem', color: 'var(--accent)', fontSize: '0.85rem' }}>
                    (Güncelleme mevcut)
                  </span>
                )}
              </span>
            </div>
          )}

          {updateInfo.error && (
            <div className="settings-info-item" style={{ color: '#ef4444', fontSize: '0.85rem' }}>
              Hata: {updateInfo.error}
            </div>
          )}

          <div className="settings-item" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div className="settings-item-info">
              <h3>Güncellemeler</h3>
              <p>
                {updateInfo.downloading ? 'Güncelleme indiriliyor ve kuruluyor...' :
                  updateInfo.downloaded ? 'Güncelleme başarıyla kuruldu. Uygulama yeniden başlatılacak.' :
                    updateInfo.available ? 'Yeni sürüm mevcut! İndirip kurmak için butona tıklayın.' :
                      'En son sürümü kullanıyorsunuz.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                className="settings-action-button"
                onClick={checkForUpdates}
                disabled={isChecking || updateInfo.downloading}
                style={{ minWidth: 'auto', padding: '0.5rem 1rem' }}
              >
                <RefreshCw size={16} style={{ animation: isChecking ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              {updateInfo.available && !updateInfo.downloaded && (
                <button
                  className="settings-action-button"
                  onClick={async () => {
                    const success = await downloadAndInstall();
                    if (!success) {
                      showToast(updateInfo.error || 'Güncelleme başarısız', 'error');
                    }
                  }}
                  disabled={updateInfo.downloading}
                  style={{
                    background: updateInfo.downloading ? 'rgba(59, 130, 246, 0.5)' : 'var(--accent)',
                    cursor: updateInfo.downloading ? 'wait' : 'pointer'
                  }}
                >
                  <Download size={18} style={{ animation: updateInfo.downloading ? 'pulse 1.5s ease-in-out infinite' : 'none' }} />
                  {updateInfo.downloading ? 'İndiriliyor...' : 'İndir ve Kur'}
                </button>
              )}
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

      {/* Import Modal */}
      {showImportModal && (
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
            maxWidth: '500px',
            width: '90%',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'var(--accent-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Upload size={24} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Şifreleri İçe Aktar</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Kaynak uygulamayı seçin
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                onClick={handleImportEncryptedFile}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--accent)',
                  background: 'rgba(0, 217, 255, 0.05)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0, 217, 255, 0.1)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0, 217, 255, 0.05)'}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: '#fff'
                }}>
                  <Lock size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>ConfPass Şifreli Yedek</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>.cpvault veya şifreli JSON dosyası</div>
                </div>
              </button>

              <button
                onClick={() => handleImportFile('confpass')}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: '#000'
                }}>CP</div>
                <div>
                  <div style={{ fontWeight: 600 }}>ConfPass</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>JSON veya TXT dosyası (şifresiz)</div>
                </div>
              </button>

              <button
                onClick={() => handleImportFile('lastpass')}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#d32d27',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: '#fff'
                }}>LP</div>
                <div>
                  <div style={{ fontWeight: 600 }}>LastPass</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>CSV dosyası dışa aktarın</div>
                </div>
              </button>

              <button
                onClick={() => handleImportFile('bitwarden')}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#175ddc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: '#fff'
                }}>BW</div>
                <div>
                  <div style={{ fontWeight: 600 }}>Bitwarden</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>CSV dosyası dışa aktarın</div>
                </div>
              </button>

              <button
                onClick={() => handleImportFile('1password')}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: '#1a8cff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: '#fff'
                }}>1P</div>
                <div>
                  <div style={{ fontWeight: 600 }}>1Password</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>CSV dosyası dışa aktarın</div>
                </div>
              </button>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)'
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>İpucu:</strong> Diğer uygulamalardan şifrelerinizi CSV formatında dışa aktarın, ardından burada içe aktarın.
            </div>

            <button
              onClick={() => setShowImportModal(false)}
              style={{
                width: '100%',
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
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
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
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'var(--accent-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Download size={24} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Kasayı Dışa Aktar</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Export türünü seçin
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <button
                onClick={handleExportUnencrypted}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Download size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Şifresiz Export (JSON)</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Düz metin, diğer uygulamalara aktarmak için</div>
                </div>
              </button>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Şifreli Export (.cpvault)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Güvenli yedekleme için şifre ile koruma
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Şifre (en az 8 karakter)
                  </label>
                  <input
                    type="password"
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    placeholder="Şifre"
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
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Şifre Tekrar
                  </label>
                  <input
                    type="password"
                    value={exportPasswordConfirm}
                    onChange={(e) => setExportPasswordConfirm(e.target.value)}
                    placeholder="Şifre tekrar"
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
                  />
                </div>

                <button
                  onClick={handleExportEncrypted}
                  disabled={isExporting || exportPassword.length < 8 || exportPassword !== exportPasswordConfirm}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: exportPassword.length >= 8 && exportPassword === exportPasswordConfirm
                      ? 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)'
                      : 'rgba(0, 217, 255, 0.3)',
                    color: 'white',
                    cursor: exportPassword.length >= 8 && exportPassword === exportPasswordConfirm ? 'pointer' : 'not-allowed',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      Şifreleniyor...
                    </>
                  ) : (
                    <>
                      <Lock size={16} />
                      Şifreli Export
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setShowExportModal(false);
                setExportPassword('');
                setExportPasswordConfirm('');
              }}
              style={{
                width: '100%',
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
          </div>
        </div>
      )}

      {/* Encrypted Import Modal */}
      {showEncryptedImportModal && (
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
            maxWidth: '400px',
            width: '90%',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'var(--accent-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Lock size={24} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Şifreli Dosya</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Dosyayı açmak için şifre girin
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <input
                type="password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder="Şifre"
                autoFocus
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
                  if (e.key === 'Enter' && importPassword) {
                    handleImportEncrypted();
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setShowEncryptedImportModal(false);
                  setImportPassword('');
                  setEncryptedFileContent('');
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
                onClick={handleImportEncrypted}
                disabled={isImporting || !importPassword}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: importPassword
                    ? 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)'
                    : 'rgba(0, 217, 255, 0.3)',
                  color: 'white',
                  cursor: importPassword ? 'pointer' : 'not-allowed',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isImporting ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Açılıyor...
                  </>
                ) : (
                  'İçe Aktar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
