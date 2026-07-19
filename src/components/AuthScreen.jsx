import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './AuthScreen.css';
import RocketIcon from './RocketIcon';
export default function AuthScreen({ onContinueAsGuest }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <div className="auth-logo">
          <RocketIcon className="auth-logo-icon" />
          <span className="auth-logo-text">AutoPost <strong>CM</strong></span>
        </div>
        <p className="auth-tagline">De la foto al feed, sin fricción.</p>
        <div className="auth-sheet" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`auth-sheet-cell ${i === 7 ? 'is-active' : ''}`} />
          ))}
        </div>
        <p className="auth-brand-caption">Cada foto entra al laboratorio, sale con su leyenda lista.</p>
      </aside>

      <main className="auth-panel">
        <form onSubmit={handleSubmit} className="auth-form">
          <h1>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
          <p className="auth-subtitle">
            {mode === 'login' ? 'Entrá para revisar tus publicaciones.' : 'Registrate para empezar a publicar.'}
          </p>

          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="vos@empresa.com" />
          </label>

          <label className="auth-field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Mínimo 8 caracteres"
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Registrarme'}
          </button>

          <button
            type="button"
            className="auth-toggle"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Iniciá sesión'}
          </button>

          <div className="auth-divider">o</div>

          <button type="button" className="auth-guest" onClick={onContinueAsGuest}>
            Probar gratis sin cuenta
          </button>
        </form>
      </main>
    </div>
  );
}