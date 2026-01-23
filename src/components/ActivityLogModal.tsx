import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clock, Eye, Edit, Trash2, Copy, Lock, Unlock, Download, Upload } from 'lucide-react';

interface ActivityLogModalProps {
  onClose: () => void;
}

interface Activity {
  id: string;
  entry_id?: string;
  action: string;
  timestamp: number;
  details?: string;
}

const actionIcons: Record<string, any> = {
  create: <Edit size={16} />,
  update: <Edit size={16} />,
  delete: <Trash2 size={16} />,
  view: <Eye size={16} />,
  copy: <Copy size={16} />,
  export: <Download size={16} />,
  import: <Upload size={16} />,
  unlock: <Unlock size={16} />,
  lock: <Lock size={16} />,
};

const actionLabels: Record<string, string> = {
  create: 'Oluşturuldu',
  update: 'Güncellendi',
  delete: 'Silindi',
  view: 'Görüntülendi',
  copy: 'Kopyalandı',
  export: 'Dışa aktarıldı',
  import: 'İçe aktarıldı',
  unlock: 'Kasa açıldı',
  lock: 'Kasa kilitlendi',
};

export default function ActivityLogModal({ onClose }: ActivityLogModalProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const logs = await invoke<Activity[]>('get_activity_log', { limit: 100 });
      setActivities(logs);
    } catch (error) {
      console.error('Activity log load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh' }}>
        <h2>Etkinlik Geçmişi</h2>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Yükleniyor...
          </div>
        ) : activities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Henüz etkinlik kaydı yok
          </div>
        ) : (
          <div style={{ 
            overflowY: 'auto',
            maxHeight: '60vh',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
            <style>{`
              .activity-list::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div className="activity-list">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--accent)'
                  }}>
                    {actionIcons[activity.action] || <Clock size={16} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      color: 'var(--text-primary)',
                      marginBottom: '0.25rem'
                    }}>
                      {actionLabels[activity.action] || activity.action}
                    </div>
                    {activity.details && (
                      <div style={{ 
                        fontSize: '0.85rem', 
                        color: 'var(--text-secondary)',
                        marginBottom: '0.25rem'
                      }}>
                        {activity.details}
                      </div>
                    )}
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: 'var(--text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <Clock size={12} />
                      {formatDate(activity.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
          <button onClick={onClose} className="cancel-button">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
