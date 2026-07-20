import React, { useState, useEffect } from 'react';
import './History.css';
import './Scheduled.css';
import { CalendarIcon, XIcon } from './icons';

const STATUS_LABEL = {
  scheduled: { label: 'Programado', cls: 'badge-pending' },
  published: { label: 'Publicado', cls: 'badge-published' },
  published_demo: { label: 'Aprobado (demo)', cls: 'badge-demo' },
  error: { label: 'Error al publicar', cls: 'badge-rejected' },
};

export default function Scheduled() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  function load() {
    fetch('/api/scheduled')
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // Refresca sola cada minuto para reflejar publicaciones que van pasando
    // de "Programado" a "Publicado" sin que haya que recargar la página.
    const interval = setInterval(load, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  function formatDate(iso) {
    return new Date(iso).toLocaleString('es-ES', {
      weekday: 'long', day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  if (loading) return <div className="history-loading">Cargando programados...</div>;

  if (items.length === 0) return (
    <div className="history-empty">
      <span><CalendarIcon /></span>
      <p>Sin posts programados</p>
      <p className="history-empty-sub">Genera una "Semana completa" y usa "Programar semana" para verlos aquí</p>
    </div>
  );

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Programados</h1>
        <p>{items.length} posts en cola</p>
      </div>

      <div className="history-grid">
        <div className="history-list">
          {items.map(item => {
            const s = STATUS_LABEL[item.status] || { label: item.status, cls: 'badge-pending' };
            return (
              <div
                key={item.id}
                className={`history-item card ${selected?.id === item.id ? 'selected' : ''}`}
                onClick={() => setSelected(item)}
              >
                <img src={item.image} alt="" className="history-thumb" />
                <div className="history-item-info">
                  <span className={`badge ${s.cls}`}>{s.label}</span>
                  <p className="scheduled-when">{item.day} · {formatDate(item.scheduledFor)}</p>
                  <p className="history-caption-preview">
                    {item.caption.slice(0, 80)}{item.caption.length > 80 ? '...' : ''}
                  </p>
                  {item.status === 'error' && item.error && (
                    <p className="scheduled-error-msg">{item.error}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selected && (
          <div className="history-detail card">
            <button className="detail-close" onClick={() => setSelected(null)}><XIcon /></button>
            <img src={selected.image} alt="" className="detail-image" />
            <div className="detail-meta">
              <span className={`badge ${(STATUS_LABEL[selected.status] || {}).cls}`}>
                {(STATUS_LABEL[selected.status] || {}).label}
              </span>
              <span className="detail-date">{selected.day} · {formatDate(selected.scheduledFor)}</span>
            </div>
            <div className="detail-caption">
              <div className="detail-caption-label">Caption</div>
              <pre className="detail-caption-text">{selected.caption}</pre>
            </div>
            {selected.status === 'error' && selected.error && (
              <div className="detail-caption">
                <div className="detail-caption-label">Error</div>
                <pre className="detail-caption-text scheduled-error-msg">{selected.error}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
