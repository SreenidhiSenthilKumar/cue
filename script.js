const STORAGE_KEY = 'cue_prompts';
const USER_KEY    = 'cue_user_id';
const THEME_KEY   = 'cue_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

(function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
})();

document.getElementById('toggleTheme').addEventListener('click', () => {
  const btn = document.getElementById('toggleTheme');
  btn.classList.remove('spinning');
  void btn.offsetWidth;
  btn.classList.add('spinning');
  btn.addEventListener('animationend', () => btn.classList.remove('spinning'), { once: true });
  applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
});

function getOrCreateUserId() {
  let id = localStorage.getItem(USER_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(USER_KEY, id); }
  return id;
}
const currentUserId = getOrCreateUserId();

let prompts       = load();
let activeCategory  = 'all';
let activeSortOrder = 'newest';
let activeSearch    = '';
let viewingId = null;
let editingId = null;

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts)); }

function slugPlatform(p) { return 'plat-' + p.toLowerCase().replace(/[^a-z]/g, ''); }
function catClass(cat)    { return 'cat-' + cat; }
function accentClass(cat) { return 'accent-' + cat; }

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filtered() {
  let list = [...prompts];

  if (activeCategory !== 'all') {
    list = list.filter(p => p.category === activeCategory);
  }

  if (activeSearch.trim()) {
    const q = activeSearch.toLowerCase();
    list = list.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.prompt.toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
      p.platform.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  switch (activeSortOrder) {
    case 'newest':      list.sort((a, b) => b.createdAt - a.createdAt); break;
    case 'oldest':      list.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'tokens-high': list.sort((a, b) => (b.tokens || 0) - (a.tokens || 0)); break;
    case 'tokens-low':  list.sort((a, b) => (a.tokens || 0) - (b.tokens || 0)); break;
    case 'platform':    list.sort((a, b) => a.platform.localeCompare(b.platform)); break;
  }

  return list;
}

function render() {
  const list  = filtered();
  const grid  = document.getElementById('promptGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('resultsCount');

  count.textContent = `${list.length} prompt${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  grid.innerHTML = list.map(p => {
    const tags = (p.tags || []).slice(0, 3)
      .map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

    const tokenBadge = p.tokens
      ? `<span class="token-badge">
           <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
             <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.4"/>
             <path d="M7 10h6M10 7v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
           </svg>
           ${Number(p.tokens).toLocaleString()}
         </span>`
      : '';

    return `
      <div class="card ${accentClass(p.category)}" data-id="${p.id}">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-top">
            <span class="card-title">${escHtml(p.title)}</span>
            <span class="cat-badge ${catClass(p.category)}">${p.category}</span>
          </div>
          <p class="card-snippet">${escHtml(p.prompt)}</p>
          ${tags ? `<div class="card-tags">${tags}</div>` : ''}
          <div class="card-footer">
            <span class="platform-badge ${slugPlatform(p.platform)}">${escHtml(p.platform)}</span>
            ${tokenBadge}
          </div>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openView(card.dataset.id));
  });
}

function openView(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return;
  viewingId = id;

  const modal = document.querySelector('#viewModal .modal');
  modal.className = modal.className.replace(/\baccent-\w+/g, '').trim();
  modal.classList.add(accentClass(p.category));

  document.getElementById('v-title').textContent = p.title;

  const catBadge = document.getElementById('v-cat');
  catBadge.textContent = p.category;
  catBadge.className = `view-cat-badge cat-badge ${catClass(p.category)}`;

  document.getElementById('v-meta').innerHTML = [
    `<span class="meta-pill platform ${slugPlatform(p.platform)}">${escHtml(p.platform)}</span>`,
    p.model       ? `<span class="meta-pill">${escHtml(p.model)}</span>` : '',
    p.tokens      ? `<span class="meta-pill tokens">${Number(p.tokens).toLocaleString()} tokens</span>` : '',
    p.temperature != null && p.temperature !== '' ? `<span class="meta-pill">temp ${p.temperature}</span>` : '',
    p.mode        ? `<span class="meta-pill">${escHtml(p.mode)}</span>` : '',
    `<span class="meta-pill">${formatDate(p.createdAt)}</span>`,
  ].join('');

  document.getElementById('v-prompt').textContent = p.prompt;

  const notesSection = document.getElementById('v-notes-section');
  document.getElementById('v-notes').textContent = p.notes || '';
  notesSection.style.display = p.notes ? '' : 'none';

  document.getElementById('v-tags').innerHTML =
    (p.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

  const copyBtn = document.getElementById('copyPrompt');
  copyBtn.textContent = 'copy prompt';
  copyBtn.classList.remove('copied');

  const isOwner = p.authorId === currentUserId;
  document.getElementById('deletePrompt').style.display = isOwner ? '' : 'none';
  document.getElementById('editPrompt').style.display   = isOwner ? '' : 'none';

  document.getElementById('viewModal').removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}

function closeView() {
  document.getElementById('viewModal').setAttribute('hidden', '');
  document.body.style.overflow = '';
  viewingId = null;
}

function openAdd() {
  editingId = null;
  document.getElementById('addForm').reset();
  document.getElementById('formError').textContent = '';
  document.querySelector('#addModal .modal-header h2').textContent = 'add a prompt';
  document.querySelector('#addModal .form-actions .btn-pill').textContent = 'save prompt';
  document.getElementById('addModal').removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('f-title').focus(), 50);
}

function openEdit(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  closeView();

  document.getElementById('f-title').value       = p.title;
  document.getElementById('f-prompt').value      = p.prompt;
  document.getElementById('f-category').value    = p.category;
  document.getElementById('f-platform').value    = p.platform;
  document.getElementById('f-model').value       = p.model || '';
  document.getElementById('f-tokens').value      = p.tokens != null ? p.tokens : '';
  document.getElementById('f-temperature').value = p.temperature != null ? p.temperature : '';
  document.getElementById('f-mode').value        = p.mode || '';
  document.getElementById('f-notes').value       = p.notes || '';
  document.getElementById('f-tags').value        = (p.tags || []).join(', ');
  document.getElementById('formError').textContent = '';
  document.querySelector('#addModal .modal-header h2').textContent = 'edit prompt';
  document.querySelector('#addModal .form-actions .btn-pill').textContent = 'update prompt';
  document.getElementById('addModal').removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('f-title').focus(), 50);
}

function closeAdd() {
  document.getElementById('addModal').setAttribute('hidden', '');
  document.body.style.overflow = '';
  editingId = null;
}

document.getElementById('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const errEl    = document.getElementById('formError');
  const title    = document.getElementById('f-title').value.trim();
  const prompt   = document.getElementById('f-prompt').value.trim();
  const category = document.getElementById('f-category').value;
  const platform = document.getElementById('f-platform').value;

  if (!title)    { errEl.textContent = 'please enter a title'; return; }
  if (!prompt)   { errEl.textContent = 'please enter a prompt'; return; }
  if (!category) { errEl.textContent = 'please pick a category'; return; }
  if (!platform) { errEl.textContent = 'please pick an ai platform'; return; }
  errEl.textContent = '';

  const tokensVal = document.getElementById('f-tokens').value;
  const tempVal   = document.getElementById('f-temperature').value;
  const rawTags   = document.getElementById('f-tags').value;

  const fields = {
    title, prompt, category, platform,
    model:       document.getElementById('f-model').value.trim(),
    tokens:      tokensVal ? Number(tokensVal) : null,
    temperature: tempVal !== '' ? tempVal : null,
    mode:        document.getElementById('f-mode').value.trim(),
    notes:       document.getElementById('f-notes').value.trim(),
    tags:        rawTags.split(',').map(t => t.trim()).filter(Boolean),
  };

  if (editingId) {
    const idx = prompts.findIndex(p => p.id === editingId);
    if (idx !== -1) prompts[idx] = { ...prompts[idx], ...fields };
  } else {
    prompts.unshift({ id: crypto.randomUUID(), ...fields, createdAt: Date.now(), authorId: currentUserId });
  }

  save();
  render();
  closeAdd();
});

document.getElementById('editPrompt').addEventListener('click', () => {
  if (viewingId) openEdit(viewingId);
});

document.getElementById('deletePrompt').addEventListener('click', () => {
  if (!viewingId || !confirm('delete this prompt?')) return;
  prompts = prompts.filter(p => p.id !== viewingId);
  save();
  render();
  closeView();
});

document.getElementById('copyPrompt').addEventListener('click', () => {
  const p = prompts.find(x => x.id === viewingId);
  if (!p) return;
  navigator.clipboard.writeText(p.prompt).then(() => {
    const btn = document.getElementById('copyPrompt');
    btn.textContent = 'copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'copy prompt'; btn.classList.remove('copied'); }, 2000);
  });
});

const CUEY_GRADIENTS = {
  all:          ['#FFBB55', '#FF5E82'],
  writing:      ['#e8a090', '#7a8c42'],
  coding:       ['#7898d0', '#e898b0'],
  marketing:    ['#c8b0e4', '#e8d040'],
  research:     ['#7080d0', '#60a0b0'],
  design:       ['#98b8e4', '#e08878'],
  productivity: ['#e8a848', '#c4a8dc'],
  education:    ['#e098b0', '#9880cc'],
  other:        ['#f0d0d0', '#a03060'],
};

function updateCueyGradient(cat) {
  const [s, e] = CUEY_GRADIENTS[cat] || CUEY_GRADIENTS.all;
  const startEl = document.getElementById('cg-s');
  const endEl   = document.getElementById('cg-e');
  if (startEl) startEl.setAttribute('stop-color', s);
  if (endEl)   endEl.setAttribute('stop-color', e);
}

setTimeout(() => {
  const c = document.getElementById('cuey-corner');
  if (c) { c.style.animation = 'none'; c.style.opacity = '1'; }
}, 5200);

function dismissBubble(e) {
  e.stopPropagation();
  const bubble = document.getElementById('cuey-bubble');
  if (!bubble) return;
  bubble.classList.add('dismissed');
  setTimeout(() => bubble.remove(), 450);
}
document.getElementById('cuey-bubble').addEventListener('click', dismissBubble);
document.querySelector('.bubble-dismiss').addEventListener('click', dismissBubble);

document.getElementById('cuey-corner').addEventListener('click', () => {
  const svg = document.getElementById('corner-cuey');
  setTimeout(() => {
    svg.classList.remove('spinning');
    void svg.offsetWidth;
    svg.classList.add('spinning');
    svg.addEventListener('animationend', () => svg.classList.remove('spinning'), { once: true });
  }, 300);
});

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeCategory = chip.dataset.cat;
    updateCueyGradient(chip.dataset.cat);
    render();
  });
});

document.getElementById('sortSelect').addEventListener('change', e => {
  activeSortOrder = e.target.value;
  render();
});

document.getElementById('searchInput').addEventListener('input', e => {
  activeSearch = e.target.value;
  render();
});

document.getElementById('openAddModal').addEventListener('click', openAdd);
document.getElementById('openAddModalEmpty').addEventListener('click', openAdd);
document.getElementById('openAddModalMobile').addEventListener('click', openAdd);
document.getElementById('closeAddModal').addEventListener('click', closeAdd);
document.getElementById('cancelAdd').addEventListener('click', closeAdd);
document.getElementById('closeViewModal').addEventListener('click', closeView);

document.getElementById('addModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAdd();
});
document.getElementById('viewModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeView();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('addModal').hidden)  closeAdd();
    if (!document.getElementById('viewModal').hidden) closeView();
  }
});

const IDLE_POOL        = ['jump', 'jump', 'bounce', 'wiggle', 'squish', 'dizzy', 'wink', 'wink', 'blink', 'blink'];
const IDLE_POOL_MOBILE = ['peek', 'peek', 'peek', 'wink', 'blink'];

function playCueyIdle() {
  const svg = document.getElementById('corner-cuey');
  if (!svg) { scheduleIdle(); return; }

  const isMobile = window.innerWidth <= 600;
  const pool = isMobile ? IDLE_POOL_MOBILE : IDLE_POOL;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  if (pick === 'peek') {
    svg.classList.remove('idle-peek');
    void svg.offsetWidth;
    svg.classList.add('idle-peek');
    svg.addEventListener('animationend', () => svg.classList.remove('idle-peek'), { once: true });
  } else if (pick === 'wink') {
    const pupils = svg.querySelectorAll('.cuey-pupil');
    const pupil  = pupils[Math.floor(Math.random() * 2)];
    pupil.classList.add('cuey-wink');
    pupil.addEventListener('animationend', () => pupil.classList.remove('cuey-wink'), { once: true });
  } else if (pick === 'blink') {
    svg.querySelectorAll('.cuey-pupil').forEach(pupil => {
      pupil.classList.add('cuey-wink');
      pupil.addEventListener('animationend', () => pupil.classList.remove('cuey-wink'), { once: true });
    });
  } else {
    const cls = `idle-${pick}`;
    svg.classList.add(cls);
    svg.addEventListener('animationend', () => svg.classList.remove(cls), { once: true });
  }

  scheduleIdle();
}

function scheduleIdle() {
  const isMobile = window.innerWidth <= 600;
  setTimeout(playCueyIdle, isMobile ? 10000 + Math.random() * 2000 : 1800 + Math.random() * 3200);
}

setTimeout(scheduleIdle, 5500);

const EYE_CENTERS     = [{ cx: 82, cy: 98 }, { cx: 118, cy: 98 }];
const MAX_PUPIL_OFFSET = 6;
const LERP_SPEED      = 0.1;

const pupilState = EYE_CENTERS.map(({ cx, cy }) => ({ cx, cy, tx: cx, ty: cy }));

document.addEventListener('mousemove', (e) => {
  const svg = document.getElementById('corner-cuey');
  if (!svg) return;
  const rect   = svg.getBoundingClientRect();
  const scaleX = 200 / rect.width;
  const scaleY = 200 / rect.height;
  const cursorX = (e.clientX - rect.left) * scaleX;
  const cursorY = (e.clientY - rect.top)  * scaleY;

  EYE_CENTERS.forEach(({ cx, cy }, i) => {
    const dx    = cursorX - cx;
    const dy    = cursorY - cy;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const ratio = dist > 0 ? Math.min(dist, MAX_PUPIL_OFFSET) / dist : 0;
    pupilState[i].tx = cx + dx * ratio;
    pupilState[i].ty = cy + dy * ratio;
  });
});

(function animatePupils() {
  const svg = document.getElementById('corner-cuey');
  if (svg) {
    svg.querySelectorAll('.cuey-pupil').forEach((pupil, i) => {
      const s = pupilState[i];
      s.cx += (s.tx - s.cx) * LERP_SPEED;
      s.cy += (s.ty - s.cy) * LERP_SPEED;
      pupil.setAttribute('cx', s.cx.toFixed(3));
      pupil.setAttribute('cy', s.cy.toFixed(3));
    });
  }
  requestAnimationFrame(animatePupils);
})();

render();
