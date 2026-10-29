/* Kingrow Checkers - application: UI, game flow, computer opponent, online play */
(function () {
  'use strict';

  const { pieceSVG, icon } = window.KingrowArt;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const { colorOf, isKing, opp, sqNum, isDark } = Checkers;
  const COLOR_NAME = { r: 'Red', w: 'White' };
  const pieceValue = (p) => (isKing(p) ? Checkers.VALUES.king : Checkers.VALUES.man);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Storage (safe) ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kingrow.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kingrow.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem('kingrow.' + k); } catch (e) { /* ignore */ } }
  };

  const DEFAULTS = { ui: 'dark', board: 'tavern', legal: true, coords: false, sound: true, anim: true, autoflip: false, evalbar: false, name: '' };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  const TIME_CONTROLS = [
    { id: 'none', label: 'No clock', base: 0, inc: 0 },
    { id: '1+0', label: '1 min', base: 60, inc: 0 },
    { id: '3+2', label: '3 | 2', base: 180, inc: 2 },
    { id: '5+0', label: '5 min', base: 300, inc: 0 },
    { id: '10+0', label: '10 min', base: 600, inc: 0 },
    { id: '15+10', label: '15 | 10', base: 900, inc: 10 },
    { id: '30+0', label: '30 min', base: 1800, inc: 0 }
  ];
  const LEVELS = [
    { id: 'beginner', label: 'Beginner', sub: 'Learning the moves', depth: 2, timeMs: 200, noise: 140 },
    { id: 'casual', label: 'Casual', sub: 'Friendly kitchen-table game', depth: 4, timeMs: 500, noise: 35 },
    { id: 'strong', label: 'Strong', sub: 'Punishes mistakes', depth: 8, timeMs: 900, noise: 0 },
    { id: 'master', label: 'Master', sub: 'Full strength', depth: 64, timeMs: 2200, noise: 0 }
  ];
  const BOARDS = [
    { id: 'tavern', l: '#ecd9b6', d: '#7a5232' },
    { id: 'tournament', l: '#ebe4cf', d: '#3f6b48' },
    { id: 'classic', l: '#c8443a', d: '#232323' },
    { id: 'slate', l: '#e3e7ed', d: '#8796ab' },
    { id: 'ocean', l: '#dbe9f4', d: '#4b7aa6' },
    { id: 'graphite', l: '#b9bec7', d: '#5d6470' }
  ];

  function applyTheme() {
    document.documentElement.dataset.theme = settings.ui;
    document.documentElement.dataset.board = settings.board;
    const btn = $('#navTheme');
    if (btn) btn.innerHTML = icon(settings.ui === 'dark' ? 'sun' : 'moon');
    const meta = $('meta[name=theme-color]');
    if (meta) meta.content = settings.ui === 'dark' ? '#0e1014' : '#f4f5f7';
  }

  function fillIcons(root) {
    $$('[data-icon]', root).forEach((el) => {
      if (el.dataset.iconDone) return;
      el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
      el.dataset.iconDone = '1';
    });
  }

  /* ---------------- Sound (synthesised, no files) ---------------- */
  const Sound = {
    ctx: null,
    tone(freq, start, dur, type, gain) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, c.currentTime + start);
      g.gain.exponentialRampToValueAtTime(gain || 0.14, c.currentTime + start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      o.connect(g); g.connect(c.destination);
      o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.02);
    },
    play(kind, n) {
      if (!settings.sound) return;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (kind === 'move') { this.tone(330, 0, 0.06, 'triangle', 0.2); this.tone(165, 0, 0.05, 'sine', 0.12); }
        else if (kind === 'capture') { for (let i = 0; i < Math.min(n || 1, 4); i++) { this.tone(260 + i * 60, i * 0.09, 0.08, 'square', 0.06); this.tone(130 + i * 30, i * 0.09 + 0.01, 0.1, 'triangle', 0.2); } }
        else if (kind === 'crown') { [392, 523, 659].forEach((f, i) => this.tone(f, i * 0.07, 0.18, 'sine', 0.12)); }
        else if (kind === 'end') { [523, 659, 784].forEach((f, i) => this.tone(f, i * 0.11, 0.35, 'sine', 0.12)); }
        else if (kind === 'notify') { this.tone(660, 0, 0.1, 'sine', 0.1); this.tone(990, 0.08, 0.12, 'sine', 0.08); }
        else if (kind === 'nope') { this.tone(180, 0, 0.12, 'sawtooth', 0.05); }
      } catch (e) { /* audio not available */ }
    }
  };

  /* ---------------- Toasts ---------------- */
  function toast(msg, ms) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms || 2600);
  }

  /* ---------------- Engine host (Web Worker with fallback) ---------------- */
  const EngineHost = {
    lanes: {},
    seq: 0,
    pending: {},
    failed: false,
    worker(lane) {
      if (this.failed) return null;
      if (this.lanes[lane]) return this.lanes[lane];
      try {
        const src = `(${window.KingrowRulesFactory.toString()})(self);\n(${window.KingrowEngineFactory.toString()})(self);\n` +
          'self.onmessage=function(e){var r=self.KingrowEngine.run(e.data);r.id=e.data.id;self.postMessage(r);};';
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        const w = new Worker(url);
        w.onmessage = (e) => {
          const p = this.pending[e.data.id];
          if (p) { delete this.pending[e.data.id]; p.resolve(e.data); }
        };
        w.onerror = (e) => {
          if (e.preventDefault) e.preventDefault();
          this.failed = true;
          Object.keys(this.pending).forEach((id) => {
            const p = this.pending[id];
            if (p.lane === lane) { delete this.pending[id]; p.resolve(window.KingrowEngine.run(p.params)); }
          });
        };
        this.lanes[lane] = w;
        return w;
      } catch (e) {
        this.failed = true;
        return null;
      }
    },
    think(params, lane) {
      lane = lane || 'main';
      return new Promise((resolve) => {
        const w = this.worker(lane);
        if (!w) { setTimeout(() => resolve(window.KingrowEngine.run(params)), 30); return; }
        const id = ++this.seq;
        this.pending[id] = { resolve, params, lane };
        w.postMessage(Object.assign({}, params, { id }));
      });
    }
  };

  /* ---------------- Game state ---------------- */
  let G = null;
  const boardEl = $('#board');

  function playerLabel(c) {
    if (!G) return COLOR_NAME[c];
    return G.cfg.players[c].name || COLOR_NAME[c];
  }

  function newGame(cfg, resume) {
    cfg = JSON.parse(JSON.stringify(cfg));
    cfg.startFen = cfg.startFen || Checkers.START_FEN;
    const base = (cfg.tc && cfg.tc.base) || 0;
    G = {
      cfg,
      mode: cfg.mode,
      myColor: cfg.myColor || 'r',
      game: new Checkers(cfg.startFen),
      records: [],
      ids: [],
      timed: base > 0,
      clocks: { r: base * 1000, w: base * 1000 },
      lastTick: performance.now(),
      over: null,
      viewPly: null,
      selected: -1,
      partial: [],
      hint: null,
      hintBusy: false,
      hintsUsed: { r: 0, w: 0 },
      orientation: cfg.mode === 'local' ? 'r' : (cfg.myColor || 'r'),
      thinking: false,
      token: 0,
      evalScore: null,
      oppZeroSince: 0
    };
    if (resume) {
      for (const id of resume.ids || []) {
        const r = G.game.move(id);
        if (!r) break;
        G.records.push(r); G.ids.push(r.id);
      }
      if (resume.clocks) G.clocks = resume.clocks;
      if (resume.hintsUsed) G.hintsUsed = resume.hintsUsed;
      if (G.mode === 'local' && settings.autoflip) G.orientation = G.game.turn;
    }
    $('#chatTab').classList.toggle('hidden', G.mode !== 'online');
    if (G.mode !== 'online') switchTab('moves');
    $('#chatLog').innerHTML = '';
    $('#offerBox').classList.add('hidden');
    showView('game');
    buildBoard();
    renderAll();
    const st = G.game.status();
    if (st.over) endGame(st);
    else { maybeAI(); updateEval(); }
    saveResume();
  }

  function saveResume() {
    if (!G || G.mode === 'online') return;
    if (G.over || !G.ids.length) { store.del('resume'); return; }
    store.set('resume', { cfg: G.cfg, ids: G.ids, clocks: G.clocks, hintsUsed: G.hintsUsed, at: Date.now() });
  }

  function canMoveColor(c) {
    if (!G) return false;
    if (G.mode === 'local') return true;
    return c === G.myColor;
  }

  function canInteract() {
    if (!G || G.over || G.viewPly != null || G.thinking) return false;
    if (G.mode === 'online' && !Net.connected) return false;
    return canMoveColor(G.game.turn);
  }

  /* ---------------- Board building & rendering ---------------- */
  function buildBoard() {
    boardEl.innerHTML = '';
    G.sqEls = new Array(64);
    G.pieceAt = new Array(64).fill(null);
    for (let d = 0; d < 64; d++) {
      const sq = G.orientation === 'r' ? d : 63 - d;
      const el = document.createElement('div');
      el.className = 'sq ' + (isDark(sq) ? 'dark' : 'light');
      el.dataset.sq = sq;
      if (isDark(sq)) el.insertAdjacentHTML('beforeend', `<span class="sqnum">${sqNum(sq)}</span>`);
      boardEl.appendChild(el);
      G.sqEls[sq] = el;
    }
    boardEl.classList.toggle('no-coords', !settings.coords);
    $('.board-area').classList.toggle('flipped', G.orientation === 'w');
  }

  function displayed() {
    if (G.viewPly == null) return { game: G.game, last: G.records[G.records.length - 1], live: true };
    const c = new Checkers(G.cfg.startFen);
    for (let i = 0; i < G.viewPly; i++) c.move(G.ids[i]);
    return { game: c, last: G.records[G.viewPly - 1], live: false };
  }

  // Legal moves that continue the steps the player has made so far
  function continuing() {
    if (G.selected < 0) return [];
    return G.game.moves({ square: G.selected }).filter((m) => m.path.length > G.partial.length && G.partial.every((s, i) => m.path[i] === s));
  }
  function nextTargets() {
    return new Set(continuing().map((m) => m.path[G.partial.length]));
  }

  function renderBoard(animRec) {
    const view = displayed();
    const pos = view.game.board.slice();
    const taken = new Set();
    let at = -1;
    if (view.live && G.partial.length > 1) {
      const from = G.partial[0];
      at = G.partial[G.partial.length - 1];
      pos[at] = pos[from]; pos[from] = null;
      const m = continuing()[0];
      if (m) for (let i = 0; i < G.partial.length - 1; i++) taken.add(m.caps[i]);
    }
    const live = view.live && canInteract();
    const legal = live ? G.game.moves() : [];
    const movable = new Set(legal.map((m) => m.from));
    const must = legal.length && legal[0].caps.length > 0;
    const targets = view.live && G.selected >= 0 ? nextTargets() : new Set();
    const lastSet = new Set(view.last ? view.last.path : []);
    const hintSet = new Set(view.live && G.hint && G.hint.move ? G.hint.move.path : []);
    const trail = new Set(G.partial.slice(0, -1));
    for (let sq = 0; sq < 64; sq++) {
      const el = G.sqEls[sq];
      const p = pos[sq];
      if (G.pieceAt[sq] !== p) {
        const old = el.querySelector('.piece');
        if (old) old.remove();
        if (p) {
          const pe = document.createElement('div');
          pe.className = 'piece';
          pe.innerHTML = pieceSVG(p);
          el.appendChild(pe);
        }
        G.pieceAt[sq] = p;
      }
      el.classList.toggle('last', lastSet.has(sq) && !G.partial.length);
      el.classList.toggle('sel', view.live && G.selected >= 0 && sq === (at >= 0 ? at : G.selected));
      el.classList.toggle('trail', trail.has(sq));
      el.classList.toggle('taken', taken.has(sq));
      el.classList.toggle('hint-sq', hintSet.has(sq));
      el.classList.toggle('movable', live && G.partial.length <= 1 && movable.has(sq));
      el.classList.toggle('must', live && must && G.partial.length <= 1 && movable.has(sq) && settings.legal);
      el.classList.toggle('legal', targets.has(sq));
      const mark = el.querySelector('.mark');
      if (mark) mark.remove();
      if (targets.has(sq) && settings.legal) el.insertAdjacentHTML('beforeend', '<span class="mark dot"></span>');
    }
    if (animRec && settings.anim) animate(animRec);
    renderArrows();
  }

  function sqCenter(sq) {
    const d = G.orientation === 'r' ? sq : 63 - sq;
    return { x: (d & 7) + 0.5, y: (d >> 3) + 0.5 };
  }

  function animate(rec) {
    const end = rec.path[rec.path.length - 1];
    const pe = G.sqEls[end].querySelector('.piece');
    if (!pe || !pe.animate) return;
    const size = G.sqEls[end].getBoundingClientRect().width;
    const b = sqCenter(end);
    const frames = rec.path.map((s) => { const a = sqCenter(s); return { transform: `translate(${(a.x - b.x) * size}px, ${(a.y - b.y) * size}px)` }; });
    frames[frames.length - 1] = { transform: 'none' };
    pe.animate(frames, { duration: 170 * (rec.path.length - 1), easing: 'cubic-bezier(.2,.7,.3,1)' });
  }

  function renderArrows() {
    const layer = $('#arrowLayer');
    layer.innerHTML = '';
    if (!G.hint || !G.hint.move || G.viewPly != null) return;
    const path = G.hint.move.path;
    let html = '';
    for (let i = 0; i < path.length - 1; i++) {
      const a = sqCenter(path[i]), b = sqCenter(path[i + 1]);
      const last = i === path.length - 2;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      const ex = last ? b.x - (dx / len) * 0.32 : b.x, ey = last ? b.y - (dy / len) * 0.32 : b.y;
      html += `<line x1="${a.x}" y1="${a.y}" x2="${ex}" y2="${ey}" ${last ? 'marker-end="url(#ah)"' : ''}/>`;
    }
    layer.innerHTML = html;
  }

  /* ---------------- Points / material ---------------- */
  function captures(uptoPly) {
    const n = uptoPly == null ? G.records.length : uptoPly;
    const caps = { r: [], w: [] };
    for (let i = 0; i < n; i++) {
      const r = G.records[i];
      for (const p of r.captured) caps[r.color].push(p);
    }
    return caps;
  }
  function crowned(uptoPly) {
    const n = uptoPly == null ? G.records.length : uptoPly;
    const k = { r: 0, w: 0 };
    for (let i = 0; i < n; i++) if (G.records[i].crowned) k[G.records[i].color]++;
    return k;
  }
  function material(board) {
    const m = { r: 0, w: 0 };
    for (const p of board) if (p) m[colorOf(p)] += pieceValue(p);
    return m;
  }
  function capsHTML(list) {
    return list.slice().sort((a, b) => pieceValue(b) - pieceValue(a)).map((p) => `<span class="cp">${pieceSVG(p)}</span>`).join('');
  }

  /* ---------------- Player cards, status, panels ---------------- */
  function fmtClock(ms) {
    ms = Math.max(0, ms);
    if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
  }

  function renderCards() {
    const view = displayed();
    const caps = captures(G.viewPly);
    const mat = material(view.game.board);
    const top = opp(G.orientation), bottom = G.orientation;
    G.clockEls = {};
    [['#cardTop', top], ['#cardBottom', bottom]].forEach(([sel, c]) => {
      const el = $(sel);
      const pts = caps[c].reduce((s, p) => s + pieceValue(p), 0);
      const adv = mat[c] - mat[opp(c)];
      let tag = '';
      if (G.mode === 'ai') tag = c === G.myColor ? '<span class="tag">You</span>' : '<span class="tag">CPU</span>';
      if (G.mode === 'online') tag = c === G.myColor ? '<span class="tag">You</span>' : `<span class="live ${Net.connected ? '' : 'off'}" title="${Net.connected ? 'Connected' : 'Disconnected'}"></span>`;
      const toMove = !G.over && view.game.turn === c;
      el.classList.toggle('to-move', toMove);
      el.innerHTML = `
        <div class="avatar ${c}">${pieceSVG(c)}</div>
        <div class="pinfo">
          <div class="pname"><span>${esc(playerLabel(c))}</span>${tag}</div>
          <div class="pcaps"><span class="caps">${capsHTML(caps[c])}</span>
            <span class="pts">${pts} pts</span>${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}</div>
        </div>
        ${G.timed ? `<div class="clock" data-c="${c}">${fmtClock(G.clocks[c])}</div>` : ''}`;
      if (G.timed) G.clockEls[c] = el.querySelector('.clock');
    });
    updateClocks();
  }

  function updateClocks() {
    if (!G || !G.timed || !G.clockEls) return;
    ['r', 'w'].forEach((c) => {
      const el = G.clockEls[c];
      if (!el) return;
      el.textContent = fmtClock(G.clocks[c]);
      const active = !G.over && G.game.turn === c && G.records.length > 0;
      el.classList.toggle('active', active && G.clocks[c] >= 20000);
      el.classList.toggle('low', active && G.clocks[c] < 20000);
    });
  }

  function renderStatus() {
    const st = $('#status');
    const turn = G.game.turn;
    let main, sub = '', alert = false;
    if (G.over) {
      main = resultTitle(G.over);
      sub = resultReason(G.over);
    } else if (G.mode === 'online' && !Net.connected) {
      main = 'Waiting for opponent';
      sub = 'The connection dropped. They can rejoin with the same link.';
      alert = true;
    } else {
      if (G.mode === 'local') main = `${playerLabel(turn)} to move`;
      else main = turn === G.myColor ? 'Your move' : (G.mode === 'ai' ? 'Computer is thinking' : `${playerLabel(turn)} is thinking`);
      const mustJump = G.game.mustCapture();
      if (mustJump && (G.mode === 'local' || turn === G.myColor)) { main += ': you must capture'; alert = true; }
      const tc = G.cfg.tc && G.cfg.tc.base ? `${G.cfg.tc.base / 60} min${G.cfg.tc.inc ? ' + ' + G.cfg.tc.inc + 's' : ''}` : 'Untimed';
      sub = `Move ${G.game.fullmove}, ${tc.toLowerCase()}`;
      if (G.game.quiet >= 50) sub += `. ${Math.ceil((Checkers.DRAW_PLIES - G.game.quiet) / 2)} moves to a 40-move draw`;
      if (G.game.repetitions() === 2) sub += '. This position has appeared twice';
    }
    st.classList.toggle('alert', alert);
    st.innerHTML = `<span class="turn-dot ${G.over ? (G.over.winner || 'w') : turn}"></span><div><span class="stxt">${esc(main)}</span><small>${esc(sub)}</small></div>`;
  }

  function renderMoves() {
    const list = $('#moveList');
    if (!G.records.length) { list.innerHTML = `<div class="empty">No moves yet. ${G.game.turn === 'r' && !G.records.length ? 'Red' : 'White'} moves first.</div>`; return; }
    const cur = G.viewPly == null ? G.records.length : G.viewPly;
    const startWhite = G.cfg.startFen[0] === 'W';
    let html = '', idx = 0, num = 1;
    if (startWhite) { html += `<span class="num">${num}.</span><span class="mv">...</span>` + mvBtn(0, cur); idx = 1; num++; }
    for (; idx < G.records.length; idx += 2) {
      html += `<span class="num">${num}.</span>` + mvBtn(idx, cur) + (idx + 1 < G.records.length ? mvBtn(idx + 1, cur) : '<span></span>');
      num++;
    }
    list.innerHTML = html;
    const active = list.querySelector('.cur');
    if (active) {
      const lr = list.getBoundingClientRect(), ar = active.getBoundingClientRect();
      if (ar.bottom > lr.bottom || ar.top < lr.top) list.scrollTop += ar.top - lr.top - lr.height / 2;
    } else list.scrollTop = list.scrollHeight;
  }
  function mvBtn(i, cur) {
    const r = G.records[i];
    return `<button class="mv ${i + 1 === cur ? 'cur' : ''}" data-ply="${i + 1}" title="${esc(r.notation)}">${esc(r.notation)}${r.crowned ? ' K' : ''}</button>`;
  }

  function renderPoints() {
    const view = displayed();
    const caps = captures(G.viewPly);
    const kings = crowned(G.viewPly);
    const mat = material(view.game.board);
    const cnt = view.game.count();
    const total = mat.r + mat.w || 1;
    const row = (c) => {
      const pts = caps[c].reduce((s, p) => s + pieceValue(p), 0);
      const adv = mat[c] - mat[opp(c)];
      return `<div class="pt-row"><div class="who"><span class="avatar ${c}" style="width:30px;height:30px">${pieceSVG(c)}</span>
        <div>${esc(playerLabel(c))}<div class="sub">${cnt[c].men} men, ${cnt[c].kings} kings. ${adv > 0 ? 'Ahead by ' + adv : adv < 0 ? 'Behind by ' + -adv : 'Even'}. Crowned ${kings[c]}</div></div></div>
        <div style="text-align:right"><div class="big">${pts}</div><div class="sub">points captured</div></div></div>`;
    };
    $('#pointsPanel').innerHTML = `
      ${row('r')}${row('w')}
      <div class="pt-bar" title="Share of material on the board"><div class="r" style="width:${(mat.r / total) * 100}%"></div><div class="w"></div></div>
      <div class="pt-legend">
        <div><span class="pc">${pieceSVG('r')}</span>Man<b>1</b></div>
        <div><span class="pc">${pieceSVG('R')}</span>King<b>2</b></div>
        <div><span class="pc">${icon('crown', 22)}</span>Crowning<b>+1</b></div>
      </div>
      <p class="pt-note">Each side starts with 12 men, worth 12 points. Crowning a man raises its value from 1 to 2. Winning is about blocking or capturing every piece, so points are a guide to who is ahead.</p>`;
  }

  function renderHint() {
    const body = $('#hintBody'), btn = $('#hintBtn'), count = $('#hintCount');
    const allowed = G.cfg.hints !== false;
    const usedFor = G.mode === 'local' ? G.game.turn : G.myColor;
    count.textContent = allowed ? `Hints used: ${G.hintsUsed[usedFor]}` : 'Hints off';
    const myTurn = canMoveColor(G.game.turn);
    btn.disabled = !allowed || !!G.over || G.viewPly != null || !myTurn || G.thinking || (G.mode === 'online' && !Net.connected);
    btn.lastElementChild.textContent = G.hint ? 'Hide hint' : 'Show best move';
    if (G.hintBusy) { body.innerHTML = '<span class="spinner"></span>Looking for the best move...'; return; }
    if (G.hint) {
      const h = G.hint;
      body.innerHTML = `<div class="best">${esc(h.notation)}</div>
        <div class="reasons">${h.reasons.map((r) => `<span class="reason">${esc(r)}</span>`).join('')}</div>
        <div class="evaltxt">${esc(h.evalText)}</div>`;
      return;
    }
    if (!allowed) body.textContent = 'Hints are turned off for this game. Tap a piece to see where it can move.';
    else if (G.over) body.textContent = 'Game over. Use the move list to review any position.';
    else if (!myTurn) body.textContent = 'Wait for your turn, then press the button for a suggestion.';
    else if (G.game.mustCapture()) body.textContent = 'A capture is available, so you must take one. Glowing pieces can jump. Press the button to see the best capture.';
    else body.textContent = 'Tap a piece to see where it can move. Press the button for the strongest move.';
  }

  function renderToolbar() {
    const n = G.records.length;
    const online = G.mode === 'online';
    $('#undoBtn').disabled = !n || (online && (G.over || !Net.connected || !G.records.some((r) => r.color === G.myColor))) || (G.mode === 'ai' && !G.records.some((r) => r.color === G.myColor));
    $('#drawBtn').disabled = !!G.over || (online && !Net.connected);
    $('#resignBtn').disabled = !!G.over;
    $('#reviewBanner').classList.toggle('hidden', G.viewPly == null);
    if (G.viewPly != null) $('#reviewText').textContent = G.viewPly === 0 ? 'Viewing the starting position' : `Viewing after ${G.records[G.viewPly - 1].notation}`;
  }

  function renderAll(animRec) {
    if (!G) return;
    renderBoard(animRec);
    renderCards();
    renderStatus();
    renderMoves();
    renderPoints();
    renderHint();
    renderToolbar();
    renderEvalBar();
  }

  /* ---------------- Interaction ---------------- */
  function select(sq) {
    G.selected = sq;
    G.partial = [sq];
    renderBoard();
  }
  function deselect() {
    if (G.selected < 0) return;
    G.selected = -1; G.partial = [];
    renderBoard();
  }

  // Take one step of a move (a single step, or one jump of a multi-jump)
  function step(sq, dragged) {
    if (!nextTargets().has(sq)) return false;
    G.partial = G.partial.concat(sq);
    const done = G.game.moves({ square: G.selected }).find((m) => m.path.length === G.partial.length && G.partial.every((s, i) => m.path[i] === s));
    if (done) { applyMove({ path: done.path }, 'local', { dragged }); return true; }
    Sound.play('capture', 1);
    renderBoard();
    return true;
  }

  let drag = null;
  function sqFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const s = el && el.closest && el.closest('.sq');
    return s && boardEl.contains(s) ? +s.dataset.sq : -1;
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (!G) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const sqEl = e.target.closest('.sq');
    if (!sqEl) return;
    const sq = +sqEl.dataset.sq;
    if (!canInteract()) {
      if (G.viewPly != null) toast('You are reviewing an earlier move. Press "Back to live" to play.');
      return;
    }
    e.preventDefault();
    if (G.selected >= 0 && nextTargets().has(sq)) { step(sq, false); return; }
    if (G.partial.length > 1) { toast('Finish the jump. Keep capturing from the highlighted piece.'); Sound.play('nope'); return; }
    const p = G.game.board[sq];
    if (p && colorOf(p) === G.game.turn) {
      const mine = G.game.moves({ square: sq });
      if (!mine.length) {
        if (G.game.mustCapture()) { toast('You must capture. Choose one of the glowing pieces.'); Sound.play('nope'); }
        else toast('That piece has no legal moves.');
        deselect();
        return;
      }
      const was = G.selected === sq;
      select(sq);
      drag = { sq, x0: e.clientX, y0: e.clientY, started: false, was, ghost: null, over: -1 };
      return;
    }
    deselect();
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.started = true;
      const size = G.sqEls[drag.sq].getBoundingClientRect().width;
      const g = document.createElement('div');
      g.className = 'ghost';
      g.style.width = g.style.height = size * 0.9 + 'px';
      g.innerHTML = pieceSVG(G.game.board[drag.sq]);
      document.body.appendChild(g);
      drag.ghost = g;
      const pe = G.sqEls[drag.sq].querySelector('.piece');
      if (pe) pe.classList.add('lifted');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const over = sqFromPoint(e.clientX, e.clientY);
    if (over !== drag.over) {
      if (drag.over >= 0) G.sqEls[drag.over].classList.remove('drop-target');
      if (over >= 0 && nextTargets().has(over)) G.sqEls[over].classList.add('drop-target');
      drag.over = over;
    }
  }, { passive: true });

  function endDrag(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.over >= 0 && G.sqEls[d.over]) G.sqEls[d.over].classList.remove('drop-target');
    if (d.started) {
      d.ghost.remove();
      const pe = G.sqEls[d.sq] && G.sqEls[d.sq].querySelector('.piece');
      if (pe) pe.classList.remove('lifted');
      const target = cancelled ? -1 : sqFromPoint(e.clientX, e.clientY);
      if (target >= 0 && target !== d.sq && nextTargets().has(target)) step(target, true);
    } else if (d.was) {
      deselect();
    }
  }
  window.addEventListener('pointerup', (e) => endDrag(e, false));
  window.addEventListener('pointercancel', (e) => endDrag(e, true));

  /* ---------------- Applying moves ---------------- */
  function applyMove(mv, source, opts) {
    opts = opts || {};
    if (!G || G.over) return false;
    const mover = G.game.turn;
    const firstMove = G.records.length === 0;
    const res = G.game.move(mv);
    if (!res) return false;
    G.records.push(res);
    G.ids.push(res.id);
    G.selected = -1; G.partial = [];
    G.hint = null; G.hintBusy = false;
    G.viewPly = null;
    $('#offerBox').classList.add('hidden');
    G.token++;

    if (G.timed) {
      if (!firstMove && G.cfg.tc.inc) G.clocks[mover] += G.cfg.tc.inc * 1000;
      if (source === 'remote' && typeof opts.clock === 'number') G.clocks[mover] = opts.clock;
      G.lastTick = performance.now();
    }

    if (source === 'local' && G.mode === 'online') {
      Net.send({ t: 'move', id: res.id, clock: G.timed ? G.clocks[mover] : null, ply: G.ids.length });
    }

    if (res.crowned) Sound.play('crown');
    else if (res.caps.length) Sound.play('capture', res.caps.length);
    else Sound.play('move');

    let rebuilt = false;
    if (G.mode === 'local' && settings.autoflip && G.orientation !== G.game.turn) {
      G.orientation = G.game.turn;
      buildBoard();
      rebuilt = true;
    }
    let anim = null;
    if (!opts.dragged && !rebuilt) anim = source === 'local' ? { path: res.path.slice(-2) } : res;
    renderAll(anim);
    if (res.crowned && (G.mode === 'local' || res.color === G.myColor)) toast(`${G.mode === 'local' ? playerLabel(res.color) + "'s" : 'Your'} man is crowned a king`);

    const st = G.game.status();
    if (st.over) { endGame(st); return true; }
    saveResume();
    maybeAI();
    updateEval();
    return true;
  }

  function rebuildTo(ply) {
    const keep = G.ids.slice(0, ply);
    G.game = new Checkers(G.cfg.startFen);
    G.records = []; G.ids = [];
    for (const id of keep) {
      const r = G.game.move(id);
      if (!r) break;
      G.records.push(r); G.ids.push(r.id);
    }
    G.selected = -1; G.partial = [];
    G.hint = null; G.hintBusy = false; G.viewPly = null; G.thinking = false;
    G.over = null;
    G.token++;
    G.lastTick = performance.now();
    if (G.mode === 'local' && settings.autoflip && G.orientation !== G.game.turn) { G.orientation = G.game.turn; buildBoard(); }
    renderAll();
    saveResume();
    updateEval();
  }

  /* ---------------- Computer opponent ---------------- */
  function maybeAI() {
    if (!G || G.mode !== 'ai' || G.over || G.game.turn === G.myColor) return;
    const level = LEVELS.find((l) => l.id === G.cfg.level) || LEVELS[1];
    G.thinking = true;
    renderStatus(); renderHint(); renderBoard();
    const token = G.token, game = G, t0 = performance.now();
    EngineHost.think({ startFen: G.cfg.startFen, moves: G.ids.slice(), depth: level.depth, timeMs: level.timeMs, noise: level.noise }, 'main').then((r) => {
      const wait = Math.max(0, 450 - (performance.now() - t0));
      setTimeout(() => {
        if (G !== game || token !== G.token || G.over) return;
        G.thinking = false;
        if (r.move) applyMove(r.move, 'ai');
      }, wait);
    });
  }

  /* ---------------- Hints ---------------- */
  function explain(r) {
    const c = G.game, turn = c.turn, them = opp(turn);
    const legal = c.moves();
    const m = legal.find((x) => x.path.join() === r.move.path.join());
    if (!m) return null;
    const before = c.threatened(them);
    const res = c.move({ path: m.path });
    if (!res) return null;
    const after = c.threatened(them);
    const oppMoves = c.moves();
    const wins = !oppMoves.length;
    const forcedReply = oppMoves.length && oppMoves[0].caps.length > 0;
    c.undo();
    const reasons = [];
    if (wins) reasons.push('Wins the game');
    if (legal.length === 1) reasons.push('Only legal move');
    if (m.caps.length > 1) reasons.push(`Multi-jump: captures ${m.caps.length} pieces (+${res.captured.reduce((s, p) => s + pieceValue(p), 0)})`);
    else if (m.caps.length === 1) reasons.push(`Captures a ${isKing(res.captured[0]) ? 'king (+2)' : 'man (+1)'}`);
    if (m.caps.length && legal.length > 1) reasons.push(`Best of ${legal.length} captures`);
    if (res.crowned) reasons.push('Crowns a king (+1)');
    if (before.has(m.from) && !after.has(m.to) && !m.caps.length) reasons.push('Moves a piece out of danger');
    if (forcedReply && !wins) reasons.push('Forces your opponent to capture');
    if (!m.caps.length && !after.has(m.to) && !forcedReply && reasons.length === 0) reasons.push('Lands on a safe square');
    const backRow = turn === 'r' ? 7 : 0;
    if (!isKing(m.piece) && (m.from >> 3) !== backRow && reasons.length < 2 && !after.size) reasons.push('Keeps every piece protected');
    if (!reasons.length) reasons.push(after.size ? 'Best option in a sharp position' : 'Improves your position');

    let evalText;
    if (r.win) {
      evalText = r.win > 0 ? `You can force a win in about ${r.win} moves.` : `Your opponent has a winning line. This move holds out the longest.`;
    } else {
      const v = r.score / 100;
      const abs = Math.abs(v);
      const who = v >= 0 ? 'you' : 'your opponent';
      const word = abs < 0.3 ? 'The position is about equal' : abs < 0.9 ? `Slight edge for ${who}` : abs < 2 ? `Clear advantage for ${who}` : `${who === 'you' ? 'You are' : 'Your opponent is'} winning`;
      evalText = `${word} (${v >= 0 ? '+' : ''}${v.toFixed(1)} pieces from your side).`;
    }
    return { notation: res.notation, reasons, evalText };
  }

  function toggleHint() {
    if (!G || G.hintBusy) return;
    if (G.hint) { G.hint = null; renderBoard(); renderHint(); return; }
    if (G.cfg.hints === false) { toast('Hints are turned off for this game.'); return; }
    if (G.over || G.viewPly != null || !canMoveColor(G.game.turn) || G.thinking) return;
    G.hintBusy = true;
    renderHint();
    const ply = G.ids.length, game = G;
    EngineHost.think({ startFen: G.cfg.startFen, moves: G.ids.slice(), depth: 64, timeMs: 1200 }, 'hint').then((r) => {
      if (G !== game || G.ids.length !== ply || G.over || !G.hintBusy) return;
      G.hintBusy = false;
      if (!r.move) { renderHint(); return; }
      const ex = explain(r);
      if (!ex) { renderHint(); return; }
      G.hint = Object.assign({ move: r.move }, ex);
      G.hintsUsed[G.mode === 'local' ? G.game.turn : G.myColor]++;
      G.evalScore = { score: r.turn === 'r' ? r.score : -r.score, win: r.turn === 'r' ? r.win : -r.win };
      renderBoard(); renderHint(); renderEvalBar();
      saveResume();
    });
  }

  /* ---------------- Evaluation bar ---------------- */
  function evalAllowed() { return settings.evalbar && G && G.cfg.hints !== false; }
  function updateEval() {
    if (!evalAllowed() || G.over) { renderEvalBar(); return; }
    const ply = G.ids.length, game = G;
    EngineHost.think({ startFen: G.cfg.startFen, moves: G.ids.slice(), depth: 64, timeMs: 400 }, 'eval').then((r) => {
      if (G !== game || G.ids.length !== ply) return;
      G.evalScore = { score: r.turn === 'r' ? r.score : -r.score, win: r.turn === 'r' ? r.win : -r.win };
      renderEvalBar();
    });
  }
  function renderEvalBar() {
    const bar = $('#evalBar');
    const on = evalAllowed();
    bar.classList.toggle('hidden', !on);
    if (!on) return;
    let pct = 50, label = '0.0';
    if (G.over) {
      pct = G.over.winner === 'r' ? 100 : G.over.winner === 'w' ? 0 : 50;
      label = G.over.winner ? (G.over.winner === 'r' ? '1-0' : '0-1') : '½';
    } else if (G.evalScore) {
      if (G.evalScore.win) { pct = G.evalScore.win > 0 ? 100 : 0; label = 'W' + Math.abs(G.evalScore.win); }
      else { pct = 100 / (1 + Math.exp(-0.009 * G.evalScore.score)); label = (G.evalScore.score / 100).toFixed(1); }
    }
    $('#evalFill').style.height = pct + '%';
    $('#evalNum').textContent = label;
  }

  /* ---------------- Clock ---------------- */
  setInterval(() => {
    if (!G || !G.timed) return;
    const now = performance.now();
    const dt = now - G.lastTick;
    G.lastTick = now;
    if (G.over || G.records.length === 0) return;
    if (G.mode === 'online' && !Net.connected) return;
    const c = G.game.turn;
    G.clocks[c] -= dt;
    if (G.clocks[c] <= 0) {
      G.clocks[c] = 0;
      if (G.mode === 'online' && c !== G.myColor) {
        if (!G.oppZeroSince) G.oppZeroSince = now;
        if (now - G.oppZeroSince > 2500) flag(c);
      } else flag(c);
    } else G.oppZeroSince = 0;
    updateClocks();
  }, 100);

  function flag(c) {
    if (G.over) return;
    if (G.mode === 'online') Net.send({ t: 'flag', color: c });
    endGame({ over: true, winner: opp(c), reason: 'timeout', loser: c });
  }

  /* ---------------- Game end ---------------- */
  function resultTitle(r) {
    if (!r.winner) return 'Draw';
    if (G.mode === 'local') return `${playerLabel(r.winner)} wins`;
    return r.winner === G.myColor ? 'You win' : `${G.mode === 'ai' ? 'Computer' : playerLabel(r.winner)} wins`;
  }
  function resultReason(r) {
    const loser = r.loser ? playerLabel(r.loser) : '';
    switch (r.reason) {
      case 'noPieces': return `${loser} has no pieces left`;
      case 'blocked': return `${loser} has no legal move`;
      case 'repetition': return 'The same position appeared three times';
      case 'forty': return '40 moves each with no capture and no man moved';
      case 'resign': return `${loser} resigned`;
      case 'timeout': return `${loser} ran out of time`;
      case 'agreement': return 'Draw by agreement';
      default: return '';
    }
  }

  function endGame(r) {
    if (!G || G.over) return;
    G.over = r;
    G.thinking = false;
    G.hint = null;
    G.selected = -1; G.partial = [];
    G.token++;
    store.del('resume');
    recordStats(r);
    Sound.play('end');
    renderAll();
    setTimeout(() => { if (G && G.over === r) showResult(); }, 650);
  }

  // Lifetime record against the computer, saved on this device
  function recordStats(r) {
    if (G.mode !== 'ai') return;
    const s = store.get('stats', {});
    const lv = G.cfg.level;
    s[lv] = s[lv] || { w: 0, l: 0, d: 0 };
    if (!r.winner) s[lv].d++; else if (r.winner === G.myColor) s[lv].w++; else s[lv].l++;
    store.set('stats', s);
  }

  function showResult() {
    const r = G.over;
    const caps = captures();
    const kings = crowned();
    const pts = (c) => caps[c].reduce((s, p) => s + pieceValue(p), 0);
    const actions = [];
    if (G.mode === 'online') {
      if (Net.connected) actions.push('<button class="btn primary" data-act="rematch">Offer rematch</button>');
    } else actions.push('<button class="btn primary" data-act="again">Play again</button>');
    openModal(`
      <div class="m-head"><div><p class="result-big">${esc(resultTitle(r))}</p><p class="result-why">${esc(resultReason(r))}</p></div>
        <button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="result-stats">
        <div><span>${esc(playerLabel('r'))} points</span><b>${pts('r')}</b></div>
        <div><span>${esc(playerLabel('w'))} points</span><b>${pts('w')}</b></div>
        <div><span>Kings crowned</span><b>${kings.r} : ${kings.w}</b></div>
        <div><span>Hints used</span><b>${G.mode === 'local' ? G.hintsUsed.r + G.hintsUsed.w : G.hintsUsed[G.myColor]}</b></div>
      </div>
      <div class="m-actions">
        <button class="btn" data-act="review">Review game</button>
        <button class="btn" data-act="home">Home</button>
        ${actions.join('')}
      </div>`, (act) => {
      if (act === 'review') { closeModal(); setView(0); }
      else if (act === 'home') { closeModal(); goHome(); }
      else if (act === 'again') {
        closeModal();
        const cfg = G.cfg;
        if (cfg.mode === 'ai' && cfg.colorPref === 'random') cfg.myColor = Math.random() < 0.5 ? 'r' : 'w';
        if (cfg.mode === 'ai') cfg.players = aiPlayers(cfg);
        newGame(cfg);
      } else if (act === 'rematch') { closeModal(); Net.send({ t: 'rematch' }); toast('Rematch offered'); }
    });
  }

  /* ---------------- Review navigation ---------------- */
  function setView(ply) {
    if (!G) return;
    ply = Math.max(0, Math.min(G.records.length, ply));
    G.viewPly = ply === G.records.length ? null : ply;
    G.selected = -1; G.partial = [];
    renderBoard(); renderCards(); renderMoves(); renderPoints(); renderHint(); renderToolbar();
  }
  const curPly = () => (G.viewPly == null ? G.records.length : G.viewPly);

  /* ---------------- Toolbar actions ---------------- */
  function doUndo() {
    if (!G || !G.records.length) return;
    if (G.mode === 'local') { rebuildTo(G.records.length - 1); return; }
    if (G.mode === 'ai') {
      let target = G.records.length;
      for (let i = G.records.length - 1; i >= 0; i--) { if (G.records[i].color === G.myColor) { target = i; break; } }
      rebuildTo(target);
      maybeAI();
      return;
    }
    if (G.mode === 'online') {
      let target = -1;
      for (let i = G.records.length - 1; i >= 0; i--) { if (G.records[i].color === G.myColor) { target = i; break; } }
      if (target < 0) return;
      Net.send({ t: 'takeback', ply: target });
      toast('Takeback requested');
    }
  }

  function doDraw() {
    if (!G || G.over) return;
    if (G.mode === 'local') {
      confirmBox('Agree to a draw?', 'Both players agree to end the game as a draw.', 'Agree to draw', () => endGame({ over: true, winner: null, reason: 'agreement' }));
    } else if (G.mode === 'ai') {
      if (G.records.length < 30) { toast('The computer declines. It is too early for a draw.'); return; }
      EngineHost.think({ startFen: G.cfg.startFen, moves: G.ids.slice(), depth: 64, timeMs: 500 }, 'eval').then((r) => {
        const red = r.turn === 'r' ? r.score : -r.score;
        const aiScore = G.myColor === 'r' ? -red : red;
        if (aiScore <= 30) endGame({ over: true, winner: null, reason: 'agreement' });
        else toast('The computer declines the draw offer.');
      });
    } else {
      Net.send({ t: 'drawOffer' });
      toast('Draw offered');
    }
  }

  function doResign() {
    if (!G || G.over) return;
    const loser = G.mode === 'local' ? G.game.turn : G.myColor;
    const name = G.mode === 'local' ? playerLabel(loser) : 'you';
    confirmBox('Resign this game?', `This ends the game with ${name} losing.`, 'Resign', () => {
      if (G.mode === 'online') Net.send({ t: 'resign' });
      endGame({ over: true, winner: opp(loser), reason: 'resign', loser });
    }, true);
  }

  function flipBoard() {
    if (!G) return;
    G.orientation = opp(G.orientation);
    buildBoard();
    renderAll();
  }

  function downloadPDN() {
    if (!G) return;
    const d = new Date();
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const result = G.over ? (G.over.winner === 'r' ? '1-0' : G.over.winner === 'w' ? '0-1' : '1/2-1/2') : '*';
    const tags = [['Event', 'Kingrow Checkers'], ['Site', location.host || 'Local'], ['Date', date], ['Black', playerLabel('r') + ' (Red)'], ['White', playerLabel('w')], ['Result', result], ['GameType', '21']];
    if (G.cfg.tc && G.cfg.tc.base) tags.push(['TimeControl', `${G.cfg.tc.base}+${G.cfg.tc.inc}`]);
    if (G.cfg.startFen !== Checkers.START_FEN) tags.push(['FEN', G.cfg.startFen]);
    let moves = '';
    G.records.forEach((r, i) => { if (i % 2 === 0) moves += `${i / 2 + 1}. `; moves += r.notation + ' '; });
    const pdn = tags.map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n') + '\n\n' + (moves + result).trim() + '\n';
    const blob = new Blob([pdn], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kingrow-${date.replace(/\./g, '-')}.pdn`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('PDN saved');
  }

  /* ---------------- Online offers ---------------- */
  function showOffer(text, onAccept, onDecline) {
    const box = $('#offerBox');
    box.innerHTML = `<span>${esc(text)}</span><div class="row"><button class="btn" data-o="no">Decline</button><button class="btn primary" data-o="yes">Accept</button></div>`;
    box.classList.remove('hidden');
    box.onclick = (e) => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      box.classList.add('hidden');
      if (b.dataset.o === 'yes') onAccept(); else if (onDecline) onDecline();
    };
    Sound.play('notify');
  }

  /* ---------------- Modals ---------------- */
  let modalHandler = null;
  function openModal(html, handler, wide) {
    const m = $('#modal');
    m.className = 'modal' + (wide ? ' wide' : '');
    m.innerHTML = html;
    fillIcons(m);
    modalHandler = handler;
    $('#modalBack').classList.remove('hidden');
  }
  function closeModal() {
    $('#modalBack').classList.add('hidden');
    $('#modal').innerHTML = '';
    modalHandler = null;
  }
  $('#modalBack').addEventListener('click', (e) => {
    if (e.target.id === 'modalBack' || e.target.closest('[data-close]')) {
      const h = modalHandler;
      closeModal();
      if (h) h('close');
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && modalHandler) modalHandler(a.dataset.act, a);
  });

  function confirmBox(title, text, okLabel, onOk, danger) {
    openModal(`<div class="m-head"><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div></div>
      <div class="m-actions"><button class="btn" data-act="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okLabel)}</button></div>`,
    (act) => { if (act === 'ok') { closeModal(); onOk(); } else if (act === 'cancel') closeModal(); });
  }

  function seg(name, items, value, big) {
    return `<div class="seg ${big ? 'big' : ''}" data-seg="${name}">${items.map((it) => `<button type="button" data-v="${it.id}" class="${it.id === value ? 'on' : ''}">${esc(it.label)}${big && it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('')}</div>`;
  }
  function wireSegs(root, state) {
    $$('[data-seg]', root).forEach((s) => {
      s.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        $$('button', s).forEach((x) => x.classList.toggle('on', x === b));
        state[s.dataset.seg] = b.dataset.v;
      });
    });
  }
  function toggleRow(id, label, sub, on) {
    return `<label class="toggle"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></span></label>`;
  }

  /* ---------------- Setup screens ---------------- */
  function aiPlayers(cfg) {
    const level = LEVELS.find((l) => l.id === cfg.level) || LEVELS[1];
    const me = cfg.myName || 'You';
    return cfg.myColor === 'r' ? { r: { name: me }, w: { name: `Computer (${level.label})` } } : { r: { name: `Computer (${level.label})` }, w: { name: me } };
  }

  const COLOR_CHOICES = [{ id: 'r', label: 'Red (moves first)' }, { id: 'random', label: 'Random' }, { id: 'w', label: 'White' }];

  function setupLocal() {
    const st = { tc: 'none' };
    openModal(`
      <div class="m-head"><div><h3>Pass &amp; Play</h3><p>Two players share this device and take turns. Red moves first.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field-row">
        <div class="field"><label for="nR">Red</label><input type="text" id="nR" maxlength="20" placeholder="Red"></div>
        <div class="field"><label for="nW">White</label><input type="text" id="nW" maxlength="20" placeholder="White"></div>
      </div>
      <div class="field"><span class="lbl">Time control</span>${seg('tc', TIME_CONTROLS, st.tc)}</div>
      <div class="field">
        ${toggleRow('optHints', 'Allow hints', 'Either player can ask for the best move', true)}
        ${toggleRow('optFlip', 'Rotate board each turn', 'The board faces whoever is moving', settings.autoflip)}
      </div>
      <div class="m-actions"><button class="btn primary block" data-act="start">${icon('play')}Start game</button></div>`,
    (act) => {
      if (act !== 'start') return;
      settings.autoflip = $('#optFlip').checked; saveSettings();
      const tc = TIME_CONTROLS.find((t) => t.id === st.tc);
      const cfg = {
        mode: 'local',
        players: { r: { name: $('#nR').value.trim() || 'Red' }, w: { name: $('#nW').value.trim() || 'White' } },
        tc: { base: tc.base, inc: tc.inc },
        hints: $('#optHints').checked
      };
      closeModal();
      newGame(cfg);
    });
    wireSegs($('#modal'), st);
  }

  function setupAI() {
    const st = { level: 'casual', color: 'r', tc: 'none' };
    const stats = store.get('stats', {});
    const rec = LEVELS.map((l) => stats[l.id] ? `${l.label} ${stats[l.id].w}-${stats[l.id].l}-${stats[l.id].d}` : '').filter(Boolean).join(', ');
    openModal(`
      <div class="m-head"><div><h3>Play the computer</h3><p>The computer runs on your device, so this works offline.${rec ? ` Your record (wins-losses-draws): ${esc(rec)}.` : ''}</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field"><label for="nMe">Your name</label><input type="text" id="nMe" maxlength="20" placeholder="You" value="${esc(settings.name)}"></div>
      <div class="field"><span class="lbl">Difficulty</span>${seg('level', LEVELS, st.level, true)}</div>
      <div class="field"><span class="lbl">Play as</span>${seg('color', COLOR_CHOICES, st.color)}</div>
      <div class="field"><span class="lbl">Time control</span>${seg('tc', TIME_CONTROLS, st.tc)}</div>
      <div class="field">${toggleRow('optHints', 'Allow hints', 'Ask the coach for the best move on your turn', true)}</div>
      <div class="m-actions"><button class="btn primary block" data-act="start">${icon('play')}Start game</button></div>`,
    (act) => {
      if (act !== 'start') return;
      const name = $('#nMe').value.trim();
      settings.name = name; saveSettings();
      const tc = TIME_CONTROLS.find((t) => t.id === st.tc);
      const myColor = st.color === 'random' ? (Math.random() < 0.5 ? 'r' : 'w') : st.color;
      const cfg = { mode: 'ai', level: st.level, myColor, colorPref: st.color, myName: name || 'You', tc: { base: tc.base, inc: tc.inc }, hints: $('#optHints').checked };
      cfg.players = aiPlayers(cfg);
      closeModal();
      newGame(cfg);
    });
    wireSegs($('#modal'), st);
  }

  function setupOnline(joinCode) {
    const st = { color: 'random', tc: '10+0', tab: joinCode ? 'join' : 'create' };
    const peerReady = () => typeof window.Peer === 'function';
    openModal(`
      <div class="m-head"><div><h3>Play online</h3><p>Create a room and share the link, or join a friend's room.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="tabs" style="margin-bottom:16px">
        <button class="tab ${st.tab === 'create' ? 'active' : ''}" data-act="tab" data-t="create">Create room</button>
        <button class="tab ${st.tab === 'join' ? 'active' : ''}" data-act="tab" data-t="join">Join room</button>
      </div>
      <div class="field"><label for="nMe">Your name</label><input type="text" id="nMe" maxlength="20" placeholder="Player" value="${esc(settings.name)}"></div>
      <div id="createPane" class="${st.tab === 'create' ? '' : 'hidden'}">
        <div class="field"><span class="lbl">Your color</span>${seg('color', COLOR_CHOICES, st.color)}</div>
        <div class="field"><span class="lbl">Time control</span>${seg('tc', TIME_CONTROLS, st.tc)}</div>
        <div class="field">${toggleRow('optHints', 'Allow hints', 'Both players can use the coach and evaluation bar', false)}</div>
        <div id="roomSlot"></div>
        <div class="m-actions" id="createActions"><button class="btn primary block" data-act="create">${icon('link')}Create room</button></div>
      </div>
      <div id="joinPane" class="${st.tab === 'join' ? '' : 'hidden'}">
        <div class="field"><label for="codeIn">Room code</label><input type="text" id="codeIn" maxlength="6" placeholder="ABC123" value="${esc(joinCode || '')}" style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.15em"></div>
        <div class="waiting hidden" id="joinWait"><span class="spinner"></span>Connecting...</div>
        <div class="m-actions"><button class="btn primary block" data-act="join">${icon('globe')}Join game</button></div>
      </div>`,
    (act, el) => {
      if (act === 'close') { if (!G || G.mode !== 'online' || !Net.connected) Net.close(); return; }
      if (act === 'tab') {
        st.tab = el.dataset.t;
        $$('.tabs .tab', $('#modal')).forEach((t) => t.classList.toggle('active', t.dataset.t === st.tab));
        $('#createPane').classList.toggle('hidden', st.tab !== 'create');
        $('#joinPane').classList.toggle('hidden', st.tab !== 'join');
        return;
      }
      const name = $('#nMe').value.trim() || 'Player';
      settings.name = $('#nMe').value.trim(); saveSettings();
      if (!peerReady()) { toast('Online play needs an internet connection. Check your connection and reload.'); return; }
      if (act === 'create') {
        const tc = TIME_CONTROLS.find((t) => t.id === st.tc);
        const hostColor = st.color === 'random' ? (Math.random() < 0.5 ? 'r' : 'w') : st.color;
        el.disabled = true;
        el.innerHTML = '<span class="spinner"></span>Creating room...';
        Net.host({ name, hostColor, tc: { base: tc.base, inc: tc.inc }, hints: $('#optHints').checked }, (code) => {
          const link = `${location.origin}${location.pathname}?room=${code}`;
          $('#createActions').classList.add('hidden');
          $('#roomSlot').innerHTML = `<div class="room-box">
              <div class="lbl" style="font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.06em;text-transform:uppercase">Room code</div>
              <div class="room-code">${code}</div>
              <div class="room-link"><input readonly value="${esc(link)}" id="roomLink"><button class="btn" data-act="copy">${icon('copy')}Copy link</button></div>
              <div class="waiting"><span class="spinner"></span>Waiting for your friend to join...</div>
            </div>`;
        });
      } else if (act === 'copy') {
        const v = $('#roomLink').value;
        const done = () => toast('Link copied');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => { $('#roomLink').select(); document.execCommand('copy'); done(); });
        else { $('#roomLink').select(); document.execCommand('copy'); done(); }
      } else if (act === 'join') {
        const code = $('#codeIn').value.trim().toUpperCase();
        if (code.length < 4) { toast('Enter the room code your friend sent you.'); return; }
        $('#joinWait').classList.remove('hidden');
        Net.join(code, name, (err) => {
          $('#joinWait').classList.add('hidden');
          toast(err);
        });
      }
    });
    wireSegs($('#modal'), st);
  }

  /* ---------------- Networking (PeerJS / WebRTC) ---------------- */
  const PREFIX = 'kingrow-checkers-v1-';
  const Net = {
    peer: null, conn: null, code: null, role: null, connected: false, hostCfg: null,
    genCode() {
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let s = '';
      for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
      return s;
    },
    close() {
      try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
      this.peer = null; this.conn = null; this.connected = false; this.role = null;
    },
    queue: [],
    send(obj) {
      if (this.conn && this.conn.open) { try { this.conn.send(obj); } catch (e) { /* ignore */ } }
      else if (this.conn) this.queue.push(obj);
    },
    host(cfg, onReady, tries) {
      this.close();
      this.role = 'host';
      this.hostCfg = cfg;
      const code = this.genCode();
      this.code = code;
      const peer = new window.Peer(PREFIX + code, { debug: 0 });
      this.peer = peer;
      peer.on('open', () => onReady(code));
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && (tries || 0) < 4) { this.host(cfg, onReady, (tries || 0) + 1); return; }
        if (err.type === 'peer-unavailable') return;
        toast('Connection problem: ' + (err.type || 'unknown') + '. Try again.');
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      peer.on('connection', (conn) => {
        if (this.conn && this.conn.open) {
          conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); });
          return;
        }
        this.attach(conn);
      });
    },
    join(code, name, onErr) {
      this.close();
      this.role = 'guest';
      this.code = code;
      this.myName = name;
      const peer = new window.Peer({ debug: 0 });
      this.peer = peer;
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { onErr('Could not reach that room. Check the code and that your friend still has it open.'); this.close(); } }, 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, metadata: { name } });
        this.attach(conn, () => { settled = true; clearTimeout(timer); });
      });
      peer.on('error', (err) => {
        if (settled && err.type !== 'peer-unavailable') { toast('Connection problem: ' + err.type); return; }
        settled = true; clearTimeout(timer);
        onErr(err.type === 'peer-unavailable' ? 'Room not found. Check the code and try again.' : 'Could not connect (' + err.type + ').');
        this.close();
      });
    },
    attach(conn, onOpen) {
      this.conn = conn;
      this.queue = [];
      conn.on('open', () => {
        this.connected = true;
        if (onOpen) onOpen();
        const q = this.queue.splice(0);
        q.forEach((m) => { try { conn.send(m); } catch (e) { /* ignore */ } });
        if (this.role === 'guest') conn.send({ t: 'join', name: this.myName });
        if (G && G.mode === 'online') renderAll();
      });
      conn.on('data', (msg) => onNet(msg));
      conn.on('close', () => {
        if (this.conn !== conn) return;
        this.connected = false;
        this.conn = null;
        if (G && G.mode === 'online') {
          if (!G.over) toast('Your opponent disconnected', 3500);
          renderAll();
          if (this.role === 'guest' && !G.over) setTimeout(() => this.rejoin(), 1500);
        }
      });
      conn.on('error', () => { /* handled by close */ });
    },
    rejoin() {
      if (this.connected || this.role !== 'guest' || !this.peer || this.peer.destroyed) return;
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
      this.attach(conn);
    }
  };

  function onlineHello() {
    return { t: 'hello', players: G.cfg.players, yourColor: opp(G.myColor), tc: G.cfg.tc, hints: G.cfg.hints, startFen: G.cfg.startFen, ids: G.ids, clocks: G.clocks, over: G.over };
  }

  function onNet(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'join': {
        if (Net.role !== 'host') return;
        const name = String(msg.name || 'Guest').slice(0, 20);
        if (!G || G.mode !== 'online' || G.over) {
          const h = Net.hostCfg;
          const players = h.hostColor === 'r' ? { r: { name: h.name }, w: { name } } : { r: { name }, w: { name: h.name } };
          closeModal();
          newGame({ mode: 'online', myColor: h.hostColor, players, tc: h.tc, hints: h.hints });
          Sound.play('notify');
          toast(`${name} joined. Good luck!`);
        } else toast(`${name} reconnected`);
        Net.send(onlineHello());
        renderAll();
        break;
      }
      case 'hello': {
        if (Net.role !== 'guest') return;
        const fresh = !G || G.mode !== 'online' || G.ids.join() !== (msg.ids || []).join();
        if (fresh) {
          closeModal();
          newGame({ mode: 'online', myColor: msg.yourColor, players: msg.players, tc: msg.tc, hints: msg.hints, startFen: msg.startFen }, { ids: msg.ids, clocks: msg.clocks });
          Sound.play('notify');
          toast(`Connected. You play ${COLOR_NAME[msg.yourColor]}.`);
        } else {
          if (msg.clocks) G.clocks = msg.clocks;
          toast('Reconnected');
          renderAll();
        }
        break;
      }
      case 'move': {
        if (!G || G.mode !== 'online' || G.over) return;
        if (G.game.turn === G.myColor) return;
        if (msg.ply && msg.ply !== G.ids.length + 1) return;
        const ok = applyMove(String(msg.id || ''), 'remote', { clock: msg.clock });
        if (!ok) toast('Received an invalid move');
        break;
      }
      case 'resign':
        if (G && !G.over) endGame({ over: true, winner: G.myColor, reason: 'resign', loser: opp(G.myColor) });
        break;
      case 'flag':
        if (G && !G.over && (msg.color === 'r' || msg.color === 'w')) {
          G.clocks[msg.color] = 0;
          endGame({ over: true, winner: opp(msg.color), reason: 'timeout', loser: msg.color });
        }
        break;
      case 'drawOffer':
        if (!G || G.over) return;
        showOffer(`${playerLabel(opp(G.myColor))} offers a draw`, () => { Net.send({ t: 'drawAccept' }); endGame({ over: true, winner: null, reason: 'agreement' }); }, () => Net.send({ t: 'drawDecline' }));
        break;
      case 'drawAccept':
        if (G && !G.over) endGame({ over: true, winner: null, reason: 'agreement' });
        break;
      case 'drawDecline': toast('Draw offer declined'); break;
      case 'takeback':
        if (!G || G.over || typeof msg.ply !== 'number') return;
        showOffer(`${playerLabel(opp(G.myColor))} asks to take back a move`, () => { Net.send({ t: 'takebackAccept', ply: msg.ply }); rebuildTo(msg.ply); }, () => Net.send({ t: 'takebackDecline' }));
        break;
      case 'takebackAccept':
        if (G && typeof msg.ply === 'number') { rebuildTo(msg.ply); toast('Takeback accepted'); }
        break;
      case 'takebackDecline': toast('Takeback declined'); break;
      case 'rematch':
        if (!G) return;
        if (!$('#modalBack').classList.contains('hidden')) closeModal();
        showOffer(`${playerLabel(opp(G.myColor))} wants a rematch`, () => { Net.send({ t: 'rematchGo' }); startRematch(); }, () => Net.send({ t: 'rematchNo' }));
        break;
      case 'rematchGo': closeModal(); startRematch(); break;
      case 'rematchNo': toast('Rematch declined'); break;
      case 'chat': addChat(String(msg.text || '').slice(0, 200), 'them'); break;
      case 'full': toast('That room already has two players.'); Net.close(); break;
      default: break;
    }
  }

  function startRematch() {
    const cfg = JSON.parse(JSON.stringify(G.cfg));
    cfg.myColor = opp(G.myColor);
    cfg.players = { r: cfg.players.w, w: cfg.players.r };
    if (Net.role === 'host' && Net.hostCfg) Net.hostCfg.hostColor = cfg.myColor;
    newGame(cfg);
    toast(`Rematch! You play ${COLOR_NAME[cfg.myColor]}.`);
  }

  function addChat(text, who) {
    if (!text) return;
    const log = $('#chatLog');
    const el = document.createElement('div');
    el.className = 'chat-msg ' + (who === 'me' ? 'me' : who === 'sys' ? 'sys' : '');
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    if (who === 'them' && $('[data-panel=chat]').classList.contains('hidden')) $('#chatDot').classList.remove('hidden');
    if (who === 'them') Sound.play('notify');
  }
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chatInput');
    const text = inp.value.trim();
    if (!text) return;
    if (!Net.connected) { toast('Not connected'); return; }
    Net.send({ t: 'chat', text });
    addChat(text, 'me');
    inp.value = '';
  });

  /* ---------------- Views & navigation ---------------- */
  function showView(v) {
    $('#home').classList.toggle('hidden', v !== 'home');
    $('#game').classList.toggle('hidden', v !== 'game');
    window.scrollTo(0, 0);
  }

  function goHome() {
    if (G && G.mode === 'online' && !G.over && Net.connected) {
      confirmBox('Leave this online game?', 'Leaving counts as resigning.', 'Leave game', () => {
        Net.send({ t: 'resign' });
        endGame({ over: true, winner: opp(G.myColor), reason: 'resign', loser: G.myColor });
        closeModal();
        Net.close();
        G = null;
        renderHome();
        showView('home');
      }, true);
      return;
    }
    if (G && G.mode === 'online') { Net.close(); G = null; }
    renderHome();
    showView('home');
  }

  function switchTab(name) {
    $$('.tab[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
    if (name === 'chat') $('#chatDot').classList.add('hidden');
  }

  function renderHome() {
    $('#valuesRow').innerHTML = [['r', 'Man', '1'], ['R', 'King', '2'], [null, 'Crowning', '+1']].map(([p, n, v]) =>
      `<div class="value-tile"><span class="pc">${p ? pieceSVG(p) : icon('crown', 40)}</span><b>${v}</b><span>${n}</span></div>`).join('');
    const r = store.get('resume', null);
    const slot = $('#resumeSlot');
    if (r && r.cfg && r.ids && r.ids.length) {
      const label = r.cfg.mode === 'ai' ? `vs ${r.cfg.myColor === 'r' ? r.cfg.players.w.name : r.cfg.players.r.name}` : `${r.cfg.players.r.name} vs ${r.cfg.players.w.name}`;
      slot.innerHTML = `<div class="resume"><div><strong>Continue your game</strong><span>${esc(label)}, ${Math.ceil(r.ids.length / 2)} moves played</span></div>
        <div class="row"><button class="btn ghost" id="resumeDrop">Discard</button><button class="btn primary" id="resumeGo">Resume</button></div></div>`;
      $('#resumeGo').onclick = () => newGame(r.cfg, r);
      $('#resumeDrop').onclick = () => { store.del('resume'); renderHome(); };
    } else slot.innerHTML = '';
  }

  function openSettings() {
    openModal(`
      <div class="m-head"><div><h3>Settings</h3><p>Saved on this device.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field"><span class="lbl">Appearance</span>${seg('ui', [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }], settings.ui)}</div>
      <div class="field"><span class="lbl">Board</span><div class="swatches">${BOARDS.map((b) => `<button class="swatch ${b.id === settings.board ? 'on' : ''}" data-act="board" data-b="${b.id}" aria-label="${b.id} board"><i style="background:${b.l}"></i><i style="background:${b.d}"></i><i style="background:${b.d}"></i><i style="background:${b.l}"></i></button>`).join('')}</div></div>
      <div class="field">
        ${toggleRow('sLegal', 'Show legal moves', 'Dots mark where a piece can go, and pieces that must capture glow', settings.legal)}
        ${toggleRow('sCoords', 'Square numbers', 'Show the standard 1 to 32 numbering used in notation', settings.coords)}
        ${toggleRow('sEval', 'Evaluation bar', 'Live advantage meter (only when hints are allowed)', settings.evalbar)}
        ${toggleRow('sFlip', 'Rotate board in Pass & Play', 'Turn the board to face the player to move', settings.autoflip)}
        ${toggleRow('sAnim', 'Animations', 'Slide pieces along their path', settings.anim)}
        ${toggleRow('sSound', 'Sounds', 'Move, capture and crowning sounds', settings.sound)}
      </div>
      <div class="m-actions"><button class="btn primary" data-act="done">Done</button></div>`,
    (act, el) => {
      if (act === 'board') {
        settings.board = el.dataset.b;
        $$('.swatch', $('#modal')).forEach((s) => s.classList.toggle('on', s === el));
        applyTheme(); saveSettings();
      } else if (act === 'done') closeModal();
    });
    const m = $('#modal');
    $('[data-seg=ui]', m).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('button', b.parentNode).forEach((x) => x.classList.toggle('on', x === b));
      settings.ui = b.dataset.v; applyTheme(); saveSettings();
    });
    const bind = (id, key, after) => $('#' + id, m).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); if (after) after(); });
    bind('sLegal', 'legal', () => G && renderBoard());
    bind('sCoords', 'coords', () => { if (G) { buildBoard(); renderAll(); } });
    bind('sEval', 'evalbar', () => { if (G) { renderEvalBar(); updateEval(); } });
    bind('sFlip', 'autoflip', () => { if (G && G.mode === 'local' && settings.autoflip && G.orientation !== G.game.turn) { G.orientation = G.game.turn; buildBoard(); renderAll(); } });
    bind('sAnim', 'anim');
    bind('sSound', 'sound');
  }

  function openRules() {
    openModal(`
      <div class="m-head"><div><h3>How the rules work</h3><p>These are the official rules of American checkers (English draughts). Everything below is enforced automatically.</p></div><button class="m-close" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="rules">
        <h4>Setup</h4><p>The board has 64 squares and play happens only on the dark ones. Each player starts with 12 men on the three rows nearest them. Red always moves first, then turns alternate.</p>
        <h4>Moving</h4><p>A man moves one square diagonally forward onto an empty dark square. Tap a piece to see where it can go.</p>
        <h4>Capturing</h4><p>Jump diagonally over an opponent's piece onto the empty square just beyond it to capture it. Men capture forward only.</p>
        <ul>
          <li><b>Captures are compulsory.</b> If any capture is available, you must take one. Pieces that can capture glow.</li>
          <li><b>Multi-jumps.</b> If the same piece can keep jumping after a capture, it must continue until no more jumps are possible.</li>
          <li><b>Your choice of capture.</b> When several captures are available you may choose any of them. You do not have to take the one that captures the most.</li>
          <li>A piece cannot be jumped twice in the same move.</li>
        </ul>
        <h4>Kings</h4><p>A man that reaches the far row is crowned a king. Kings move and capture one square diagonally in any direction. If a man is crowned during a capture, its move ends there.</p>
        <h4>Winning</h4><p>You win when your opponent has no pieces left or no legal move, or when they resign or run out of time.</p>
        <h4>Draws</h4><p>The game is drawn if the same position occurs three times with the same player to move, if 40 moves pass for each player with no capture and no man moved (only kings shuffling), or if both players agree.</p>
        <h4>Points</h4><p>Man 1, King 2. Points show who is ahead in material, but the game is won by blocking or capturing every piece.</p>
        <h4>Notation</h4><p>Dark squares are numbered 1 to 32, starting from Red's side. A move is written from-to, like 11-15, and a capture uses x, like 15x22 or 15x22x31 for a double jump.</p>
      </div>
      <div class="m-actions"><button class="btn primary" data-close>Got it</button></div>`, null, true);
  }

  /* ---------------- Wiring ---------------- */
  function init() {
    applyTheme();
    fillIcons(document);
    $('#brandMark').innerHTML = pieceSVG('R');
    renderHome();

    $$('.mode-card').forEach((c) => c.addEventListener('click', () => {
      const m = c.dataset.mode;
      if (m === 'local') setupLocal();
      else if (m === 'ai') setupAI();
      else setupOnline();
    }));
    $('#brandBtn').onclick = goHome;
    $('#navPlay').onclick = goHome;
    $('#navRules').onclick = openRules;
    $('#navSettings').onclick = openSettings;
    $('#navTheme').onclick = () => { settings.ui = settings.ui === 'dark' ? 'light' : 'dark'; applyTheme(); saveSettings(); };

    $('#hintBtn').onclick = toggleHint;
    $('#undoBtn').onclick = doUndo;
    $('#flipBtn').onclick = flipBoard;
    $('#drawBtn').onclick = doDraw;
    $('#resignBtn').onclick = doResign;
    $('#pdnBtn').onclick = downloadPDN;
    $('#newBtn').onclick = () => {
      if (!G) return;
      const start = () => {
        if (G.mode === 'online') { if (Net.connected) { Net.send({ t: 'rematch' }); toast('New game offered to your opponent'); } return; }
        if (G.mode === 'ai') setupAI(); else setupLocal();
      };
      if (!G.over && G.records.length && G.mode !== 'online') confirmBox('Start a new game?', 'The current game will be lost.', 'New game', start);
      else start();
    };
    $('#reviewLive').onclick = () => setView(G.records.length);
    $('#moveList').addEventListener('click', (e) => { const b = e.target.closest('[data-ply]'); if (b) setView(+b.dataset.ply); });
    $('#navFirst').onclick = () => setView(0);
    $('#navPrev').onclick = () => setView(curPly() - 1);
    $('#navNext').onclick = () => setView(curPly() + 1);
    $('#navLast').onclick = () => setView(G.records.length);
    $$('.tab[data-tab]').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    document.addEventListener('keydown', (e) => {
      if (!G || $('#game').classList.contains('hidden')) return;
      if (e.target.closest('input, textarea')) return;
      if (!$('#modalBack').classList.contains('hidden')) { if (e.key === 'Escape') { const h = modalHandler; closeModal(); if (h) h('close'); } return; }
      if (e.key === 'ArrowLeft') { setView(curPly() - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setView(curPly() + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setView(0); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { setView(G.records.length); e.preventDefault(); }
      else if (e.key === 'f') flipBoard();
      else if (e.key === 'h') toggleHint();
      else if (e.key === 'Escape') { if (G.partial.length > 1) { G.partial = [G.selected]; renderBoard(); } else deselect(); }
    });

    window.addEventListener('resize', () => { if (G) renderArrows(); });
    window.addEventListener('beforeunload', (e) => {
      if (G && G.mode === 'online' && !G.over && Net.connected) { e.preventDefault(); e.returnValue = ''; }
    });

    const room = new URLSearchParams(location.search).get('room');
    if (room) {
      const open = () => setupOnline(room.toUpperCase().slice(0, 6));
      if (document.readyState === 'complete') open(); else window.addEventListener('load', open);
    }

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }

    // Test hook (harmless in production)
    window.__kingrow = { get G() { return G; }, applyMove, newGame, step };
  }

  init();
})();
