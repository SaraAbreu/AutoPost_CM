import React, { useState, useEffect } from 'react';
import './Settings.css';
import { CameraIcon, CheckIcon, WarningIcon, BrainIcon } from './icons';

const TONOS = ['Profesional', 'Cercano', 'Inspiracional', 'Divertido'];

export default function Settings() {
  const [form, setForm] = useState({
    nombre: '', instagram: '', sector: '', ciudad: '', servicios: '', tono: 'Cercano', cta: '', hashtags: '', modulo: 'generico'
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [voice, setVoice] = useState({ count: 0, patterns: null });
  const [modules, setModules] = useState([]);
  const [instagram, setInstagram] = useState({ connected: false, username: null });
  const [instagramNotice, setInstagramNotice] = useState(null); // { type: 'ok'|'error', text }

  useEffect(() => {
    Promise.all([
      fetch('/api/profile').then(r => r.json()),
      fetch('/api/voice').then(r => r.json()),
      fetch('/api/modules').then(r => r.json()),
      fetch('/api/instagram/status').then(r => r.json()).catch(() => ({ connected: false }))
    ]).then(([profile, voiceData, modulesData, instagramData]) => {
      if (profile) setForm(f => ({ ...f, ...profile }));
      if (voiceData) setVoice(voiceData);
      if (modulesData) setModules(modulesData);
      if (instagramData) setInstagram(instagramData);
    }).finally(() => setLoading(false));

    // El backend redirige acá con ?instagram_connected=1 o ?instagram_error=...
    // después de que el usuario vuelve de autorizar en Instagram.
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected')) {
      setInstagramNotice({ type: 'ok', text: '¡Instagram conectado correctamente!' });
    } else if (params.get('instagram_error')) {
      setInstagramNotice({ type: 'error', text: `No se pudo conectar Instagram (${params.get('instagram_error')}).` });
    }
    if (params.get('instagram_connected') || params.get('instagram_error')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function disconnectInstagram() {
    await fetch('/api/instagram/disconnect', { method: 'POST' });
    setInstagram({ connected: false, username: null });
    setInstagramNotice(null);
  }

  const activeModule = modules.find(m => m.id === form.modulo);
  const extraFields = activeModule?.extraFields ?? [];

  function update(e) {
    setSaved(false);
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setSaved(true);
  }

  if (loading) return <div className="settings-page"><p className="settings-loading">Cargando perfil…</p></div>;

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Perfil de marca</h1>
        <p>La IA usará estos datos para generar captions adaptados a tu empresa</p>
      </div>

      <form className="settings-form" onSubmit={save}>
        <div className="settings-grid">

          <div className="field-group full">
            <label>Vertical / módulo</label>
            <select name="modulo" value={form.modulo} onChange={update}>
              {(modules.length ? modules : [{ id: 'generico', label: 'Genérico (cualquier negocio)' }]).map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="field-hint">Adapta el prompt, el compliance y el calendario de contenido a tu sector.</p>
          </div>

          <div className="field-group">
            <label>Nombre de la empresa *</label>
            <input name="nombre" value={form.nombre} onChange={update} placeholder="Ej: Seguros García" required />
          </div>

          <div className="field-group">
            <label>Usuario de Instagram</label>
            <input name="instagram" value={form.instagram} onChange={update} placeholder="Ej: sa_draftstudio" />
          </div>

          <div className="field-group">
            <label>Sector / industria</label>
            <input name="sector" value={form.sector} onChange={update} placeholder="Ej: Correduría de seguros" />
          </div>

          <div className="field-group">
            <label>Ciudad / ubicación</label>
            <input name="ciudad" value={form.ciudad} onChange={update} placeholder="Ej: Madrid" />
          </div>

          <div className="field-group">
            <label>Tono de comunicación</label>
            <select name="tono" value={form.tono} onChange={update}>
              {TONOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="field-group full">
            <label>Productos y servicios principales</label>
            <textarea
              name="servicios"
              value={form.servicios}
              onChange={update}
              rows={3}
              placeholder="Ej: Seguros de hogar, auto, vida y salud para familias y autónomos"
            />
          </div>

          <div className="field-group full">
            <label>Llamada a la acción habitual</label>
            <input
              name="cta"
              value={form.cta}
              onChange={update}
              placeholder="Ej: Llámanos al 900 123 456 o escríbenos por DM"
            />
          </div>

          <div className="field-group full">
            <label>Hashtags propios (separados por espacios)</label>
            <input
              name="hashtags"
              value={form.hashtags}
              onChange={update}
              placeholder="Ej: #SegurosGarcía #TuSeguroDeConfianza #MadridSeguros"
            />
          </div>

          {extraFields.map(f => (
            <div className="field-group full" key={f.name}>
              <label>{f.label}</label>
              <input
                name={f.name}
                value={form[f.name] ?? ''}
                onChange={update}
                placeholder={f.placeholder}
              />
            </div>
          ))}

        </div>

        {/* Sección conectar Instagram */}
        <div className="instagram-section">
          <div className="instagram-header">
            <span className="instagram-title"><CameraIcon /> Cuenta de Instagram</span>
          </div>

          {instagramNotice && (
            <p className={`instagram-notice instagram-notice-${instagramNotice.type}`}>
              {instagramNotice.type === 'ok' ? <CheckIcon /> : <WarningIcon />} {instagramNotice.text}
            </p>
          )}

          {instagram.connected ? (
            <div className="instagram-connected-row">
              <span className="instagram-connected-user"><CheckIcon /> Conectado como <strong>@{instagram.username}</strong></span>
              <button type="button" className="btn btn-ghost" onClick={disconnectInstagram}>Desconectar</button>
            </div>
          ) : (
            <>
              <p className="instagram-empty">
                Conectá tu cuenta de Instagram para poder aprobar y publicar directamente desde acá.
              </p>
              <a href="/api/instagram/connect" className="btn btn-primary">Conectar mi Instagram</a>
            </>
          )}
        </div>

        {/* Sección voz aprendida */}
        <div className="voice-section">
          <div className="voice-header">
            <span className="voice-title"><BrainIcon /> Voz aprendida</span>
            <span className="voice-count">{voice.count} {voice.count === 1 ? 'edición guardada' : 'ediciones guardadas'}</span>
          </div>
          {voice.patterns ? (
            <div className="voice-patterns">
              <p className="voice-patterns-label">Patrones detectados:</p>
              <pre className="voice-patterns-text">{voice.patterns}</pre>
            </div>
          ) : (
            <p className="voice-empty">
              {voice.count === 0
                ? 'Aún no hay datos. Edita un caption antes de aprobarlo y la IA irá aprendiendo tu estilo.'
                : `${voice.count}/3 ediciones guardadas. Con 3 la IA activará el aprendizaje automático.`}
            </p>
          )}
        </div>

        <div className="settings-footer">
          {saved && <span className="settings-saved"><CheckIcon /> Perfil guardado</span>}
          <button type="submit" className="btn btn-primary">Guardar perfil</button>
        </div>
      </form>
    </div>
  );
}
