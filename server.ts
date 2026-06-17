import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { Patient, ClinicSettings, LiveStats, QueueState, SocketMessage } from './src/types.js';

// Setup state
let patients: Patient[] = [];
let settings: ClinicSettings = {
  avgConsultTime: 10,
  doctorName: 'Dr. Piyush Patil',
  clinicName: 'Patil Family Care Clinic',
  isDoctorAvailable: true,
};

// Seed helper to populate initial state with realistic, relative times
function seedInitialData() {
  const now = new Date();
  
  // Completed Patients
  patients.push({
    id: 'p-1',
    tokenNumber: 1,
    name: 'Aarav Sharma',
    phone: '9876543210',
    status: 'completed',
    addedAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
    calledAt: new Date(now.getTime() - 85 * 60 * 1000).toISOString(),
    completedAt: new Date(now.getTime() - 75 * 60 * 1000).toISOString(), // 10 min consult
  });

  patients.push({
    id: 'p-2',
    tokenNumber: 2,
    name: 'Ishaan Verma',
    phone: '9123456789',
    status: 'completed',
    addedAt: new Date(now.getTime() - 80 * 60 * 1000).toISOString(),
    calledAt: new Date(now.getTime() - 75 * 60 * 1000).toISOString(),
    completedAt: new Date(now.getTime() - 67 * 60 * 1000).toISOString(), // 8 min consult
  });

  patients.push({
    id: 'p-3',
    tokenNumber: 3,
    name: 'Diya Patel',
    phone: '9988776655',
    status: 'completed',
    addedAt: new Date(now.getTime() - 70 * 60 * 1000).toISOString(),
    calledAt: new Date(now.getTime() - 67 * 60 * 1000).toISOString(),
    completedAt: new Date(now.getTime() - 55 * 60 * 1000).toISOString(), // 12 min consult
  });

  patients.push({
    id: 'p-4',
    tokenNumber: 4,
    name: 'Saanvi Iyer',
    phone: '9888777666',
    status: 'completed',
    addedAt: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
    calledAt: new Date(now.getTime() - 55 * 60 * 1000).toISOString(),
    completedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(), // 10 min consult
  });

  // Current Active Patient (entered consultation 5 minutes ago)
  patients.push({
    id: 'p-5',
    tokenNumber: 5,
    name: 'Rajesh Kumar',
    phone: '9777666555',
    status: 'active',
    addedAt: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
    calledAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
  });

  // Waiting Patients
  patients.push({
    id: 'p-6',
    tokenNumber: 6,
    name: 'Priya Nair',
    phone: '9555444333',
    status: 'waiting',
    addedAt: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
  });

  patients.push({
    id: 'p-7',
    tokenNumber: 7,
    name: 'Amit Gupta',
    phone: '9444333222',
    status: 'waiting',
    addedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
  });

  patients.push({
    id: 'p-8',
    tokenNumber: 8,
    name: 'Sneha Rao',
    phone: '9333222111',
    status: 'waiting',
    addedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
  });
}

// Seed on startup
seedInitialData();

// Stats calculation helper
function calculateStats(): LiveStats {
  const completed = patients.filter(p => p.status === 'completed');
  const active = patients.find(p => p.status === 'active');
  const waiting = patients.filter(p => p.status === 'waiting');

  let totalDurationSeconds = 0;
  let countWithDuration = 0;

  completed.forEach(p => {
    if (p.calledAt && p.completedAt) {
      const duration = (new Date(p.completedAt).getTime() - new Date(p.calledAt).getTime()) / 1000;
      if (duration > 0) {
        totalDurationSeconds += duration;
        countWithDuration++;
      }
    }
  });

  const averageCompletedDuration = countWithDuration > 0 ? Math.round(totalDurationSeconds / countWithDuration) : 600; // default 10 mins in seconds

  return {
    activeToken: active ? active.tokenNumber : 0,
    totalTokensToday: patients.length,
    completedCount: completed.length,
    waitingCount: waiting.length,
    averageCompletedDuration,
  };
}

// Full state package helper
function getFullQueueState(): QueueState {
  return {
    patients,
    settings,
    stats: calculateStats(),
  };
}

// We also store transaction/audit history for Receptionist Undo capability
let historyStack: string[] = [];
function pushHistory() {
  historyStack.push(JSON.stringify({ patients, settings }));
  if (historyStack.length > 20) {
    historyStack.shift();
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Create clean HTTP server to run WS and Express side-by-side
  const server = http.createServer(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ server });

  // Connected clients tracker
  const clients = new Set<WebSocket>();

  // WebSocket broker
  function broadcast(msg: SocketMessage) {
    const data = JSON.stringify(msg);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  wss.on('connection', ws => {
    clients.add(ws);
    
    // Send initial sync payload
    ws.send(JSON.stringify({
      type: 'STATE_INITIAL',
      payload: getFullQueueState(),
    }));

    ws.on('close', () => {
      clients.delete(ws);
    });

    // Accept receptionist action requests over WebSocket as well!
    ws.on('message', message => {
      try {
        const data = JSON.parse(message.toString());
        // Simple authentication or role parsing if we wanted, but we keep it open and trust-based for simplicity
        if (data.type === 'REFRESH_REQUEST') {
          ws.send(JSON.stringify({
            type: 'STATE_UPDATE',
            payload: getFullQueueState(),
          }));
        }
      } catch (err) {
        console.error('WS Message handle error:', err);
      }
    });
  });

  // REST API Endpoints
  app.get('/api/queue', (req, res) => {
    res.json(getFullQueueState());
  });

  // Add Patient
  app.post('/api/patients/add', (req, res) => {
    try {
      const { name, phone } = req.body;
      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Patient name is required' });
      }

      pushHistory();

      const nextTokenNumber = patients.length > 0 ? Math.max(...patients.map(p => p.tokenNumber)) + 1 : 1;
      const newPatient: Patient = {
        id: `p-${Date.now()}`,
        tokenNumber: nextTokenNumber,
        name: name.trim(),
        phone: phone ? phone.trim() : '',
        status: 'waiting',
        addedAt: new Date().toISOString(),
      };

      patients.push(newPatient);

      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });
      res.json({ success: true, patient: newPatient, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Call Next Patient
  app.post('/api/queue/next', (req, res) => {
    try {
      pushHistory();

      const activePatient = patients.find(p => p.status === 'active');
      const now = new Date().toISOString();

      // 1. Auto-complete the currently active Patient if one exists
      if (activePatient) {
        activePatient.status = 'completed';
        activePatient.completedAt = now;
      }

      // 2. Find next patient in waiting list (lowest token number)
      const waitingPatients = patients
        .filter(p => p.status === 'waiting')
        .sort((a, b) => a.tokenNumber - b.tokenNumber);

      let nextPatient: Patient | null = null;
      if (waitingPatients.length > 0) {
        nextPatient = waitingPatients[0];
        nextPatient.status = 'active';
        nextPatient.calledAt = now;
      }

      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });

      if (nextPatient) {
        broadcast({
          type: 'PATIENT_CALLED_ALERT',
          payload: {
            tokenNumber: nextPatient.tokenNumber,
            patientName: nextPatient.name,
          },
        });
      }

      res.json({ success: true, calledPatient: nextPatient, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Complete consultation of active patient manually
  app.post('/api/queue/complete', (req, res) => {
    try {
      pushHistory();
      const activePatient = patients.find(p => p.status === 'active');
      if (activePatient) {
        activePatient.status = 'completed';
        activePatient.completedAt = new Date().toISOString();
      }

      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });
      res.json({ success: true, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Skip a specific patient (e.g. if they did not turn up)
  app.post('/api/queue/skip/:id', (req, res) => {
    try {
      const { id } = req.params;
      pushHistory();

      const patient = patients.find(p => p.id === id);
      if (patient) {
        patient.status = 'skipped';
        // Treat as inactive/resolved
      }

      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });
      res.json({ success: true, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Restore/re-queue a skipped or completed patient back to waiting list
  app.post('/api/queue/requeue/:id', (req, res) => {
    try {
      const { id } = req.params;
      pushHistory();

      const patient = patients.find(p => p.id === id);
      if (patient) {
        patient.status = 'waiting';
        delete patient.calledAt;
        delete patient.completedAt;
      }

      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });
      res.json({ success: true, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update Settings
  app.post('/api/queue/settings', (req, res) => {
    try {
      const { avgConsultTime, doctorName, clinicName, isDoctorAvailable } = req.body;
      pushHistory();

      if (avgConsultTime !== undefined) settings.avgConsultTime = Number(avgConsultTime);
      if (doctorName !== undefined) settings.doctorName = doctorName;
      if (clinicName !== undefined) settings.clinicName = clinicName;
      if (isDoctorAvailable !== undefined) settings.isDoctorAvailable = !!isDoctorAvailable;

      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });
      res.json({ success: true, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Mistake proofing: Undo Last Action!
  app.post('/api/queue/undo', (req, res) => {
    try {
      if (historyStack.length === 0) {
        return res.status(400).json({ error: 'Nothing to undo' });
      }

      const previous = JSON.parse(historyStack.pop()!);
      patients = previous.patients;
      settings = previous.settings;

      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });
      res.json({ success: true, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reset entire clinic queue for a fresh start
  app.post('/api/queue/clear', (req, res) => {
    try {
      pushHistory();
      patients = [];
      const updatedState = getFullQueueState();
      broadcast({ type: 'STATE_UPDATE', payload: updatedState });
      res.json({ success: true, state: updatedState });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite Integration & SPA asset delivery
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Queue Cure '26 Server booting on http://localhost:${PORT}`);
  });
}

startServer();
