import React, { useState } from 'react';
import Upload from './components/Upload.jsx';
import CaptionReview from './components/CaptionReview.jsx';
import History from './components/History.jsx';
import Settings from './components/Settings.jsx';
import WeekView from './components/WeekView.jsx';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState('upload'); // upload | review | history | week | settings
  const [job, setJob] = useState(null);
  const [weekData, setWeekData] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  function onGenerated(data) {
    setJob(data);
    setScreen('review');
  }

  function onDone() {
    setHistoryKey(k => k + 1);
    setJob(null);
    setScreen('upload');
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <div className="logo-mark">✦</div>
          <span className="logo-text">AutoPost <strong>CM</strong></span>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-btn ${screen === 'upload' || screen === 'review' ? 'active' : ''}`}
            onClick={() => { setScreen('upload'); setJob(null); }}
          >
            Nueva publicación
          </button>
          <button
            className={`nav-btn ${screen === 'history' ? 'active' : ''}`}
            onClick={() => setScreen('history')}
          >
            Historial
          </button>
          <button
            className={`nav-btn nav-settings ${screen === 'settings' ? 'active' : ''}`}
            onClick={() => setScreen('settings')}
            title="Perfil de marca"
          >
            ⚙️
          </button>
        </nav>
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
        {screen === 'settings' && <Settings />}
      </main>
    </div>
  );
}
