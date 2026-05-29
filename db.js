// ============================================================
//  GreenTrack — Shared Data Store & Auth
//  db.js  (loaded by all pages)
// ============================================================

const GT = (() => {

  // ── Seed data ──────────────────────────────────────────────
  const DEFAULT_DATA = {
    users: [
      { id: 'emp1', username: 'admin',    password: 'admin123',   role: 'employee', name: 'Alex (Manager)' },
      { id: 'emp2', username: 'mike',     password: 'mike123',    role: 'employee', name: 'Mike Green' },
      { id: 'u1',   username: 'john_doe', password: 'password123',role: 'customer', name: 'John Doe',      customerId: 'C001' },
      { id: 'u2',   username: 'mary_j',   password: 'pass456',    role: 'customer', name: 'Mary Johnson',  customerId: 'C002' },
    ],
    customers: [
      { id: 'C001', name: 'John Doe',      email: 'john@example.com',  phone: '(201) 555-0101', address: '45 Oak Ave, Jersey City, NJ',  userId: 'u1' },
      { id: 'C002', name: 'Mary Johnson',  email: 'mary@example.com',  phone: '(201) 555-0202', address: '12 Maple Dr, Jersey City, NJ', userId: 'u2' },
    ],
    taskTypes: [
      { id: 'T01', name: 'Lawn Mowing',     icon: '🌾', rate: 45, desc: 'Standard lawn mowing service' },
      { id: 'T02', name: 'Hedge Trimming',  icon: '✂️',  rate: 55, desc: 'Shape and trim hedges and bushes' },
      { id: 'T03', name: 'Leaf Blowing',    icon: '🍂', rate: 35, desc: 'Remove leaves and debris' },
      { id: 'T04', name: 'Fertilizing',     icon: '🌱', rate: 65, desc: 'Lawn fertilization treatment' },
      { id: 'T05', name: 'Weed Control',    icon: '🌿', rate: 50, desc: 'Remove and treat weeds' },
      { id: 'T06', name: 'Irrigation Check',icon: '💧', rate: 75, desc: 'Inspect and adjust irrigation' },
    ],
    transactions: [
      { id:'TX001', customerId:'C001', taskId:'T01', date:'2025-05-10', start:'08:00', end:'09:30', cost:67.50, type:'debit',  notes:'Front and backyard mowing done.',        loggedBy:'Alex (Manager)', taskName:'Lawn Mowing' },
      { id:'TX002', customerId:'C001', taskId:'T02', date:'2025-05-15', start:'10:00', end:'11:00', cost:55.00, type:'debit',  notes:'Trimmed all hedges along fence.',        loggedBy:'Alex (Manager)', taskName:'Hedge Trimming' },
      { id:'TX003', customerId:'C001', taskId:null,  date:'2025-05-18', start:'',     end:'',      cost:100.00,type:'credit', notes:'Customer payment — check #1042',          loggedBy:'Alex (Manager)', taskName:'Payment' },
      { id:'TX004', customerId:'C002', taskId:'T03', date:'2025-05-12', start:'14:00', end:'15:00', cost:35.00, type:'debit',  notes:'Leaf blowing — front yard and driveway.',loggedBy:'Alex (Manager)', taskName:'Leaf Blowing' },
      { id:'TX005', customerId:'C002', taskId:null,  date:'2025-05-20', start:'',     end:'',      cost:35.00, type:'credit', notes:'Venmo payment received.',                 loggedBy:'Alex (Manager)', taskName:'Payment' },
    ],
    counters: { tx: 6, cust: 3, task: 7, user: 5 }
  };

  // ── Persistence (localStorage) ─────────────────────────────
  const STORE_KEY = 'greentrack_v1';

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : structuredClone(DEFAULT_DATA);
    } catch { return structuredClone(DEFAULT_DATA); }
  }

  function save(db) {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  }

  function reset() {
    localStorage.removeItem(STORE_KEY);
    return structuredClone(DEFAULT_DATA);
  }

  let db = load();

  // ── Session (sessionStorage) ───────────────────────────────
  const SESSION_KEY = 'gt_session';

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function setSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ── Auth ───────────────────────────────────────────────────
  function login(username, password, requiredRole) {
    const u = db.users.find(x => x.username === username && x.password === password && x.role === requiredRole);
    if (!u) return null;
    setSession(u);
    return u;
  }

  function logout(redirectTo = 'employee-login.html') {
    clearSession();
    window.location.href = redirectTo;
  }

  function requireAuth(role) {
    const session = getSession();
    if (!session) { window.location.href = role === 'employee' ? 'employee-login.html' : 'customer-login.html'; return null; }
    if (role && session.role !== role) { window.location.href = role === 'employee' ? 'employee-login.html' : 'customer-login.html'; return null; }
    return session;
  }

  // ── Balance calc ───────────────────────────────────────────
  function getBalance(customerId) {
    const txs = db.transactions.filter(t => t.customerId === customerId);
    const totalCredit = txs.filter(t => t.type === 'credit').reduce((s, t) => s + t.cost, 0);
    const totalDebit  = txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.cost, 0);
    return { balance: totalCredit - totalDebit, totalCredit, totalDebit, txCount: txs.length, jobCount: txs.filter(t => t.taskId).length };
  }

  // ── CRUD helpers ───────────────────────────────────────────
  function addTransaction(tx) {
    const id = 'TX' + String(db.counters.tx++).padStart(3, '0');
    const record = { id, ...tx };
    db.transactions.push(record);
    save(db);
    return record;
  }

  function addCustomer(data) {
    const custId = 'C' + String(100 + db.counters.cust++).slice(-3);
    const userId  = 'u' + db.counters.user++;
    const cust = { id: custId, name: data.name, email: data.email, phone: data.phone, address: data.address, userId };
    const user = { id: userId, username: data.username, password: data.password, role: 'customer', name: data.name, customerId: custId };
    db.customers.push(cust);
    db.users.push(user);
    save(db);
    return { cust, user };
  }

  function addTaskType(data) {
    const id = 'T' + String(10 + db.counters.task++).slice(-2);
    const task = { id, ...data };
    db.taskTypes.push(task);
    save(db);
    return task;
  }

  function deleteTransaction(id) {
    db.transactions = db.transactions.filter(t => t.id !== id);
    save(db);
  }

  // ── Utilities ──────────────────────────────────────────────
  function fmt(n) { return '$' + Number(n).toFixed(2); }

  function calcDuration(start, end) {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 1440;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  function today() { return new Date().toISOString().split('T')[0]; }

  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    get db() { return db; },
    reset,
    login, logout, requireAuth, getSession, setSession, clearSession,
    getBalance,
    addTransaction, addCustomer, addTaskType, deleteTransaction,
    fmt, calcDuration, today, nowTime,
  };
})();
