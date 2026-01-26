import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PasswordStrengthResult } from '../types';
import { clearClipboard } from '../utils';
import { Copy, Trash2, Clock, RefreshCw } from 'lucide-react';
import './PasswordGeneratorModal.css';

interface PasswordGeneratorModalProps {
  onClose: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface PasswordHistoryItem {
  id: string;
  password: string;
  length: number;
  strength: string;
  createdAt: number;
  options: {
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    symbols: boolean;
  };
}

const HISTORY_STORAGE_KEY = 'confpass_password_history';
const MAX_HISTORY_ITEMS = 50;

function getPasswordHistory(): PasswordHistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePasswordHistory(history: PasswordHistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)));
  } catch (e) {
    console.error('Failed to save password history:', e);
  }
}

export default function PasswordGeneratorModal({ onClose, showToast }: PasswordGeneratorModalProps) {
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
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
  const [history, setHistory] = useState<PasswordHistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load history on mount
  useEffect(() => {
    setHistory(getPasswordHistory());
  }, []);

  const addToHistory = useCallback((password: string, strengthStr: string) => {
    const newItem: PasswordHistoryItem = {
      id: `pwd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      password,
      length: password.length,
      strength: strengthStr,
      createdAt: Date.now(),
      options: {
        uppercase: includeUppercase,
        lowercase: includeLowercase,
        numbers: includeNumbers,
        symbols: includeSymbols,
      },
    };

    const newHistory = [newItem, ...history];
    setHistory(newHistory);
    savePasswordHistory(newHistory);
  }, [history, includeUppercase, includeLowercase, includeNumbers, includeSymbols]);

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

      // Save to history
      addToHistory(pwd, strengthResult.strength);

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
  }, [length, includeUppercase, includeLowercase, includeNumbers, includeSymbols, addToHistory]);

  const copyToClipboard = async (password?: string, itemId?: string) => {
    const pwdToCopy = password || generatedPassword;
    if (pwdToCopy) {
      try {
        await clearClipboard(pwdToCopy, 30000);
        showToast('Şifre kopyalandı (30 saniye sonra temizlenecek)', 'success');
        if (itemId) {
          setCopiedId(itemId);
          setTimeout(() => setCopiedId(null), 2000);
        }
      } catch (error) {
        console.error('Copy failed:', error);
        showToast('Kopyalama başarısız', 'error');
      }
    }
  };

  const deleteFromHistory = (id: string) => {
    const newHistory = history.filter(item => item.id !== id);
    setHistory(newHistory);
    savePasswordHistory(newHistory);
    showToast('Şifre geçmişten silindi', 'info');
  };

  const clearHistory = () => {
    setHistory([]);
    savePasswordHistory([]);
    showToast('Şifre geçmişi temizlendi', 'info');
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;

    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getStrengthColor = (strengthStr: string) => {
    switch (strengthStr.toLowerCase()) {
      case 'çok güçlü': return 'var(--success)';
      case 'güçlü': return 'var(--success)';
      case 'orta': return 'var(--warning)';
      case 'zayıf': return 'var(--danger)';
      default: return 'var(--text-tertiary)';
    }
  };

  useEffect(() => {
    generate();
  }, []);

  useEffect(() => {
    if (generatedPassword && !isGenerating) {
      setDisplayPassword(generatedPassword);
    }
  }, [generatedPassword, isGenerating]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content generator-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Şifre Oluşturucu</h2>

        {/* Tabs */}
        <div className="generator-tabs">
          <button
            className={`generator-tab ${activeTab === 'generate' ? 'active' : ''}`}
            onClick={() => setActiveTab('generate')}
          >
            <RefreshCw size={16} />
            Oluştur
          </button>
          <button
            className={`generator-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={16} />
            Geçmiş
            {history.length > 0 && (
              <span className="history-badge">{history.length}</span>
            )}
          </button>
        </div>

        {activeTab === 'generate' ? (
          <>
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
                  <button onClick={() => copyToClipboard()} className="password-copy-icon" title="Kopyala">
                    <Copy size={18} />
                  </button>
                </div>
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
          </>
        ) : (
          <div className="history-container">
            {history.length === 0 ? (
              <div className="history-empty">
                <Clock size={48} strokeWidth={1} />
                <p>Henüz şifre oluşturulmadı</p>
                <span>Oluşturduğunuz şifreler burada görünecek</span>
              </div>
            ) : (
              <>
                <div className="history-header">
                  <span className="history-count">{history.length} şifre</span>
                  <button className="history-clear-btn" onClick={clearHistory}>
                    <Trash2 size={14} />
                    Tümünü Temizle
                  </button>
                </div>
                <div className="history-list">
                  {history.map((item) => (
                    <div key={item.id} className="history-item">
                      <div className="history-item-main">
                        <div className="history-item-password">
                          <code>{item.password}</code>
                        </div>
                        <div className="history-item-meta">
                          <span className="history-item-length">{item.length} karakter</span>
                          <span
                            className="history-item-strength"
                            style={{ color: getStrengthColor(item.strength) }}
                          >
                            {item.strength}
                          </span>
                          <span className="history-item-date">{formatDate(item.createdAt)}</span>
                        </div>
                      </div>
                      <div className="history-item-actions">
                        <button
                          className={`history-action-btn copy ${copiedId === item.id ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(item.password, item.id)}
                          title="Kopyala"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className="history-action-btn delete"
                          onClick={() => deleteFromHistory(item.id)}
                          title="Sil"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button onClick={() => setActiveTab('generate')} className="generate-button">
                Yeni Şifre Oluştur
              </button>
              <button onClick={onClose} className="cancel-button">Kapat</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
