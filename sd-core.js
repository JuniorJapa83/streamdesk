/**
 * StreamDesk — sd-core.js  (v1.1)
 * ════════════════════════════════════════════════════════
 * Módulo central: Firebase, helpers, WhatsApp, UI utils.
 * Importe em TODAS as páginas:
 *   <script type="module">
 *     import * as SD from './sd-core.js';
 *
 * NUNCA coloque lógica de página aqui; só utilitários.
 * ════════════════════════════════════════════════════════
 */

// ── FIREBASE ──────────────────────────────────────────────────
import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import {
  getFirestore,
  collection, doc,
  getDocs, getDoc, addDoc, setDoc, deleteDoc,
  query, where, orderBy, limit,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const FB_CONFIG = {
  apiKey:            'AIzaSyAGHvkDpeSbCTriZCvRf-jJ6z8PQSSWLHI',
  authDomain:        'streamdesk-5350d.firebaseapp.com',
  projectId:         'streamdesk-5350d',
  storageBucket:     'streamdesk-5350d.firebasestorage.app',
  messagingSenderId: '36684694847',
  appId:             '1:36684694847:web:0f6f3a27933e3d84cfff8a',
};

const _app  = initializeApp(FB_CONFIG);
export const auth = getAuth(_app);
export const db   = getFirestore(_app);

// ── REFERÊNCIAS DE COLEÇÕES ───────────────────────────────────
/** Retorna a coleção de clientes do usuário autenticado */
export const clientCol = (uid) => collection(db, 'usuarios', uid, 'clientes');
/** Retorna a coleção de servidores */
export const srvCol    = (uid) => collection(db, 'usuarios', uid, 'servidores');
/** Retorna a coleção financeira */
export const finCol    = (uid) => collection(db, 'usuarios', uid, 'financas');
/** Retorna o documento raiz do usuário */
export const userDoc   = (uid) => doc(db, 'usuarios', uid);
/** Documento de aviso global da administração */
export const avisoDoc  = ()    => doc(db, 'config', 'aviso');

// ── QUERIES OTIMIZADAS ────────────────────────────────────────
/**
 * Busca apenas clientes que vencem até uma data limite.
 * Evita carregar toda a coleção quando queremos só vencidos.
 * @param {string} uid
 * @param {string} dataLimite — formato 'YYYY-MM-DD'
 * @param {number} [max=200]
 */
export async function getClientesVencidos(uid, dataLimite, max = 200) {
  const q = query(
    clientCol(uid),
    where('vencimento', '<=', dataLimite),
    orderBy('vencimento', 'asc'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Busca clientes de um servidor específico.
 * @param {string} uid
 * @param {string} servidor — nome exato do servidor
 * @param {number} [max=500]
 */
export async function getClientesPorServidor(uid, servidor, max = 500) {
  const q = query(
    clientCol(uid),
    where('plataforma', '==', servidor),
    orderBy('vencimento', 'asc'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Busca TODOS os clientes (para Home e relatórios).
 * Use com moderação — prefira queries filtradas acima.
 * Limite de segurança: 2.000 registros.
 */
export async function getTodosClientes(uid) {
  const q = query(
    clientCol(uid),
    orderBy('vencimento', 'asc'),
    limit(2000)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Busca todos os servidores do usuário (coleção pequena — sem limit).
 */
export async function getServidores(uid) {
  const snap = await getDocs(srvCol(uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Busca financas de um mês específico.
 * @param {string} uid
 * @param {string} prefixo — ex: '2025-04'
 */
export async function getFinancasMes(uid, prefixo) {
  // Firestore não suporta startsWith, usamos range (YYYY-MM-00 a YYYY-MM-99)
  const q = query(
    finCol(uid),
    where('data', '>=', prefixo + '-01'),
    where('data', '<=', prefixo + '-31'),
    orderBy('data', 'desc'),
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── HELPERS DE DATA ───────────────────────────────────────────
/** Retorna hoje no formato 'YYYY-MM-DD' */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Retorna amanhã no formato 'YYYY-MM-DD' */
export function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Formata 'YYYY-MM-DD' → 'DD/MM/YYYY' */
export function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

/** Quantos dias faltam para a data (negativo = atrasado) */
export function daysFrom(dateStr) {
  const t   = new Date(today().replace(/-/g, '/'));
  const d   = new Date(dateStr.replace(/-/g, '/'));
  return Math.round((d - t) / 86_400_000);
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── HELPERS DE STATUS ─────────────────────────────────────────
/**
 * Retorna o status do cliente: 'vencido' | 'hoje' | 'amanha' | 'em-dia'
 */
export function getStatus(vencimento) {
  const t  = today();
  const tm = tomorrow();
  if (vencimento < t)  return 'vencido';
  if (vencimento === t) return 'hoje';
  if (vencimento === tm) return 'amanha';
  return 'em-dia';
}

/** Mapa de label e classe CSS para cada status */
export const STATUS_META = {
  'vencido': { label: 'Vencido',    pill: 'pill-vencido', bar: 'bar-vencido', color: 'var(--red)'    },
  'hoje':    { label: 'Hoje',       pill: 'pill-hoje',    bar: 'bar-hoje',    color: 'var(--yellow)' },
  'amanha':  { label: 'Amanhã',     pill: 'pill-amanha',  bar: 'bar-amanha',  color: 'var(--orange)' },
  'em-dia':  { label: 'Em Dia',     pill: 'pill-em-dia',  bar: 'bar-em-dia',  color: 'var(--green)'  },
};

// ── CÁLCULOS / INSIGHTS ───────────────────────────────────────
/**
 * Calcula métricas de inadimplência por servidor.
 * @param {Array} clientes
 * @param {Array} servidores
 * @returns {Array} — cada item: { ...servidor, total, inad, pct }
 */
export function calcInadimplencia(clientes, servidores) {
  const t = today();
  return servidores
    .filter(s => s.status !== 'offline')
    .map(s => {
      const total = clientes.filter(c => c.plataforma === s.nome).length;
      const inad  = clientes.filter(c => c.plataforma === s.nome && c.vencimento < t).length;
      const pct   = total > 0 ? Math.round((inad / total) * 100) : 0;
      return { ...s, total, inad, pct };
    })
    .sort((a, b) => a.pct - b.pct); // melhor primeiro
}

/**
 * Retorna totais de clientes por status e valor total de cada grupo.
 * Corrige o bug de "if (valV)" — sempre retorna número, inclusive 0.
 */
export function calcResumo(clientes) {
  const t  = today();
  const tm = tomorrow();

  const grupos = {
    vencido: clientes.filter(c => c.vencimento <  t),
    hoje:    clientes.filter(c => c.vencimento === t),
    amanha:  clientes.filter(c => c.vencimento === tm),
    emDia:   clientes.filter(c => c.vencimento >  t),
  };

  const somaValor = (arr) =>
    arr.reduce((acc, c) => acc + (parseFloat(c.plano) || 0), 0);

  return {
    vencido: { count: grupos.vencido.length, valor: somaValor(grupos.vencido) },
    hoje:    { count: grupos.hoje.length,    valor: somaValor(grupos.hoje)    },
    amanha:  { count: grupos.amanha.length,  valor: somaValor(grupos.amanha)  },
    emDia:   { count: grupos.emDia.length,   valor: somaValor(grupos.emDia)   },
    total:   clientes.length,
  };
}

/**
 * Calcula lucro líquido de uma lista de pagamentos.
 * @param {Array} pagamentos — financas do mês
 * @param {Function} getCusto — função que recebe nome do servidor e retorna custo
 */
export function calcLucro(pagamentos, getCusto) {
  const receita  = pagamentos.reduce((s, f) => s + (parseFloat(f.valor) || 0), 0);
  const despesas = pagamentos.reduce((s, f) => s + (getCusto(f.plataforma) || 0), 0);
  return { receita, despesas, lucro: receita - despesas };
}

// ── FORMATAÇÃO ────────────────────────────────────────────────
/** Formata número como moeda BRL: "R$ 1.250,00" */
export function fmtBRL(valor) {
  const v = typeof valor === 'number' ? valor : parseFloat(valor) || 0;
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Iniciais do nome: "João Silva" → "JS" */
export function initials(nome) {
  const parts = (nome || '').trim().split(' ');
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

// ── WHATSAPP ─────────────────────────────────────────────────
/**
 * Monta a mensagem de WhatsApp usando os templates configurados.
 */
export function buildWAMsg(cliente, config = {}) {
  const status = getStatus(cliente.vencimento);
  const tplMap = {
    vencido: config.msgVencido || 'Olá {nome}! 👋 Seu plano IPTV ({servidor}) está vencido. Entre em contato para renovar! 🙏',
    hoje:    config.msgHoje    || 'Olá {nome}! 👋 Seu plano IPTV ({servidor}) vence HOJE. Renove para não ficar sem sinal! 📺',
    amanha:  config.msgAmanha  || 'Olá {nome}! 👋 Seu plano IPTV ({servidor}) vence amanhã. Renove! 😊',
    'em-dia':config.msgVencido || 'Olá {nome}! 👋 Verificamos seu plano ({servidor}). Tudo certo por aqui! ✅',
  };
  const tpl = tplMap[status] || tplMap.vencido;
  return tpl
    .replace(/{nome}/g,     cliente.nome.split(' ')[0])
    .replace(/{servidor}/g, cliente.plataforma);
}

/**
 * Abre WhatsApp para UM cliente.
 * Não usa setTimeout — o usuário clica, o browser abre.
 */
export function sendWA(cliente, config = {}) {
  const msg   = buildWAMsg(cliente, config);
  const phone = cliente.contato ? cliente.contato.replace(/\D/g, '') : '';
  const url   = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener');
}

/**
 * Envio em lote — NÃO usa window.open em loop (bloqueado pelo browser).
 * Retorna lista de {cliente, url, msg} para o UI processar um por vez.
 * O componente de UI chama cada item com confirmação do usuário.
 */
export function buildWAQueue(clientes, config = {}) {
  return clientes.map(c => {
    const msg   = buildWAMsg(c, config);
    const phone = c.contato ? c.contato.replace(/\D/g, '') : '';
    const url   = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    return { cliente: c, url, msg };
  });
}

// ── UI UTILS ──────────────────────────────────────────────────
/** Exibe um toast na tela por `dur` ms */
export function showToast(msg, dur = 2800) {
  let t = document.getElementById('sd-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'sd-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), dur);
}

/** Abre um overlay/modal pelo ID */
export function openOverlay(id) {
  document.getElementById(id)?.classList.add('open');
}

/** Fecha um overlay/modal pelo ID */
export function closeOverlay(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ── TEMA ─────────────────────────────────────────────────────
/**
 * Aplica o tema correto no body ANTES do primeiro render.
 * Deve ser chamado no <head> de cada página, em <script type="module">.
 * Como módulos são diferidos, há uma versão inline no HTML também.
 */
export function applyTheme() {
  const cfg = JSON.parse(localStorage.getItem('streamdesk_config') || '{}');
  document.body.classList.toggle('dark', cfg.darkMode === true);
  document.body.classList.remove('light'); // remove classe legada
}

// ── AUTH GUARD ────────────────────────────────────────────────
/**
 * Listener de autenticação com redirecionamento.
 * @param {Function} onUser — callback chamado com o usuário autenticado
 * @param {string}   [redirect='login.html']
 */
export function requireAuth(onUser, redirect = 'login.html') {
  onAuthStateChanged(auth, user => {
    if (!user) { location.href = redirect; return; }
    onUser(user);
  });
}

// ── AVISO DA ADMINISTRAÇÃO ─────────────────────────────────────
/**
 * Verifica e exibe o aviso da administração se necessário.
 * Usa sessionStorage para evitar repetição na sessão.
 */
export async function checkAviso(user) {
  try {
    const snap = await getDoc(avisoDoc());
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data.ativo || !data.texto) return;

    const avisoId  = data.atualizadoEm || 'v1';
    const keySess  = `aviso_sessao_${avisoId}_${user.uid}`;

    if (data.frequencia === 'uma') {
      const keyUma = `aviso_uma_${avisoId}_${user.uid}`;
      if (localStorage.getItem(keyUma)) return;
      window._avisoKeyUma = keyUma;
    }

    if (sessionStorage.getItem(keySess)) return;
    sessionStorage.setItem(keySess, '1');

    window._avisoFreq = data.frequencia || 'sempre';
    const body = document.getElementById('avisoBoxBody');
    const btn  = document.getElementById('avisoBoxBtn');
    const ov   = document.getElementById('avisoOverlay');
    if (!body || !btn || !ov) return;

    body.textContent = data.texto;
    ov.classList.add('show');
    btn.onclick = () => {
      ov.classList.remove('show');
      if (window._avisoFreq === 'uma' && window._avisoKeyUma)
        localStorage.setItem(window._avisoKeyUma, '1');
    };
  } catch (e) {
    console.warn('[SD] checkAviso:', e);
  }
}

// ── BANNER DE VENCIMENTO DO PLANO ─────────────────────────────
/**
 * Exibe banner se o plano do gerente estiver vencendo/vencido.
 * @param {string|null} vencimento — data no formato 'YYYY-MM-DD'
 */
export function mostrarBannerPlano(vencimento) {
  if (!vencimento) return;
  const banner  = document.getElementById('bannerVenc');
  if (!banner) return;

  const hoje  = new Date(); hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = vencimento.split('-').map(Number);
  const venc  = new Date(y, m - 1, d);
  const dias  = Math.round((venc - hoje) / 86_400_000);

  if (dias < 0) {
    banner.className = 'banner-venc vencido';
    banner.querySelector('.banner-venc-icon').textContent   = '🔴';
    banner.querySelector('.banner-venc-titulo').textContent = 'Sua assinatura está vencida!';
    banner.querySelector('.banner-venc-sub').textContent    = 'Renove agora para continuar usando o StreamDesk';
    banner.style.display = 'block';
  } else if (dias <= 7) {
    const txt = dias === 0 ? 'Vence hoje!' : `Vence em ${dias} dia${dias > 1 ? 's' : ''}!`;
    banner.className = 'banner-venc vencendo';
    banner.querySelector('.banner-venc-icon').textContent   = '⚡';
    banner.querySelector('.banner-venc-titulo').textContent = txt;
    banner.querySelector('.banner-venc-sub').textContent    = 'Toque para renovar sua assinatura';
    banner.style.display = 'block';
  }
}

// ── REEXPORTA FIREBASE PARA NÃO PRECISAR IMPORTAR 2x ─────────
export {
  collection, doc,
  getDocs, getDoc, addDoc, setDoc, deleteDoc,
  query, where, orderBy, limit,
};
