# nerdz

A live, no-backend **code-scanner explainer** built for Night of the Nerdz @ Fontys.
Point a camera at a QR / Aztec / DataMatrix / barcode and watch a 3D visualization
walk through how the code is decoded, stage by stage.

## How it works

The app is split across **two pages on the same origin**:

- **Display** — `/` (`index.html` → `src/main.tsx` → `DisplayApp`). The big-screen / TV
  view. Runs the 3D visualizer (three.js) and plays the decode animation.
- **Scan** — `/scan` (`scan.html` → `src/scan-main.tsx` → `ScanApp`). The laptop view.
  Reads the webcam, decodes a code, and drives the display.

The two pages talk to each other over the browser
[`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
API — see `src/lib/sync/channel.ts`. Because they share an origin, **no server is
needed**: open both pages in two windows (or two devices via the dev server's LAN host)
and they stay in sync.

### Supported code types

QR, Aztec, DataMatrix, and 1D barcodes. Each lives under `src/lib/codes/<type>/` with its
own config, demo data, and categorization. Decoding uses
[`@zxing/library`](https://github.com/zxing-js/library) and
[`jsqr`](https://github.com/cozmo/jsQR).

### Localization

UI strings are available in English and Dutch (`src/locales/en.json`, `src/locales/nl.json`);
the language toggle stays in sync across both pages.

## Tech stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 6](https://vite.dev/) (multi-page build: display + scan)
- [three.js](https://threejs.org/) via [@react-three/fiber](https://r3f.docs.pmnd.rs/)
  and [@react-three/drei](https://github.com/pmndrs/drei)
- [zustand](https://zustand.docs.pmnd.rs/) for state
- [@zxing/library](https://github.com/zxing-js/library) + [jsqr](https://github.com/cozmo/jsQR)
  for decoding

## Getting started

This project uses [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

Then open two windows:

- the **display** at <http://localhost:5173/>
- the **scanner** at <http://localhost:5173/scan.html>

The dev server binds to your LAN (`host: true`), so you can also open the scan page on a
phone/laptop on the same network and point it at the TV display.

### Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check and build both pages to `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm typecheck` | Run `tsc -b` with no emit |

## License

[MIT](./LICENSE) © Marek Mitala
