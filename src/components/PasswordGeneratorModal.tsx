import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PasswordStrengthResult } from '../types';
import { clearClipboard } from '../utils';
import { Copy, Trash2, Clock, RefreshCw, Check, Shield, X } from 'lucide-react';
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
  const [strength, setStrength] = useState<PasswordStrengthResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<PasswordHistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    setCopied(false);

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

      addToHistory(pwd, strengthResult.strength);

      setTimeout(() => setIsGenerating(false), 300);
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
        } else {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
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
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} sa önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;

    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getStrengthInfo = (strengthStr: string) => {
    switch (strengthStr?.toLowerCase()) {
      case 'çok güçlü': return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', percent: 100, label: 'Çok Güçlü' };
      case 'güçlü': return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', percent: 75, label: 'Güçlü' };
      case 'orta': return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', percent: 50, label: 'Orta' };
      case 'zayıf': return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', percent: 25, label: 'Zayıf' };
      default: return { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', percent: 0, label: '-' };
    }
  };

  useEffect(() => {
    generate();
  }, []);

  const strengthInfo = getStrengthInfo(strength?.strength || '');

  return (
    <div className="modal-overlay">
      <div className="pwd-gen-modal">
        {/* Header */}
        <div className="pwd-gen-header">
          <div className="pwd-gen-title">
            <Shield size={24} />
            <h2>Şifre Oluşturucu</h2>
          </div>
          <button className="pwd-gen-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="pwd-gen-tabs">
          <button
            className={`pwd-gen-tab ${activeTab === 'generate' ? 'active' : ''}`}
            onClick={() => setActiveTab('generate')}
          >
            <RefreshCw size={16} />
            Oluştur
          </button>
          <button
            className={`pwd-gen-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={16} />
            Geçmiş
            {history.length > 0 && <span className="pwd-gen-badge">{history.length}</span>}
          </button>
        </div>

        {activeTab === 'generate' ? (
          <div className="pwd-gen-content">
            {/* Password Display */}
            <div className="pwd-display-card">
              <div className="pwd-display-inner">
                <span className={`pwd-text ${isGenerating ? 'generating' : ''}`}>
                  {generatedPassword || '••••••••••••••••'}
                </span>
              </div>
              <div className="pwd-display-actions">
                <button
                  className={`pwd-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={() => copyToClipboard()}
                  title="Kopyala"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  {copied ? 'Kopyalandı' : 'Kopyala'}
                </button>
                <button
                  className={`pwd-regenerate-btn ${isGenerating ? 'spinning' : ''}`}
                  onClick={generate}
                  disabled={isGenerating}
                  title="Yeniden Oluştur"
                >
                  <RefreshCw size={18} />
                </button>
              </div>
            </div>

            {/* Strength Indicator */}
            <div className="pwd-strength-section">
              <div className="pwd-strength-bar-container">
                <div
                  className="pwd-strength-bar-fill"
                  style={{
                    width: `${strengthInfo.percent}%`,
                    background: strengthInfo.color
                  }}
                />
              </div>
              <div className="pwd-strength-label" style={{ color: strengthInfo.color }}>
                {strengthInfo.label}
              </div>
            </div>

            {/* Length Slider */}
            <div className="pwd-option-section">
              <div className="pwd-length-header">
                <span className="pwd-option-label">Uzunluk</span>
                <span className="pwd-length-value">{length}</span>
              </div>
              <div className="pwd-slider-container">
                <input
                  type="range"
                  min="8"
                  max="64"
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                  className="pwd-slider"
                  style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((length - 8) / 56) * 100}%, var(--bg-tertiary) ${((length - 8) / 56) * 100}%, var(--bg-tertiary) 100%)`
                  }}
                />
                <div className="pwd-slider-labels">
                  <span>8</span>
                  <span>64</span>
                </div>
              </div>
            </div>

            {/* Character Options */}
            <div className="pwd-options-grid">
              <label className={`pwd-toggle-option ${includeUppercase ? 'active' : ''}`}>
                <span className="pwd-toggle-text">ABC</span>
                <span className="pwd-toggle-label">Büyük Harf</span>
                <input
                  type="checkbox"
                  checked={includeUppercase}
                  onChange={(e) => setIncludeUppercase(e.target.checked)}
                />
                <span className="pwd-toggle-switch" />
              </label>

              <label className={`pwd-toggle-option ${includeLowercase ? 'active' : ''}`}>
                <span className="pwd-toggle-text">abc</span>
                <span className="pwd-toggle-label">Küçük Harf</span>
                <input
                  type="checkbox"
                  checked={includeLowercase}
                  onChange={(e) => setIncludeLowercase(e.target.checked)}
                />
                <span className="pwd-toggle-switch" />
              </label>

              <label className={`pwd-toggle-option ${includeNumbers ? 'active' : ''}`}>
                <span className="pwd-toggle-text">123</span>
                <span className="pwd-toggle-label">Sayılar</span>
                <input
                  type="checkbox"
                  checked={includeNumbers}
                  onChange={(e) => setIncludeNumbers(e.target.checked)}
                />
                <span className="pwd-toggle-switch" />
              </label>

              <label className={`pwd-toggle-option ${includeSymbols ? 'active' : ''}`}>
                <span className="pwd-toggle-text">#$%</span>
                <span className="pwd-toggle-label">Semboller</span>
                <input
                  type="checkbox"
                  checked={includeSymbols}
                  onChange={(e) => setIncludeSymbols(e.target.checked)}
                />
                <span className="pwd-toggle-switch" />
              </label>
            </div>
          </div>
        ) : (
          <div className="pwd-history-content">
            {history.length === 0 ? (
              <div className="pwd-history-empty">
                <Clock size={48} strokeWidth={1.5} />
                <p>Henüz şifre yok</p>
                <span>Oluşturduğunuz şifreler burada görünecek</span>
              </div>
            ) : (
              <>
                <div className="pwd-history-header">
                  <span>{history.length} şifre kayıtlı</span>
                  <button className="pwd-clear-btn" onClick={clearHistory}>
                    <Trash2 size={14} />
                    Temizle
                  </button>
                </div>
                <div className="pwd-history-list">
                  {history.map((item) => {
                    const itemStrength = getStrengthInfo(item.strength);
                    return (
                      <div key={item.id} className="pwd-history-item">
                        <div className="pwd-history-main">
                          <code className="pwd-history-password">{item.password}</code>
                          <div className="pwd-history-meta">
                            <span className="pwd-history-length">{item.length} karakter</span>
                            <span className="pwd-history-dot">•</span>
                            <span style={{ color: itemStrength.color }}>{itemStrength.label}</span>
                            <span className="pwd-history-dot">•</span>
                            <span className="pwd-history-date">{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                        <div className="pwd-history-actions">
                          <button
                            className={`pwd-history-btn ${copiedId === item.id ? 'copied' : ''}`}
                            onClick={() => copyToClipboard(item.password, item.id)}
                          >
                            {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                          <button
                            className="pwd-history-btn delete"
                            onClick={() => deleteFromHistory(item.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
