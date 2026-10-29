/* Kingrow - original SVG checkers pieces and UI icons (no external assets needed). */
(function (root) {
  'use strict';

  const SETS = {
    r: { side: '#7d1f1f', face: '#d94a4a', edge: '#5c1414', groove: '#9e2d2d', shine: 'rgba(255,255,255,.22)' },
    w: { side: '#a89c86', face: '#f6f1e7', edge: '#7d725f', groove: '#cfc4ae', shine: 'rgba(255,255,255,.7)' }
  };
  const CROWN = { r: '#ffd27a', w: '#c4891c' };

  const cache = {};
  // p: 'r' red man, 'R' red king, 'w' white man, 'W' white king
  function pieceSVG(p) {
    if (cache[p]) return cache[p];
    const c = p.toLowerCase();
    const s = SETS[c];
    const king = p !== c;
    const crown = king
      ? `<path d="M31 59 L28.5 37 L40.5 46.5 L50 32 L59.5 46.5 L71.5 37 L69 59 Z" fill="${CROWN[c]}" stroke="${s.edge}" stroke-width="2.4" stroke-linejoin="round"/>
         <circle cx="28.5" cy="36" r="3" fill="${CROWN[c]}" stroke="${s.edge}" stroke-width="1.8"/><circle cx="50" cy="31" r="3" fill="${CROWN[c]}" stroke="${s.edge}" stroke-width="1.8"/><circle cx="71.5" cy="36" r="3" fill="${CROWN[c]}" stroke="${s.edge}" stroke-width="1.8"/>`
      : `<circle cx="50" cy="46" r="18" fill="none" stroke="${s.groove}" stroke-width="2.4"/>`;
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="56" rx="41" ry="39" fill="${s.side}"/>
      <circle cx="50" cy="47" r="40" fill="${s.face}" stroke="${s.edge}" stroke-width="2.5"/>
      <circle cx="50" cy="47" r="31" fill="none" stroke="${s.groove}" stroke-width="3"/>
      <path d="M22 34 A31 31 0 0 1 50 16" fill="none" stroke="${s.shine}" stroke-width="4" stroke-linecap="round"/>
      ${crown}</svg>`;
    cache[p] = svg;
    return svg;
  }

  const ICON_PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    flip: '<path d="M7 4v16"/><path d="m3 8 4-4 4 4"/><path d="M17 20V4"/><path d="m21 16-4 4-4-4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>',
    draw: '<path d="M5 12h14"/><path d="M5 7h14"/><path d="M5 17h14"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    first: '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
    prev: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    last: '<path d="m13 17 5-5-5-5"/><path d="m6 17 5-5-5-5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    play: '<path d="m6 3 14 9-14 9z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    crown: '<path d="M3 18h18"/><path d="M4 15 3 7l5 4 4-6 4 6 5-4-1 8z"/>'
  };

  function icon(name, size) {
    const s = size || 18;
    return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
  }

  root.KingrowArt = { pieceSVG, icon };
})(typeof globalThis !== 'undefined' ? globalThis : this);
