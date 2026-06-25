import React, { useState, useRef } from 'react';
import './Upload.css';

export default function Upload({ onGenerated }) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef();

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) {
      setError('Por favor sube una imagen (JPG, PNG, WEBP)');
      return;
    }
    setFile(f);
    setError('');
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
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
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => resolve(new File([blob], f.name, { type: 'image/jpeg' })), 'image/jpeg', quality);
      };
      img.src = url;
    });
  }

  async function generate() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append('image', compressed);
      const res = await fetch('/api/generate', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando caption');
      onGenerated({ ...data, caption: data.captions?.[0] ?? data.caption, image: preview });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setError('');
  }

  return (
    <div className="upload-page">
      <div className="upload-header">
        <h1>Nueva publicación</h1>
        <p>Sube una imagen y la IA generará el caption para Instagram</p>
      </div>

      {!preview ? (
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current.click()}
        >
          <div className="drop-icon">📸</div>
          <p className="drop-title">Arrastra una imagen aquí</p>
          <p className="drop-sub">o haz clic para seleccionar</p>
          <p className="drop-hint">JPG, PNG, WEBP · Máx. 20MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="preview-area">
          <div className="preview-image-wrap">
            <img src={preview} alt="Preview" className="preview-image" />
            <button className="preview-remove" onClick={reset} title="Cambiar imagen">✕</button>
          </div>
          <div className="preview-info card">
            <p className="preview-filename">📎 {file.name}</p>
            <p className="preview-size">{(file.size / 1024).toFixed(0)} KB</p>
            <button
              className="btn btn-primary generate-btn"
              onClick={generate}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Generando caption...
                </>
              ) : (
                <>✨ Generar caption con IA</>
              )}
            </button>
          </div>
        </div>
      )}

      {error && <div className="upload-error">⚠️ {error}</div>}
    </div>
  );
}
