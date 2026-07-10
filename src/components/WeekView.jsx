import React, { useState, useRef } from 'react';
import './WeekView.css';

export default function WeekView({ data, onBack }) {
  const { week, previewUrl } = data;
  const [captions, setCaptions] = useState(week.map(d => d.caption));
  const [dayImages, setDayImages] = useState(week.map(() => null)); // null = usa imagen base
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

  function handleImageChange(i, file) {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
      extractFrame(file).then(frameUrl => {
        setDayImages(imgs => imgs.map((img, idx) => idx === i ? frameUrl : img));
      });
    } else {
      const url = URL.createObjectURL(file);
      setDayImages(imgs => imgs.map((img, idx) => idx === i ? url : img));
    }
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
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      video.load();
    });
  }

  function removeImage(i) {
    setDayImages(imgs => imgs.map((img, idx) => idx === i ? null : img));
  }

  const allSameImage = dayImages.every(img => img === null);

  return (
    <div className="week-page">
      <div className="week-header">
        <button className="btn btn-ghost" onClick={onBack}>← Volver</button>
        <div>
          <h1>Semana de contenido</h1>
          <p>{allSameImage ? 'Usando la misma imagen toda la semana — puedes cambiarla por día' : 'Imágenes personalizadas por día'}</p>
        </div>
      </div>

      <div className="week-days-full">
        {week.map((day, i) => {
          const img = dayImages[i] ?? previewUrl;
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
                    >
                      {copied === i ? '✅ Copiado' : '📋 Copiar'}
                    </button>
                  </div>
                  <textarea
                    className="day-caption"
                    value={captions[i]}
                    onChange={e => update(i, e.target.value)}
                    rows={4}
                  />
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
