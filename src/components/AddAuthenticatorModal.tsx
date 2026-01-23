import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Shield, Key, User, AlertCircle, CheckCircle } from 'lucide-react';
import type { AuthenticatorData } from '../types';

interface AddAuthenticatorModalProps {
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  loadEntries: () => Promise<void>;
}

export default function AddAuthenticatorModal({
  onClose,
  showToast,
  loadEntries
}: AddAuthenticatorModalProps) {
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const cleanSecret = (value: string) => {
    return value.replace(/[\s\-=]+/g, '').toUpperCase();
  };

  // Validate and preview TOTP code
  useEffect(() => {
    const validateSecret = async () => {
      const cleanedSecret = cleanSecret(secret);
      if (cleanedSecret.length < 16) {
        setIsValid(null);
        setPreviewCode(null);
        return;
      }

      setIsValidating(true);
      try {
        const code = await invoke<string>('generate_totp_code', { secret: cleanedSecret });
        if (code && code.length === 6) {
          setPreviewCode(code);
          setIsValid(true);
        } else {
          setIsValid(false);
          setPreviewCode(null);
        }
      } catch (err) {
        console.error('Validation error:', err);
        setIsValid(false);
        setPreviewCode(null);
      }
      setIsValidating(false);
    };

    const debounce = setTimeout(validateSecret, 500);
    return () => clearTimeout(debounce);
  }, [secret]);

  const handleSave = async () => {
    if (!issuer.trim()) {
      showToast('Lütfen hesap adı girin', 'error');
      return;
    }

    if (!account.trim()) {
      showToast('Lütfen kullanıcı adı veya e-posta girin', 'error');
      return;
    }

    const cleanedSecret = cleanSecret(secret);
    if (cleanedSecret.length < 16) {
      showToast('Kurulum anahtarı çok kısa (en az 16 karakter)', 'error');
      return;
    }

    if (isValid === false) {
      showToast('Geçersiz kurulum anahtarı', 'error');
      return;
    }

    setIsSaving(true);

    try {
      const authData: AuthenticatorData = {
        secret: cleanedSecret,
        issuer: issuer.trim(),
        account: account.trim(),
        algorithm: 'SHA1',
        digits: 6,
        period: 30
      };

      await invoke('add_password_entry', {
        title: issuer.trim(),
        username: account.trim(),
        password: cleanedSecret,
        url: '',
        notes: JSON.stringify(authData),
        category: 'authenticator'
      });

      await loadEntries();
      showToast('Kimlik doğrulayıcı eklendi', 'success');
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      showToast('Kaydetme hatası: ' + String(err), 'error');
    }

    setIsSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content authenticator-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <Shield size={24} style={{ color: 'var(--accent)' }} />
            <h2>Kimlik Doğrulayıcı Ekle</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            İki aşamalı kimlik doğrulama için hesap bilgilerinizi ve kurulum anahtarını girin.
          </p>

          <div className="form-group">
            <label>
              <Key size={16} />
              Hesap Adı (Servis)
            </label>
            <input
              type="text"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="örn: Google, Microsoft, GitHub"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>
              <User size={16} />
              Kullanıcı Adı / E-posta
            </label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="örn: kullanici@email.com"
            />
          </div>

          <div className="form-group">
            <label>
              <Shield size={16} />
              Kurulum Anahtarı (Secret Key)
            </label>
            <div className="secret-input-wrapper">
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="örn: JBSWY3DPEHPK3PXP"
                className={`secret-input ${isValid === true ? 'valid' : isValid === false ? 'invalid' : ''}`}
                style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
              />
              <div className="secret-status">
                {isValidating && <div className="spinner-small" />}
                {!isValidating && isValid === true && (
                  <CheckCircle size={18} className="status-valid" />
                )}
                {!isValidating && isValid === false && (
                  <AlertCircle size={18} className="status-invalid" />
                )}
              </div>
            </div>
            <small className="form-hint">
              Web sitesinin iki faktörlü kimlik doğrulama ayarlarından aldığınız gizli anahtar
            </small>
          </div>

          {previewCode && (
            <div className="code-preview">
              <span className="code-preview-label">Önizleme Kodu:</span>
              <span className="code-preview-value">
                {previewCode.slice(0, 3)} {previewCode.slice(3)}
              </span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving || !issuer.trim() || !account.trim() || !isValid}
          >
            {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      <style>{`
        .authenticator-modal {
          max-width: 480px;
        }

        .modal-header-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .modal-description {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Sora', sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .form-group label svg {
          color: var(--accent);
        }

        .form-group input {
          width: 100%;
          padding: 14px 16px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 12px;
          color: var(--text-primary);
          font-size: 0.95rem;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .form-group input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
        }

        .form-group input::placeholder {
          color: var(--text-tertiary);
        }

        .secret-input-wrapper {
          position: relative;
        }

        .secret-input {
          padding-right: 44px !important;
          font-family: 'JetBrains Mono', monospace;
        }

        .secret-input.valid {
          border-color: #10b981 !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
        }

        .secret-input.invalid {
          border-color: #ef4444 !important;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
        }

        .secret-status {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
        }

        .status-valid {
          color: #10b981;
        }

        .status-invalid {
          color: #ef4444;
        }

        .spinner-small {
          width: 18px;
          height: 18px;
          border: 2px solid var(--bg-secondary);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .form-hint {
          display: block;
          margin-top: 8px;
          font-size: 0.8rem;
          color: var(--text-tertiary);
        }

        .code-preview {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 18px;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05));
          border: 1px solid rgba(245, 158, 11, 0.25);
          border-radius: 14px;
          margin-top: 1.25rem;
        }

        .code-preview-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .code-preview-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.75rem;
          font-weight: 600;
          color: var(--accent);
          letter-spacing: 4px;
          text-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }

        .btn-secondary,
        .btn-primary {
          padding: 12px 24px;
          border-radius: 12px;
          font-family: 'Sora', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .btn-secondary {
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          color: var(--text-secondary);
        }

        .btn-secondary:hover {
          background: var(--bg-elevated);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .btn-primary {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border: none;
          color: var(--bg-primary);
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 25px rgba(245, 158, 11, 0.4);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
      `}</style>
    </div>
  );
}
