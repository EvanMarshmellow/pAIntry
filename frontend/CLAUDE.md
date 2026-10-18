# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                 # expo start (Expo Go / dev build)
npm run web               # browser preview
npm run typecheck         # tsc --noEmit
npm run lint              # expo lint (includes React Compiler rules)
npx expo install <pkg>    # always use this to add deps, so versions match the SDK
```

There are no tests yet. Run typecheck and lint before calling a change done.

Expo SDK 57 / React Native 0.86 / React 19 (pinned to 57 to match the App Store Expo Go). Expo APIs change every SDK, so check `https://docs.expo.dev/versions/v57.0.0/` before using an Expo API from memory.

## React Native rules in this folder

`SKILL.md`, `AGENTS.md` and `rules/*.md` are Vercel's React Native best-practice guide, not app docs. Follow them. The ones that shape this codebase:

- Native navigators only (expo-router `Stack`; sheets via `presentation: 'formSheet'`)
- `Pressable`, never `TouchableOpacity`
- Never `{value && <X/>}` with a possibly-falsy value; use a ternary
- `borderCurve: 'continuous'` with every `borderRadius`; `gap` for spacing; `boxShadow` strings
- Few font sizes: hierarchy comes from weight and color (see `type` in `src/theme.ts`)
- Compound components for buttons (`Button` + `ButtonText` + `ButtonIcon`)
- Hoist `Intl` formatters (`src/lib/format.ts`)

## Architecture

- `src/app/`: expo-router routes only. `_layout.tsx` nests the providers (Session → Cart → Pantry → GroupCart) and uses `Stack.Protected` to gate everything behind sign-in. `convince`, `scan`, `checkout`, `add-item` and `profile` are modal or form-sheet routes over `index`.
- `src/features/`: the two halves of the home screen. `index.tsx` switches between Shopping and Storage with a segmented control at the top, as in the Figma wireframe. This is deliberately not a tab navigator.
- `src/lib/api.ts`: the only place that talks to the backend, with typed responses. The base URL comes from `EXPO_PUBLIC_API_URL`, or else the deployed `https://paintry.onrender.com` (free tier: first request after idle can take ~30 s, so the timeout is 45 s).
- `src/lib/useAsync.ts`: a small fetch hook keyed by a string. Change the key to refetch, or call `reload()`. It's written to pass the React Compiler lint (no setState in effect bodies), so keep it that way.
- `src/theme.ts`: tokens from the Figma file (`76LvwXLZ5AYbJDG67D44FR`). Mint/green for Shopping UI. The three storage shelves are colored folders: Fresh is pink, Pantry is yellow, Leftover is blue.

### Backend contract (`../backend/app/main.py`)

These endpoints are used: `GET /users/{id}`, `GET /products`, `GET|POST /users/{id}/pantry`, `GET /users/{id}/savings`, `POST /convince-me`, `POST /users/{id}/pantry/receipt`.

- **Receipt OCR** runs on the device: `src/lib/perceptron.ts` calls Perceptron Mk1.5 (`EXPO_PUBLIC_PERCEPTRON_API_KEY`) with the same JSON schema as `backend/app/perceptron_ocr.py`, then pushes the result to `/users/{id}/pantry/receipt` for catalog matching. Confirmed lines are saved with `POST /users/{id}/pantry`.
- **Barcode scans** are named by Open Food Facts (`src/lib/openFoodFacts.ts`) and sent to `/convince-me` as a `query`, because the seeded catalog has fake barcodes. Unknown barcodes fall back to `barcode`, then to demo data.

- Trust principle: **code does the math, the LLM writes the words**. Prices, savings and verdicts come from the backend's `engine`. The client only sums cart totals. When adding to the cart, use `verdict.engine.product` / `.alternative`, not model text.
- `/convince-me` may return `source: "engine"` (no AI key, or a timeout). The UI must look complete in that case.
- `/convince-me` logs Swap savings to the ledger on every call (backend default `log: true`).
- Sign-in is a Supabase email code (`src/lib/supabase.ts`, `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`): `signInWithOtp` → `verifyOtp`, then the Supabase `access_token` goes to `POST /login/supabase`, which returns the Mongo `user_id` (creating the user on first sign-in). On web, a magic link also works (`detectSessionInUrl`). `SessionProvider` saves `user_id` in AsyncStorage (localStorage on web) and restores it on launch; `_layout.tsx` gates screens with `Stack.Protected`. `api.user` has no demo fallback. Typing `hello@uw.edu` (or `0000000000`) is a demo bypass for UI testing: no code, signs in as Maya. Supabase storage is off during server rendering (no `window`).
- **Allergies** are picked at sign-in (after the code step) and saved per user on the device (`src/lib/allergies.ts`, key `paintry.allergies.<userId>`); the session overrides the server's `allergies` with them. To sync, make `api.updateAllergies` match the backend endpoint and set `SYNC_TO_SERVER = true`. Until then `/convince-me` still uses the server's list.

### Client-only state (no backend endpoint yet)

- **Cart and checkout** live in `CartProvider`; checkout is a mock payment.
- **Pantry shelf** is derived in `shelfOf()`: unit `leftover` → Leftover, expiring within 14 days → Fresh, else Pantry.
- **Finished / Trashed / Move to fridge** are session-only overrides in `PantryProvider`.

When the backend adds endpoints for any of these, replace the local state rather than layering on top of it.
