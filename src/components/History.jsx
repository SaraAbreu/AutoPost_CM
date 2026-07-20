import React, { useState, useEffect } from 'react';
import './History.css';
import { InboxIcon, XIcon } from './icons';

const STATUS_LABEL = {
  pending: { label: 'Pendiente', cls: 'badge-pending' },
  published: { label: 'Publicado', cls: 'badge-published' },
  published_demo: { label: 'Aprobado (demo)', cls: 'badge-demo' },
  rejected: { label: 'Rechazado', cls: 'badge-rejected' },
  publishing: { label: 'Publicando...', cls: 'badge-pending' },
  error: { label: 'Error', cls: 'badge-rejected' },
};

export default function History() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function formatDate(iso) {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  if (loading) return <div className="history-loading">Cargando historial...</div>;

  if (items.length === 0) return (
    <div className="history-empty">
      <span><InboxIcon /></span>
      <p>Sin publicaciones aún</p>
      <p className="history-empty-sub">Las publicaciones generadas aparecerán aquí</p>
    </div>
  );

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Historial</h1>
        <p>{items.length} publicaciones</p>
      </div>

      <div className="history-grid">
        {/* Lista */}
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
                  <p className="history-date">{formatDate(item.date)}</p>
                  <p className="history-caption-preview">
                    {item.caption.slice(0, 80)}{item.caption.length > 80 ? '...' : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detalle */}
        {selected && (
          <div className="history-detail card">
            <button className="detail-close" onClick={() => setSelected(null)}><XIcon /></button>
            <img src={selected.image} alt="" className="detail-image" />
            <div className="detail-meta">
              <span className={`badge ${(STATUS_LABEL[selected.status] || {}).cls}`}>
                {(STATUS_LABEL[selected.status] || {}).label}
              </span>
              <span className="detail-date">{formatDate(selected.date)}</span>
            </div>
            <div className="detail-caption">
              <div className="detail-caption-label">Caption</div>
              <pre className="detail-caption-text">{selected.caption}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
