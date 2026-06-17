import { useState, useRef, FormEvent } from 'react';
import { QueueState, Patient } from '../types';
import { 
  UserPlus, Play, CheckCircle, RotateCcw, Settings, Trash, 
  UserCheck, AlertTriangle, ShieldCheck, HeartPulse, Sparkles, Phone, Undo, Users
} from 'lucide-react';

interface ReceptionistScreenProps {
  state: QueueState;
  onAddPatient: (name: string, phone: string) => Promise<void>;
  onCallNext: () => Promise<void>;
  onCompleteSession: () => Promise<void>;
  onSkipPatient: (id: string) => Promise<void>;
  onRequeue: (id: string) => Promise<void>;
  onUpdateSettings: (settings: Partial<QueueState['settings']>) => Promise<void>;
  onUndo: () => Promise<void>;
  onClearQueue: () => Promise<void>;
}

export default function ReceptionistScreen(props: ReceptionistScreenProps) {
  const { 
    state, onAddPatient, onCallNext, onCompleteSession, 
    onSkipPatient, onRequeue, onUpdateSettings, onUndo, onClearQueue 
  } = props;
  
  const { patients, settings, stats } = state;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Local settings controllers
  const [avgConsult, setAvgConsult] = useState(settings.avgConsultTime);
  const [docName, setDocName] = useState(settings.doctorName);
  const [clinicName, setClinicName] = useState(settings.clinicName);
  const [showConfig, setShowConfig] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleAddPatientSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Patient name is required');
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await onAddPatient(name, phone);
      setName('');
      setPhone('');
      nameInputRef.current?.focus(); // maintain fast workflow
    } catch (err: any) {
      setFormError(err.message || 'Failed to add patient');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await onUpdateSettings({
        avgConsultTime: Number(avgConsult),
        doctorName: docName,
        clinicName: clinicName,
      });
      setShowConfig(false);
    } catch (err) {
      alert('Failed to update config');
    }
  };

  const toggleDoctorAvailability = async () => {
    try {
      await onUpdateSettings({
        isDoctorAvailable: !settings.isDoctorAvailable,
      });
    } catch (err) {
      alert('Failed to toggle doctor status');
    }
  };

  const handleClearConfirm = async () => {
    if (window.confirm('WARNING: Are you sure you want to completely wipe the patient queue today? This action cannot be reversed (unless you click dynamic Undo immediately).')) {
      await onClearQueue();
    }
  };

  const activePatient = patients.find(p => p.status === 'active');
  const waitingPatients = patients
    .filter(p => p.status === 'waiting')
    .sort((a, b) => a.tokenNumber - b.tokenNumber);
  const completedPatients = patients
    .filter(p => p.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  const skippedPatients = patients
    .filter(p => p.status === 'skipped');

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans overflow-y-auto" id="receptionist-screen">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-teal-800 to-emerald-700 text-white px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-teal-900 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-900/40 rounded-xl border border-teal-500/20">
            <ShieldCheck className="h-6 w-6 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{settings.clinicName}</h2>
            <p className="text-xs text-teal-200">
              Logged in: Nurse/Receptionist Desk • Managing <strong>{settings.doctorName}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Quick Undo Terminal */}
          <button
            onClick={onUndo}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-950/40 text-teal-200 border border-teal-600/30 hover:border-teal-400 hover:text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all shadow-sm"
            title="Instant Mistake-Proofing: Undo your last queue action!"
            id="receptionist-undo border"
          >
            <Undo className="h-3.5 w-3.5 text-emerald-400" />
            Undo Last
          </button>

          {/* Quick Doctor Emergency toggle */}
          <button
            onClick={toggleDoctorAvailability}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-sm border ${
              settings.isDoctorAvailable
                ? 'bg-teal-900/30 text-teal-300 border-teal-600/35 hover:bg-teal-900/50'
                : 'bg-rose-600 text-white border-rose-700 hover:bg-rose-500'
            }`}
            id="doctor-status-toggle"
          >
            <HeartPulse className={`h-3.5 w-3.5 ${!settings.isDoctorAvailable ? 'animate-pulse' : ''}`} />
            {settings.isDoctorAvailable ? 'Doctor Active' : 'Doctor: Away on Break'}
          </button>

          {/* Settings gear toggle */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-2 rounded-lg border cursor-pointer hover:bg-slate-100 transition-all ${
              showConfig 
                ? 'bg-teal-50 text-teal-900 border-teal-200' 
                : 'bg-teal-900 border-teal-700 hover:bg-teal-800 text-white'
            }`}
            id="settings-toggle"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Settings Modal (Inline edit panel) */}
      {showConfig && (
        <div className="bg-teal-50 border-b border-teal-100 p-5 shadow-inner" id="settings-panel">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-sm font-bold text-teal-950 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-teal-700" />
              Configure Clinic & Doctor Settings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Clinic Name</label>
                <input
                  type="text"
                  value={clinicName}
                  onChange={e => setClinicName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Doctor Name</label>
                <input
                  type="text"
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Manual Average Consultation (Mins)</label>
                <input
                  type="number"
                  value={avgConsult}
                  onChange={e => setAvgConsult(Number(e.target.value))}
                  min="1"
                  max="60"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-teal-700 shadow-sm transition-all animate-none"
                id="save-settings-btn"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 flex-1 bg-slate-50">
        
        {/* Left Column: Register Patient & Quick Controls */}
        <div className="space-y-6">
          {/* Quick Action Dashboard Console */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Sparkles className="h-3.5 w-3.5 text-teal-600" />
              Primary Queue Controllers
            </h3>

            {/* BIG ACTION: CALL NEXT PATIENT */}
            <button
              onClick={onCallNext}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white py-4 px-5 rounded-2xl font-bold text-base flex flex-col items-center justify-center gap-1 shadow-lg cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all hover:shadow-teal-150/55"
              title="Next token moves inside. Current active is automatically marked as Completed"
              id="call-next-btn"
            >
              <div className="flex items-center gap-2 text-lg">
                <Play className="h-5 w-5 fill-current" />
                Call Next Patient (Token #{waitingPatients[0]?.tokenNumber || '--'})
              </div>
              <span className="text-[10px] font-normal text-teal-100 opacity-90 mt-0.5">
                Automatically saves previous & alerts waitlist
              </span>
            </button>

            {/* SECONDARY CONTROLS */}
            <div className="grid grid-cols-2 gap-2.5 mt-3">
              <button
                onClick={onCompleteSession}
                disabled={!activePatient}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-800 disabled:opacity-45 disabled:hover:bg-teal-50 rounded-xl text-xs font-bold cursor-pointer transition-all"
                title="Only complete the current patient's consultation without triggering the next patient"
                id="complete-consultation-btn"
              >
                <CheckCircle className="h-4 w-4 text-teal-600" />
                Complete Current
              </button>
              <button
                onClick={handleClearConfirm}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
                title="Wipe the queue state entirely"
                id="clear-queue-btn"
              >
                <Trash className="h-4 w-4 text-rose-500" />
                Reset Day
              </button>
            </div>
          </div>

          {/* ADD PATIENT FORM */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" id="add-patient-box">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3.5 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <UserPlus className="h-4 w-4 text-teal-600" />
              Register Patient / Walk-In
            </h3>

            <form onSubmit={handleAddPatientSubmit} className="space-y-3.5">
              {formError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 px-3.5 py-2 rounded-lg text-xs flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label htmlFor="patient-name" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="patient-name"
                  ref={nameInputRef}
                  type="text"
                  placeholder="e.g. Anand Mahindra"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-350 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800"
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="patient-phone" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Phone Number (SMS Alert Simulation)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="patient-phone"
                    type="tel"
                    placeholder="10 digit mobile number"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-350 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800"
                    disabled={isSubmitting}
                    autoComplete="off"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-slate-850 hover:bg-slate-850 text-white font-bold py-2.5 rounded-xl cursor-pointer text-xs transform active:scale-[0.98] transition-all flex items-center justify-center gap-1 bg-slate-900 border border-slate-950"
              >
                <UserCheck className="h-4 w-4" />
                {isSubmitting ? 'Registering...' : 'Add Walk-in (Assign Token)'}
              </button>
            </form>
          </div>
        </div>

        {/* Center Column: Waiting Queue (Mistake Proof list) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col max-h-[550px] lg:max-h-none">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-850 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-600" />
              Waiting Lobby
            </h3>
            <span className="bg-teal-550 bg-teal-600 text-white font-mono text-xs px-2 py-0.5 rounded-full" id="waiting-lobby-count">
              {waitingPatients.length} Waiting
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 space-y-2.5 pr-0.5" id="waiting-list-reception">
            {waitingPatients.length > 0 ? (
              waitingPatients.map((patient, index) => (
                <div
                  key={patient.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between group transition-all duration-200 ${
                    index === 0
                      ? 'bg-teal-50/60 border-teal-200'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex flex-col items-center justify-center font-mono border ${
                      index === 0
                        ? 'bg-teal-600 border-teal-700 text-white font-bold'
                        : 'bg-slate-200 border-slate-300 text-slate-700'
                    }`}>
                      <span className="text-[10px] font-black">{patient.tokenNumber}</span>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{patient.name}</h4>
                      {patient.phone ? (
                        <p className="text-[10px] text-slate-500 font-mono flex items-center gap-0.5 mt-0.5">
                          <Phone className="h-3 w-3 inline text-slate-400" /> {patient.phone}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic mt-0.5 font-mono">No contact registered</p>
                      )}
                    </div>
                  </div>

                  {/* Mistake proof tools (Skipping) */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onSkipPatient(patient.id)}
                      className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-lg text-[10px] font-bold border border-slate-250 cursor-pointer transition-all"
                      title="Skip patient if absent. Patient will move to skipped log ready to be restored."
                      id={`skip-btn-${patient.id}`}
                    >
                      Skip (Absent)
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Users className="h-10 w-10 opacity-30 mb-2 animate-pulse" />
                <p className="text-sm font-medium">Lobby is empty</p>
                <p className="text-xs text-center mt-0.5 max-w-[200px]">
                  Use the walk-in form on the left to add fresh consultations.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Other logs (Current Session + completed list + skipped list) */}
        <div className="space-y-6">
          
          {/* CURRENT ACTIVE CONSULTATION */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" id="active-consultation-panel">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3.5 flex items-center gap-1.5 border-b border-teal-50 pb-2">
              <UserCheck className="h-4 w-4 text-emerald-600 animate-pulse" />
              Inside Examination Room
            </h3>

            {activePatient ? (
              <div className="bg-emerald-50/45 border border-emerald-200 rounded-2xl p-4 relative overflow-hidden">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-full bg-emerald-600 text-white font-mono font-black text-lg flex flex-col items-center justify-center border border-emerald-700 shrink-0 shadow-sm animate-pulse">
                    {activePatient.tokenNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest leading-none">Treating Active</p>
                    <h4 className="font-extrabold text-slate-900 text-base mt-1 truncate">{activePatient.name}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                      Entered at: {new Date(activePatient.calledAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-emerald-200/50">
                  <button
                    onClick={onCompleteSession}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-3 rounded-lg text-xs font-extrabold cursor-pointer text-center shadow-md transition-all flex items-center justify-center gap-1"
                    id="active-complete-btn"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Complete Consult
                  </button>
                  <button
                    onClick={() => onSkipPatient(activePatient.id)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                    id="active-skip-btn"
                  >
                    Skip
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-400 text-xs">
                Dr. Patil is currently waiting for patients. Click &quot;Call Next Patient&quot; above to begin.
              </div>
            )}
          </div>

          {/* ABSENT / SKIPPED MISTAKE PROOF RESTORE BOARD */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" id="skipped-board">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5 border-b border-rose-50 pb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Sidetracked / Absent Patients ({skippedPatients.length})
            </h3>

            {skippedPatients.length > 0 ? (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {skippedPatients.map(patient => (
                  <div key={patient.id} className="p-2.5 bg-amber-50/15 border border-amber-200/50 rounded-xl flex items-center justify-between text-xs transition-all">
                    <div>
                      <h4 className="font-bold text-slate-800">Token #{patient.tokenNumber} — {patient.name}</h4>
                      <p className="text-[9px] text-slate-450 text-slate-500 font-mono mt-0.5">Marked absent earlier</p>
                    </div>
                    <button
                      onClick={() => onRequeue(patient.id)}
                      className="px-2.5 py-1 bg-teal-50 hover:bg-teal-105 border border-teal-200 text-teal-700 hover:bg-teal-100 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all"
                      title="Reinstate this patient directly back to waiting list queue"
                      id={`requeue-btn-${patient.id}`}
                    >
                      Re-queue
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-[11px] text-center italic py-3">No skipped or absent patients recorded.</p>
            )}
          </div>

          {/* HISTORIC COMPLETED LOG */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" id="completed-board">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5 border-b border-teal-50 pb-2">
              <CheckCircle className="h-4 w-4 text-teal-600" />
              Completed Consultations ({completedPatients.length})
            </h3>

            {completedPatients.length > 0 ? (
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {completedPatients.map(patient => {
                  let durationMin = 0;
                  if (patient.calledAt && patient.completedAt) {
                    durationMin = Math.round((new Date(patient.completedAt).getTime() - new Date(patient.calledAt).getTime()) / 60000);
                  }
                  return (
                    <div key={patient.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <h4 className="font-bold text-slate-700">Token #{patient.tokenNumber} — {patient.name}</h4>
                        <p className="text-[9px] text-slate-500 font-mono mt-0.5">Session: {durationMin ? `${durationMin} mins` : '< 1 min'}</p>
                      </div>
                      <button
                        onClick={() => onRequeue(patient.id)}
                        className="p-1 px-1.5 hover:bg-slate-200 text-slate-500 rounded-md text-[9px] font-bold border border-slate-150 cursor-pointer"
                        title="Deselect completion or requeue back into lobby"
                      >
                        Re-queue
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400 text-[11px] text-center italic py-3">No sessions completed yet.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
