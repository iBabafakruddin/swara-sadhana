# CLAUDE.md

## Language and input

- The user gives instructions in a mix of Telugu and English ("Tenglish"), often in the same sentence.
- Telugu may be in Telugu script or Roman letters. Treat both the same way.
- Input often comes from voice dictation, so expect transcription errors. Interpret by likely meaning, considering words that sound similar.
- File names, paths, commands and technical terms will usually be typed exactly in English. Treat those as precise and literal.

## Dialects and tone

- The user may speak standard Telugu, Telangana dialect, or Rayalaseema slang. Interpret intent, not literal wording.
- Rayalaseema-style or blunt, critical phrasing usually means review feedback or corrections. Treat it as actionable changes to make, not as hostility.
- Telangana-style casual phrasing is normal instruction-giving.

## How to work

- Restate your understanding of the task briefly in English before starting non-trivial work.
- If an instruction is ambiguous, or a word or slang term is unclear, ask a short clarifying question before making large or destructive changes.
- Small, clearly understood tasks: proceed directly in an agentic loop (read files, edit, run commands, verify).
- After finishing, summarise what was done in simple English. Short Telugu explanations are fine if the user asks.

## Responses

- Reply in English by default, unless the user asks for Telugu.
- Keep code, comments, commit messages and file contents in English unless told otherwise.

## Project-specific notes

**Swara Sadhana** (స్వర సాధన, "practice of the notes"): a client-only SPA for singing practice. It records takes, plays them back (with speed control), shows a pitch chart, compares takes with a reference vocal section by section, lets the singer practise weak sections until they pass, tracks progress per song over time, and plays a tanpura drone. Takes live in browser IndexedDB and are auto-deleted after 24h; references are kept until deleted, and score history (no audio) is kept until its reference is deleted. "Save" means downloading the file to the device. There is intentionally no backend, database, cache or auth yet; don't add them unless asked.

Stack: React 18 + TypeScript (strict) + Vite 5, Vitest, ESLint 9 (flat config). Import alias `@/` → `src/`.

Commands:
- `npm run dev`: dev server
- `npm run build`: `tsc` typecheck + production build
- `npm test`: all tests. Single file: `npx vitest run src/domain/analysis/notes.test.ts`. Single test: add `-t "<name>"`.
- `npm run lint`

Architecture (ports and adapters; dependencies point inward):
- `src/domain`: pure logic only, no browser APIs (retention rules, YIN pitch detection, note maths). Unit-test here.
- `src/application`: `RecordingService` use cases plus `ports.ts` interfaces (repository, recorder, pitch analyzer, exporter, clock, ids).
- `src/infrastructure`: browser implementations of the ports (IndexedDB, MediaRecorder, Web Audio, `<a download>`). `InMemoryRecordingRepository` is used by tests.
- `src/app/container.ts`: the only place that picks concrete implementations. To add a backend, write a new adapter and swap it in here.
- `src/features/*`: UI by feature. Components get services via `useServices()`, never by importing `infrastructure` directly.
- Tunables (retention, pitch params) live in `src/config/appConfig.ts`. `VITE_RETENTION_HOURS` overrides retention.

Gotchas:
- IndexedDB returns new `Blob` instances on every read. `useRecordings` reuses existing Blobs by id so object URLs and playback survive the periodic refresh. Keep that if you change list loading.
- Tests run in the `node` environment (no DOM), so keep testable logic in `domain`/`application`.
- Microphone access needs a secure context (localhost or HTTPS).
- References must be vocals without accompaniment: YIN follows one voice. YouTube/streaming URLs are deliberately unsupported (terms of service, needs a backend).
- Pitch detection runs in a Web Worker (`pitch.worker.ts`); decoding stays on the main thread because `OfflineAudioContext` isn't available in workers.
- The IndexedDB schema lives in `infrastructure/storage/database.ts`. Bump `DB_VERSION` and add an `ensure(...)` line for new stores; upgrades create whatever is missing.
- Range playback (`shared/playRange.ts`) checks on both animation frames and `timeupdate`, because frames are throttled in background tabs. Practice recording uses timers for the same reason.
- Practice attempts are scored with `compareSection`, which fixes the key to the full take's key offset so a line sung consistently flat isn't mistaken for a key change. Attempt scores are saved through `ProgressService`; attempt audio is kept in memory for the session only. Before/after and personal-best come from the saved `TakeScore` history.
- `ProgressService.onChange` notifies the UI (streak, journey) after any history write; use it rather than polling when adding progress views.
