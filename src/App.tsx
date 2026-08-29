/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense, memo, useMemo, useCallback } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  useNavigate,
  useParams
} from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  query, 
  addDoc, 
  updateDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  deleteDoc,
  where,
  writeBatch,
  deleteField,
  limit
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  onAuthStateChanged,
  signInAnonymously
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Shield, 
  Lock, 
  Clock, 
  AlertTriangle, 
  LogOut, 
  Plus, 
  ExternalLink, 
  Copy, 
  CheckCircle2,
  Monitor,
  Trash2,
  Calendar,
  User,
  Key,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Info,
  Edit,
  Search,
  X,
  Download,
  Smartphone,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  Link,
  Power,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// --- Types ---

interface Group {
  id: string;
  name: string;
  rules?: string;
  createdAt: string;
  isActive?: boolean;
}

interface Exam {
  id: string;
  title: string;
  url: string;
  startTime: string;
  endTime: string;
  duration?: number;
  accessCode: string;
  exitCode?: string;
  info?: string;
  rules?: string;
  freezeDuration?: number;
  isActive?: boolean;
  groupId?: string;
  createdAt: string;
}

interface ExamSession {
  id: string;
  examId: string;
  studentName: string;
  studentClass: string;
  studentAbsen: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'finished';
  lastActive: string;
}

interface CheatLog {
  id: string;
  examId: string;
  studentName: string;
  type: string;
  details: string;
  timestamp: string;
}

// --- Components ---

const Navbar = ({ isAdmin, onLogout }: { isAdmin: boolean, onLogout: () => void }) => {
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 p-1.5 rounded-xl shadow-lg shadow-indigo-100">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-lg tracking-tighter text-gray-900 leading-none">ExamGuard</span>
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest leading-none mt-1">SPENDAPOL</span>
        </div>
      </div>
      
      {isAdmin && (
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">Administrator</p>
            <p className="text-xs text-green-600 font-bold">Mode Panel Aktif</p>
          </div>
          <button 
            onClick={onLogout}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
            title="Keluar Panel"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      )}
    </nav>
  );
};

const ADMIN_EMAILS = ['ujianspendapol@gmail.com', 'sulaimanwahyu@gmail.com'];
const ADMIN_ACCESS_CODE = 'SPENDAPOL2024'; // Kode akses admin untuk mengubah data

// --- Admin Login ---

const AdminLogin = ({ onLogin }: { onLogin: () => void }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin123') {
      localStorage.setItem('admin_token', 'secure_session_active');
      localStorage.setItem('admin_access_type', 'password'); // Mode baca saja
      try {
        await signInAnonymously(auth);
        onLogin();
      } catch (err: any) {
        console.error("Firebase Anonymous Login failed:", err);
        onLogin();
      }
    } else if (password === ADMIN_ACCESS_CODE) {
      localStorage.setItem('admin_token', 'secure_session_active');
      localStorage.setItem('admin_access_type', 'code'); // Mode penuh
      try {
        await signInAnonymously(auth);
        onLogin();
      } catch (err: any) {
        console.error("Firebase Anonymous Login failed:", err);
        onLogin();
      }
    } else {
      setError('Kata sandi atau Kode Akses salah!');
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user.email && ADMIN_EMAILS.includes(result.user.email)) {
        localStorage.setItem('admin_token', 'secure_session_active');
        localStorage.setItem('admin_access_type', 'google');
        onLogin();
      } else {
        await signOut(auth);
        setError('Email ini tidak terdaftar sebagai administrator.');
      }
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain') {
        setError(`Domain belum terdaftar di Firebase. Tambahkan domain ini di Firebase Console: ${window.location.hostname}`);
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Login dibatalkan karena jendela login ditutup. Silakan coba lagi.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError('Permintaan login dibatalkan. Silakan coba lagi.');
      } else {
        setError('Gagal masuk dengan Google: ' + err.message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-gray-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100"
      >
        <div className="text-center mb-8">
          <div className="inline-block bg-indigo-100 p-4 rounded-full mb-4">
            <Key className="text-indigo-600 w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Panel Admin</h1>
          <p className="text-gray-500 mt-2">Masuk untuk mengelola ujian</p>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="w-full py-3 bg-white border-2 border-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-3 shadow-sm"
          >
            <img src="https://www.gstatic.com/firebase/anonymous-scan.png" className="w-5 h-5 opacity-0" alt="" /> {/* Spacer */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Masuk dengan Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400 font-bold">Atau gunakan kata sandi</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Kata Sandi"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}
            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              Masuk ke Panel
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

// --- Admin Dashboard ---

const ParticipantRow = memo(({ session, exam, violations, groups }: { session: ExamSession, exam?: Exam, violations: CheatLog[], groups: Group[] }) => {
  return (
    <tr className="hover:bg-gray-50 transition-all">
      <td className="px-6 py-4">
        <p className="font-bold text-gray-900">{session.studentName}</p>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-[10px] font-bold">KELAS: {session.studentClass}</span>
          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-[10px] font-bold">ABSEN: {session.studentAbsen}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-gray-600">
        <div className="flex flex-col">
          <span className="font-medium">{exam?.title || 'Ujian Terhapus'}</span>
          {exam?.groupId && (
            <span className="text-[10px] text-indigo-400 font-bold uppercase">
              {groups.find(g => g.id === exam.groupId)?.name}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${session.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {session.status === 'active' ? 'Sedang Mengerjakan' : 'Selesai'}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className={`font-bold ${violations.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {violations.length}
          </span>
          {violations.length > 0 && (
            <div className="group relative">
              <AlertTriangle className="w-4 h-4 text-red-500 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-[10px] p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-xl">
                <p className="font-bold mb-1 border-b border-white/20 pb-1">Detail Pelanggaran:</p>
                <ul className="space-y-1">
                  {violations.map((v, i) => (
                    <li key={i}>• {v.type}: {format(parseISO(v.timestamp), 'HH:mm:ss')}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-xs text-gray-500">
        <div className="flex flex-col">
          <span>{format(parseISO(session.startTime), 'HH:mm')} {session.endTime && ` - ${format(parseISO(session.endTime), 'HH:mm')}`}</span>
          {session.status === 'active' && (
            <span className="text-[10px] text-indigo-400 mt-1">
              Aktif terakhir: {format(parseISO(session.lastActive), 'HH:mm:ss')}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
});

const AdminDashboard = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [cheatLogs, setCheatLogs] = useState<CheatLog[]>([]);
  const [activeTab, setActiveTab] = useState<'exams' | 'groups' | 'participants'>('exams');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newExam, setNewExam] = useState({
    title: '',
    url: '',
    startTime: '',
    endTime: '',
    duration: 60,
    accessCode: '',
    exitCode: '',
    info: '',
    rules: '',
    freezeDuration: 15,
    isActive: true,
    groupId: ''
  });
  
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupRules, setNewGroupRules] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState<string | null>(null);
  const [selectedParticipantGroupId, setSelectedParticipantGroupId] = useState<string>('all');
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [examToDelete, setExamToDelete] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  
  const [participantsSearchTerm, setParticipantsSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const hasAttemptedAuth = useRef(false);

  useEffect(() => {
    // Track connection status
    const unsubMetadata = onSnapshot(doc(db, 'metadata', 'status'), { includeMetadataChanges: true }, (doc) => {
      setIsOnline(!doc.metadata.fromCache);
    }, () => {
      window.addEventListener('online', () => setIsOnline(true));
      window.addEventListener('offline', () => setIsOnline(false));
    });

    const checkAuth = async () => {
      if (!auth.currentUser && !hasAttemptedAuth.current) {
        hasAttemptedAuth.current = true;
        try {
          await signInAnonymously(auth);
        } catch (e: any) {
          if (e.code === 'auth/admin-restricted-operation') {
            setAuthError("Anonymous Authentication Disabled");
          }
        }
      }
    };
    checkAuth();

    const qExams = query(collection(db, 'exams'), orderBy('createdAt', 'desc'));
    const unsubExams = onSnapshot(qExams, (snapshot) => {
      setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)));
      setLastUpdated(new Date());
    }, (error) => {
      console.error("Exams listener error:", error);
    });

    const qGroups = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)));
    }, (error) => {
      console.error("Groups listener error:", error);
    });

    let unsubSessions = () => {};
    let unsubLogs = () => {};

    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      const qSessions = query(collection(db, 'exam_sessions'), orderBy('startTime', 'desc'), limit(500));
      unsubSessions = onSnapshot(qSessions, (snapshot) => {
        setSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamSession)));
      }, (error) => {
        if (!error.message.includes('permission-denied')) {
          console.warn("Sessions listener warning:", error);
        }
      });

      const qLogs = query(collection(db, 'cheat_logs'), orderBy('timestamp', 'desc'), limit(500));
      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        setCheatLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheatLog)));
      }, (error) => {
        if (!error.message.includes('permission-denied')) {
          console.warn("Logs listener warning:", error);
        }
      });
    }

    return () => {
      unsubExams();
      unsubGroups();
      unsubSessions();
      unsubLogs();
      unsubMetadata();
    };
  }, [auth.currentUser]);

  const examsMap = useMemo(() => {
    const map = new Map<string, Exam>();
    exams.forEach(e => map.set(e.id, e));
    return map;
  }, [exams]);

  const logsBySession = useMemo(() => {
    const map = new Map<string, CheatLog[]>();
    cheatLogs.forEach(log => {
      const key = `${log.examId}_${log.studentName}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    });
    return map;
  }, [cheatLogs]);

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      const exam = examsMap.get(session.examId);
      const matchesGroup = selectedParticipantGroupId === 'all' || exam?.groupId === selectedParticipantGroupId;
      
      const searchLower = participantsSearchTerm.trim().toLowerCase();
      const matchesSearch = !searchLower || 
                           session.studentName.toLowerCase().includes(searchLower) ||
                           session.studentClass.toLowerCase().includes(searchLower) ||
                           (exam?.title || '').toLowerCase().includes(searchLower);
      
      return matchesGroup && matchesSearch;
    });
  }, [sessions, selectedParticipantGroupId, participantsSearchTerm, examsMap]);

  const totalPages = Math.ceil(filteredSessions.length / itemsPerPage);
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSessions.slice(start, start + itemsPerPage);
  }, [filteredSessions, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedParticipantGroupId, participantsSearchTerm]);

  const optimizeUrl = (url: string) => {
    let cleanUrl = url.trim();
    
    // Extract src from iframe tag if pasted
    if (cleanUrl.startsWith('<iframe')) {
      const srcMatch = cleanUrl.match(/src=["']([^"']+)["']/);
      if (srcMatch && srcMatch[1]) {
        cleanUrl = srcMatch[1];
      }
    }
    
    // Google Forms embed optimize
    if (cleanUrl.includes('docs.google.com/forms') && !cleanUrl.includes('embedded=true')) {
      cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + 'embedded=true';
    }
    
    // Microsoft Forms embed optimize
    if (cleanUrl.includes('forms.office.com') && !cleanUrl.includes('embed=true')) {
      cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + 'embed=true';
    }

    return cleanUrl;
  };

  const checkPermission = () => {
    const isAdminCodeSession = localStorage.getItem('admin_access_type') === 'code';
    if (auth.currentUser?.isAnonymous && !isAdminCodeSession) {
      setNotification({ 
        message: "Akses Terbatas: Silakan masuk dengan Google atau Kode Akses Admin untuk mengubah data.", 
        type: 'error' 
      });
      return false;
    }
    return true;
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkPermission()) return;
    
    const optimizedExam = {
      ...newExam,
      url: optimizeUrl(newExam.url)
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'exams', editingId), optimizedExam);
      } else {
        await addDoc(collection(db, 'exams'), {
          ...optimizedExam,
          createdAt: new Date().toISOString()
        });
      }
      closeModal();
      setNotification({ message: "Ujian berhasil disimpan.", type: 'success' });
    } catch (error) {
      console.error("Error saving exam:", error);
      setNotification({ message: "Gagal menyimpan ujian.", type: 'error' });
    }
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkPermission()) return;
    if (!newGroupName.trim()) return;
    try {
      if (editingGroupId) {
        await updateDoc(doc(db, 'groups', editingGroupId), {
          name: newGroupName,
          rules: newGroupRules
        });
        setEditingGroupId(null);
      } else {
        await addDoc(collection(db, 'groups'), {
          name: newGroupName,
          rules: newGroupRules,
          createdAt: new Date().toISOString(),
          isActive: true
        });
      }
      setNewGroupName('');
      setNewGroupRules('');
      setNotification({ message: "Kelompok berhasil disimpan.", type: 'success' });
    } catch (error) {
      console.error("Error saving group:", error);
      setNotification({ message: "Gagal menyimpan kelompok.", type: 'error' });
    }
  };

  const handleToggleGroupActive = async (group: Group) => {
    if (!checkPermission()) return;
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        isActive: group.isActive === undefined ? false : !group.isActive
      });
    } catch (error) {
      setNotification({ message: "Gagal mengubah status kelompok.", type: 'error' });
    }
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroupId(group.id);
    setNewGroupName(group.name);
    setNewGroupRules(group.rules || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteGroup = async (id: string) => {
    if (!checkPermission()) return;
    try {
      const batch = writeBatch(db);
      const groupExams = exams.filter(e => e.groupId === id);
      groupExams.forEach(exam => {
        batch.update(doc(db, 'exams', exam.id), { groupId: deleteField() });
      });
      batch.delete(doc(db, 'groups', id));
      await batch.commit();
      setIsDeletingGroup(null);
      setNotification({ message: "Kelompok berhasil dihapus.", type: 'success' });
    } catch (error) {
      console.error("Error deleting group:", error);
      setNotification({ message: "Gagal menghapus kelompok.", type: 'error' });
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingId(null);
    setNewExam({ 
      title: '', url: '', startTime: '', endTime: '', duration: 60, accessCode: '', 
      exitCode: '', info: '', rules: '', freezeDuration: 15, isActive: true, groupId: '' 
    });
  };

  const handleEdit = (exam: Exam) => {
    setEditingId(exam.id);
    setNewExam({
      title: exam.title,
      url: exam.url,
      startTime: exam.startTime || '',
      endTime: exam.endTime || '',
      duration: exam.duration || 60,
      accessCode: exam.accessCode || '',
      exitCode: exam.exitCode || '',
      info: exam.info || '',
      rules: exam.rules || '',
      freezeDuration: exam.freezeDuration || 15,
      isActive: exam.isActive !== undefined ? exam.isActive : true,
      groupId: exam.groupId || ''
    });
    setShowAddModal(true);
  };

  const handleToggleActive = async (exam: Exam) => {
    if (!checkPermission()) return;
    try {
      await updateDoc(doc(db, 'exams', exam.id), {
        isActive: !exam.isActive
      });
    } catch (error) {
      setNotification({ message: "Gagal mengubah status ujian.", type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!checkPermission()) return;
    try {
      await deleteDoc(doc(db, 'exams', id));
      setExamToDelete(null);
      setNotification({ message: "Ujian berhasil dihapus.", type: 'success' });
    } catch (error) {
      setNotification({ message: "Gagal menghapus ujian.", type: 'error' });
    }
  };

  const copyToClipboard = (id: string) => {
    const url = `${window.location.origin}/exam/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetData = async () => {
    if (!checkPermission()) return;
    setIsResetting(true);
    setShowResetConfirm(false);
    try {
      const deleteInChunks = async (collectionName: string, queryConstraints: any[]) => {
        let hasMore = true;
        while (hasMore) {
          const q = query(collection(db, collectionName), ...queryConstraints, limit(200));
          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            hasMore = false;
            break;
          }
          const batch = writeBatch(db);
          snapshot.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      };

      if (selectedParticipantGroupId === 'all') {
        await deleteInChunks('exam_sessions', []);
        await deleteInChunks('cheat_logs', []);
      } else {
        const groupExamIds = exams.filter(e => e.groupId === selectedParticipantGroupId).map(e => e.id);
        if (groupExamIds.length > 0) {
          for (let i = 0; i < groupExamIds.length; i += 10) {
            const chunk = groupExamIds.slice(i, i + 10);
            await deleteInChunks('exam_sessions', [where('examId', 'in', chunk)]);
            await deleteInChunks('cheat_logs', [where('examId', 'in', chunk)]);
          }
        }
      }
      setNotification({ message: "Data berhasil dibersihkan.", type: 'success' });
    } catch (error) {
      console.error("Error resetting data:", error);
      setNotification({ message: "Gagal mereset data.", type: 'error' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nama Siswa', 'Kelas', 'Absen', 'Ujian', 'Kelompok', 'Status', 'Pelanggaran', 'Waktu Mulai'];
    const rows = filteredSessions.map(session => {
      const exam = examsMap.get(session.examId);
      const violations = logsBySession.get(`${session.examId}_${session.studentName}`) || [];
      const group = exam?.groupId ? groups.find(g => g.id === exam.groupId) : null;
      
      return [
        session.studentName,
        session.studentClass,
        session.studentAbsen,
        exam?.title || 'Terhapus',
        group?.name || '-',
        session.status === 'active' ? 'Aktif' : 'Selesai',
        violations.length,
        session.startTime ? format(parseISO(session.startTime), 'yyyy-MM-dd HH:mm:ss') : '-'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `peserta_ujian_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {auth.currentUser?.isAnonymous && localStorage.getItem('admin_access_type') !== 'code' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs font-bold text-amber-800">Mode Lihat Saja. Masuk dengan Google/Kode Akses untuk mengedit.</p>
          </div>
          <button 
            onClick={() => {
              localStorage.removeItem('admin_token');
              window.location.reload();
            }}
            className="bg-amber-600 text-white px-4 py-1.5 rounded-xl font-bold text-xs hover:bg-amber-700"
          >
            Login Google
          </button>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
              {isOnline ? 'Online & Siap' : 'Offline'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Panel Pengawas Ujian</h1>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('exams')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'exams' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
          >
            <List className="w-4 h-4" />
            <span>Daftar Ujian</span>
          </button>
          <button 
            onClick={() => setActiveTab('groups')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'groups' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Kelompok / Kelas</span>
          </button>
          <button 
            onClick={() => setActiveTab('participants')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'participants' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
          >
            <User className="w-4 h-4" />
            <span>Pantau Peserta</span>
          </button>
        </div>
      </div>

      {/* Tab: Ujian */}
      {activeTab === 'exams' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs font-bold text-gray-500">{exams.length} Ujian Terdaftar</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Ujian</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.map(exam => (
              <div 
                key={exam.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-gray-900 truncate">{exam.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${exam.isActive !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {exam.isActive !== false ? 'Aktif' : 'Nonaktif'}
                      </span>
                      {exam.groupId && (
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 truncate max-w-[120px]">
                          {groups.find(g => g.id === exam.groupId)?.name || 'Kelompok'}
                        </span>
                      )}
                    </div>
                  </div>
                  {exam.accessCode && (
                    <div className="bg-gray-100 text-gray-800 text-[11px] font-black px-2 py-1 rounded shrink-0">
                      KODE: {exam.accessCode}
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 p-2.5 rounded-xl text-xs text-gray-600 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>Durasi: {exam.duration || 60} Menit</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-400 truncate">
                    <Link className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{exam.url}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <button 
                    onClick={() => copyToClipboard(exam.id)}
                    className="flex-1 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    {copiedId === exam.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === exam.id ? "Tersalin" : "Salin Link"}</span>
                  </button>
                  <button 
                    onClick={() => handleEdit(exam)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-gray-50"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleToggleActive(exam)}
                    className={`p-1.5 rounded-lg hover:bg-gray-50 ${exam.isActive !== false ? 'text-emerald-600' : 'text-gray-300'}`}
                    title="Aktif/Nonaktif"
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setExamToDelete(exam.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-50"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {exams.length === 0 && (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200 p-6">
                <p className="text-gray-400 font-bold text-sm">Belum ada ujian. Klik tombol Tambah Ujian di atas.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Kelompok */}
      {activeTab === 'groups' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <form onSubmit={handleAddGroup} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
              <h3 className="font-black text-gray-900 text-sm">{editingGroupId ? 'Edit Kelompok' : 'Buat Kelompok Baru'}</h3>
              <input 
                type="text" 
                placeholder="Nama (contoh: Kelas 7, Kelas 8)"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
              />
              <textarea 
                placeholder="Tata tertib khusus kelompok (opsional)"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                value={newGroupRules}
                onChange={e => setNewGroupRules(e.target.value)}
              />
              <div className="flex gap-2">
                {editingGroupId && (
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingGroupId(null);
                      setNewGroupName('');
                      setNewGroupRules('');
                    }}
                    className="py-2 px-3 border border-gray-300 rounded-xl text-xs font-bold text-gray-600"
                  >
                    Batal
                  </button>
                )}
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 shadow-md shadow-indigo-100"
                >
                  {editingGroupId ? 'Simpan' : 'Tambah Kelompok'}
                </button>
              </div>
            </form>
          </div>

          <div className="md:col-span-2 space-y-3">
            {groups.map(group => (
              <div key={group.id} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center shadow-sm">
                <div>
                  <h4 className="font-bold text-sm text-gray-900">{group.name}</h4>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {exams.filter(e => e.groupId === group.id).length} Ujian di kelompok ini
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleToggleGroupActive(group)}
                    className={`p-1.5 rounded-lg ${group.isActive === false ? 'text-gray-300' : 'text-emerald-600'}`}
                    title="Aktif/Nonaktif"
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleEditGroup(group)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setIsDeletingGroup(group.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-gray-400 text-xs text-center py-8">Belum ada kelompok ujian.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Peserta */}
      {activeTab === 'participants' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input 
                type="text"
                placeholder="Cari nama atau kelas siswa..."
                className="w-full text-xs outline-none bg-transparent"
                value={participantsSearchTerm}
                onChange={e => setParticipantsSearchTerm(e.target.value)}
              />
              {participantsSearchTerm && (
                <button onClick={() => setParticipantsSearchTerm('')} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh CSV</span>
              </button>
              <button 
                onClick={() => setShowResetConfirm(true)}
                disabled={isResetting}
                className="flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>Bersihkan Sesi</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Siswa</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Kelas/Absen</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Ujian</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Pelanggaran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {paginatedSessions.map(session => {
                    const exam = examsMap.get(session.examId);
                    const violations = logsBySession.get(`${session.examId}_${session.studentName}`) || [];
                    return (
                      <tr key={session.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold text-gray-900">{session.studentName}</td>
                        <td className="px-4 py-3 text-gray-600 font-medium">
                          {session.studentClass} ({session.studentAbsen})
                        </td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[180px]">{exam?.title || 'Ujian'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${session.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {session.status === 'active' ? 'Mengerjakan' : 'Selesai'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${violations.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {violations.length}x
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSessions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Belum ada siswa yang mengerjakan.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="bg-gray-50 px-4 py-2.5 border-t border-gray-200 flex items-center justify-between text-xs">
                <span className="text-gray-500">Hal {currentPage} dari {totalPages}</span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded bg-white border border-gray-200 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded bg-white border border-gray-200 disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold text-white ${notification.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add / Edit Exam Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-black text-gray-900">{editingId ? 'Edit Ujian' : 'Tambah Ujian Baru'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExam} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Kelompok Ujian</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newExam.groupId}
                  onChange={e => setNewExam({...newExam, groupId: e.target.value})}
                >
                  <option value="">Tanpa Kelompok (Ujian Bebas)</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Judul Ujian</label>
                <input 
                  required
                  type="text" 
                  placeholder="Contoh: Penilaian Harian Matematika"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newExam.title}
                  onChange={e => setNewExam({...newExam, title: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Link Soal (Google Forms / MS Forms / Web Soal)</label>
                <input 
                  required
                  type="text" 
                  placeholder="https://docs.google.com/forms/d/e/... atau https://forms.office.com/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newExam.url}
                  onChange={e => setNewExam({...newExam, url: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Kode Masuk (Opsional)</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: 123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newExam.accessCode}
                    onChange={e => setNewExam({...newExam, accessCode: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Durasi (Menit)</label>
                  <input 
                    required
                    type="number" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newExam.duration}
                    onChange={e => setNewExam({...newExam, duration: parseInt(e.target.value) || 60})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Waktu Freeze / Hukum Kunci (Detik)</label>
                <input 
                  type="number" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newExam.freezeDuration}
                  onChange={e => setNewExam({...newExam, freezeDuration: parseInt(e.target.value) || 15})}
                />
                <p className="text-[10px] text-gray-400 mt-1">Lama layar siswa membeku saat terdeteksi membuka aplikasi/tab lain.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 shadow-md shadow-indigo-100"
                >
                  {editingId ? 'Simpan Perubahan' : 'Buat Ujian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Exam Confirm */}
      {examToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-3">
            <Trash2 className="w-10 h-10 text-red-600 mx-auto" />
            <h3 className="font-black text-gray-900 text-base">Hapus Ujian?</h3>
            <p className="text-xs text-gray-500">Ujian ini akan dihapus dari sistem.</p>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setExamToDelete(null)}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700"
              >
                Batal
              </button>
              <button 
                onClick={() => handleDelete(examToDelete)}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Confirm */}
      {isDeletingGroup && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-3">
            <Trash2 className="w-10 h-10 text-red-600 mx-auto" />
            <h3 className="font-black text-gray-900 text-base">Hapus Kelompok?</h3>
            <p className="text-xs text-gray-500">Kelompok akan dihapus. Ujian di dalamnya tetap aman dan menjadi ujian umum.</p>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setIsDeletingGroup(null)}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700"
              >
                Batal
              </button>
              <button 
                onClick={() => handleDeleteGroup(isDeletingGroup)}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirm */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
            <h3 className="font-black text-gray-900 text-base">Bersihkan Sesi Peserta?</h3>
            <p className="text-xs text-gray-500">Semua riwayat pengerjaan siswa yang tersimpan akan dibersihkan untuk sesi baru.</p>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700"
              >
                Batal
              </button>
              <button 
                onClick={handleResetData}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
              >
                Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Student View & Exam Player ---

const ENCOURAGEMENT_QUOTES = [
  "Tenang, soal ujiannya nggak bakal nanya 'kapan mabar' kok. Fokus ya! 🎮",
  "Kerjain soalnya satu-satu, jangan kayak tugas numpuk di akhir semester. Semangat! ✨",
  "Tarik napas, buang beban pikiran. Kamu keren, kamu pasti bisa! 🚀",
  "Jangan tegang, ini cuma ujian, bukan ketemu guru BK pas telat masuk sekolah. Santai! 😎",
  "Ingat, jawaban yang paling benar adalah jawaban yang kamu isi sendiri. Jujur itu juara! 🏆",
  "Kalau soalnya susah, tarik napas dulu. Siapa tahu jawabannya muncul di awan-awan. 😆",
  "Fokus ke layar, jangan ke kantin dulu. Baksonya nggak bakal lari kok! 🍜",
  "Percaya pada dirimu sendiri, kamu lebih hebat dari yang kamu duga! 💪",
  "Ujian itu kayak level bos di game, butuh konsentrasi buat menanginnya! 🕹️",
  "Tarik napas dalam-dalam, kerjakan dengan tenang, kamu pasti bisa! 🌈"
];

const ExamCard = memo(({ exam, status, onStart, viewMode }: { exam: Exam, status: string, onStart: (id: string) => void, viewMode: 'grid' | 'list' }) => {
    if (viewMode === 'list') {
      return (
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onStart(exam.id)}
          className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm hover:shadow-md flex items-center justify-between gap-3 transition-all cursor-pointer hover:border-indigo-200"
        >
          <div className="flex items-center gap-3.5 flex-1 min-w-0">
            <div className="p-2.5 rounded-xl shrink-0 bg-indigo-50 text-indigo-600">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="text-left min-w-0">
              <h3 className="text-sm font-black text-gray-900 leading-tight truncate">{exam.title}</h3>
              <div className="flex items-center gap-3 mt-1">
                {exam.startTime && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-gray-400">
                    <Calendar className="w-3 h-3" />
                    <span>{format(parseISO(exam.startTime), 'd MMM', { locale: localeId })}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-500">
                  <Clock className="w-3 h-3" />
                  <span>{exam.duration || 60}m</span>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onStart(exam.id);
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-xs hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all flex items-center gap-1.5"
            >
              <span>MULAI</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      );
    }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onClick={() => onStart(exam.id)}
      className="bg-white rounded-[2rem] border-2 border-gray-100 p-6 sm:p-8 shadow-xl transition-all relative overflow-hidden cursor-pointer hover:border-indigo-300"
    >
      <div className="absolute top-0 right-0 bg-emerald-500 text-white px-4 py-1 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest">
        Aktif
      </div>
      
      <div className="mb-6">
        <h3 className="text-2xl font-black text-gray-900 leading-tight mb-2">{exam.title}</h3>
        <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm">
          <Info className="w-4 h-4" />
          <span>{exam.info || 'Ujian Sekolah'}</span>
        </div>
      </div>
      
      <div className="space-y-4 mb-8">
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
          {exam.startTime && (
            <div className="flex items-center gap-3 text-sm font-bold text-gray-700">
              <Calendar className="w-5 h-5 text-indigo-500" />
              <span>{format(parseISO(exam.startTime), 'EEEE, d MMMM yyyy', { locale: localeId })}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm font-bold text-indigo-600">
            <Clock className="w-5 h-5" />
            <span>{exam.duration || 60} Menit</span>
          </div>
        </div>
      </div>

      <button 
        onClick={(e) => {
          e.stopPropagation();
          onStart(exam.id);
        }}
        className="w-full py-4 rounded-2xl font-black text-lg transition-all shadow-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 flex items-center justify-center gap-2"
      >
        <span>MULAI UJIAN</span>
        <ChevronRight className="w-5 h-5" />
      </button>
    </motion.div>
  );
});

const StudentHome = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | { id: string, name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuote, setCurrentQuote] = useState('');
  const navigate = useNavigate();

  const [authError, setAuthError] = useState<string | null>(null);
  const hasAttemptedAuth = useRef(false);

  useEffect(() => {
    setIsLoading(true);
    setCurrentQuote(ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * ENCOURAGEMENT_QUOTES.length)]);
    
    // Ensure student is authenticated anonymously
    const ensureAuth = async () => {
      if (!auth.currentUser && !hasAttemptedAuth.current) {
        hasAttemptedAuth.current = true;
        try {
          await signInAnonymously(auth);
          setAuthError(null);
        } catch (e: any) {
          if (e.code === 'auth/admin-restricted-operation') {
            console.warn("Anonymous Authentication is disabled in Firebase Console. Continuing as guest.");
          } else {
            console.error("Anonymous auth failed for student:", e);
          }
        }
      }
    };
    ensureAuth();

    // Fallback timeout to prevent infinite loading
    const fallbackTimer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    const qExams = query(collection(db, 'exams'), orderBy('createdAt', 'desc'));
    const unsubExams = onSnapshot(qExams, (snap) => {
      const allExams = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(allExams.filter(e => e.isActive !== false));
      setIsLoading(false);
    }, (error) => {
      console.error("Exams listener error:", error);
      setIsLoading(false);
    });

    const unsubGroups = onSnapshot(query(collection(db, 'groups'), orderBy('createdAt', 'desc')), (snap) => {
      setGroups(snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Group))
        .filter(g => g.isActive !== false)
      );
      setIsLoading(false);
    }, (error) => {
      console.error("Groups listener error:", error);
      setIsLoading(false);
    });

    return () => {
      clearTimeout(fallbackTimer);
      unsubExams();
      unsubGroups();
    };
  }, []);

  useEffect(() => {
    if (selectedGroup && selectedGroup.id !== 'ungrouped') {
      const currentGroup = groups.find(g => g.id === selectedGroup.id);
      if (!currentGroup) {
        setSelectedGroup(null);
      }
    }
  }, [groups, selectedGroup]);

  const ungroupedExams = useMemo(() => {
    return exams.filter(ex => !ex.groupId || !groups.some(g => g.id === ex.groupId));
  }, [exams, groups]);

  const filteredExams = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') return ungroupedExams;
    return exams.filter(ex => ex.groupId === selectedGroup.id);
  }, [selectedGroup, exams, ungroupedExams]);

  const groupColors = [
    'bg-indigo-500 hover:bg-indigo-600',
    'bg-pink-500 hover:bg-pink-600',
    'bg-amber-500 hover:bg-amber-600',
    'bg-emerald-500 hover:bg-emerald-600',
    'bg-violet-500 hover:bg-violet-600',
    'bg-rose-500 hover:bg-rose-600',
  ];

  // If no groups exist, show exams directly without extra screen
  const hasNoGroups = groups.length === 0;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#F8FAFC] p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center space-y-2.5 mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-full shadow-md shadow-indigo-100">
            <Shield className="w-4 h-4" />
            <span className="font-black text-[10px] uppercase tracking-[0.2em]">Examguard - SPENDAPOL</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Halo, <span className="text-indigo-600">Pejuang Ujian!</span> 🔥
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm font-medium italic px-4">
              "{currentQuote}"
            </p>
          </div>
        </div>

        {authError && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-center space-y-2 mb-6">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-red-700 text-sm font-medium">{authError}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {hasNoGroups || selectedGroup ? (
            <motion.div 
              key="exams-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {!hasNoGroups && selectedGroup && (
                <div className="flex items-center justify-between gap-4 bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 mb-4">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setSelectedGroup(null)}
                      className="p-2 hover:bg-gray-100 rounded-xl transition-all text-indigo-600 flex items-center gap-1 font-bold text-xs"
                    >
                      <ChevronLeft className="w-5 h-5" />
                      <span>Kembali</span>
                    </button>
                    <div>
                      <h2 className="text-base font-black text-gray-900 uppercase tracking-tight leading-none">{selectedGroup.name}</h2>
                    </div>
                  </div>
                  <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-black text-[10px]">
                    {filteredExams.length} Ujian
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {(hasNoGroups ? exams : filteredExams).map(exam => (
                  <ExamCard 
                    key={exam.id} 
                    exam={exam} 
                    status="active"
                    onStart={(id) => navigate(`/exam/${id}`)} 
                    viewMode="list"
                  />
                ))}

                {(hasNoGroups ? exams : filteredExams).length === 0 && !isLoading && (
                  <div className="py-16 text-center bg-white rounded-3xl border-2 border-dashed border-gray-200 p-6">
                    <p className="text-gray-400 font-bold text-base">Belum ada ujian aktif yang tersedia.</p>
                    <p className="text-gray-400 text-xs mt-1">Silakan hubungi bapak/ibu guru pengawas jika ujian belum muncul.</p>
                  </div>
                )}

                {isLoading && (
                  <div className="py-16 text-center">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-500 font-bold text-sm">Memuat daftar ujian...</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="groups-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex flex-col gap-3">
                {groups.map((group, index) => {
                  const examCount = exams.filter(e => e.groupId === group.id).length;
                  return (
                    <motion.button
                      key={group.id}
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedGroup(group)}
                      className={`${groupColors[index % groupColors.length]} p-4 rounded-2xl text-white shadow-md flex items-center justify-between gap-3 transition-all border-2 border-white/20`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                          <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-base font-black uppercase tracking-wide">{group.name}</h3>
                          <p className="text-white/80 font-bold text-[10px]">
                            {examCount} Ujian Aktif
                          </p>
                        </div>
                      </div>
                      <div className="bg-white text-gray-900 px-3.5 py-1.5 rounded-xl font-black text-xs shadow-sm flex items-center gap-1">
                        <span>PILIH</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </motion.button>
                  );
                })}

                {ungroupedExams.length > 0 && (
                  <motion.button
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedGroup({ id: 'ungrouped', name: 'Ujian Umum / Lainnya' })}
                    className="bg-slate-700 hover:bg-slate-800 p-4 rounded-2xl text-white shadow-md flex items-center justify-between gap-3 transition-all border-2 border-white/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                        <BookOpen className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-base font-black uppercase tracking-wide">Ujian Umum / Lainnya</h3>
                        <p className="text-white/80 font-bold text-[10px]">
                          {ungroupedExams.length} Ujian Aktif
                        </p>
                      </div>
                    </div>
                    <div className="bg-white text-gray-900 px-3.5 py-1.5 rounded-xl font-black text-xs shadow-sm flex items-center gap-1">
                      <span>PILIH</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </motion.button>
                )}

                {isLoading && (
                  <div className="py-16 text-center">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-500 font-bold text-sm">Memuat data...</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-12 text-center">
          <button 
            onClick={() => navigate('/admin')}
            className="text-xs font-bold text-gray-400 hover:text-indigo-600 transition-all uppercase tracking-widest inline-flex items-center gap-1.5 py-2 px-4 rounded-xl hover:bg-gray-100"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Akses Ruang Pengawas (Admin)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const ExamPlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [examLoading, setExamLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [studentAbsen, setStudentAbsen] = useState('');
  const [code, setCode] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [freezeTimeLeft, setFreezeTimeLeft] = useState(0);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [violationCount, setViolationCount] = useState(0);
  const [lockReason, setLockReason] = useState('');
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [showTimeWarning, setShowTimeWarning] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [lastActionTime, setLastActionTime] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitCodeInput, setExitCodeInput] = useState('');
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(true);

  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), []);

  const logCheat = useCallback(async (type: string, details: string) => {
    if (!exam || isFrozen || isLocked || !id) return;
    
    // Grace period 2 detik setelah start/resume untuk menghindari false positive saat transisi fullscreen
    if (Date.now() - lastActionTime < 2000) return;

    try {
      const newViolationCount = violationCount + 1;
      setViolationCount(newViolationCount);

      // Play alert sound
      if (audioContext) {
        try {
          if (audioContext.state === 'suspended') {
            audioContext.resume();
          }
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
          oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
          oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.2);
          
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.5);
        } catch (soundError) {
          console.error("Gagal memutar suara peringatan", soundError);
        }
      }

      const logData: any = {
        examId: id,
        studentName: studentName || 'Siswa Tanpa Nama',
        type,
        details: `${details} (Pelanggaran ke-${newViolationCount})`,
        timestamp: new Date().toISOString()
      };

      if (sessionId) {
        logData.sessionId = sessionId;
        // Update session violation count
        updateDoc(doc(db, 'exam_sessions', sessionId), {
          violationCount: newViolationCount,
          lastActive: new Date().toISOString()
        }).catch(e => console.error("Failed to update session violation count", e));
      }

      await addDoc(collection(db, 'cheat_logs'), logData);

      if (newViolationCount >= 6) {
        setIsLocked(true);
        const reason = 'Ujian ditutup PERMANEN karena melakukan pelanggaran lebih dari 6 kali.';
        setLockReason(reason);
        if (sessionId) {
          updateDoc(doc(db, 'exam_sessions', sessionId), {
            status: 'locked',
            lockReason: reason
          }).catch(e => console.error("Failed to lock session in DB"));
        }
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      const freezeDuration = (exam.freezeDuration || 15) * newViolationCount;
      setIsFrozen(true);
      setFreezeTimeLeft(freezeDuration);
      
      if (newViolationCount >= 3) {
        setPinRequired(true);
      }

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cheat_logs');
      console.error("Gagal mencatat pelanggaran", error);
    }
  }, [exam, isFrozen, isLocked, id, lastActionTime, violationCount, audioContext, studentName]);

  useEffect(() => {
    // Session Recovery
    if (!id) return;
    const savedSession = localStorage.getItem(`session_${id}`);
    if (savedSession) {
      try {
        const data = JSON.parse(savedSession);
        setStudentName(data.name || '');
        setStudentClass(data.class || '');
        setStudentAbsen(data.absen || '');
      } catch (e) {
        console.error("Failed to parse saved session", e);
      }
    }
    setIsInitialized(true);
  }, [id]);

  const retrySession = () => {
    if (studentName && studentClass && studentAbsen) {
      startExam();
    }
  };

  useEffect(() => {
    if (!id) return;
    setExamLoading(true);
    setLoadError(null);

    const docRef = doc(db, 'exams', id);
    
    // Safety fallback timeout
    const timer = setTimeout(() => {
      if (!exam) {
        setExamLoading(false);
      }
    }, 4000);

    getDoc(docRef).then(async snap => {
      clearTimeout(timer);
      if (snap.exists()) {
        const data = snap.data() as Exam;
        if (data.isActive === false) {
          setPlayerError("Ujian ini telah dinonaktifkan oleh administrator.");
          setTimeout(() => navigate('/'), 3000);
          return;
        }
        setExam({ id: snap.id, ...data } as Exam);
        setExamLoading(false);
        
        if (data.groupId) {
          try {
            const groupSnap = await getDoc(doc(db, 'groups', data.groupId));
            if (groupSnap.exists()) {
              const groupData = groupSnap.data() as Group;
              if (groupData.isActive === false) {
                setPlayerError("Kelompok ujian ini telah dinonaktifkan oleh administrator.");
                setTimeout(() => navigate('/'), 3000);
                return;
              }
              setGroup({ id: groupSnap.id, ...groupData } as Group);
            }
          } catch (gErr) {
            console.warn("Group fetch error:", gErr);
          }
        }
      } else {
        setExamLoading(false);
        setLoadError("Ujian tidak ditemukan atau telah dihapus.");
      }
    }).catch(err => {
      clearTimeout(timer);
      setExamLoading(false);
      console.error("Exam load error:", err);
      setLoadError("Gagal memuat ujian. Periksa koneksi internet Anda.");
    });

    return () => clearTimeout(timer);
  }, [id, navigate]);

    // Anti-cheat & Timer logic
    useEffect(() => {
      if (!isStarted || isLocked || !exam) return;

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          logCheat('focus-lost', 'Pengguna berpindah tab atau meminimalkan jendela');
        }
      };

      const handleBeforePrint = () => {
        logCheat('print-attempt', 'Pengguna mencoba mencetak halaman atau mengambil screenshot');
      };

      const handleContextMenu = (e: MouseEvent) => e.preventDefault();
      
      const handleKeyDown = (e: KeyboardEvent) => {
        const forbidden = [
          (e.ctrlKey || e.metaKey) && e.key === 'c',
          (e.ctrlKey || e.metaKey) && e.key === 'v',
          (e.ctrlKey || e.metaKey) && e.key === 'u',
          (e.ctrlKey || e.metaKey) && e.key === 'p',
          (e.ctrlKey || e.metaKey) && e.key === 's',
          e.key === 'F12',
          e.key === 'PrintScreen',
          e.key === 'Escape',
          e.key === 'Meta' // Windows Key / Command Key
        ];
        if (forbidden.some(cond => cond)) {
          e.preventDefault();
          logCheat('shortcut-attempt', `Shortcut terlarang ditekan: ${e.key}`);
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'PrintScreen') {
          logCheat('screenshot-attempt', 'Pengguna mencoba mengambil screenshot (PrintScreen)');
        }
      };

      // Mencegah screenshot di beberapa browser mobile (terbatas)
      // dan mendeteksi sentuhan layar yang mencurigakan
      const handleTouchStart = (e: TouchEvent) => {
        // Siswa tetap bisa mengisi, kita hanya pantau jika ada pola sentuhan sistem
        // yang biasanya memicu screenshot (seperti 3 jari di beberapa Android)
        if (e.touches.length >= 3) {
          // logCheat('suspicious-touch', 'Deteksi sentuhan multi-jari (potensi screenshot)');
        }
      };

      const handleFullscreenChange = () => {
        if (isStarted && !isLocked && !isFrozen) {
          // iPhone/iOS tidak mendukung Fullscreen API standar, jadi kita abaikan pengecekan ini untuk iOS
          if (!isIOS && !document.fullscreenElement) {
            logCheat('fullscreen-exit', 'Pengguna keluar dari mode layar penuh');
          }
        }
      };

      window.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('beforeprint', handleBeforePrint);
      window.addEventListener('contextmenu', handleContextMenu);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

      // Main Exam Timer
      const examTimer = setInterval(() => {
        const now = new Date();
        let diff = 0;

        if (exam.duration && sessionStartTime) {
          // Duration-based countdown
          const start = parseISO(sessionStartTime);
          const durationMs = exam.duration * 60000;
          const end = new Date(start.getTime() + durationMs);
          diff = end.getTime() - now.getTime();
        } else {
          // Fallback to fixed end time
          const end = parseISO(exam.endTime);
          diff = end.getTime() - now.getTime();
        }
        
        if (diff <= 0) {
          setIsLocked(true);
          setLockReason('Waktu ujian telah berakhir');
          clearInterval(examTimer);
        } else {
          const mins = Math.floor(diff / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);

          // Time warnings
          if (mins === 5 && secs === 0) {
            setShowTimeWarning(5);
          } else if (mins === 1 && secs === 0) {
            setShowTimeWarning(1);
          }
        }
      }, 1000);

      return () => {
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeprint', handleBeforePrint);
        window.removeEventListener('contextmenu', handleContextMenu);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        clearInterval(examTimer);
      };
    }, [isStarted, isLocked, id, studentName, exam, isFrozen, violationCount]);

    // Separate Freeze Timer logic
    useEffect(() => {
      let freezeInterval: NodeJS.Timeout;
      
      if (isFrozen && freezeTimeLeft > 0) {
        freezeInterval = setInterval(() => {
          setFreezeTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(freezeInterval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }

      return () => {
        if (freezeInterval) clearInterval(freezeInterval);
      };
    }, [isFrozen, freezeTimeLeft]);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, 'exam_sessions', sessionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'locked') {
          setIsLocked(true);
          setLockReason(data.lockReason || 'Ujian dikunci oleh administrator.');
        } else if (data.status === 'finished') {
          // If admin marks as finished or they finish elsewhere, kick them out
          navigate('/');
          localStorage.removeItem(`session_${id}`);
        } else if (data.status === 'active' && isLocked) {
          // Admin unlocked them
          setIsLocked(false);
          setViolationCount(data.violationCount || 0);
        }
        
        if (data.violationCount !== undefined) {
          setViolationCount(data.violationCount);
        }
      }
    });
    return () => unsub();
  }, [sessionId, isLocked, navigate, id]);

  useEffect(() => {
    if (!sessionId || !isStarted || isLocked) return;

    const interval = setInterval(async () => {
      try {
        await updateDoc(doc(db, 'exam_sessions', sessionId), {
          lastActive: new Date().toISOString()
        });
      } catch (e) {
        // Silent fail for heartbeat to avoid annoying popups if connection flickers
        console.error("Failed to update session activity");
      }
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [sessionId, isStarted, isLocked]);

  const startExam = async () => {
    if (isStarting) return;
    setIsStarting(true);
    setPlayerError(null);
    
    if (!exam) {
      setIsStarting(false);
      setPlayerError("Data ujian belum siap. Silakan muat ulang halaman.");
      return;
    }

    const cleanName = studentName.trim().toUpperCase();
    const cleanClass = studentClass.trim().toUpperCase();
    const cleanAbsen = studentAbsen.trim().toUpperCase();

    if (!cleanName) {
      setPlayerError("Silakan masukkan Nama Lengkap Anda.");
      setIsStarting(false);
      return;
    }

    if (!cleanClass) {
      setPlayerError("Silakan masukkan Kelas Anda (contoh: 7A).");
      setIsStarting(false);
      return;
    }

    if (!cleanAbsen) {
      setPlayerError("Silakan masukkan Nomor Absen Anda.");
      setIsStarting(false);
      return;
    }
    
    // Check access code if required by teacher
    const requiredCode = (exam.accessCode || '').trim();
    const enteredCode = (code || '').trim();
    if (requiredCode && enteredCode.toUpperCase() !== requiredCode.toUpperCase()) {
      setPlayerError("Kode Masuk salah! Periksa kembali kode akses dari pengawas.");
      setIsStarting(false);
      return;
    }

    try {
      // 1. Fullscreen handling immediately on user gesture
      const target = document.documentElement;
      try {
        if (target.requestFullscreen) {
          target.requestFullscreen().catch(() => {});
        } else if ((target as any).webkitRequestFullscreen) {
          (target as any).webkitRequestFullscreen();
        }
      } catch (fsErr) {
        console.warn("Initial fullscreen error:", fsErr);
      }

      // 2. Audio context initialization for warning tones
      try {
        const AudioCtxClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const ctx = new AudioCtxClass();
          setAudioContext(ctx);
        }
      } catch (e) {}

      const startTimeStr = new Date().toISOString();
      const safeName = cleanName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const safeClass = cleanClass.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
      const safeAbsen = cleanAbsen.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10);
      const deterministicSessionId = `SSN_${id}_${safeName}_${safeClass}_${safeAbsen}`;

      // Save for instant local recovery
      localStorage.setItem(`session_${id}`, JSON.stringify({
        id: deterministicSessionId,
        name: cleanName,
        class: cleanClass,
        absen: cleanAbsen,
        startTime: startTimeStr
      }));

      // 3. ENTER EXAM IMMEDIATELY (Zero Lag!)
      setSessionId(deterministicSessionId);
      setSessionStartTime(startTimeStr);
      setLastActionTime(Date.now());
      setIsStarted(true);
      setIsFrozen(false);
      setIsLocked(false);
      setFreezeTimeLeft(0);

      // 4. Background non-blocking sync to Firestore
      (async () => {
        try {
          if (!auth.currentUser) {
            await signInAnonymously(auth).catch(() => {});
          }
          const sessionRef = doc(db, 'exam_sessions', deterministicSessionId);
          await setDoc(sessionRef, {
            examId: id,
            studentName: cleanName,
            studentClass: cleanClass,
            studentAbsen: cleanAbsen,
            startTime: startTimeStr,
            status: 'active',
            lastActive: startTimeStr,
            violationCount: 0
          }, { merge: true });
        } catch (dbErr) {
          console.warn("Background session sync warning:", dbErr);
        }
      })();

    } catch (err: any) {
      console.error("Critical Start Error:", err);
      setPlayerError("Terjadi kendala saat memulai ujian. Silakan coba lagi.");
    } finally {
      setIsStarting(false);
    }
  };

  const resumeExam = async () => {
    if (pinRequired) {
      if (pinInput !== exam?.accessCode) {
        setPlayerError("PIN Masuk salah! Gunakan kode akses ujian sebagai PIN.");
        return;
      }
      setPinRequired(false);
      setPinInput('');
    }

    try {
      // Resume AudioContext on user gesture
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const target = document.documentElement;
      try {
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        } else if ((target as any).webkitRequestFullscreen) {
          await (target as any).webkitRequestFullscreen();
        }
      } catch (fsErr) {
        console.warn("Fullscreen failed on resume:", fsErr);
      }
      setLastActionTime(Date.now());
      setIsFrozen(false);
      setFreezeTimeLeft(0);
    } catch (err) {
      setPlayerError("Gagal melanjutkan ujian.");
    }
  };

  const confirmExit = async () => {
    if (exam?.exitCode && exitCodeInput !== exam.exitCode) {
      setPlayerError("Kode Keluar salah!");
      return;
    }
    
    if (sessionId) {
      try {
        await updateDoc(doc(db, 'exam_sessions', sessionId), {
          status: 'finished',
          endTime: new Date().toISOString(),
          lastActive: new Date().toISOString()
        });
        localStorage.removeItem(`session_${id}`);
      } catch (e) {
        console.error("Failed to update session status");
      }
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate('/');
  };

  const handleExit = () => {
    setShowExitModal(true);
  };

  if (examLoading || (!exam && !loadError)) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="text-lg font-black text-gray-900">Menyiapkan Lembar Ujian...</h3>
          <p className="text-gray-500 text-sm">Sedang memuat data soal dan tata tertib ujian.</p>
        </div>
      </div>
    );
  }

  if (loadError || !exam) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-gray-900">Gagal Memuat Ujian</h3>
          <p className="text-gray-500 text-sm">{loadError || "Ujian tidak ditemukan."}</p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              Muat Ulang Halaman
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-200 text-center">
          <AlertTriangle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ujian Terkunci</h2>
          <p className="text-red-600 font-medium mb-6">{lockReason}</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-black transition-all"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  if (!isStarted) {
    if (showRules) {
      return (
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-gray-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg w-full bg-white rounded-3xl shadow-2xl p-8 border border-gray-100"
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{exam.title}</h2>
              <p className="text-indigo-500 font-bold mt-1">Tata Tertib & Informasi Ujian</p>
            </div>

            <div className="space-y-6 mb-8">
              {exam.info && (
                <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                  <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2">Informasi Ujian</h4>
                  <p className="text-sm text-blue-900 font-medium leading-relaxed">{exam.info}</p>
                </div>
              )}

              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Tata Tertib</h4>
                <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {group?.rules || exam.rules || "Tidak ada tata tertib khusus untuk ujian ini. Kerjakan dengan jujur dan teliti."}
                  {"\n\n"}
                  <span className="text-red-600 font-bold">PENTING: Jangan klik link apa pun di dalam soal (termasuk tombol 'Sign In' Google) yang membuka tab baru. Jika Anda meninggalkan halaman ini, ujian akan otomatis TERKUNCI."</span>
                </div>
              </div>

              <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 flex gap-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-900 leading-relaxed">
                  Dengan menekan tombol di bawah, Anda setuju untuk mengikuti tata tertib yang berlaku. Sistem akan otomatis mengunci jika Anda mencoba keluar dari halaman ujian.
                </p>
              </div>
            </div>

            <button 
              onClick={() => setShowRules(false)}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-2"
            >
              SAYA MENGERTI & LANJUTKAN
              <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-gray-50 p-4" ref={containerRef}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">{exam.title}</h2>
            <p className="text-gray-500 mt-2">Lengkapi data untuk memulai</p>
          </div>
          
          <div className="space-y-4">
            {playerError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs font-bold animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{playerError}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="Nama Siswa"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kelas</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={studentClass}
                  onChange={e => setStudentClass(e.target.value)}
                  placeholder="Contoh: 7A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No Absen</label>
                <input 
                  type="number" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={studentAbsen}
                  onChange={e => setStudentAbsen(e.target.value)}
                  placeholder="01"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kode Masuk</label>
              <input 
                type="text" 
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center text-xl tracking-widest font-bold"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="••••••"
              />
            </div>
            
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">
                Memulai ujian akan mengaktifkan <b>Mode Layar Penuh</b>. Keluar dari layar penuh atau berpindah tab akan menyebabkan ujian terkunci otomatis.
              </p>
            </div>

            {localStorage.getItem(`session_${id}`) && !isStarting && (
              <button 
                onClick={retrySession}
                className="w-full mb-3 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Lanjutkan Sesi Terakhir</span>
              </button>
            )}

            <button 
              onClick={startExam}
              disabled={isStarting}
              className={`w-full py-4 text-white rounded-xl font-bold text-lg transition-all shadow-lg ${
                isStarting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              {isStarting ? (
                <div className="flex items-center justify-center gap-2">
                  <RotateCcw className="w-5 h-5 animate-spin" />
                  <span>Menyiapkan Ujian...</span>
                </div>
              ) : 'Mulai Ujian'}
            </button>
          </div>
          <div className="mt-8 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Tim Kurikulum SMPN 2 Gempol @2026
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-white z-[9999] flex flex-col select-none" 
      ref={containerRef}
      onCopy={e => e.preventDefault()}
      onCut={e => e.preventDefault()}
      onPaste={e => e.preventDefault()}
    >
      <div className="bg-gray-900 text-white px-4 sm:px-6 py-2 sm:py-3 flex justify-between items-center select-none">
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <Shield className="w-5 h-5 text-indigo-400 shrink-0" />
          <span className="font-bold truncate text-sm sm:text-base">{exam.title}</span>
          <span className="hidden md:block text-xs text-gray-400 border-l border-gray-700 pl-4 truncate">{studentName}</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <div className="flex items-center gap-2 bg-gray-800 px-2 sm:px-3 py-1 rounded-lg">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span className="font-mono font-bold text-base sm:text-lg">{timeLeft}</span>
          </div>
          <button 
            onClick={handleExit}
            className="bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Selesai</span>
          </button>
          <div className="hidden lg:flex items-center gap-2 text-xs text-gray-400">
            <Monitor className="w-4 h-4" />
            <span>Sesi Aman Aktif</span>
          </div>
        </div>
      </div>
      <div className="flex-1 relative bg-gray-100 overflow-hidden">
        <iframe 
          src={exam.url} 
          className="w-full h-full border-none bg-white relative z-0"
          title="Konten Ujian"
          allow="autoplay; camera; microphone; display-capture; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-presentation"
          referrerPolicy="no-referrer"
        />

        {/* Time Warning Overlay */}
        <AnimatePresence>
          {showTimeWarning !== null && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[10001] w-full max-w-md px-4"
            >
              <div className="bg-amber-600 text-white rounded-2xl shadow-2xl p-6 border-2 border-amber-400 flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <Clock className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-lg leading-tight">WAKTU TINGGAL {showTimeWarning} MENIT!</h3>
                  <p className="text-sm text-amber-100 font-medium">Segera kirim jawaban Anda dan tekan tombol Selesai.</p>
                </div>
                <button 
                  onClick={() => setShowTimeWarning(null)}
                  className="bg-white text-amber-700 px-4 py-2 rounded-xl font-bold text-sm hover:bg-amber-50 transition-colors"
                >
                  OK
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Freeze Overlay */}
        <AnimatePresence>
          {isFrozen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center p-6 text-center"
            >
              <div className="max-w-md">
                <div className="bg-red-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <AlertTriangle className="text-white w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">SISTEM TERKUNCI</h2>
                <p className="text-red-400 font-bold mb-6 uppercase tracking-widest">
                  Pelanggaran Terdeteksi (#{violationCount})
                </p>
                
                <div className="bg-white/10 rounded-2xl p-6 mb-6">
                  <p className="text-gray-300 text-sm mb-2">
                    {violationCount >= 3 
                      ? "Anda telah melakukan banyak pelanggaran. Masukkan PIN untuk melanjutkan."
                      : "Halaman akan terbuka kembali dalam:"}
                  </p>
                  <span className="text-6xl font-mono font-black text-white">{freezeTimeLeft}s</span>
                </div>

                {violationCount >= 3 && (
                  <div className="mb-6 text-left">
                    <label className="block text-[10px] font-black text-red-400 uppercase tracking-widest mb-2">Masukkan PIN (Kode Akses Ujian)</label>
                    <input 
                      type="text"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="Masukkan PIN..."
                      className="w-full px-5 py-3 bg-white/5 border-2 border-white/20 rounded-xl font-bold text-center text-white focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                )}

                <button 
                  onClick={resumeExam}
                  disabled={freezeTimeLeft > 0}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-xl ${
                    freezeTimeLeft > 0 
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-900/20'
                  }`}
                >
                  {freezeTimeLeft > 0 ? 'Menunggu...' : (violationCount >= 3 ? 'Verifikasi PIN & Lanjutkan' : 'Lanjutkan Ujian')}
                </button>
                
                <p className="mt-6 text-gray-500 text-xs">
                  Setiap pelanggaran akan menambah durasi kunci secara eksponensial.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Exit Confirmation Modal */}
        <AnimatePresence>
          {showExitModal && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center"
              >
                <LogOut className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Akhiri Ujian?</h3>
                <p className="text-gray-500 text-sm mb-6">
                  Pastikan Anda telah menyelesaikan semua soal sebelum keluar.
                </p>
                
                {exam.exitCode && (
                  <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 text-left">Kode Keluar</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center font-bold tracking-widest"
                      placeholder="••••••"
                      value={exitCodeInput}
                      onChange={e => setExitCodeInput(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setShowExitModal(false);
                      setExitCodeInput('');
                    }}
                    className="flex-1 py-3 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={confirmExit}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                  >
                    Ya, Selesai
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Player Error Modal */}
        <AnimatePresence>
          {playerError && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center"
              >
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Pemberitahuan</h3>
                <p className="text-gray-500 text-sm mb-6">{playerError}</p>
                <button 
                  onClick={() => setPlayerError(null)}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  Mengerti
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // If logged in via Google with correct email OR logged in anonymously with local token
        if ((user.email && ADMIN_EMAILS.includes(user.email)) || (user.isAnonymous && localStorage.getItem('admin_token') === 'secure_session_active')) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } else {
        const token = localStorage.getItem('admin_token');
        if (token === 'secure_session_active') {
          // Bypass UI lock if local token exists, allowing user to see dashboard
          // even if Firebase Auth is misconfigured (though Firestore writes will fail)
          setIsAdmin(true);
          try {
            await signInAnonymously(auth);
          } catch (e) {
            console.warn("Firebase Auth failed, but local session is active. Firestore writes may fail.", e);
          }
        } else {
          setIsAdmin(false);
        }
      }
    });

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show if not already installed and not on admin page
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      unsubAuth();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('admin_token');
    setIsAdmin(false);
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
        <Navbar isAdmin={isAdmin} onLogout={handleLogout} />
        
        <Routes>
          <Route 
            path="/admin" 
            element={isAdmin ? <AdminDashboard /> : <AdminLogin onLogin={() => setIsAdmin(true)} />} 
          />

          <Route path="/" element={<StudentHome />} />

          <Route 
            path="/exam/:id" 
            element={<ExamPlayer />} 
          />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>

        {/* PWA Install Prompt */}
        <AnimatePresence>
          {showInstallPrompt && (
            <div className="fixed bottom-6 left-6 right-6 z-[100] flex justify-center pointer-events-none">
              <motion.div 
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl border border-indigo-100 p-5 max-w-md w-full flex items-center gap-4 pointer-events-auto"
              >
                <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-100 shrink-0">
                  <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-black text-gray-900 leading-tight">Install ExamGuard</h4>
                  <p className="text-[11px] text-gray-500 font-medium leading-tight mt-0.5">Akses ujian lebih cepat & stabil langsung dari layar utama HP kamu.</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowInstallPrompt(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={handleInstall}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    INSTALL
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </Router>
  );
}
