# Kingrow Checkers

A browser checkers game that runs entirely on GitHub Pages, with no server or build step. Made by [4FDR Studios](https://4fdr.dev).

## Features

- **Every rule enforced:** official American checkers (English draughts). Red moves first, men move forward, captures are compulsory, multi-jumps must be finished, you may choose any capture, a man crowned mid-jump stops there, and kings move both ways. Wins by capturing or blocking every piece. Draws by threefold repetition, the 40-move rule, or agreement.
- **Shows where you can play:** tap or drag a piece and dots mark where it can go. When a capture is available, the pieces that can jump glow.
- **Coach hints:** shows the best move with an arrow along the whole jump path and explains why (multi-jump, crowns a king, escapes a capture, forces a trade), plus who is ahead.
- **Point values:** Man 1, King 2, and crowning adds 1. Player cards show points captured and material lead, and the Points tab has the full breakdown.
- **Pass & Play:** two players on one device, fully offline, with an optional setting that rotates the board each turn.
- **Play Online:** create a room and send the link or 6-character code. Moves, clocks, chat, draw offers, takebacks, resign and rematch all sync peer-to-peer.
- **vs Computer:** four levels (Beginner, Casual, Strong, Master). The engine runs in a background thread on your device, and your record against each level is saved.
- **Extras:** chess-style clocks with increment, move list in standard notation with review mode (arrow keys work), PDN download, evaluation bar, six board themes, light/dark mode, sounds, a resume prompt for unfinished offline games, and installable as an app that works offline.

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `checkers`.
2. Upload every file to the root of the repository (there are no folders).
3. Go to **Settings > Pages**, set Source to **Deploy from a branch**, choose `main` and `/ (root)`, then Save.
4. The `CNAME` file points the site at `checkers.4fdr.dev`. Add a CNAME record for `checkers` in Cloudflare pointing to `<your-username>.github.io`.

## Files

```
index.html            page layout
style.css             all styling (themes, layout, responsive rules)
rules.js              rules engine: move generation, captures, crowning, draws, notation, PDN FEN
engine.js             search engine for hints and the computer opponent
art.js                original SVG checkers pieces and icons
app.js                interface, game flow, clocks, points, hints, online play
sw.js                 offline cache (service worker)
manifest.webmanifest  install-as-app metadata
icon.svg              site icon
CNAME                 custom domain for GitHub Pages
.nojekyll             tells GitHub Pages to serve files as-is
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Left / Right | Step back or forward through moves |
| Up / Down | Jump to the start or to the live position |
| F | Flip the board |
| H | Show or hide a hint |
| Esc | Undo a half-finished jump or deselect |

The move generator was checked against the published checkers perft totals (7, 49, 302, 1469, 7361, 36768, 179740 positions at depths 1 to 7).
