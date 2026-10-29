/*
 * Kingrow - checkers rules engine (American checkers / English draughts, WCDF rules)
 *  - 8x8 board, play on the dark squares, Red moves first
 *  - men move one square diagonally forward; kings move one square in any diagonal direction
 *  - captures are compulsory; a capture must be continued while more jumps are available
 *  - any capturing sequence may be chosen (the longest is not required)
 *  - a man that reaches the far row is crowned and its move ends there
 *  - a player with no pieces or no legal move loses
 *  - draws: threefold repetition, 40 moves each with no capture and no man moved, agreement
 *  - standard 1-32 square numbering and PDN notation (11-15, 22x15x8)
 */
function KingrowRulesFactory(root) {
  'use strict';

  const DIRS = { r: [[-1, -1], [-1, 1]], w: [[1, -1], [1, 1]], k: [[-1, -1], [-1, 1], [1, -1], [1, 1]] };
  const VALUES = { man: 1, king: 2 };
  const DRAW_PLIES = 80; // 40 moves by each player

  // Internal index 0..63, row = i >> 3 (0 at top), col = i & 7.
  // Red starts at the bottom and moves up. White starts at the top.
  // Standard numbering puts the first player's pieces (Red) on squares 1-12.
  const isDark = (i) => (((i >> 3) + (i & 7)) & 1) === 1;
  const sqNum = (i) => { const dr = 7 - (i >> 3), dc = 7 - (i & 7); return dr * 4 + (dc >> 1) + 1; };
  const NUM_TO_SQ = [];
  for (let i = 0; i < 64; i++) if (isDark(i)) NUM_TO_SQ[sqNum(i)] = i;
  const colorOf = (p) => (p ? (p.toLowerCase() === 'r' ? 'r' : 'w') : null);
  const isKing = (p) => !!p && p === p.toUpperCase();
  const opp = (c) => (c === 'r' ? 'w' : 'r');
  const crownRow = (c) => (c === 'r' ? 0 : 7);

  function startBoard() {
    const b = new Array(64).fill(null);
    for (let i = 0; i < 64; i++) {
      if (!isDark(i)) continue;
      const r = i >> 3;
      if (r < 3) b[i] = 'w';
      if (r > 4) b[i] = 'r';
    }
    return b;
  }

  class Checkers {
    constructor(fen) {
      this.board = startBoard();
      this.turn = 'r';
      this.quiet = 0;      // plies since the last capture or man move
      this.ply = 0;
      this.stack = [];
      this.keys = [];
      this._cache = null;
      if (fen) this.load(fen);
      this.keys.push(this.key());
    }

    static get START_FEN() { return 'B:W21,22,23,24,25,26,27,28,29,30,31,32:B1,2,3,4,5,6,7,8,9,10,11,12'; }

    get fullmove() { return Math.floor(this.ply / 2) + 1; }
    key() { let s = this.turn; for (let i = 0; i < 64; i++) if (isDark(i)) s += this.board[i] || '.'; return s; }

    // PDN FEN. "B" in PDN is the first player, which is Red here.
    load(fen) {
      const parts = String(fen).replace(/[\[\]"]/g, '').replace(/^FEN\s*/i, '').split(':');
      const b = new Array(64).fill(null);
      let turn = 'r';
      for (const part of parts) {
        const p = part.trim();
        if (p === 'B' || p === 'W') { turn = p === 'B' ? 'r' : 'w'; continue; }
        const side = p[0] === 'B' ? 'r' : p[0] === 'W' ? 'w' : null;
        if (!side) continue;
        for (let tok of p.slice(1).split(',')) {
          tok = tok.trim(); if (!tok) continue;
          const king = tok[0] === 'K';
          const n = parseInt(king ? tok.slice(1) : tok, 10);
          const sq = NUM_TO_SQ[n];
          if (sq != null) b[sq] = king ? side.toUpperCase() : side;
        }
      }
      this.board = b; this.turn = turn; this.quiet = 0; this.ply = 0; this.stack = []; this.keys = []; this._cache = null;
    }

    fen() {
      const list = (c) => {
        const out = [];
        for (let n = 1; n <= 32; n++) { const p = this.board[NUM_TO_SQ[n]]; if (colorOf(p) === c) out.push((isKing(p) ? 'K' : '') + n); }
        return out.join(',');
      };
      return `${this.turn === 'r' ? 'B' : 'W'}:W${list('w')}:B${list('r')}`;
    }

    _jumps(board, sq, piece, path, caps, out) {
      const c = colorOf(piece);
      const dirs = isKing(piece) ? DIRS.k : DIRS[c];
      let extended = false;
      const r = sq >> 3, f = sq & 7;
      for (const [dr, df] of dirs) {
        const mr = r + dr, mf = f + df, lr = r + 2 * dr, lf = f + 2 * df;
        if (lr < 0 || lr > 7 || lf < 0 || lf > 7) continue;
        const mid = mr * 8 + mf, land = lr * 8 + lf;
        const mp = board[mid];
        if (!mp || colorOf(mp) === c || caps.includes(mid) || board[land]) continue;
        extended = true;
        const np = path.concat(land), nc = caps.concat(mid);
        if (!isKing(piece) && lr === crownRow(c)) out.push({ path: np, caps: nc, crown: true });
        else this._jumps(board, land, piece, np, nc, out);
      }
      if (!extended && caps.length) out.push({ path, caps, crown: false });
    }

    _generate(color) {
      const b = this.board, jumps = [], steps = [];
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq];
        if (!p || colorOf(p) !== color) continue;
        const tmp = b.slice(); tmp[sq] = null;
        const found = [];
        this._jumps(tmp, sq, p, [sq], [], found);
        for (const j of found) jumps.push({ from: sq, to: j.path[j.path.length - 1], path: j.path, caps: j.caps, crown: j.crown, piece: p });
        if (jumps.length) continue;
        const dirs = isKing(p) ? DIRS.k : DIRS[color];
        const r = sq >> 3, f = sq & 7;
        for (const [dr, df] of dirs) {
          const nr = r + dr, nf = f + df;
          if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
          const to = nr * 8 + nf;
          if (!b[to]) steps.push({ from: sq, to, path: [sq, to], caps: [], crown: !isKing(p) && nr === crownRow(color), piece: p });
        }
      }
      return jumps.length ? jumps : steps;
    }

    moves(opts) {
      if (!this._cache) this._cache = this._generate(this.turn);
      const all = this._cache;
      if (opts && opts.square != null) return all.filter((m) => m.from === opts.square);
      return all.slice();
    }

    mustCapture() { return this.moves().some((m) => m.caps.length > 0); }

    notation(m) {
      const sep = m.caps.length ? 'x' : '-';
      return m.path.map(sqNum).join(sep);
    }

    _find(m) {
      const legal = this.moves();
      if (typeof m === 'string') {
        const nums = m.split(/[-x]/).map((n) => parseInt(n, 10));
        const path = nums.map((n) => NUM_TO_SQ[n]);
        return legal.find((x) => x.path.length === path.length && x.path.every((s, i) => s === path[i]))
          || (path.length === 2 ? legal.find((x) => x.from === path[0] && x.to === path[1]) : null);
      }
      if (m.path) return legal.find((x) => x.path.length === m.path.length && x.path.every((s, i) => s === m.path[i])) || null;
      return legal.find((x) => x.from === m.from && x.to === m.to) || null;
    }

    move(m) {
      const mv = this._find(m);
      if (!mv) return null;
      const b = this.board;
      const piece = b[mv.from];
      const color = colorOf(piece);
      const captured = mv.caps.map((s) => b[s]);
      const undo = { mv, piece, captured, quiet: this.quiet };
      b[mv.from] = null;
      for (const s of mv.caps) b[s] = null;
      const crowned = !isKing(piece) && (mv.to >> 3) === crownRow(color);
      b[mv.to] = crowned ? piece.toUpperCase() : piece;
      this.quiet = (mv.caps.length || !isKing(piece)) ? 0 : this.quiet + 1;
      this.turn = opp(this.turn);
      this.ply++;
      this._cache = null;
      this.stack.push(undo);
      this.keys.push(this.key());
      return {
        from: mv.from, to: mv.to, path: mv.path.slice(), caps: mv.caps.slice(), captured, crowned,
        color, piece, notation: this.notation(mv), id: mv.path.map(sqNum).join(mv.caps.length ? 'x' : '-')
      };
    }

    undo() {
      const u = this.stack.pop();
      if (!u) return null;
      const b = this.board;
      b[u.mv.to] = null;
      u.mv.caps.forEach((s, i) => { b[s] = u.captured[i]; });
      b[u.mv.from] = u.piece;
      this.quiet = u.quiet;
      this.turn = opp(this.turn);
      this.ply--;
      this.keys.pop();
      this._cache = null;
      return u;
    }

    count() {
      const c = { r: { men: 0, kings: 0 }, w: { men: 0, kings: 0 } };
      for (const p of this.board) if (p) c[colorOf(p)][isKing(p) ? 'kings' : 'men']++;
      return c;
    }

    // Squares the given color could capture right now if it were their turn
    threatened(color) {
      const save = this.turn, cache = this._cache;
      this.turn = color; this._cache = null;
      const set = new Set();
      for (const m of this._generate(color)) for (const s of m.caps) set.add(s);
      this.turn = save; this._cache = cache;
      return set;
    }

    repetitions() {
      const k = this.keys[this.keys.length - 1];
      let n = 0;
      for (const x of this.keys) if (x === k) n++;
      return n;
    }

    status() {
      if (!this.moves().length) {
        const cnt = this.count()[this.turn];
        return { over: true, winner: opp(this.turn), loser: this.turn, reason: cnt.men + cnt.kings === 0 ? 'noPieces' : 'blocked' };
      }
      if (this.repetitions() >= 3) return { over: true, winner: null, reason: 'repetition' };
      if (this.quiet >= DRAW_PLIES) return { over: true, winner: null, reason: 'forty' };
      return { over: false };
    }
  }

  Checkers.VALUES = VALUES;
  Checkers.DRAW_PLIES = DRAW_PLIES;
  Checkers.sqNum = sqNum;
  Checkers.NUM_TO_SQ = NUM_TO_SQ;
  Checkers.isDark = isDark;
  Checkers.colorOf = colorOf;
  Checkers.isKing = isKing;
  Checkers.opp = opp;
  root.Checkers = Checkers;
  return Checkers;
}
(function (g) {
  const C = KingrowRulesFactory(g);
  g.KingrowRulesFactory = KingrowRulesFactory;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof globalThis !== 'undefined' ? globalThis : this);
