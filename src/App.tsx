/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { QueueState } from './types';
import ReceptionistScreen from './components/ReceptionistScreen';
import WaitingRoomScreen from './components/WaitingRoomScreen';
import { 
  Terminal, ShieldCheck, Monitor, Tv, Columns, ExternalLink, 
  RefreshCw, Wifi, WifiOff, FileText, CheckCircle, Smartphone
} from 'lucide-react';

export default function App() {
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [viewMode, setViewMode] = useState<'cockpit' | 'receptionist' | 'waiting-room'>('cockpit');
  const [isConnected, setIsConnected] = useState(false);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [voiceHintBanner, setVoiceHintBanner] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Read URL query parameters to auto-route roles if opened in new tabs
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    if (role === 'receptionist') {
      setViewMode('receptionist');
    } else if (role === 'waiting-room') {
      setViewMode('waiting-room');
    }
  }, []);

  // Sync state via REST API as immediate fallback, and initial fetch
  const fetchQueueState = async () => {
    try {
      const res = await fetch('/api/queue');
      if (res.ok) {
        const data: QueueState = await res.json();
        setQueueState(data);
        setErrorLog(null);
      } else {
        throw new Error('API server returned error state');
      }
    } catch (err: any) {
      console.error('Fetch queue error:', err);
      setErrorLog('Express REST Server loading / offline. Will retry.');
    }
  };

  // Setup autorun WebSocket link
  useEffect(() => {
    fetchQueueState();

    const connectWebSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}`;
      
      console.log('Connecting to Queue Cure WS Server:', wsUrl);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('WS Socket state: CONNECTED');
        setIsConnected(true);
        setErrorLog(null);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'STATE_INITIAL' || message.type === 'STATE_UPDATE') {
            setQueueState(message.payload);
          } else if (message.type === 'PATIENT_CALLED_ALERT') {
            // Flash a dynamic subtle highlight in client waiting room or play sounds if they activated it
            console.log(`Alert: Token ${message.payload.tokenNumber} (${message.payload.patientName}) was called!`);
          }
        } catch (err) {
          console.error('Failed to parse websocket message payload:', err);
        }
      };

      ws.onclose = (e) => {
        console.log('WS Connection lost, code:', e.code);
        setIsConnected(false);
        // Progressive backoff reconnection attempt
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('WS Error context:', err);
        ws.close();
      };
    };

    connectWebSocket();

    // Secondary Polling safeguard - if WS stays broken, poll every 5s silently
    const pollingInterval = setInterval(() => {
      if (!isConnected) {
        fetchQueueState();
      }
    }, 5000);

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearInterval(pollingInterval);
    };
  }, [isConnected]);

  // REST API Client Handlers
  const handleAddPatient = async (name: string, phone: string) => {
    const res = await fetch('/api/patients/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to add patient');
    }
    const data = await res.json();
    setQueueState(data.state);
  };

  const handleCallNext = async () => {
    const res = await fetch('/api/queue/next', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to call next patient');
    const data = await res.json();
    setQueueState(data.state);
  };

  const handleCompleteSession = async () => {
    const res = await fetch('/api/queue/complete', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to update session');
    const data = await res.json();
    setQueueState(data.state);
  };

  const handleSkipPatient = async (id: string) => {
    const res = await fetch(`/api/queue/skip/${id}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to skip patient');
    const data = await res.json();
    setQueueState(data.state);
  };

  const handleRequeue = async (id: string) => {
    const res = await fetch(`/api/queue/requeue/${id}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to restore patient');
    const data = await res.json();
    setQueueState(data.state);
  };

  const handleUpdateSettings = async (settingsPayload: Partial<QueueState['settings']>) => {
    const res = await fetch('/api/queue/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload),
    });
    if (!res.ok) throw new Error('Failed to change clinic settings');
    const data = await res.json();
    setQueueState(data.state);
  };

  const handleUndo = async () => {
    const res = await fetch('/api/queue/undo', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'No actions left to undo.');
      return;
    }
    const data = await res.json();
    setQueueState(data.state);
  };

  const handleClearQueue = async () => {
    const res = await fetch('/api/queue/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset queue');
    const data = await res.json();
    setQueueState(data.state);
  };

  if (!queueState) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center text-slate-300">
        <div className="h-12 w-12 rounded-full border-4 border-t-emerald-500 border-slate-705 border-slate-700 animate-spin mb-4" />
        <h3 className="text-xl font-bold text-white">Warming Up Queue Cure &apos;26</h3>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Please wait while the full-stack server establishes database states and registers the WebSocket channel...
        </p>
        {errorLog && (
          <span className="mt-4 inline-block bg-rose-900/30 border border-rose-800 text-rose-300 px-3 py-1.5 rounded-lg text-xs font-mono">
            {errorLog}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans select-none antialiased" id="clinic-viewport">
      {/* Upper Navigation and Synchronization Status indicators */}
      <nav className="bg-slate-900 text-white border-b border-slate-800 select-none shrink-0" id="top-nav-bar">
        <div className="max-w-[1700px] mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo Brand Brand */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-white shadow-md shadow-teal-500/20">
              Q
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm uppercase tracking-wider text-slate-100">Queue Cure &apos;26</span>
                <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.2 rounded font-black tracking-normal">LIVE SYNC</span>
              </div>
              <p className="text-[10px] text-slate-400">Clinic Queue & Wait Optimization Console</p>
            </div>
          </div>

          {/* Quick instructions / tips */}
          <div className="hidden xl:flex items-center gap-2 text-xs bg-slate-950/45 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-350">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span><strong>Tip:</strong> Try launching role screens in custom device tabs layout to preview true WebSocket performance!</span>
          </div>

          {/* Controller selectors */}
          <div className="flex items-center gap-3.5 flex-wrap justify-center font-semibold">
            {/* View selectors */}
            <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-xs text-slate-300" id="cockpit-selectors">
              <button
                onClick={() => setViewMode('cockpit')}
                className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg transition-all ${
                  viewMode === 'cockpit'
                    ? 'bg-slate-800 text-white font-bold'
                    : 'hover:text-slate-100'
                }`}
                title="Superb dual-view cockpit. Best way to see receptionist operations immediately sync room displays!"
              >
                <Columns className="h-3.5 w-3.5 text-teal-400" />
                <span>Dual Cockpit</span>
              </button>

              <button
                onClick={() => setViewMode('receptionist')}
                className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg transition-all ${
                  viewMode === 'receptionist'
                    ? 'bg-slate-800 text-white font-bold'
                    : 'hover:text-slate-100'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Receptionist View</span>
              </button>

              <button
                onClick={() => setViewMode('waiting-room')}
                className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer rounded-lg transition-all ${
                  viewMode === 'waiting-room'
                    ? 'bg-slate-800 text-white font-bold'
                    : 'hover:text-slate-100'
                }`}
              >
                <Tv className="h-3.5 w-3.5" />
                <span>Waiting Room TV</span>
              </button>
            </div>

            {/* Connection state */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
              {isConnected ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-slate-300 font-mono">WS Connected (3000)</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-rose-400 animate-bounce" />
                  <span className="text-[10px] text-slate-300 font-mono">WS Offline (Polling)</span>
                </>
              )}
            </div>
          </div>

        </div>
      </nav>

      {voiceHintBanner && (
        <div className="bg-emerald-50 border-b border-emerald-100 p-2 text-center text-xs text-emerald-800 flex items-center justify-center gap-2 select-none" id="voice-banner">
          <Smartphone className="h-3.5 w-3.5 text-emerald-600 animate-bounce" />
          <span>
            <strong>Testing Sync?</strong> Open multiple browser tabs with different roles to see true WS speed:
            <a href="?role=receptionist" target="_blank" rel="noopener noreferrer" className="mx-1 px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-emerald-700 hover:bg-emerald-100 transition-all font-bold">Open Receptionist ↗</a> or 
            <a href="?role=waiting-room" target="_blank" rel="noopener noreferrer" className="ml-1 px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-emerald-700 hover:bg-emerald-100 transition-all font-bold">Open TV Room ↗</a>
          </span>
          <button onClick={() => setVoiceHintBanner(false)} className="ml-4 font-bold cursor-pointer hover:text-emerald-900 border border-emerald-300 px-1 rounded bg-white text-[10px]">✕ Hide</button>
        </div>
      )}

      {/* Main viewport frame */}
      <div className="flex-1 min-h-0 bg-slate-100">
        {viewMode === 'cockpit' && (
          <div className="h-full grid grid-cols-1 xl:grid-cols-2 max-w-[1770px] mx-auto min-h-0 overflow-hidden divide-y xl:divide-y-0 xl:divide-x divide-slate-200" id="cockpit-container">
            {/* Left Screen: Receptionist Terminal */}
            <div className="h-full overflow-y-auto">
              <ReceptionistScreen
                state={queueState}
                onAddPatient={handleAddPatient}
                onCallNext={handleCallNext}
                onCompleteSession={handleCompleteSession}
                onSkipPatient={handleSkipPatient}
                onRequeue={handleRequeue}
                onUpdateSettings={handleUpdateSettings}
                onUndo={handleUndo}
                onClearQueue={handleClearQueue}
              />
            </div>

            {/* Right Screen: Patient Waiting Room TV */}
            <div className="h-full overflow-y-auto">
              <WaitingRoomScreen
                state={queueState}
              />
            </div>
          </div>
        )}

        {viewMode === 'receptionist' && (
          <div className="h-full max-w-7xl mx-auto">
            <ReceptionistScreen
              state={queueState}
              onAddPatient={handleAddPatient}
              onCallNext={handleCallNext}
              onCompleteSession={handleCompleteSession}
              onSkipPatient={handleSkipPatient}
              onRequeue={handleRequeue}
              onUpdateSettings={handleUpdateSettings}
              onUndo={handleUndo}
              onClearQueue={handleClearQueue}
            />
          </div>
        )}

        {viewMode === 'waiting-room' && (
          <div className="h-full max-w-7xl mx-auto">
            <WaitingRoomScreen
              state={queueState}
            />
          </div>
        )}
      </div>

      {/* Footer system details */}
      <footer className="bg-slate-900 text-slate-400 py-3 block shrink-0 text-center text-xs font-mono border-t border-slate-805 border-slate-800" id="footer-frame">
        <p className="flex justify-center items-center gap-1">
          <span>Queue Cure &apos;26 Software Terminal • Powered by full-stack Node.js Event Loop</span>
          <span className="text-slate-550 shrink-0 text-slate-500">•</span>
          <span className="text-teal-400">Port: 3000 Dedicated Protocol</span>
        </p>
      </footer>
    </div>
  );
}
