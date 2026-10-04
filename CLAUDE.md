# Intervo

Interval timer PWA for exercise (work / rest / rounds, voice or silent). English only. React 18 + TypeScript strict + Vite 5 + vite-plugin-pwa, plain CSS tokens, no router, no backend. Deployed on Vercel (not yet). Modelled on `small-steps-to-great-harmony`.

## Layout
- `src/engine/` pure logic, unit tested (`engine.test.ts`): `voices.ts` (guess voice gender from name, pick a voice), `history.ts` (workout log: build/sanitize entries, filters, chart buckets), `plan.ts` (routine -> step list), `runner.ts` (clock-driven state machine), `cues.ts` (event -> speech/beep/vibrate), `storage.ts` (sanitizers + localStorage), `timeEntry.ts`, `device.ts` (audio, speech, vibrate, wake lock).
- `src/components/` screens: Setup, Running, Finish, RepsField (+ KindToggle), History (+ BarChart, hand-drawn SVG), SettingsSheet, TimeField (+ NumberPad), Sheet, ConfirmSheet, UpdatePrompt.
- `src/strings.ts` every user-visible string (no literals in JSX).
- `e2e/` Playwright against the production build (`npm run test:e2e` builds and serves on :4175).

## Rules
- Timing comes from the clock (`performance.now()` deltas), never from counting ticks, so a throttled/background tab catches up. Cues fire once, and only for the step landed in.
- Everything read from localStorage is untrusted: pass it through the sanitizers (clamp, default, strip control/bidi chars). Keys are `intervo:*`. Every storage call is try/catch.
- Audio and speech are unlocked inside the Start tap (iOS). All device calls are best-effort and swallow errors.
- Browsers expose no voice gender: `voices.ts` infers it from the voice name/URI and the settings sheet also offers an exact English voice list. Counting every second is voice-mode only, work steps only, and skips the first 2 s of a step so it does not cut off the exercise announcement.
- EVERY delete (saved routine, exercise, logged workout, clear history) must go through `ConfirmSheet`. Never add a delete that acts on the first tap.
- The log (`intervo:history`, max 1000) records finished AND ended-early workouts from `Runner.result()` (per-step seconds actually done; skips/back never lose seconds). Under 3 s of work is not logged. Dates are local time; weeks start Monday.
- Exercises are Timed (countdown) or Reps (`kind: 'reps'`, target `reps`). A reps set is an UNTIMED step: no countdown/3-2-1/halfway, it ends only when the user taps Done (`Runner.completeSet(reps)`) or skips (0 reps, not complete). Its `durationSec` is just `reps x 3 s` for the setup total, shown with "≈". Logged per exercise: reps, bestReps, sets, workSec.
- Quick mode is a Routine with exactly one exercise; one engine for both modes.
- The service worker uses `registerType: 'prompt'` so an update never swaps in mid-workout.
- No network calls. Keep `connect-src 'self'` in `vercel.json`.
- Tests must be proven to fail on a deliberately broken build (done for: trailing rest, no catch-up, unclamped rounds, silent every-second counting, counting during rest, swapped voice gender).

## Commands
`npm run dev` (use a free port, e.g. `-- --port 5190`) | `npm run build` | `npm test` | `npm run test:e2e` | `npm run icons`

## Not covered by automated tests
Real phones: which voices exist and whether a "female" guess is right on each phone (e2e uses fake voices), iPhone audio/speech after screen lock, real voice quality, vibration hardware, install flow on Android/iOS, real wake-lock behaviour. Check by hand after the first deploy.
