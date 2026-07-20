import React, { useState, useRef } from 'react';
import './WeekView.css';
import { CalendarIcon, CheckIcon, WarningIcon, CameraIcon, ClipboardIcon, XIcon } from './icons';

// Próximo lunes (o hoy mismo si hoy ya es lunes) en formato YYYY-MM-DD, para
// que el selector de fecha de "Programar semana" arranque con un valor sensato.
function nextMonday() {
  const d = new Date();
  const day = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
  const diff = day === 1 ? 0 : ((8 - day) % 7 || 7);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Convierte un File (foto subida a mano para sustituir el día) a data URI —
// el servidor necesita base64 real, no le sirve el blob: URL que usa el
// navegador solo para previsualizar en pantalla.
function fileToDataURI(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function WeekView({ data, onBack }) {
  const { week } = data;
  const originalCaptions = useRef(week.map(d => d.caption));
  const [captions, setCaptions] = useState(week.map(d => d.caption));
  const [dayImages, setDayImages] = useState(week.map(() => null)); // null = usa imagen base
  const dayFiles = useRef(week.map(() => null)); // File real de cada imagen personalizada (para programar)
  const [regenerating, setRegenerating] = useState(week.map(() => false));
  const [copied, setCopied] = useState(null);
  const fileRefs = useRef(week.map(() => null));

  const [startDate, setStartDate] = useState(nextMonday());
  const [time, setTime] = useState('10:00');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState(null); // { ok, message }

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
    dayFiles.current[i] = imageFile;
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
    dayFiles.current[i] = null;
    setDayImages(imgs => imgs.map((img, idx) => idx === i ? null : img));
    update(i, originalCaptions.current[i]);
  }

  // Manda los 5 días (con imagen ya en base64, no blob:) al backend, que
  // calcula la fecha/hora exacta de cada uno a partir del lunes elegido y los
  // deja programados. Un proceso en el servidor los publica solo cuando llega
  // su momento — mientras el servidor siga corriendo.
  async function scheduleWeek() {
    setScheduling(true);
    setScheduleResult(null);
    try {
      const days = await Promise.all(week.map(async (d, i) => ({
        day: d.day,
        angle: d.angle,
        caption: captions[i],
        image: dayFiles.current[i] ? await fileToDataURI(dayFiles.current[i]) : d.image
      })));

      const res = await fetch('/api/schedule-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, startDate, time })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error desconocido');
      setScheduleResult({ ok: true, message: `Semana programada: ${result.created.length} posts, empezando el ${startDate}.` });
    } catch (err) {
      setScheduleResult({ ok: false, message: err.message });
    } finally {
      setScheduling(false);
    }
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

      <div className="schedule-panel card">
        <div className="schedule-panel-header">
          <span className="schedule-panel-title"><CalendarIcon /> Programar semana completa</span>
          <p className="schedule-panel-sub">
            Se publica sola en Instagram cada día, a la hora que elijas — no hace falta que vuelvas a entrar.
            Requiere tener la cuenta de Instagram conectada (Meta) y la app desplegada; si no, se guarda igual y
            queda marcada como "aprobada (demo)" el día que le toque, sin publicar de verdad.
          </p>
        </div>
        <div className="schedule-panel-fields">
          <div className="schedule-field">
            <label htmlFor="week-start-date">Lunes de inicio</label>
            <input
              id="week-start-date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div className="schedule-field">
            <label htmlFor="week-time">Hora de publicación</label>
            <input
              id="week-time"
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={scheduleWeek} disabled={scheduling}>
            {scheduling ? 'Programando…' : 'Programar semana'}
          </button>
        </div>
        {scheduleResult && (
          <div className={`schedule-result ${scheduleResult.ok ? 'ok' : 'error'}`}>
            {scheduleResult.ok ? <CheckIcon /> : <WarningIcon />} {scheduleResult.message}
          </div>
        )}
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
                        <CameraIcon /> Cambiar
                      </button>
                      {isCustom && (
                        <button
                          className="btn-remove-img"
                          onClick={() => removeImage(i)}
                          title="Usar imagen base"
                        ><XIcon /></button>
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
                      {copied === i ? <><CheckIcon /> Copiado</> : <><ClipboardIcon /> Copiar</>}
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
