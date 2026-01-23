import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Copy, RefreshCw } from 'lucide-react';
import { clearClipboard } from '../utils';

interface TotpModalProps {
  secret: string;
  issuer?: string;
  account?: string;
  onClose: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function TotpModal({ secret, issuer, account, onClose, showToast }: TotpModalProps) {
  const [code, setCode] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [qrCode, setQrCode] = useState<string>('');

  const generateCode = async () => {
    try {
      const newCode = await invoke<string>('generate_totp_code', { secret });
      setCode(newCode);
      setTimeLeft(30);
    } catch (error) {
      console.error('TOTP code generation error:', error);
      showToast('TOTP kodu oluşturulamadı', 'error');
    }
  };

  const generateQrCode = async () => {
    if (!issuer || !account) return;
    
    try {
      const qr = await invoke<string>('generate_totp_qr_code', {
        secret,
        issuer,
        account
      });
      setQrCode(qr);
    } catch (error) {
      console.error('QR code generation error:', error);
    }
  };

  useEffect(() => {
    generateCode();
    if (issuer && account) {
      generateQrCode();
    }
  }, [secret, issuer, account]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          generateCode();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secret]);

  const copyCode = async () => {
    if (code) {
      try {
        await clearClipboard(code, 30000);
        showToast('Kod kopyalandı (30 saniye sonra temizlenecek)', 'success');
      } catch (error) {
        showToast('Kopyalama başarısız', 'error');
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <h2>2FA Kodu</h2>
        
        {qrCode && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <img 
              src={`data:image/png;base64,${qrCode}`} 
              alt="TOTP QR Code" 
              style={{ maxWidth: '200px', borderRadius: '8px' }}
            />
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            fontSize: '2rem',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            letterSpacing: '0.5rem',
            color: 'var(--accent)',
            padding: '1rem 2rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '12px',
            border: '2px solid var(--accent)'
          }}>
            {code}
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Yenileniyor: {timeLeft}s
          </div>
          <div style={{ 
            width: '100px', 
            height: '4px', 
            background: 'var(--bg-tertiary)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(timeLeft / 30) * 100}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 1s linear'
            }} />
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={generateCode} className="submit-button" style={{ flex: 1 }}>
            <RefreshCw size={16} style={{ marginRight: '0.5rem' }} />
            Yenile
          </button>
          <button onClick={copyCode} className="submit-button" style={{ flex: 1 }}>
            <Copy size={16} style={{ marginRight: '0.5rem' }} />
            Kopyala
          </button>
          <button onClick={onClose} className="cancel-button">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
