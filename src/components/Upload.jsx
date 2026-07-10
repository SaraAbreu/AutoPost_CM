import React, { useState, useRef } from 'react';
import './Upload.css';

export default function Upload({ onGenerated, onWeekGenerated }) {
  const [files, setFiles] = useState([]); // [{ file, preview, type, frame }]
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('single');
  const inputRef = useRef();

  // Extrae un fotograma de un vídeo como blob
  function extractVideoFrame(file) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.src = url;
      video.muted = true;
      video.currentTime = 1;
      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration / 4);
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => resolve(new File([blob], 'frame.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9);
      };
      video.load();
    });
  }

  async function compressImage(f, maxPx = 1200, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => resolve(new File([blob], f.name, { type: 'image/jpeg' })), 'image/jpeg', quality);
      };
      img.src = url;
    });
  }

  async function processFiles(rawFiles) {
    setError('');
    const valid = Array.from(rawFiles).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (!valid.length) { setError('Solo se aceptan imágenes y vídeos'); return; }

    const processed = await Promise.all(valid.map(async (f) => {
      const isVideo = f.type.startsWith('video/');
      const preview = URL.createObjectURL(f);
      const frame = isVideo ? await extractVideoFrame(f) : null;
      return { file: f, preview, type: isVideo ? 'video' : 'image', frame };
    }));

    setFiles(prev => {
      const next = [...prev, ...processed];
      setSelected(prev.length); // selecciona el primero nuevo
      return next;
    });
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  }

  function removeFile(i) {
    setFiles(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      setSelected(s => Math.min(s, Math.max(0, next.length - 1)));
      return next;
    });
  }

  async function generate() {
    if (!files.length) return;
    setLoading(true);
    setError('');
    try {
      const item = files[selected];
      const raw = item.type === 'video' ? item.frame : item.file;
      const compressed = await compressImage(raw);
      const form = new FormData();
      form.append('image', compressed);
      const previewUrl = item.type === 'video' ? URL.createObjectURL(item.frame) : item.preview;

      if (mode === 'week') {
        const res = await fetch('/api/generate-week', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error generando semana');
        onWeekGenerated({ ...data, previewUrl });
      } else {
        const res = await fetch('/api/generate', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error generando caption');
        onGenerated({ ...data, caption: data.captions?.[0] ?? data.caption, image: previewUrl });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const activeItem = files[selected];

  return (
    <div className="upload-page">
      <div className="upload-header">
        <h1>Nueva publicación</h1>
        <p>Sube imágenes o vídeos y la IA generará el contenido para Instagram</p>
      </div>

      {/* Toggle modo */}
      <div className="mode-toggle">
        <button className={`mode-btn ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
          📸 Caption único
        </button>
        <button className={`mode-btn ${mode === 'week' ? 'active' : ''}`} onClick={() => setMode('week')}>
          📅 Semana completa
        </button>
      </div>

      {mode === 'week' && (
        <div className="mode-hint">
          La IA generará 5 captions distintos — uno por día, de lunes a viernes, cada uno con un ángulo diferente.
        </div>
      )}

      {/* Zona drop */}
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''} ${files.length ? 'drop-zone-compact' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
      >
        {files.length ? (
          <>
            <span className="drop-icon-sm">＋</span>
            <p className="drop-sub">Arrastra más archivos o haz clic para añadir</p>
          </>
        ) : (
          <>
            <div className="drop-icon">📂</div>
            <p className="drop-title">Arrastra imágenes o vídeos aquí</p>
            <p className="drop-sub">o haz clic para seleccionar</p>
            <p className="drop-hint">JPG, PNG, WEBP, MP4, MOV · Varios archivos a la vez</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => processFiles(e.target.files)}
        />
      </div>

      {/* Galería + preview */}
      {files.length > 0 && (
        <div className="media-layout">
          {/* Preview grande del seleccionado */}
          <div className="media-preview">
            {activeItem?.type === 'video' ? (
              <video
                src={activeItem.preview}
                className="preview-media"
                controls
                playsInline
              />
            ) : (
              <img src={activeItem?.preview} alt="Preview" className="preview-media" />
            )}
            {activeItem?.type === 'video' && (
              <div className="video-badge">🎬 Vídeo · se usará el fotograma para el caption</div>
            )}
          </div>

          {/* Panel derecho */}
          <div className="media-sidebar">
            {/* Miniaturas */}
            <div className="thumbnails">
              {files.map((item, i) => (
                <div
                  key={i}
                  className={`thumb ${i === selected ? 'thumb-active' : ''}`}
                  onClick={() => setSelected(i)}
                >
                  <img
                    src={item.type === 'video' ? URL.createObjectURL(item.frame) : item.preview}
                    alt=""
                    className="thumb-img"
                  />
                  {item.type === 'video' && <span className="thumb-video-icon">▶</span>}
                  <button
                    className="thumb-remove"
                    onClick={e => { e.stopPropagation(); removeFile(i); }}
                  >✕</button>
                </div>
              ))}
            </div>

            {/* Info + botón */}
            <div className="media-info card">
              <p className="preview-filename">
                {activeItem?.type === 'video' ? '🎬' : '📎'} {activeItem?.file.name}
              </p>
              <p className="preview-size">
                {((activeItem?.file.size ?? 0) / 1024).toFixed(0)} KB
                {files.length > 1 && <span className="file-count"> · {files.length} archivos</span>}
              </p>
              <button className="btn btn-primary generate-btn" onClick={generate} disabled={loading}>
                {loading
                  ? <><span className="spinner" /> {mode === 'week' ? 'Generando semana...' : 'Generando caption...'}</>
                  : <>{mode === 'week' ? '📅 Generar semana completa' : '✨ Generar caption con IA'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="upload-error">⚠️ {error}</div>}
    </div>
  );
}
