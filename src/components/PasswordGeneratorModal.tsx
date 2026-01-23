import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PasswordStrengthResult } from '../types';
import { clearClipboard } from '../utils';

interface PasswordGeneratorModalProps {
  onClose: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function PasswordGeneratorModal({ onClose, showToast }: PasswordGeneratorModalProps) {
  const [length, setLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [displayPassword, setDisplayPassword] = useState('');
  const [strength, setStrength] = useState<PasswordStrengthResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lengthChanged, setLengthChanged] = useState(false);

  const generate = useCallback(async () => {
    setIsGenerating(true);
    setDisplayPassword('');
    
    try {
      const pwd = await invoke<string>('generate_password', {
        length,
        includeUppercase,
        includeLowercase,
        includeNumbers,
        includeSymbols,
      });
      
      setGeneratedPassword(pwd);
      
      const strengthResult = await invoke<PasswordStrengthResult>('check_password_strength', { password: pwd });
      setStrength(strengthResult);
      
      let currentIndex = 0;
      const typingInterval = setInterval(() => {
        if (currentIndex < pwd.length) {
          setDisplayPassword(pwd.substring(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(typingInterval);
          setIsGenerating(false);
        }
      }, 30);
    } catch (error) {
      console.error('Error generating password:', error);
      setIsGenerating(false);
    }
  }, [length, includeUppercase, includeLowercase, includeNumbers, includeSymbols]);

  const copyToClipboard = async () => {
    if (generatedPassword) {
      try {
        await clearClipboard(generatedPassword, 30000);
        showToast('Şifre kopyalandı (30 saniye sonra temizlenecek)', 'success');
      } catch (error) {
        console.error('Copy failed:', error);
        showToast('Kopyalama başarısız', 'error');
      }
    }
  };

  useEffect(() => {
    generate();
  }, [generate]);
  
  useEffect(() => {
    if (generatedPassword && !isGenerating) {
      setDisplayPassword(generatedPassword);
    }
  }, [generatedPassword, isGenerating]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Şifre Oluşturucu</h2>
        <div className="form-group">
          <label className="length-label">
            <span className="length-text">Uzunluk: <span className={`length-value ${lengthChanged ? 'pulse' : ''}`}>{length}</span></span>
          </label>
          <div className="slider-container">
            <input
              type="range"
              min="8"
              max="64"
              value={length}
              className="length-slider"
              onChange={(e) => {
                const newLength = Number(e.target.value);
                setLength(newLength);
                setLengthChanged(true);
                setTimeout(() => setLengthChanged(false), 600);
              }}
            />
          </div>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={includeUppercase}
              onChange={(e) => setIncludeUppercase(e.target.checked)}
            />
            Büyük Harfler (A-Z)
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={includeLowercase}
              onChange={(e) => setIncludeLowercase(e.target.checked)}
            />
            Küçük Harfler (a-z)
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={includeNumbers}
              onChange={(e) => setIncludeNumbers(e.target.checked)}
            />
            Sayılar (0-9)
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={includeSymbols}
              onChange={(e) => setIncludeSymbols(e.target.checked)}
            />
            Özel Karakterler (!@#$...)
          </label>
        </div>
        <div className="form-group">
          <label>Oluşturulan Şifre:</label>
          <div className="password-display">
            <div className="password-wrapper">
              <input
                type="text"
                value={displayPassword}
                readOnly
                className={`generated-password ${isGenerating ? 'generating' : 'generated'}`}
              />
              {isGenerating && <span className="typing-cursor">|</span>}
            </div>
            <button onClick={copyToClipboard} className="copy-button">
              Kopyala
            </button>
          </div>
        </div>
        {strength && (
          <div className="strength-indicator" style={{ marginBottom: '2rem' }}>
            <div className={`strength-bar ${strength.strength.toLowerCase().replace(/\s+/g, '-').replace('çok-güçlü', 'very-strong').replace('güçlü', 'strong').replace('orta', 'medium').replace('zayıf', 'weak')} animate`}>
              <div className="strength-label">Güç Seviyesi: {strength.strength}</div>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={generate} className="generate-button">Yeniden Oluştur</button>
          <button onClick={onClose} className="cancel-button">Kapat</button>
        </div>
      </div>
    </div>
  );
}
