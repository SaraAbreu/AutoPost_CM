import React, { useState, useEffect } from 'react';
import Upload from './components/Upload.jsx';
import CaptionReview from './components/CaptionReview.jsx';
import History from './components/History.jsx';
import Scheduled from './components/Scheduled.jsx';
import Settings from './components/Settings.jsx';
import WeekView from './components/WeekView.jsx';
import './App.css';
import { useAuth } from './context/AuthContext';
import AuthScreen from './components/AuthScreen';
import RocketIcon from './components/RocketIcon';
import { SparklesIcon, ClockHistoryIcon, CalendarIcon, SlidersIcon } from './components/icons';
const GUEST_KEY = 'autopost_guest_mode';

export default function App() {
  const { user, loading, logout } = useAuth();

  const [guestMode, setGuestMode] = useState(() => localStorage.getItem(GUEST_KEY) === '1');
  const [screen, setScreen] = useState('upload'); // upload | review | history | scheduled | week | settings
  const [job, setJob] = useState(null);
  const [weekData, setWeekData] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  // Si el usuario termina logueándose de verdad, la marca de invitado ya no
  // hace falta — evita que quede un flag viejo confundiendo un futuro logout.
  useEffect(() => {
    if (user) localStorage.removeItem(GUEST_KEY);
  }, [user]);

  function continueAsGuest() {
    localStorage.setItem(GUEST_KEY, '1');
    setGuestMode(true);
  }

  function goToLogin() {
    localStorage.removeItem(GUEST_KEY);
    setGuestMode(false);
  }

  function onGenerated(data) {
    setJob(data);
    setScreen('review');
  }

  function onDone() {
    setHistoryKey(k => k + 1);
    setJob(null);
    setScreen('upload');
  }

  if (loading) return <div className="app-loading">Cargando…</div>;
  if (!user && !guestMode) return <AuthScreen onContinueAsGuest={continueAsGuest} />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <RocketIcon className="logo-mark" />
          <span className="logo-text">AutoPost <strong>CM</strong></span>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-btn ${screen === 'upload' || screen === 'review' ? 'active' : ''}`}
            onClick={() => { setScreen('upload'); setJob(null); }}
          >
            <span className="nav-icon" aria-hidden="true"><SparklesIcon /></span>
            <span className="nav-label">Nueva publicación</span>
          </button>
          <button
            className={`nav-btn ${screen === 'history' ? 'active' : ''}`}
            onClick={() => setScreen('history')}
          >
            <span className="nav-icon" aria-hidden="true"><ClockHistoryIcon /></span>
            <span className="nav-label">Historial</span>
          </button>
          <button
            className={`nav-btn ${screen === 'scheduled' ? 'active' : ''}`}
            onClick={() => setScreen('scheduled')}
          >
            <span className="nav-icon" aria-hidden="true"><CalendarIcon /></span>
            <span className="nav-label">Programados</span>
          </button>
          <button
            className={`nav-btn nav-settings ${screen === 'settings' ? 'active' : ''}`}
            onClick={() => setScreen('settings')}
            title="Perfil de marca"
          >
            <span className="nav-icon" aria-hidden="true"><SlidersIcon /></span>
            <span className="nav-label">Perfil</span>
          </button>
        </nav>
        <div className="app-user">
          {user ? (
            <>
              <span className="app-user-email">{user.email} · {user.plan}</span>
              <button className="nav-btn" onClick={logout}>Cerrar sesión</button>
            </>
          ) : (
            <button className="nav-btn" onClick={goToLogin}>Iniciar sesión</button>
          )}
        </div>
      </header>

      <main className="app-main">
        {screen === 'upload' && (
          <Upload
            onGenerated={onGenerated}
            onWeekGenerated={data => { setWeekData(data); setScreen('week'); }}
          />
        )}
        {screen === 'week' && weekData && <WeekView data={weekData} onBack={() => setScreen('upload')} />}
        {screen === 'review' && job && <CaptionReview job={job} onDone={onDone} onBack={() => setScreen('upload')} />}
        {screen === 'history' && <History key={historyKey} />}
        {screen === 'scheduled' && <Scheduled />}
        {screen === 'settings' && <Settings />}
      </main>
    </div>
  );
}