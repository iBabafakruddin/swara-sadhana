# Swara Sadhana (స్వర సాధన)

A single-page web app for singing practice. Record a take, listen back (optionally slowed down), and check your pitch on a note chart.

Add a **reference vocal** (upload a clean vocal file or record one, e.g. your teacher singing the line) and press **Compare** on a take. The app lines the take up with the reference, allows for a later start or a different key, scores each phrase, and lists the sections that need work with notes such as "about 40 cents flat" or "came in 0.5 s late". Each section can be replayed as reference, your version, or both back to back. References need to be vocals without background music; pitch detection follows one voice.

Press **Practise** on a weak section to drill it: listen to the reference (slowed down to 0.5× or 0.75× without changing pitch, optionally looped) or to a **guide tone** playing the melody in your key, then **Sing it** after a count-in while a live pitch line shows you against the target. Each attempt is scored straight away. Two passing attempts in a row mark the section as learned; once every weak section is learned, record the full song again and the comparison shows before-and-after scores per section. Practice attempts are kept in memory for the current session only.

Takes are stored **only in your browser** and are deleted automatically after 24 hours, so practice doesn't eat storage. To keep a take, press **Save to device** to download the audio file.

## Getting started

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173
```

Microphone access needs a secure context: `localhost` works; for other devices on your network, serve over HTTPS.

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Dev server with hot reload          |
| `npm run build`     | Typecheck and production build      |
| `npm run preview`   | Serve the production build          |
| `npm test`          | Run unit tests once                 |
| `npm run lint`      | ESLint                              |

## Configuration

Copy `.env.example` to `.env` to override settings. `VITE_RETENTION_HOURS` sets how long takes are kept (default 24). Other settings (pitch detection, purge interval, comparison scoring thresholds) are in `src/config/appConfig.ts`.

## Architecture

Layered ("ports and adapters"), so storage, recording or analysis can be swapped — e.g. for a backend — without touching the UI:

```
src/
  domain/          Pure logic, no browser APIs: Recording and Reference models, retention rules, pitch detection (YIN),
                   note maths, comparison (DTW alignment, phrase splitting, scoring, feedback text), practice progress
  application/     Use cases (RecordingService, ReferenceService, ComparisonService, PracticeService) and their ports
  infrastructure/  Browser adapters: IndexedDB storage, MediaRecorder (+ live pitch), Web Worker pitch analysis,
                   oscillator guide tones and count-in, file download
  app/             Composition root (container.ts) and React context that hands services to the UI
  features/        UI by feature: recorder, library (list of takes), references, compare, practice, analysis (pitch chart)
  shared/          Formatting, error messages, small React hooks
  config/          App settings
```

Dependencies point inward: `features` → `application` → `domain`. Only `app/container.ts` knows about concrete `infrastructure` classes.

### Extending

- **Backend / sync**: implement `RecordingRepository` (e.g. `HttpRecordingRepository`) and swap it in `container.ts`.
- **More analysis** (tempo, lyrics alignment): add pure functions under `domain/analysis`, a port in `application/ports.ts`, an adapter in `infrastructure`, and a panel under `features/analysis`.
- **Songs with background music**: add a `VocalSeparator` port (e.g. Demucs via `onnxruntime-web`) and run references through it before analysis.
