import React, { useState } from 'react';
import Upload from './components/Upload.jsx';
import CaptionReview from './components/CaptionReview.jsx';
import History from './components/History.jsx';
import Settings from './components/Settings.jsx';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState('upload'); // upload | review | history
  const [job, setJob] = useState(null); // { id, caption, image }
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
          <span className="logo-icon">🚀</span>
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
        {screen === 'upload' && <Upload onGenerated={onGenerated} />}
        {screen === 'review' && job && <CaptionReview job={job} onDone={onDone} onBack={() => setScreen('upload')} />}
        {screen === 'history' && <History key={historyKey} />}
        {screen === 'settings' && <Settings />}
      </main>
    </div>
  );
}
