import { useMemo } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Shield, Key, CreditCard, FileText, MapPin, StickyNote, KeyRound,
  AlertTriangle, CheckCircle, TrendingUp, Download, Settings,
  Star, ArrowRight, Lock, Fingerprint, Globe, RefreshCw
} from 'lucide-react';
import type { PasswordEntry, UpdateInfo } from '../types';

interface PasswordSecurityData {
  atRisk: PasswordEntry[];
  weak: PasswordEntry[];
  total: number;
}

interface DashboardProps {
  entries: PasswordEntry[];
  favorites: Set<string>;
  passwordSecurity: PasswordSecurityData | null;
  onNavigateToCategory: (category: string) => void;
  onNavigateToPasswordCheck: () => void;
  onNavigateToSettings: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  updateInfo?: UpdateInfo;
}

export default function Dashboard({
  entries,
  favorites,
  passwordSecurity,
  onNavigateToCategory,
  onNavigateToPasswordCheck,
  onNavigateToSettings,
  updateInfo,
}: DashboardProps) {
  // Calculate statistics
  const stats = useMemo(() => {
    const categoryCounts = {
      accounts: 0,
      bank_cards: 0,
      documents: 0,
      addresses: 0,
      notes: 0,
      passkeys: 0,
    };

    for (const entry of entries) {
      if (entry.category in categoryCounts) {
        categoryCounts[entry.category as keyof typeof categoryCounts]++;
      }
    }

    return {
      total: entries.length,
      ...categoryCounts,
      favorites: Array.from(favorites).filter(id => entries.some(e => e.id === id)).length,
    };
  }, [entries, favorites]);


  // Security score calculation
  const securityScore = useMemo(() => {
    if (!passwordSecurity || entries.length === 0) return 100;

    const totalIssues =
      passwordSecurity.atRisk.length +
      passwordSecurity.weak.length;

    if (totalIssues === 0) return 100;

    const score = Math.max(0, 100 - (totalIssues * 10));
    return score;
  }, [passwordSecurity, entries.length]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Güçlü';
    if (score >= 60) return 'Orta';
    return 'Zayıf';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'accounts': return <Shield size={16} />;
      case 'bank_cards': return <CreditCard size={16} />;
      case 'documents': return <FileText size={16} />;
      case 'addresses': return <MapPin size={16} />;
      case 'notes': return <StickyNote size={16} />;
      case 'passkeys': return <KeyRound size={16} />;
      default: return <Key size={16} />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'accounts': return 'Hesaplar';
      case 'bank_cards': return 'Banka Kartları';
      case 'documents': return 'Belgeler';
      case 'addresses': return 'Adresler';
      case 'notes': return 'Notlar';
      case 'passkeys': return 'Geçiş Anahtarları';
      default: return category;
    }
  };

  const handleUpdate = async () => {
    if (updateInfo?.url) {
      try {
        await openUrl(updateInfo.url);
      } catch (error) {
        console.error('Failed to open update URL:', error);
      }
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Hoş Geldiniz</h1>
        <p className="dashboard-subtitle">Şifre kasanızın özeti</p>
      </div>

      {/* Update Alert */}
      {updateInfo?.available && (
        <div className="dashboard-alert update-alert" onClick={handleUpdate} style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.05))',
          borderColor: 'rgba(59, 130, 246, 0.3)',
          cursor: 'pointer',
          marginBottom: '1.5rem'
        }}>
          <div className="alert-icon" style={{
            background: 'rgba(59, 130, 246, 0.2)',
            color: '#3b82f6'
          }}>
            <RefreshCw size={24} className="spin-slow" />
          </div>
          <div className="alert-content">
            <h3 style={{ color: '#60a5fa' }}>Güncelleme Mevcut</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Yeni sürüm ({updateInfo.latestVersion}) indirilebilir durumda. Güncellemek için tıklayın.
            </p>
          </div>
          <div style={{
            padding: '0.5rem 1rem',
            background: '#3b82f6',
            color: 'white',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Download size={16} />
            İndir
          </div>
        </div>
      )}

      {/* Main Stats Row */}
      <div className="dashboard-stats-row">
        <div className="dashboard-stat-card primary">
          <div className="stat-icon">
            <Key size={28} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Toplam Kayıt</span>
          </div>
        </div>

        <div
          className="dashboard-stat-card clickable"
          onClick={onNavigateToPasswordCheck}
        >
          <div className="stat-icon" style={{ color: getScoreColor(securityScore) }}>
            {securityScore >= 80 ? <CheckCircle size={28} /> : <AlertTriangle size={28} />}
          </div>
          <div className="stat-content">
            <span className="stat-value" style={{ color: getScoreColor(securityScore) }}>
              {getScoreLabel(securityScore)}
            </span>
            <span className="stat-label">Güvenlik Durumu</span>
          </div>
          <ArrowRight size={18} className="stat-arrow" />
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon">
            <Star size={28} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.favorites}</span>
            <span className="stat-label">Favori</span>
          </div>
        </div>
      </div>

      {/* Security Alert (if issues exist) */}
      {passwordSecurity && (passwordSecurity.atRisk.length > 0 || passwordSecurity.weak.length > 0) && (
        <div className="dashboard-alert" onClick={onNavigateToPasswordCheck}>
          <div className="alert-icon">
            <AlertTriangle size={24} />
          </div>
          <div className="alert-content">
            <h3>Güvenlik Uyarısı</h3>
            <p>
              {passwordSecurity.atRisk.length > 0 && (
                <span>{passwordSecurity.atRisk.length} şifre risk altında. </span>
              )}
              {passwordSecurity.weak.length > 0 && (
                <span>{passwordSecurity.weak.length} zayıf şifre bulundu. </span>
              )}
              Kontrol etmek için tıklayın.
            </p>
          </div>
          <ArrowRight size={20} />
        </div>
      )}

      {/* Categories Overview */}
      <div className="dashboard-section">
        <h2 className="section-title">Kategoriler</h2>
        <div className="category-grid">
          {[
            { key: 'accounts', count: stats.accounts },
            { key: 'bank_cards', count: stats.bank_cards },
            { key: 'documents', count: stats.documents },
            { key: 'addresses', count: stats.addresses },
            { key: 'notes', count: stats.notes },
            { key: 'passkeys', count: stats.passkeys },
          ].map(cat => (
            <div
              key={cat.key}
              className="category-card"
              onClick={() => onNavigateToCategory(cat.key)}
            >
              <div className="category-icon">
                {getCategoryIcon(cat.key)}
              </div>
              <div className="category-info">
                <span className="category-name">{getCategoryLabel(cat.key)}</span>
                <span className="category-count">{cat.count} kayıt</span>
              </div>
              <ArrowRight size={16} className="category-arrow" />
            </div>
          ))}
        </div>
      </div>


      {/* Tips & Suggestions */}
      <div className="dashboard-section">
        <h2 className="section-title">
          <TrendingUp size={18} />
          Öneriler
        </h2>
        <div className="tips-grid">
          <div className="tip-card" onClick={() => openUrl('https://chromewebstore.google.com/detail/confpass-password-manager/hhaieidomjambbcgconfnefkpffjoeoa')}>
            <div className="tip-icon">
              <Globe size={24} />
            </div>
            <div className="tip-content">
              <h4>Tarayıcı Uzantısı</h4>
              <p>ConfPass tarayıcı uzantısını yükleyerek şifrelerinizi otomatik doldurun.</p>
            </div>
            <button className="tip-action">
              <Download size={16} />
              Yükle
            </button>
          </div>

          <div className="tip-card" onClick={onNavigateToSettings}>
            <div className="tip-icon">
              <Lock size={24} />
            </div>
            <div className="tip-content">
              <h4>Otomatik Kilitleme</h4>
              <p>Güvenliğiniz için otomatik kasa kilitleme süresini ayarlayın.</p>
            </div>
            <button className="tip-action">
              <Settings size={16} />
              Ayarla
            </button>
          </div>

          <div className="tip-card" onClick={onNavigateToSettings}>
            <div className="tip-icon">
              <Fingerprint size={24} />
            </div>
            <div className="tip-content">
              <h4>Biyometrik Giriş</h4>
              <p>Parmak izi veya yüz tanıma ile hızlı ve güvenli giriş yapın.</p>
            </div>
            <button className="tip-action">
              <Settings size={16} />
              Etkinleştir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
