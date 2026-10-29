/*
 * Kingrow - search engine for hints and the computer opponent.
 * Negamax alpha-beta with iterative deepening, capture quiescence,
 * a transposition table, killer-move ordering, and a hand-tuned evaluation.
 * Runs inside a Web Worker when possible so the board never freezes.
 */
function KingrowEngineFactory(root) {
  'use strict';
  const Checkers = root.Checkers;
  const { colorOf, isKing } = Checkers;
  const WIN = 100000;
  const INF = 1e9;
  const MAN = 100, KING = 165;

  // Centre and edge weights for kings (row-major, internal index)
  const KING_PST = [];
  for (let i = 0; i < 64; i++) {
    const r = i >> 3, f = i & 7;
    const d = Math.abs(3.5 - r) + Math.abs(3.5 - f);
    KING_PST[i] = Math.round(12 - d * 3);
  }

  function evaluate(c) {
    const b = c.board;
    let red = 0, white = 0, redPieces = 0, whitePieces = 0, redKings = 0, whiteKings = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const r = i >> 3, f = i & 7;
      if (colorOf(p) === 'r') {
        redPieces++;
        if (isKing(p)) { redKings++; red += KING + KING_PST[i]; }
        else {
          red += MAN + (7 - r) * 5;                                   // advancement
          if (r === 7 && (f === 2 || f === 6)) red += 12;             // guarding the back row (bridge squares)
          if (r >= 3 && r <= 4 && f >= 2 && f <= 5) red += 8;         // centre
          if (f === 0 || f === 7) red -= 4;                           // edges are weaker
        }
      } else {
        whitePieces++;
        if (isKing(p)) { whiteKings++; white += KING + KING_PST[i]; }
        else {
          white += MAN + r * 5;
          if (r === 0 && (f === 1 || f === 5)) white += 12;
          if (r >= 3 && r <= 4 && f >= 2 && f <= 5) white += 8;
          if (f === 0 || f === 7) white -= 4;
        }
      }
    }
    let score = red - white;
    // When ahead, trading pieces down makes the win easier
    const total = redPieces + whitePieces;
    if (redPieces > whitePieces) score += (24 - total) * 4;
    else if (whitePieces > redPieces) score -= (24 - total) * 4;
    return c.turn === 'r' ? score : -score;
  }

  function search(c, opts) {
    const maxDepth = opts.depth || 64;
    const deadline = Date.now() + (opts.timeMs || 1000);
    const noise = opts.noise || 0;
    const tt = new Map();
    const killers = [];
    let nodes = 0, stopped = false;

    function order(moves, ply, ttMove) {
      return moves.map((m) => {
        let s = m.caps.length * 1000 + (m.crown ? 500 : 0);
        const id = m.path.join(',');
        if (ttMove && id === ttMove) s += 100000;
        if (killers[ply] && killers[ply] === id) s += 300;
        return { m, s };
      }).sort((a, b) => b.s - a.s).map((x) => x.m);
    }

    function quiesce(alpha, beta, ply) {
      nodes++;
      const moves = c.moves();
      if (!moves.length) return -WIN + ply;
      if (!moves[0].caps.length) {
        const stand = evaluate(c);
        return stand;
      }
      if (ply > 60) return evaluate(c);
      for (const m of order(moves, ply)) {
        c.move({ path: m.path });
        const v = -quiesce(-beta, -alpha, ply + 1);
        c.undo();
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stopped = true;
      if (stopped) return 0;
      if (ply > 0 && c.repetitions() >= 3) return 0;
      if (ply > 0 && c.quiet >= Checkers.DRAW_PLIES) return 0;
      const moves = c.moves();
      if (!moves.length) return -WIN + ply;
      if (depth <= 0) return quiesce(alpha, beta, ply);
      const key = c.key();
      const hit = tt.get(key);
      if (hit && hit.depth >= depth) {
        if (hit.flag === 0) return hit.v;
        if (hit.flag === 1 && hit.v >= beta) return hit.v;
        if (hit.flag === -1 && hit.v <= alpha) return hit.v;
      }
      const a0 = alpha;
      let best = -INF, bestId = null;
      // A single forced move does not use up depth
      const ext = moves.length === 1 ? 1 : 0;
      for (const m of order(moves, ply, hit && hit.move)) {
        c.move({ path: m.path });
        const v = -negamax(depth - 1 + ext, -beta, -alpha, ply + 1);
        c.undo();
        if (stopped) return 0;
        if (v > best) { best = v; bestId = m.path.join(','); }
        if (v > alpha) alpha = v;
        if (alpha >= beta) { if (!m.caps.length) killers[ply] = m.path.join(','); break; }
      }
      tt.set(key, { depth, v: best, flag: best <= a0 ? -1 : best >= beta ? 1 : 0, move: bestId });
      return best;
    }

    const rootMoves = c.moves();
    let rootBest = rootMoves[0] || null, rootScore = 0, completed = 0;
    if (rootMoves.length > 1) {
      for (let depth = 1; depth <= maxDepth; depth++) {
        let alpha = -INF, bestHere = null, scoreHere = -INF;
        const scored = [];
        for (const m of order(rootMoves, 0, rootBest && rootBest.path.join(','))) {
          c.move({ path: m.path });
          let v = -negamax(depth - 1, -INF, -alpha, 1);
          c.undo();
          if (stopped) break;
          if (noise) v += Math.round((Math.random() - 0.5) * 2 * noise);
          scored.push({ m, v });
          if (v > scoreHere) { scoreHere = v; bestHere = m; }
          if (v > alpha) alpha = v;
        }
        if (stopped && !bestHere) break;
        if (bestHere) { rootBest = bestHere; rootScore = scoreHere; completed = depth; }
        if (stopped || Math.abs(rootScore) > WIN - 200) break;
      }
    } else if (rootBest) {
      c.move({ path: rootBest.path }); rootScore = -evaluate(c); c.undo(); completed = 1;
    }
    const win = Math.abs(rootScore) > WIN - 500;
    return {
      move: rootBest ? { path: rootBest.path.slice() } : null,
      score: win ? Math.sign(rootScore) * 9999 : rootScore,
      win: win ? Math.sign(rootScore) * Math.ceil((WIN - Math.abs(rootScore)) / 2) : 0,
      depth: completed,
      nodes
    };
  }

  function run(data) {
    const c = new Checkers(data.startFen);
    for (const id of data.moves || []) c.move(id);
    const r = search(c, data);
    r.turn = c.turn;
    return r;
  }

  root.KingrowEngine = { search, evaluate, run, WIN };
  return root.KingrowEngine;
}
(function (g) {
  const E = KingrowEngineFactory(g);
  g.KingrowEngineFactory = KingrowEngineFactory;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
