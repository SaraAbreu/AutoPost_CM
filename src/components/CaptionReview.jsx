import React, { useState, useEffect } from 'react';
import './CaptionReview.css';
import { CheckIcon, XCircleIcon, ClipboardIcon, RefreshIcon, BulbIcon, ClockIcon, CalendarIcon, WarningIcon, SparklesIcon, BrainIcon } from './icons';

const DEFAULT_TONOS = ['✨ Inspiracional', '💬 Cercano', '🎯 Comercial'];

export default function CaptionReview({ job, onDone, onBack }) {
  const [captions, setCaptions] = useState(job.captions ?? [job.caption]);
  const [tones, setTones] = useState(job.tones ?? DEFAULT_TONOS);
  const hasVariants = captions.length > 1;
  const [selected, setSelected] = useState(hasVariants ? null : 0);
  const [caption, setCaption] = useState(job.caption);
  const [originalCaption, setOriginalCaption] = useState(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState({});
  const [bestTime, setBestTime] = useState(null);
  const [loadingTime, setLoadingTime] = useState(false);

  const charCount = caption.length;
  const charLimit = 2200;
  const igUser = profile.instagram || profile.nombre || 'tu_empresa';
  const igInitials = igUser.slice(0, 2).toUpperCase();
  const igLocation = profile.ciudad || 'España';

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      setProfile(p);
      // Pedir mejor hora en cuanto tengamos perfil y caption
      setLoadingTime(true);
      fetch('/api/best-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector: p.sector, caption: job.caption })
      })
        .then(r => r.json())
        .then(data => { if (!data.error) setBestTime(data); })
        .catch(() => {})
        .finally(() => setLoadingTime(false));
    }).catch(() => {});
  }, []);

  async function approve() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, caption, originalCaption, imageBase64: job.image })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error publicando');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reject() {
    await fetch('/api/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id })
    });
    onBack();
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar al portapapeles');
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setError('');
    try {
      const blob = await fetch(job.image).then(r => r.blob());
      const file = new File([blob], 'image.jpg', { type: blob.type });
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/generate', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error regenerando');
      const newCaptions = data.captions ?? [data.caption];
      setCaptions(newCaptions);
      if (data.tones) setTones(data.tones);
      job.id = data.id;
      setSelected(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  if (result) {
    return (
      <div className="result-screen">
        <div className="result-icon">{result.demo ? <CheckIcon /> : <SparklesIcon />}</div>
        <h2>{result.demo ? 'Caption aprobado' : '¡Publicado en Instagram!'}</h2>
        <p className="result-msg">{result.message || 'Tu publicación se ha enviado a Instagram correctamente.'}</p>
        {result.demo && (
          <div className="result-demo-note">
            Modo demo activo — configura META_ACCESS_TOKEN en el archivo .env para publicar de verdad.
          </div>
        )}
        {result.voiceExamples > 0 && (
          <div className="result-voice-note">
            <BrainIcon /> {result.voiceExamples < 3
              ? `La IA ha guardado tu edición (${result.voiceExamples}/3 para activar el aprendizaje)`
              : `La IA ha actualizado tu estilo con ${result.voiceExamples} ejemplos`}
          </div>
        )}
        <button className="btn btn-primary" onClick={onDone} style={{ marginTop: 24 }}>
          Nueva publicación
        </button>
      </div>
    );
  }

  // Pantalla de selección de variante
  if (hasVariants && selected === null) {
    return (
      <div className="review-page">
        <div className="review-header">
          <button className="btn btn-ghost back-btn" onClick={onBack}>← Volver</button>
          <div>
            <h1>Elige un caption</h1>
            <p>La IA generó 3 versiones — selecciona la que mejor encaje</p>
          </div>
          <button className="btn btn-ghost regen-btn" onClick={regenerate} disabled={regenerating}>
            {regenerating ? <><span className="spinner" /> Generando...</> : <><RefreshIcon /> Generar otros 3</>}
          </button>
        </div>
        <div className="variants-grid">
          {captions.map((c, i) => (
            <div key={i} className="variant-card card" onClick={() => { setCaption(c); setOriginalCaption(c); setSelected(i); }}>
              <div className="variant-tag">{tones[i] ?? `Opción ${i + 1}`}</div>
              <p className="variant-preview">{c.split('\n')[0]}</p>
              <p className="variant-body">{c.split('\n').slice(1).join(' ').slice(0, 120)}…</p>
              <button className="btn btn-primary variant-btn">Usar esta →</button>
            </div>
          ))}
        </div>
        {error && <div className="review-error" style={{ marginTop: 16 }}><WarningIcon /> {error}</div>}
      </div>
    );
  }

  return (
    <div className="review-page">
      <div className="review-header">
        <button className="btn btn-ghost back-btn" onClick={hasVariants ? () => setSelected(null) : onBack}>
          ← {hasVariants ? 'Cambiar opción' : 'Volver'}
        </button>
        <div>
          <h1>Revisar caption</h1>
          <p>Edita el caption si lo necesitas y aprueba para publicar</p>
        </div>
      </div>

      <div className="review-grid">
        {/* Mockup Instagram */}
        <div className="review-image-col">
          <div className="ig-post">
            <div className="ig-header">
              <div className="ig-avatar"><span>{igInitials}</span></div>
              <div className="ig-username-wrap">
                <span className="ig-username">{igUser}</span>
                <span className="ig-location">{igLocation}</span>
              </div>
              <span className="ig-more">•••</span>
            </div>
            <img src={job.image} alt="Post" className="ig-image" />
            <div className="ig-actions">
              <div className="ig-actions-left">
                <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
              <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div className="ig-likes">248 Me gusta</div>
            <div className="ig-caption-preview">
              <span className="ig-caption-user">{igUser}</span>
              {' '}
              <span className="ig-caption-text">
                {caption.split('\n')[0].slice(0, 80)}{caption.split('\n')[0].length > 80 ? '… más' : ''}
              </span>
            </div>
            <div className="ig-comments">Ver los 12 comentarios</div>
            <div className="ig-timestamp">HACE 2 HORAS</div>
          </div>
        </div>

        {/* Caption editor */}
        <div className="review-caption-col">
          <div className="caption-editor card">
            <div className="caption-label">
              <span>Caption</span>
              <span className={`char-count ${charCount > charLimit ? 'over' : ''}`}>
                {charCount}/{charLimit}
              </span>
            </div>
            <textarea
              className="caption-textarea"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={14}
              maxLength={2500}
            />
          </div>

          {error && <div className="review-error"><WarningIcon /> {error}</div>}

          <div className="review-actions">
            <button className="btn btn-success" onClick={approve} disabled={loading || !caption.trim()}>
              {loading ? <><span className="spinner" /> Publicando...</> : <><CheckIcon /> Aprobar y publicar</>}
            </button>
            <button className="btn btn-danger" onClick={reject} disabled={loading}>
              <XCircleIcon /> Rechazar
            </button>
          </div>

          <div className="review-secondary-actions">
            <button className="btn btn-ghost" onClick={copyCaption}>
              {copied ? <><CheckIcon /> ¡Copiado!</> : <><ClipboardIcon /> Copiar caption</>}
            </button>
            {hasVariants && (
              <button className="btn btn-ghost" onClick={regenerate} disabled={regenerating}>
                {regenerating ? <><span className="spinner" /> Generando...</> : <><RefreshIcon /> Generar otros 3</>}
              </button>
            )}
          </div>

          <p className="review-hint">
            <BulbIcon /> Puedes editar el caption antes de publicar. Los cambios se guardan en el historial.
          </p>

          {/* Mejor hora */}
          <div className="best-time-card">
            <div className="best-time-header">
              <span className="best-time-title"><ClockIcon /> Mejor momento para publicar</span>
            </div>
            {loadingTime ? (
              <p className="best-time-loading"><span className="spinner" /> Analizando tu sector…</p>
            ) : bestTime ? (
              <div className="best-time-body">
                <div className="best-time-row">
                  <span className="best-time-label"><CalendarIcon /> Días</span>
                  <span className="best-time-value">{bestTime.dias?.join(', ')}</span>
                </div>
                <div className="best-time-row">
                  <span className="best-time-label"><ClockIcon /> Hora</span>
                  <span className="best-time-value">{bestTime.horas}</span>
                </div>
                <p className="best-time-reason">{bestTime.razon}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
