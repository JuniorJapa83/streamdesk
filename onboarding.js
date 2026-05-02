/**
 * StreamDesk — onboarding.js  (v1.0)
 * ════════════════════════════════════════════════════════
 * Sistema de onboarding B+A:
 *   A) Tour guiado na primeira abertura (welcome flow)
 *   B) Empty states inteligentes por contexto
 *
 * USO — adicione em TODAS as páginas, antes do </body>:
 *   <script type="module" src="./onboarding.js"></script>
 *
 * O módulo se auto-inicializa. Não requer chamada manual.
 * Depende apenas de: localStorage (sem Firebase).
 * ════════════════════════════════════════════════════════
 */

// ── CONSTANTES ────────────────────────────────────────────────
const OB_KEY       = 'sd_onboarding_done';   // localStorage: tour concluído?
const OB_STEP_KEY  = 'sd_onboarding_step';   // localStorage: passo atual
const OB_SEEN_KEY  = 'sd_pages_seen';        // localStorage: páginas visitadas (JSON array)

// ── PASSOS DO TOUR ─────────────────────────────────────────────
// Cada passo tem: id, page (glob), selector (CSS), título, texto, position
const TOUR_STEPS = [
  {
    id: 'welcome',
    page: 'index.html',
    selector: null,           // null = modal central (sem destaque de elemento)
    title: '👋 Bem-vindo ao StreamDesk!',
    text: 'Seu painel completo para gerenciar assinantes de IPTV. Vamos dar uma volta rápida pelo app?',
    cta: 'Vamos lá!',
    skip: 'Pular tour',
    position: 'center',
  },
  {
    id: 'home-stats',
    page: 'index.html',
    selector: '.stats-grid, .kpi-row, [class*="stat"], .home-stats',
    title: '📊 Visão geral do negócio',
    text: 'Aqui você acompanha o resumo do dia: total de clientes, vencimentos próximos e receita.',
    cta: 'Próximo',
    position: 'bottom',
  },
  {
    id: 'nav-clientes',
    page: 'index.html',
    selector: '.nav-item:nth-child(2), [onclick*="clientes"]',
    title: '👥 Gestão de Clientes',
    text: 'Cadastre assinantes, renove planos e envie cobranças pelo WhatsApp com um toque.',
    cta: 'Próximo',
    position: 'top',
  },
  {
    id: 'nav-servidor',
    page: 'index.html',
    selector: '.nav-item:nth-child(3), [onclick*="servidor"]',
    title: '🖥️ Servidores',
    text: 'Organize seus clientes por servidor. Veja a taxa de inadimplência de cada plataforma.',
    cta: 'Próximo',
    position: 'top',
  },
  {
    id: 'nav-financas',
    page: 'index.html',
    selector: '.nav-item:nth-child(4), [onclick*="financas"]',
    title: '💰 Finanças',
    text: 'Registre pagamentos e veja o faturamento mensal, ranking de servidores e histórico.',
    cta: 'Próximo',
    position: 'top',
  },
  {
    id: 'nav-avisos',
    page: 'index.html',
    selector: '.nav-item:nth-child(5), [onclick*="avisos"]',
    title: '📢 Avisos',
    text: 'Receba comunicados do administrador e fique por dentro de atualizações do sistema.',
    cta: 'Próximo',
    position: 'top',
  },
  {
    id: 'fab',
    page: 'index.html',
    selector: '.fab, [class*="fab"]',
    title: '⚡ Ação rápida',
    text: 'O botão + adiciona um novo cliente de qualquer tela. É o atalho mais usado do app!',
    cta: 'Entendido!',
    position: 'top',
  },
  {
    id: 'finish',
    page: 'index.html',
    selector: null,
    title: '🎉 Pronto para começar!',
    text: 'O StreamDesk está configurado e esperando por você. Adicione seu primeiro servidor e depois seu primeiro cliente.',
    cta: 'Começar agora',
    position: 'center',
  },
];

// ── EMPTY STATES POR PÁGINA ────────────────────────────────────
// Contexto inteligente: cada entry descreve o empty state certo
const EMPTY_STATES = {
  // Clientes — sem nenhum servidor ainda
  'clientes-no-server': {
    icon: '🖥️',
    title: 'Crie um servidor primeiro',
    sub: 'Para adicionar clientes, você precisa ter pelo menos um servidor cadastrado.',
    action: { label: 'Ir para Servidores', href: 'servidor.html' },
    tip: null,
  },
  // Clientes — servidor existe, mas lista vazia
  'clientes-empty': {
    icon: '👥',
    title: 'Nenhum cliente ainda',
    sub: 'Adicione seu primeiro assinante e comece a gerenciar sua base com facilidade.',
    action: { label: '＋ Adicionar cliente', fn: 'CL.openModal()' },
    tip: '💡 Dica: use o botão ＋ no canto inferior direito para adicionar clientes rapidamente.',
  },
  // Clientes — busca sem resultado
  'clientes-search': {
    icon: '🔍',
    title: 'Nenhum resultado',
    sub: 'Verifique a ortografia ou tente um termo diferente.',
    action: { label: 'Limpar busca', fn: 'CL.clearSearch()' },
    tip: null,
  },
  // Clientes — filtro sem resultado
  'clientes-filter': {
    icon: '📭',
    title: 'Nenhum cliente neste filtro',
    sub: 'Tente ajustar os filtros acima ou selecione "Todos" para ver toda a lista.',
    action: { label: 'Ver todos', fn: "CL.setFilterById('todos')" },
    tip: null,
  },
  // Servidores — vazio
  'servidor-empty': {
    icon: '🖥️',
    title: 'Nenhum servidor cadastrado',
    sub: 'Adicione seu primeiro servidor para começar a organizar seus clientes de IPTV.',
    action: { label: '＋ Adicionar Servidor', fn: 'SRV.openModal()' },
    tip: '💡 Dica: cada servidor pode ter uma cor diferente para identificação visual.',
  },
  // Finanças — sem movimentações no mês
  'financas-empty': {
    icon: '💰',
    title: 'Sem movimentações este mês',
    sub: 'Registre um pagamento para ver o resumo financeiro e o ranking de servidores.',
    action: { label: '＋ Novo Pagamento', fn: "document.getElementById('fabNew').click()" },
    tip: '💡 Dica: pagamentos são vinculados ao servidor para gerar o ranking de receita.',
  },
  // Avisos — sem avisos
  'avisos-empty': {
    icon: '📢',
    title: 'Nenhum aviso no momento',
    sub: 'O administrador publicará comunicados importantes aqui. Fique de olho!',
    action: null,
    tip: null,
  },
};

// ═══════════════════════════════════════════════════════════════
// MÓDULO DO TOUR
// ═══════════════════════════════════════════════════════════════

const Tour = (() => {
  let currentStep = 0;
  let overlay = null;
  let spotlight = null;
  let bubble = null;

  // Injeta o CSS do tour no <head> (uma vez)
  function injectCSS() {
    if (document.getElementById('sd-ob-style')) return;
    const s = document.createElement('style');
    s.id = 'sd-ob-style';
    s.textContent = `
/* ── StreamDesk Onboarding ── */
#sd-ob-overlay {
  position: fixed; inset: 0; z-index: 9998;
  pointer-events: none;
}
#sd-ob-spotlight {
  position: fixed; z-index: 9999;
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.62);
  transition: all .35s cubic-bezier(.4,0,.2,1);
  pointer-events: none;
  outline: 2.5px solid rgba(99,102,241,.7);
  outline-offset: 3px;
}
#sd-ob-bubble {
  position: fixed; z-index: 10000;
  background: var(--card, #fff);
  border: 1px solid var(--border, #e8ecf2);
  border-radius: 20px;
  padding: 22px 20px 18px;
  width: min(320px, calc(100vw - 32px));
  box-shadow: 0 24px 64px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.08);
  transition: all .32s cubic-bezier(.4,0,.2,1);
  font-family: var(--font, 'Plus Jakarta Sans', sans-serif);
}
.ob-bubble-arrow {
  position: absolute; width: 14px; height: 14px;
  background: var(--card, #fff);
  border: 1px solid var(--border, #e8ecf2);
  rotate: 45deg;
}
.ob-bubble-arrow.top    { bottom: -8px; left: 50%; translate: -50% 0; border-top: none; border-left: none; }
.ob-bubble-arrow.bottom { top: -8px;   left: 50%; translate: -50% 0; border-bottom: none; border-right: none; }
.ob-progress {
  display: flex; gap: 5px; margin-bottom: 14px;
}
.ob-dot {
  height: 3px; border-radius: 99px; background: var(--border, #e8ecf2);
  flex: 1; transition: background .3s;
}
.ob-dot.done { background: var(--accent, #6366f1); }
.ob-title {
  font-size: 16px; font-weight: 800; color: var(--text, #0f172a);
  margin-bottom: 7px; line-height: 1.3;
}
.ob-text {
  font-size: 13px; color: var(--muted2, #64748b);
  line-height: 1.55; margin-bottom: 18px;
}
.ob-actions { display: flex; gap: 10px; align-items: center; }
.ob-cta {
  flex: 1; background: var(--accent, #6366f1); color: #fff;
  border: none; border-radius: 50px; padding: 11px 0;
  font-size: 14px; font-weight: 700; cursor: pointer;
  font-family: var(--font, sans-serif);
  box-shadow: 0 4px 14px var(--accent-glow, rgba(99,102,241,.2));
  transition: transform .15s, box-shadow .15s;
}
.ob-cta:active { transform: scale(.96); }
.ob-skip {
  background: none; border: none;
  color: var(--muted2, #64748b); font-size: 12px;
  cursor: pointer; font-family: var(--font, sans-serif);
  padding: 4px 8px; border-radius: 8px;
  transition: color .15s;
  white-space: nowrap;
}
.ob-skip:hover { color: var(--red, #ef4444); }

/* Welcome / Finish modal central */
#sd-ob-modal {
  position: fixed; inset: 0; z-index: 10001;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: obFadeIn .3s ease both;
  font-family: var(--font, 'Plus Jakarta Sans', sans-serif);
}
.ob-modal-card {
  background: var(--card, #fff);
  border: 1px solid var(--border, #e8ecf2);
  border-radius: 28px;
  padding: 36px 28px 28px;
  width: min(360px, calc(100vw - 32px));
  text-align: center;
  box-shadow: 0 32px 80px rgba(0,0,0,.22);
  animation: obSlideUp .38s cubic-bezier(.4,0,.2,1) both;
}
.ob-modal-emoji { font-size: 54px; margin-bottom: 16px; display: block; }
.ob-modal-title {
  font-size: 22px; font-weight: 800; color: var(--text, #0f172a);
  margin-bottom: 10px; line-height: 1.25;
}
.ob-modal-text {
  font-size: 14px; color: var(--muted2, #64748b);
  line-height: 1.6; margin-bottom: 26px;
}
.ob-modal-cta {
  width: 100%; background: linear-gradient(135deg, var(--accent, #6366f1), var(--purple, #8b5cf6));
  color: #fff; border: none; border-radius: 50px;
  padding: 14px 0; font-size: 15px; font-weight: 800;
  cursor: pointer; font-family: var(--font, sans-serif);
  box-shadow: 0 6px 20px rgba(99,102,241,.35);
  transition: transform .15s;
}
.ob-modal-cta:active { transform: scale(.97); }
.ob-modal-skip {
  display: block; margin-top: 14px;
  background: none; border: none;
  color: var(--muted2, #64748b); font-size: 13px;
  cursor: pointer; font-family: var(--font, sans-serif);
}
.ob-modal-skip:hover { color: var(--text, #0f172a); }

/* Animações */
@keyframes obFadeIn  { from { opacity: 0 } to { opacity: 1 } }
@keyframes obSlideUp { from { opacity:0; transform:translateY(28px) scale(.96) } to { opacity:1; transform:none } }
@keyframes obPop     { 0%{transform:scale(.8);opacity:0} 70%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
.ob-pop { animation: obPop .35s cubic-bezier(.4,0,.2,1) both; }
`;
    document.head.appendChild(s);
  }

  // Retorna o passo atual baseado na página
  function getPageSteps() {
    const page = location.pathname.split('/').pop() || 'index.html';
    return TOUR_STEPS.filter(s => !s.page || s.page === page);
  }

  // Exibe modal central (Welcome / Finish)
  function showModal(step, onNext, onSkip) {
    removeModal();
    const d = document.createElement('div');
    d.id = 'sd-ob-modal';

    const emoji = step.title.match(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/u)?.[0] || '🚀';
    const titleClean = step.title.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\s]+/u, '').trim();

    d.innerHTML = `
      <div class="ob-modal-card">
        <span class="ob-modal-emoji">${emoji}</span>
        <div class="ob-modal-title">${titleClean}</div>
        <div class="ob-modal-text">${step.text}</div>
        <button class="ob-modal-cta" id="obModalCta">${step.cta || 'Próximo'}</button>
        ${step.skip ? `<button class="ob-modal-skip" id="obModalSkip">${step.skip}</button>` : ''}
      </div>`;

    document.body.appendChild(d);
    document.getElementById('obModalCta').onclick = onNext;
    const skipBtn = document.getElementById('obModalSkip');
    if (skipBtn) skipBtn.onclick = onSkip;
  }

  function removeModal() {
    document.getElementById('sd-ob-modal')?.remove();
  }

  // Exibe bubble ancorada a um elemento
  function showBubble(step, el, onNext) {
    removeBubble();

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Spotlight
    if (!spotlight) {
      spotlight = document.createElement('div');
      spotlight.id = 'sd-ob-spotlight';
      document.body.appendChild(spotlight);
    }
    const pad = 8;
    spotlight.style.cssText = `
      left:   ${rect.left   - pad}px;
      top:    ${rect.top    - pad}px;
      width:  ${rect.width  + pad*2}px;
      height: ${rect.height + pad*2}px;
    `;

    // Bubble
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'sd-ob-bubble';
      document.body.appendChild(bubble);
    }

    const totalSteps = getPageSteps().filter(s => s.selector).length;
    const stepIdx    = getPageSteps().filter(s => s.selector).indexOf(step);

    bubble.innerHTML = `
      <div class="ob-progress">
        ${Array.from({length: totalSteps}, (_,i) =>
          `<div class="ob-dot ${i <= stepIdx ? 'done' : ''}"></div>`
        ).join('')}
      </div>
      <div class="ob-title">${step.title}</div>
      <div class="ob-text">${step.text}</div>
      <div class="ob-actions">
        <button class="ob-cta" id="obNext">${step.cta || 'Próximo'}</button>
      </div>
    `;

    // Posicionamento
    const bw = 320;
    const bh = 180; // estimado
    let top, left, arrowClass;

    if (step.position === 'top' || rect.top > vh / 2) {
      // Bubble acima do elemento
      top = rect.top - bh - 20;
      if (top < 10) top = rect.bottom + 20;
      arrowClass = top < rect.top ? 'bottom' : 'top';
    } else {
      // Bubble abaixo do elemento
      top = rect.bottom + 20;
      if (top + bh > vh - 10) top = rect.top - bh - 20;
      arrowClass = top < rect.top ? 'bottom' : 'top';
    }

    left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(16, Math.min(left, vw - bw - 16));

    bubble.style.cssText = `left:${left}px; top:${top}px;`;
    bubble.classList.add('ob-pop');

    // Arrow
    const arrowX = (rect.left + rect.width/2) - left;
    const arrow  = document.createElement('div');
    arrow.className = `ob-bubble-arrow ${arrowClass}`;
    arrow.style.left = `${Math.max(16, Math.min(arrowX, bw-16))}px`;
    bubble.appendChild(arrow);

    document.getElementById('obNext').onclick = onNext;

    // Scroll para visível
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function removeBubble() {
    bubble?.remove(); bubble = null;
    spotlight?.remove(); spotlight = null;
  }

  function removeAll() {
    removeModal();
    removeBubble();
  }

  // Marca tour como concluído
  function finish() {
    localStorage.setItem(OB_KEY, '1');
    removeAll();
  }

  // Executa o passo atual
  function runStep(steps, idx) {
    if (idx >= steps.length) { finish(); return; }
    const step = steps[idx];

    if (!step.selector) {
      // Modal central
      showModal(
        step,
        () => { removeModal(); runStep(steps, idx + 1); },
        () => finish()
      );
    } else {
      // Tenta encontrar o elemento
      const el = document.querySelector(step.selector);
      if (!el) {
        // Pula se elemento não existe nesta página
        runStep(steps, idx + 1);
        return;
      }
      showBubble(step, el, () => {
        removeBubble();
        runStep(steps, idx + 1);
      });
    }
  }

  // API pública
  return {
    start() {
      injectCSS();
      const steps = getPageSteps();
      if (!steps.length) return;
      // Pequeno delay para página terminar de renderizar
      setTimeout(() => runStep(steps, 0), 600);
    },

    // Reinicia o tour (para testes ou "ver tour novamente")
    restart() {
      localStorage.removeItem(OB_KEY);
      localStorage.removeItem(OB_STEP_KEY);
      this.start();
    },

    // Verifica se deve rodar
    shouldRun() {
      return !localStorage.getItem(OB_KEY);
    },
  };
})();

// ═══════════════════════════════════════════════════════════════
// MÓDULO DE EMPTY STATES
// ═══════════════════════════════════════════════════════════════

export const EmptyState = {
  /**
   * Gera HTML de um empty state.
   * @param {string} key — chave de EMPTY_STATES
   * @param {object} [overrides] — sobrescreve title/sub/action
   * @returns {string} HTML pronto para inserir com innerHTML
   */
  html(key, overrides = {}) {
    const base = EMPTY_STATES[key];
    if (!base) {
      console.warn(`[StreamDesk] EmptyState key not found: "${key}"`);
      return '';
    }
    const cfg = { ...base, ...overrides };

    let actionBtn = '';
    if (cfg.action) {
      if (cfg.action.href) {
        actionBtn = `<a href="${cfg.action.href}" class="sd-es-btn">${cfg.action.label}</a>`;
      } else if (cfg.action.fn) {
        actionBtn = `<button class="sd-es-btn" onclick="${cfg.action.fn}">${cfg.action.label}</button>`;
      }
    }

    const tip = cfg.tip
      ? `<div class="sd-es-tip">${cfg.tip}</div>`
      : '';

    return `
      <div class="sd-empty-state">
        <span class="sd-es-icon">${cfg.icon}</span>
        <div class="sd-es-title">${cfg.title}</div>
        <div class="sd-es-sub">${cfg.sub}</div>
        ${actionBtn}
        ${tip}
      </div>`;
  },

  /**
   * Injeta CSS dos empty states (chame uma vez por página).
   * Já é chamado automaticamente na auto-inicialização.
   */
  injectCSS() {
    if (document.getElementById('sd-es-style')) return;
    const s = document.createElement('style');
    s.id = 'sd-es-style';
    s.textContent = `
.sd-empty-state {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 52px 24px 44px;
  background: var(--card, #fff);
  border: 1px solid var(--border, #e8ecf2);
  border-radius: 20px;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(15,23,42,.06));
  animation: esFadeUp .38s cubic-bezier(.4,0,.2,1) both;
  font-family: var(--font, 'Plus Jakarta Sans', sans-serif);
}
.sd-es-icon  { font-size: 48px; margin-bottom: 14px; line-height: 1; }
.sd-es-title { font-size: 17px; font-weight: 800; color: var(--text, #0f172a); margin-bottom: 8px; }
.sd-es-sub   { font-size: 13px; color: var(--muted2, #64748b); line-height: 1.6; margin-bottom: 22px; max-width: 280px; }
.sd-es-btn {
  background: var(--accent, #6366f1); color: #fff;
  border: none; border-radius: 50px;
  padding: 11px 24px; font-size: 14px; font-weight: 700;
  cursor: pointer; text-decoration: none; display: inline-block;
  font-family: var(--font, sans-serif);
  box-shadow: 0 4px 14px var(--accent-glow, rgba(99,102,241,.2));
  transition: transform .15s, box-shadow .15s;
}
.sd-es-btn:active { transform: scale(.96); }
.sd-es-tip {
  margin-top: 18px; font-size: 12px; color: var(--muted, #94a3b8);
  background: var(--card2, #f8fafc); border: 1px solid var(--border, #e8ecf2);
  border-radius: 10px; padding: 10px 14px; line-height: 1.5; max-width: 300px;
}
@keyframes esFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
    `;
    document.head.appendChild(s);
  },
};

// ═══════════════════════════════════════════════════════════════
// AUTO-INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════

(function init() {
  // Injeta CSS dos empty states em todas as páginas
  EmptyState.injectCSS();

  // Registra visita desta página
  const page = location.pathname.split('/').pop() || 'index.html';
  const seen = JSON.parse(localStorage.getItem(OB_SEEN_KEY) || '[]');
  if (!seen.includes(page)) {
    seen.push(page);
    localStorage.setItem(OB_SEEN_KEY, JSON.stringify(seen));
  }

  // Só roda o tour na index.html (home) e se ainda não foi visto
  const isHome = page === 'index.html' || page === '';
  if (isHome && Tour.shouldRun()) {
    // Aguarda o DOM estar pronto e dados carregados
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => Tour.start());
    } else {
      Tour.start();
    }
  }
})();

// ── EXPORTAÇÕES ───────────────────────────────────────────────
export { Tour };
export default { Tour, EmptyState };
