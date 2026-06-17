export interface Patient {
  id: string;
  tokenNumber: number;
  name: string;
  phone: string;
  status: 'waiting' | 'active' | 'completed' | 'skipped';
  addedAt: string; // ISO string
  calledAt?: string; // ISO string
  completedAt?: string; // ISO string
}

export interface ClinicSettings {
  avgConsultTime: number; // in minutes (manual setting)
  doctorName: string;
  clinicName: string;
  isDoctorAvailable: boolean;
}

export interface LiveStats {
  activeToken: number;
  totalTokensToday: number;
  completedCount: number;
  waitingCount: number;
  averageCompletedDuration: number; // in seconds (computed from actual completed patients)
}

export interface QueueState {
  patients: Patient[];
  settings: ClinicSettings;
  stats: LiveStats;
}

export type SocketMessage =
  | { type: 'STATE_INITIAL'; payload: QueueState }
  | { type: 'STATE_UPDATE'; payload: QueueState }
  | { type: 'PATIENT_CALLED_ALERT'; payload: { tokenNumber: number; patientName: string } };
