# Intervo

Interval timer PWA for exercise (work / rest / rounds, voice or silent). English only. React 18 + TypeScript strict + Vite 5 + vite-plugin-pwa, plain CSS tokens, no router, no backend. Deployed on Vercel (not yet). Modelled on `small-steps-to-great-harmony`.

## Layout
- `src/engine/` pure logic, unit tested (`engine.test.ts`): `voices.ts` (guess voice gender from name, pick a voice), `history.ts` (workout log: build/sanitize entries, filters, chart buckets), `plan.ts` (routine -> step list), `runner.ts` (clock-driven state machine), `cues.ts` (event -> speech/beep/vibrate), `storage.ts` (sanitizers + localStorage), `timeEntry.ts`, `device.ts` (audio, speech, vibrate, wake lock).
- `src/components/` screens: Setup (Quick form + routine cards + goal card), RoutineEditor, RoutineFields (ExerciseList with drag reorder, TimingFields, WeightInput), GoalCard, BackupSection, Running, Finish, RepsField (+ KindToggle), History (+ BarChart, hand-drawn SVG), SettingsSheet, TimeField (+ NumberPad), Sheet, ConfirmSheet, UpdatePrompt.
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
- Routine tab = the saved-routine library (`intervo:saved`): cards with a Start button; tapping the rest of a card opens `RoutineEditor` (popup) with Save / Save and start / Delete. Editing works on a draft copy; closing with changes asks to discard. `AppState` only holds Quick mode's working copy. Sheets stack (editor > number pad > confirm); Escape closes only the top one.
- Routines may have an optional warm-up and cool-down block (`warmup`/`cooldown`, max 10 exercises each): they play once before round 1 / after the last round, are tagged `section` on their steps, and never count as rounds. Exercises can carry an optional extra `weight` (unit in Settings, kg or lb).
- "Extra set" (Runner.addExtraSet) splices a copy of the last set into the live step list. Extra sets are logged as sets but never count toward rounds done.
- History entries carry `routineId` (so renames keep history together; old entries fall back to the name), `unit` and an optional `note`. The weekly goal and streak count only COMPLETED workouts, weeks start Monday.
- Backup (`engine/backup.ts`): one JSON file with settings, quick state, routines, history. Import is untrusted input: size cap, `app/version` check, every part through the sanitizers; merge never overwrites, replace asks first.
- Exercise reordering uses window-level pointer listeners (a row's DOM node moves when reordered, which drops pointer capture on the handle); arrow keys on the handle work too.
- Exercises are Timed, Reps or Distance. Reps and Distance sets are UNTIMED (no countdown; ended by Done via `Runner.completeSet(amount)`); distance is in the Settings distance unit (km/mi), logged with the time taken so pace = time / distance. There is deliberately NO GPS: the user confirms the distance. Setup totals for these sets are estimates (6 min per unit, 3 s per rep) shown with "≈".
- Settings are tabs (Sound / Workout / Reminders / General). `Sheet` must focus itself only once on open (re-focusing on every render stole the cursor from fields: a regression test types real keys).
- Quick mode is a Routine with exactly one exercise; one engine for both modes.
- The service worker uses `registerType: 'prompt'` so an update never swaps in mid-workout.
- The ONLY network traffic is workout reminders (same-origin `/api/push/*`), and only after the user turns them on. Sent: push address, time, weekdays, time zone. Keep `connect-src 'self'`. Server code in `api/` (Vercel functions, imports end in `.js`): endpoints must be https on an allowlisted push service (SSRF), `x-cron-secret` is required (fails closed), table capped. Setup: docs/REMINDERS_SETUP.md. Service worker is `src/sw.ts` (injectManifest).
- Tests must be proven to fail on a deliberately broken build (done for: trailing rest, no catch-up, unclamped rounds, silent every-second counting, counting during rest, swapped voice gender).

## Commands
`npm run dev` (use a free port, e.g. `-- --port 5190`) | `npm run build` | `npm test` | `npm run test:e2e` | `npm run icons`

## Not covered by automated tests
Real phones: which voices exist and whether a "female" guess is right on each phone (e2e uses fake voices), iPhone audio/speech after screen lock, real voice quality, vibration hardware, install flow on Android/iOS, real wake-lock behaviour. Check by hand after the first deploy.
