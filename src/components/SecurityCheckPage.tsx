import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  RefreshCw,
  Globe,
  Copy,
  Key,
  Clock,
  Info,
  Loader2
} from 'lucide-react';
import type { PasswordEntry, PasswordStrengthResult } from '../types';

interface SecurityCheckPageProps {
  entries: PasswordEntry[];
  onBack: () => void;
  onEdit: (entry: PasswordEntry) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface BreachResult {
  breached: boolean;
  count: number;
}

interface EmailBreachResult {
  breached: boolean;
  breaches: string[];
  count: number;
}

interface SecurityAnalysis {
  entry: PasswordEntry;
  strength: PasswordStrengthResult;
  passwordBreached: boolean;
  passwordBreachCount: number;
  emailBreached: boolean;
  emailBreaches: string[];
  isReused: boolean;
  reusedWith: string[];
  ageInDays: number;
  issues: string[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'safe';
}

type TabType = 'overview' | 'breached' | 'weak' | 'reused' | 'old';

export default function SecurityCheckPage({
  entries,
  onBack,
  onEdit,
  showToast
}: SecurityCheckPageProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [analyses, setAnalyses] = useState<SecurityAnalysis[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  // Filter only account entries
  const accountEntries = entries.filter(e => e.category === 'accounts');

  // Calculate statistics
  const stats = {
    total: accountEntries.length,
    breached: analyses.filter(a => a.passwordBreached || a.emailBreached).length,
    passwordBreached: analyses.filter(a => a.passwordBreached).length,
    emailBreached: analyses.filter(a => a.emailBreached).length,
    weak: analyses.filter(a => a.strength.score <= 3).length,
    reused: analyses.filter(a => a.isReused).length,
    old: analyses.filter(a => a.ageInDays > 365).length,
    safe: analyses.filter(a => a.riskLevel === 'safe').length,
  };

  // Calculate overall security score (0-100)
  const calculateSecurityScore = useCallback(() => {
    if (analyses.length === 0) return 0;

    let score = 100;
    const totalEntries = analyses.length;

    // Deduct for breached passwords (most critical: -30 points max)
    const breachedRatio = stats.breached / totalEntries;
    score -= breachedRatio * 30;

    // Deduct for weak passwords (-25 points max)
    const weakRatio = stats.weak / totalEntries;
    score -= weakRatio * 25;

    // Deduct for reused passwords (-25 points max)
    const reusedRatio = stats.reused / totalEntries;
    score -= reusedRatio * 25;

    // Deduct for old passwords (-20 points max)
    const oldRatio = stats.old / totalEntries;
    score -= oldRatio * 20;

    return Math.max(0, Math.round(score));
  }, [analyses, stats]);

  const securityScore = calculateSecurityScore();

  // Find reused passwords
  const findReusedPasswords = (entryList: PasswordEntry[]): Map<string, string[]> => {
    const passwordMap = new Map<string, string[]>();

    entryList.forEach(entry => {
      const existing = passwordMap.get(entry.password) || [];
      existing.push(entry.title);
      passwordMap.set(entry.password, existing);
    });

    return passwordMap;
  };

  // Calculate password age in days
  const getPasswordAge = (entry: PasswordEntry): number => {
    const updatedAt = entry.updated_at || entry.created_at;
    // Timestamps are stored in seconds, convert to milliseconds
    const updatedAtMs = updatedAt * 1000;
    const now = Date.now();
    const diffMs = now - updatedAtMs;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  // Determine risk level
  const determineRiskLevel = (
    passwordBreached: boolean,
    emailBreached: boolean,
    strengthScore: number,
    isReused: boolean,
    ageInDays: number
  ): 'critical' | 'high' | 'medium' | 'low' | 'safe' => {
    if (passwordBreached || emailBreached) return 'critical';
    if (strengthScore <= 2) return 'high';
    if (isReused || strengthScore <= 3) return 'medium';
    if (ageInDays > 365) return 'low';
    return 'safe';
  };

  // Check if username looks like an email
  const isEmail = (str: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  };

  // Run security scan
  const runSecurityScan = async () => {
    if (accountEntries.length === 0) {
      showToast('Taranacak hesap bulunamadı', 'info');
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    setAnalyses([]);

    const reusedMap = findReusedPasswords(accountEntries);
    const results: SecurityAnalysis[] = [];
    const totalSteps = accountEntries.length * 3; // strength + password breach + email breach

    for (let i = 0; i < accountEntries.length; i++) {
      const entry = accountEntries[i];
      setScanStatus(`Analiz ediliyor: ${entry.title}`);

      // Check password strength
      let strength: PasswordStrengthResult = { score: 0, strength: 'zayıf' };
      try {
        strength = await invoke<PasswordStrengthResult>('check_password_strength', {
          password: entry.password
        });
      } catch (err) {
        console.error('Strength check error:', err);
      }
      setScanProgress(((i * 3 + 1) / totalSteps) * 100);

      // Check for password breaches (HIBP)
      setScanStatus(`Parola taranıyor: ${entry.title}`);
      let passwordBreached = false;
      let passwordBreachCount = 0;
      try {
        const breachResult = await invoke<BreachResult>('check_password_breach', {
          password: entry.password
        });
        console.log(`Password breach check for ${entry.title}:`, breachResult);
        passwordBreached = breachResult?.breached ?? false;
        passwordBreachCount = breachResult?.count ?? 0;
      } catch (err) {
        console.error('Password breach check error for', entry.title, ':', err);
      }
      setScanProgress(((i * 3 + 2) / totalSteps) * 100);

      // Check for email breaches (XposedOrNot) - only if username is email
      setScanStatus(`Email taranıyor: ${entry.title}`);
      let emailBreached = false;
      let emailBreaches: string[] = [];
      if (isEmail(entry.username)) {
        try {
          const emailResult = await invoke<EmailBreachResult>('check_email_breach', {
            email: entry.username
          });
          console.log(`Email breach check for ${entry.username}:`, emailResult);
          emailBreached = emailResult?.breached ?? false;
          emailBreaches = emailResult?.breaches ?? [];
        } catch (err) {
          console.error('Email breach check error for', entry.username, ':', err);
        }
      }
      setScanProgress(((i * 3 + 3) / totalSteps) * 100);

      // Check for reuse
      const reusedWith = (reusedMap.get(entry.password) || []).filter(t => t !== entry.title);
      const isReused = reusedWith.length > 0;

      // Calculate age
      const ageInDays = getPasswordAge(entry);

      // Collect issues
      const issues: string[] = [];
      if (passwordBreached) issues.push(`Parola ${passwordBreachCount.toLocaleString()} veri ihlalinde tespit edildi`);
      if (emailBreached) issues.push(`Email ${emailBreaches.length} veri ihlalinde bulundu: ${emailBreaches.slice(0, 3).join(', ')}${emailBreaches.length > 3 ? '...' : ''}`);
      if (strength.score <= 2) issues.push('Parola çok zayıf');
      else if (strength.score <= 3) issues.push('Parola güçlendirilebilir');
      if (isReused) issues.push(`${reusedWith.length} başka hesapla aynı parola`);
      if (ageInDays > 365) issues.push(`${Math.floor(ageInDays / 30)} aydır değiştirilmemiş`);

      // Determine risk level
      const riskLevel = determineRiskLevel(passwordBreached, emailBreached, strength.score, isReused, ageInDays);

      results.push({
        entry,
        strength,
        passwordBreached,
        passwordBreachCount,
        emailBreached,
        emailBreaches,
        isReused,
        reusedWith,
        ageInDays,
        issues,
        riskLevel
      });
    }

    // Sort by risk level
    const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, safe: 4 };
    results.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

    setAnalyses(results);
    setIsScanning(false);
    setScanProgress(100);
    setScanStatus('');
    setLastScanTime(new Date());
    showToast('Güvenlik taraması tamamlandı', 'success');
  };

  // Toggle entry expansion
  const toggleExpand = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Get filtered analyses based on active tab
  const getFilteredAnalyses = (): SecurityAnalysis[] => {
    switch (activeTab) {
      case 'breached':
        return analyses.filter(a => a.passwordBreached || a.emailBreached);
      case 'weak':
        return analyses.filter(a => a.strength.score <= 3);
      case 'reused':
        return analyses.filter(a => a.isReused);
      case 'old':
        return analyses.filter(a => a.ageInDays > 365);
      default:
        return analyses;
    }
  };

  // Get score color
  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  // Get risk badge
  const getRiskBadge = (level: string) => {
    const config = {
      critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', text: 'Kritik' },
      high: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', text: 'Yüksek' },
      medium: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', text: 'Orta' },
      low: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', text: 'Düşük' },
      safe: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', text: 'Güvenli' }
    };
    const c = config[level as keyof typeof config] || config.safe;
    return (
      <span className="risk-badge" style={{ color: c.color, background: c.bg }}>
        {c.text}
      </span>
    );
  };

  return (
    <div className="security-check-page">
      {/* Header */}
      <div className="security-header">
        <div className="header-left">
          <button onClick={onBack} className="back-btn">
            <ChevronLeft size={20} />
          </button>
          <div className="header-title">
            <Shield size={28} />
            <div>
              <h1>Güvenlik Merkezi</h1>
              <p>Parolalarınızın güvenlik durumunu kontrol edin</p>
            </div>
          </div>
        </div>
        <button
          className="scan-btn"
          onClick={runSecurityScan}
          disabled={isScanning}
        >
          {isScanning ? (
            <>
              <Loader2 size={18} className="spin" />
              Taranıyor...
            </>
          ) : (
            <>
              <RefreshCw size={18} />
              {analyses.length > 0 ? 'Yeniden Tara' : 'Taramayı Başlat'}
            </>
          )}
        </button>
      </div>

      {/* Scanning Progress */}
      {isScanning && (
        <div className="scan-progress-container">
          <div className="scan-progress-bar">
            <div
              className="scan-progress-fill"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
          <div className="scan-status">
            <Loader2 size={16} className="spin" />
            <span>{scanStatus}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="security-content">
        {analyses.length === 0 && !isScanning ? (
          /* Initial State */
          <div className="security-intro">
            <div className="intro-icon">
              <ShieldCheck size={80} />
            </div>
            <h2>Parolalarınızı Analiz Edin</h2>
            <p>
              Kapsamlı güvenlik taraması ile parolalarınızın ne kadar güvenli
              olduğunu öğrenin. Tarama şunları kontrol eder:
            </p>
            <div className="intro-features">
              <div className="feature-item">
                <Globe size={24} />
                <div>
                  <h4>Dark Web Taraması</h4>
                  <p>Parolalarınızın veri ihlallerinde sızdırılıp sızdırılmadığını kontrol eder</p>
                </div>
              </div>
              <div className="feature-item">
                <Key size={24} />
                <div>
                  <h4>Güç Analizi</h4>
                  <p>Parolalarınızın kaba kuvvet saldırılarına karşı dayanıklılığını ölçer</p>
                </div>
              </div>
              <div className="feature-item">
                <Copy size={24} />
                <div>
                  <h4>Tekrar Kullanım</h4>
                  <p>Birden fazla hesapta kullanılan parolaları tespit eder</p>
                </div>
              </div>
              <div className="feature-item">
                <Clock size={24} />
                <div>
                  <h4>Yaş Kontrolü</h4>
                  <p>Uzun süredir değiştirilmemiş parolaları belirler</p>
                </div>
              </div>
            </div>
            <div className="intro-note">
              <Info size={16} />
              <span>
                Parolalarınız asla sunucularımıza gönderilmez. Tüm kontroller
                güvenli k-anonymity protokolü ile yapılır.
              </span>
            </div>
            <button className="start-scan-btn" onClick={runSecurityScan}>
              <Shield size={20} />
              Güvenlik Taramasını Başlat
            </button>
          </div>
        ) : analyses.length > 0 ? (
          /* Results */
          <>
            {/* Score Card */}
            <div className="score-section">
              <div className="score-card">
                <div className="score-circle" style={{ borderColor: getScoreColor(securityScore) }}>
                  <span className="score-value" style={{ color: getScoreColor(securityScore) }}>
                    {securityScore}
                  </span>
                  <span className="score-label">puan</span>
                </div>
                <div className="score-info">
                  <h3>
                    {securityScore >= 80 ? 'Güvenlik Durumunuz İyi' :
                     securityScore >= 60 ? 'İyileştirme Gerekiyor' :
                     securityScore >= 40 ? 'Dikkat Gerekiyor' :
                     'Acil Müdahale Gerekli'}
                  </h3>
                  <p>
                    {stats.total} hesap analiz edildi.
                    {stats.breached > 0 && ` ${stats.breached} parola veri ihlalinde bulundu.`}
                    {stats.weak > 0 && ` ${stats.weak} zayıf parola var.`}
                    {stats.reused > 0 && ` ${stats.reused} tekrar kullanılmış parola var.`}
                  </p>
                  {lastScanTime && (
                    <span className="last-scan">
                      Son tarama: {lastScanTime.toLocaleTimeString('tr-TR')}
                    </span>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="stats-grid">
                <div
                  className={`stat-card ${activeTab === 'breached' ? 'active' : ''} ${stats.breached > 0 ? 'danger' : ''}`}
                  onClick={() => setActiveTab('breached')}
                >
                  <ShieldX size={24} />
                  <div className="stat-value">{stats.breached}</div>
                  <div className="stat-label">Sızdırılmış</div>
                </div>
                <div
                  className={`stat-card ${activeTab === 'weak' ? 'active' : ''} ${stats.weak > 0 ? 'warning' : ''}`}
                  onClick={() => setActiveTab('weak')}
                >
                  <AlertTriangle size={24} />
                  <div className="stat-value">{stats.weak}</div>
                  <div className="stat-label">Zayıf</div>
                </div>
                <div
                  className={`stat-card ${activeTab === 'reused' ? 'active' : ''} ${stats.reused > 0 ? 'warning' : ''}`}
                  onClick={() => setActiveTab('reused')}
                >
                  <Copy size={24} />
                  <div className="stat-value">{stats.reused}</div>
                  <div className="stat-label">Tekrarlanan</div>
                </div>
                <div
                  className={`stat-card ${activeTab === 'old' ? 'active' : ''} ${stats.old > 0 ? 'info' : ''}`}
                  onClick={() => setActiveTab('old')}
                >
                  <Clock size={24} />
                  <div className="stat-value">{stats.old}</div>
                  <div className="stat-label">Eski</div>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="tab-nav">
              <button
                className={activeTab === 'overview' ? 'active' : ''}
                onClick={() => setActiveTab('overview')}
              >
                Tümü ({analyses.length})
              </button>
              <button
                className={activeTab === 'breached' ? 'active' : ''}
                onClick={() => setActiveTab('breached')}
              >
                <ShieldX size={16} />
                Sızdırılmış ({stats.breached})
              </button>
              <button
                className={activeTab === 'weak' ? 'active' : ''}
                onClick={() => setActiveTab('weak')}
              >
                <AlertTriangle size={16} />
                Zayıf ({stats.weak})
              </button>
              <button
                className={activeTab === 'reused' ? 'active' : ''}
                onClick={() => setActiveTab('reused')}
              >
                <Copy size={16} />
                Tekrarlanan ({stats.reused})
              </button>
              <button
                className={activeTab === 'old' ? 'active' : ''}
                onClick={() => setActiveTab('old')}
              >
                <Clock size={16} />
                Eski ({stats.old})
              </button>
            </div>

            {/* Results List */}
            <div className="results-list">
              {getFilteredAnalyses().length === 0 ? (
                <div className="empty-results">
                  <CheckCircle size={48} />
                  <h4>Bu kategoride sorun yok</h4>
                  <p>Tüm parolalarınız bu kritere göre güvenli görünüyor.</p>
                </div>
              ) : (
                getFilteredAnalyses().map((analysis) => (
                  <div
                    key={analysis.entry.id}
                    className={`result-card ${analysis.riskLevel}`}
                  >
                    <div
                      className="result-header"
                      onClick={() => toggleExpand(analysis.entry.id)}
                    >
                      <div className="result-icon">
                        {analysis.riskLevel === 'critical' ? <ShieldX size={24} /> :
                         analysis.riskLevel === 'high' ? <ShieldAlert size={24} /> :
                         analysis.riskLevel === 'medium' ? <AlertCircle size={24} /> :
                         analysis.riskLevel === 'low' ? <AlertTriangle size={24} /> :
                         <ShieldCheck size={24} />}
                      </div>
                      <div className="result-info">
                        <h4>{analysis.entry.title}</h4>
                        <p>{analysis.entry.username}</p>
                      </div>
                      <div className="result-meta">
                        {getRiskBadge(analysis.riskLevel)}
                        <button
                          className="edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(analysis.entry);
                          }}
                        >
                          Düzenle
                        </button>
                      </div>
                    </div>

                    {expandedEntries.has(analysis.entry.id) && (
                      <div className="result-details">
                        {/* Issues */}
                        {analysis.issues.length > 0 && (
                          <div className="issues-list">
                            {analysis.issues.map((issue, idx) => (
                              <div key={idx} className="issue-item">
                                <AlertCircle size={14} />
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Details Grid */}
                        <div className="details-grid">
                          <div className="detail-item">
                            <span className="detail-label">Parola Gücü</span>
                            <span className={`detail-value ${
                              Number(analysis.strength.score) <= 2 ? 'danger' :
                              Number(analysis.strength.score) <= 4 ? 'warning' : 'safe'
                            }`}>
                              {Number(analysis.strength.score) <= 2 ? <ShieldX size={14} /> :
                               Number(analysis.strength.score) <= 4 ? <AlertTriangle size={14} /> :
                               <ShieldCheck size={14} />}
                              {analysis.strength.strength} ({analysis.strength.score}/6)
                            </span>
                          </div>

                          <div className="detail-item">
                            <span className="detail-label">Parola İhlali</span>
                            <span className={`detail-value ${analysis.passwordBreached ? 'danger' : 'safe'}`}>
                              {analysis.passwordBreached ? (
                                <>
                                  <ShieldX size={14} />
                                  {analysis.passwordBreachCount.toLocaleString()} kez sızdırılmış
                                </>
                              ) : (
                                <>
                                  <ShieldCheck size={14} />
                                  Sızdırılmamış
                                </>
                              )}
                            </span>
                          </div>

                          <div className="detail-item">
                            <span className="detail-label">Email İhlali</span>
                            <span className={`detail-value ${analysis.emailBreached ? 'danger' : 'safe'}`}>
                              {analysis.emailBreached ? (
                                <>
                                  <ShieldX size={14} />
                                  {analysis.emailBreaches.length} ihlalde bulundu
                                </>
                              ) : (
                                <>
                                  <ShieldCheck size={14} />
                                  Sızdırılmamış
                                </>
                              )}
                            </span>
                          </div>

                          <div className="detail-item">
                            <span className="detail-label">Tekrar Kullanım</span>
                            <span className={`detail-value ${analysis.isReused ? 'warning' : 'safe'}`}>
                              {analysis.isReused ? (
                                <>
                                  <Copy size={14} />
                                  {analysis.reusedWith.join(', ')} ile aynı
                                </>
                              ) : (
                                <>
                                  <CheckCircle size={14} />
                                  Benzersiz
                                </>
                              )}
                            </span>
                          </div>

                          <div className="detail-item">
                            <span className="detail-label">Parola Yaşı</span>
                            <span className={`detail-value ${analysis.ageInDays > 365 ? 'warning' : 'safe'}`}>
                              <Clock size={14} />
                              {analysis.ageInDays < 30 ? 'Bu ay' :
                               analysis.ageInDays < 365 ? `${Math.floor(analysis.ageInDays / 30)} ay önce` :
                               `${Math.floor(analysis.ageInDays / 365)} yıl önce`} güncellendi
                            </span>
                          </div>
                        </div>

                        {/* Recommendations */}
                        {analysis.riskLevel !== 'safe' && (
                          <div className="recommendations">
                            <h5>Öneriler</h5>
                            <ul>
                              {analysis.passwordBreached && (
                                <li>Bu parolayı derhal değiştirin - veri ihlalinde tespit edildi</li>
                              )}
                              {analysis.emailBreached && (
                                <li>Email adresiniz sızdırılmış ({analysis.emailBreaches.slice(0, 3).join(', ')}). Bu hesabın parolasını değiştirin ve 2FA etkinleştirin.</li>
                              )}
                              {analysis.strength.score <= 3 && (
                                <li>En az 12 karakter, büyük/küçük harf, rakam ve sembol içeren güçlü bir parola kullanın</li>
                              )}
                              {analysis.isReused && (
                                <li>Her hesap için benzersiz bir parola kullanın</li>
                              )}
                              {analysis.ageInDays > 365 && (
                                <li>Parolanızı düzenli olarak (en az yılda bir) değiştirin</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>

      <style>{`
        .security-check-page {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary);
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .security-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: none;
          background: var(--bg-tertiary);
          border-radius: 12px;
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .back-btn:hover {
          background: var(--accent);
          color: var(--bg-primary);
          transform: translateX(-2px);
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-title svg {
          color: var(--accent);
          filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.4));
        }

        .header-title h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0;
          color: var(--text-primary);
        }

        .header-title p {
          font-size: 0.85rem;
          margin: 0;
          color: var(--text-secondary);
        }

        .scan-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.875rem 1.75rem;
          background: linear-gradient(135deg, var(--accent), #d97706);
          border: none;
          border-radius: 12px;
          color: var(--bg-primary);
          font-family: 'Sora', sans-serif;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scan-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(245, 158, 11, 0.4);
        }

        .scan-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .scan-progress-container {
          padding: 1rem 2rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
        }

        .scan-progress-bar {
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: 3px;
          overflow: hidden;
        }

        .scan-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent), #10b981);
          transition: width 0.3s;
        }

        .scan-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .security-content {
          flex: 1;
          overflow-y: auto;
          padding: 2rem;
        }

        /* Intro Section */
        .security-intro {
          max-width: 700px;
          margin: 0 auto;
          text-align: center;
          padding: 2rem;
        }

        .intro-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 140px;
          height: 140px;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(16, 185, 129, 0.1));
          border-radius: 50%;
          margin-bottom: 1.5rem;
          color: var(--accent);
          box-shadow: 0 0 40px rgba(245, 158, 11, 0.2);
        }

        .security-intro h2 {
          font-family: 'Sora', sans-serif;
          font-size: 1.75rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .security-intro > p {
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 2rem;
        }

        .intro-features {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
          text-align: left;
          margin-bottom: 2rem;
        }

        .feature-item {
          display: flex;
          gap: 1rem;
          padding: 1.25rem;
          background: var(--bg-secondary);
          border-radius: 16px;
          border: 1px solid var(--border);
          transition: all 0.3s ease;
        }

        .feature-item:hover {
          border-color: var(--accent-muted);
          transform: translateY(-2px);
        }

        .feature-item svg {
          color: var(--accent);
          flex-shrink: 0;
        }

        .feature-item h4 {
          margin: 0 0 0.25rem 0;
          font-family: 'Sora', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .feature-item p {
          margin: 0;
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .intro-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          background: rgba(245, 158, 11, 0.08);
          border-radius: 12px;
          border: 1px solid rgba(245, 158, 11, 0.2);
          margin-bottom: 2rem;
          font-size: 0.85rem;
          color: var(--accent);
        }

        .start-scan-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 2.5rem;
          background: linear-gradient(135deg, var(--accent), #d97706);
          border: none;
          border-radius: 14px;
          color: var(--bg-primary);
          font-family: 'Sora', sans-serif;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .start-scan-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(245, 158, 11, 0.4);
        }

        /* Score Section */
        .score-section {
          margin-bottom: 2rem;
        }

        .score-card {
          display: flex;
          align-items: center;
          gap: 2rem;
          padding: 2rem;
          background: var(--bg-secondary);
          border-radius: 20px;
          border: 1px solid var(--border);
          margin-bottom: 1.5rem;
        }

        .score-circle {
          width: 120px;
          height: 120px;
          border: 6px solid;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: var(--bg-tertiary);
        }

        .score-value {
          font-family: 'Sora', sans-serif;
          font-size: 2.5rem;
          font-weight: 700;
        }

        .score-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .score-info h3 {
          margin: 0 0 0.5rem 0;
          font-family: 'Sora', sans-serif;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .score-info p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .last-scan {
          display: inline-block;
          margin-top: 0.5rem;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.25rem;
          background: var(--bg-secondary);
          border-radius: 16px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .stat-card:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
        }

        .stat-card.active {
          border-color: var(--accent);
          background: rgba(245, 158, 11, 0.08);
        }

        .stat-card.danger svg { color: #ef4444; }
        .stat-card.warning svg { color: #f59e0b; }
        .stat-card.info svg { color: #3b82f6; }
        .stat-card svg { color: var(--text-secondary); }

        .stat-value {
          font-family: 'Sora', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0.5rem 0;
        }

        .stat-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        /* Tab Navigation */
        .tab-nav {
          display: flex;
          gap: 0.5rem;
          padding: 0.5rem;
          background: var(--bg-secondary);
          border-radius: 14px;
          margin-bottom: 1.5rem;
          overflow-x: auto;
        }

        .tab-nav button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: transparent;
          border: none;
          border-radius: 10px;
          color: var(--text-secondary);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.9rem;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.3s ease;
        }

        .tab-nav button:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .tab-nav button.active {
          background: var(--accent);
          color: var(--bg-primary);
          font-weight: 600;
        }

        /* Results List */
        .results-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .empty-results {
          text-align: center;
          padding: 3rem;
          color: var(--text-secondary);
        }

        .empty-results svg {
          color: #10b981;
          margin-bottom: 1rem;
        }

        .empty-results h4 {
          margin: 0 0 0.5rem 0;
          font-family: 'Sora', sans-serif;
          color: var(--text-primary);
        }

        .result-card {
          background: var(--bg-secondary);
          border-radius: 16px;
          border: 1px solid var(--border);
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .result-card:hover {
          border-color: var(--accent-muted);
        }

        .result-card.critical { border-left: 4px solid #ef4444; }
        .result-card.high { border-left: 4px solid #f97316; }
        .result-card.medium { border-left: 4px solid #f59e0b; }
        .result-card.low { border-left: 4px solid #3b82f6; }
        .result-card.safe { border-left: 4px solid #10b981; }

        .result-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          cursor: pointer;
        }

        .result-header:hover {
          background: var(--bg-tertiary);
        }

        .result-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          flex-shrink: 0;
        }

        .result-card.critical .result-icon { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .result-card.high .result-icon { background: rgba(249, 115, 22, 0.15); color: #f97316; }
        .result-card.medium .result-icon { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .result-card.low .result-icon { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .result-card.safe .result-icon { background: rgba(16, 185, 129, 0.15); color: #10b981; }

        .result-info {
          flex: 1;
          min-width: 0;
        }

        .result-info h4 {
          margin: 0;
          font-family: 'Sora', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-info p {
          margin: 0.25rem 0 0 0;
          font-size: 0.85rem;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .risk-badge {
          padding: 0.4rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .edit-btn {
          padding: 0.6rem 1.25rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-primary);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .edit-btn:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--bg-primary);
        }

        .result-details {
          padding: 1.25rem;
          border-top: 1px solid var(--border);
          background: var(--bg-tertiary);
        }

        .issues-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .issue-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.4rem 0.85rem;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 8px;
          font-size: 0.8rem;
          color: #ef4444;
        }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .detail-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-value {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .detail-value.danger { color: #ef4444; }
        .detail-value.warning { color: #f59e0b; }
        .detail-value.safe { color: #10b981; }

        .recommendations {
          padding: 1.25rem;
          background: rgba(245, 158, 11, 0.06);
          border-radius: 14px;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .recommendations h5 {
          margin: 0 0 0.75rem 0;
          font-family: 'Sora', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--accent);
        }

        .recommendations ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .recommendations li {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        @media (max-width: 768px) {
          .security-header {
            flex-direction: column;
            gap: 1rem;
            padding: 1rem;
          }

          .header-left {
            width: 100%;
          }

          .scan-btn {
            width: 100%;
            justify-content: center;
          }

          .security-content {
            padding: 1rem;
          }

          .intro-features {
            grid-template-columns: 1fr;
          }

          .score-card {
            flex-direction: column;
            text-align: center;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .details-grid {
            grid-template-columns: 1fr;
          }

          .tab-nav {
            padding: 0.25rem;
          }

          .tab-nav button {
            padding: 0.5rem 0.75rem;
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
}
