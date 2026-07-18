import React, { useState, useRef } from 'react';
import './WeekView.css';

export default function WeekView({ data, onBack }) {
  const { week } = data;
  const originalCaptions = useRef(week.map(d => d.caption));
  const [captions, setCaptions] = useState(week.map(d => d.caption));
  const [dayImages, setDayImages] = useState(week.map(() => null)); // null = usa imagen base
  const [regenerating, setRegenerating] = useState(week.map(() => false));
  const [copied, setCopied] = useState(null);
  const fileRefs = useRef(week.map(() => null));

  async function copy(i) {
    await navigator.clipboard.writeText(captions[i]);
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  }

  function update(i, val) {
    setCaptions(c => c.map((cap, idx) => idx === i ? val : cap));
  }

  function setDayRegenerating(i, val) {
    setRegenerating(r => r.map((v, idx) => idx === i ? val : v));
  }

  // Vuelve a pedirle a la IA el caption de este día usando la nueva imagen,
  // para que el texto hable realmente de la foto que se ve ese día.
  async function regenerateCaption(i, file) {
    setDayRegenerating(i, true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('day', week[i].day);
      const res = await fetch('/api/generate-day', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok && data.caption) update(i, data.caption);
    } catch {
      // si falla la regeneración, se deja el caption que hubiera antes
    } finally {
      setDayRegenerating(i, false);
    }
  }

  async function handleImageChange(i, file) {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const imageFile = isVideo ? await extractFrame(file) : file;
    const url = URL.createObjectURL(imageFile);
    setDayImages(imgs => imgs.map((img, idx) => idx === i ? url : img));
    regenerateCaption(i, imageFile);
  }

  function extractFrame(file) {
    return new Promise(resolve => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.src = url;
      video.muted = true;
      video.onloadeddata = () => { video.currentTime = Math.min(1, video.duration / 4); };
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

  function removeImage(i) {
    setDayImages(imgs => imgs.map((img, idx) => idx === i ? null : img));
    update(i, originalCaptions.current[i]);
  }

  const hasOverrides = dayImages.some(img => img !== null);
  const allSameBase = week.every(d => d.image === week[0]?.image);

  return (
    <div className="week-page">
      <div className="week-header">
        <button className="btn btn-ghost" onClick={onBack}>← Volver</button>
        <div>
          <h1>Semana de contenido</h1>
          <p>
            {hasOverrides
              ? 'Imágenes personalizadas por día'
              : allSameBase
                ? 'Usando la misma imagen toda la semana — puedes cambiarla por día'
                : 'Cada día tiene su propia imagen — puedes cambiarla si quieres'}
          </p>
        </div>
      </div>

      <div className="week-days-full">
        {week.map((day, i) => {
          const img = dayImages[i] ?? day.image;
          const isCustom = dayImages[i] !== null;
          return (
            <div key={i} className="day-card card">
              <div className="day-card-inner">

                {/* Imagen del día */}
                <div className="day-image-col">
                  <div className="day-image-wrap">
                    <img src={img} alt={day.day} className="day-image" />
                    <div className="day-image-overlay">
                      <button
                        className="btn-change-img"
                        onClick={() => fileRefs.current[i]?.click()}
                        title="Cambiar imagen"
                      >
                        📷 Cambiar
                      </button>
                      {isCustom && (
                        <button
                          className="btn-remove-img"
                          onClick={() => removeImage(i)}
                          title="Usar imagen base"
                        >✕</button>
                      )}
                    </div>
                    {isCustom && <span className="day-custom-badge">Personalizada</span>}
                  </div>
                  <input
                    ref={el => fileRefs.current[i] = el}
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={e => handleImageChange(i, e.target.files[0])}
                  />
                </div>

                {/* Caption del día */}
                <div className="day-content">
                  <div className="day-card-header">
                    <div>
                      <span className="day-name">{day.day}</span>
                      <span className="day-angle">{day.angle}</span>
                    </div>
                    <button
                      className={`btn btn-ghost copy-btn ${copied === i ? 'copied' : ''}`}
                      onClick={() => copy(i)}
                      disabled={regenerating[i]}
                    >
                      {copied === i ? '✅ Copiado' : '📋 Copiar'}
                    </button>
                  </div>
                  {regenerating[i] ? (
                    <div className="day-caption-loading">
                      <span className="spinner" /> Regenerando caption con la nueva imagen…
                    </div>
                  ) : (
                    <textarea
                      className="day-caption"
                      value={captions[i]}
                      onChange={e => update(i, e.target.value)}
                      rows={4}
                    />
                  )}
                  <div className="day-chars">{captions[i].length}/2200</div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
