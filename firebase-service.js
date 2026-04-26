// StreamDesk — Firebase Service
// Usado por todas as páginas do app

import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }   from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc,
         collection, getDocs, addDoc,
         deleteDoc, updateDoc, query,
         orderBy }                                from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjh7BrMk1MKkLU9MOYJsI1XxantSt1V1g",
  authDomain: "streamdesk-5350d.firebaseapp.com",
  projectId: "streamdesk-5350d",
  storageBucket: "streamdesk-5350d.firebasestorage.app",
  messagingSenderId: "36684694847",
  appId: "1:36684694847:web:0f6f3a27933e3d84cfff8a"
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── Auth guard ────────────────────────────────────
export function requireAuth(callback) {
  onAuthStateChanged(auth, function(user) {
    if (!user) { location.href = 'login.html'; return; }
    callback(user);
  });
}

// ── User ref helpers ─────────────────────────────
export function clientesRef(uid)   { return collection(db, 'clientes',   uid, 'lista'); }
export function servidoresRef(uid) { return collection(db, 'servidores', uid, 'lista'); }
export function financasRef(uid)   { return collection(db, 'financas',   uid, 'lista'); }
export function configRef(uid)     { return doc(db, 'config', uid); }

// ── CLIENTES ─────────────────────────────────────
export async function getClientes(uid) {
  var snap = await getDocs(clientesRef(uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveCliente(uid, cliente) {
  if (cliente.id) {
    var id = cliente.id;
    var data = { ...cliente }; delete data.id;
    await setDoc(doc(db, 'clientes', uid, 'lista', id), data);
    return id;
  } else {
    var ref = await addDoc(clientesRef(uid), cliente);
    return ref.id;
  }
}
export async function deleteCliente(uid, id) {
  await deleteDoc(doc(db, 'clientes', uid, 'lista', id));
}

// ── SERVIDORES ────────────────────────────────────
export async function getServidores(uid) {
  var snap = await getDocs(servidoresRef(uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveServidor(uid, servidor) {
  if (servidor.id) {
    var id = servidor.id;
    var data = { ...servidor }; delete data.id;
    await setDoc(doc(db, 'servidores', uid, 'lista', id), data);
    return id;
  } else {
    var ref = await addDoc(servidoresRef(uid), servidor);
    return ref.id;
  }
}
export async function deleteServidor(uid, id) {
  await deleteDoc(doc(db, 'servidores', uid, 'lista', id));
}

// ── FINANÇAS ──────────────────────────────────────
export async function getFinancas(uid) {
  var snap = await getDocs(financasRef(uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveFinanca(uid, financa) {
  if (financa.id) {
    var id = financa.id;
    var data = { ...financa }; delete data.id;
    await setDoc(doc(db, 'financas', uid, 'lista', id), data);
    return id;
  } else {
    var ref = await addDoc(financasRef(uid), financa);
    return ref.id;
  }
}
export async function deleteFinanca(uid, id) {
  await deleteDoc(doc(db, 'financas', uid, 'lista', id));
}

// ── CONFIG ────────────────────────────────────────
export async function getConfig(uid) {
  var snap = await getDoc(configRef(uid));
  return snap.exists() ? snap.data() : {};
}
export async function saveConfig(uid, data) {
  await setDoc(configRef(uid), data, { merge: true });
}

// ── LOGOUT ────────────────────────────────────────
export async function doLogout() {
  await signOut(auth);
  location.href = 'login.html';
}

// ── DATE HELPERS ──────────────────────────────────
export function todayStr() {
  var d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
export function tomorrowStr() {
  var d = new Date(); d.setDate(d.getDate()+1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
export function formatDate(d) {
  if (!d) return '—';
  var p = d.split('-'); return p[2]+'/'+p[1]+'/'+p[0];
}
