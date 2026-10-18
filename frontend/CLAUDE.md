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

Expo SDK 58 / React Native 0.88 / React 19. Expo APIs change every SDK, so check `https://docs.expo.dev/versions/v58.0.0/` before using an Expo API from memory.

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

- `src/app/`: expo-router routes only. `_layout.tsx` nests the providers (Session → Cart → Pantry) and uses `Stack.Protected` to gate everything behind sign-in. `convince`, `scan`, `checkout`, `add-item` and `profile` are modal or form-sheet routes over `index`.
- `src/features/`: the two halves of the home screen. `index.tsx` switches between Shopping and Storage with a segmented control at the top, as in the Figma wireframe. This is deliberately not a tab navigator.
- `src/lib/api.ts`: the only place that talks to the backend, with typed responses. The base URL comes from `EXPO_PUBLIC_API_URL`, or else the Metro host's IP on port 8000, so a phone on the same Wi-Fi reaches the dev machine.
- `src/lib/useAsync.ts`: a small fetch hook keyed by a string. Change the key to refetch, or call `reload()`. It's written to pass the React Compiler lint (no setState in effect bodies), so keep it that way.
- `src/theme.ts`: tokens from the Figma file (`76LvwXLZ5AYbJDG67D44FR`). Mint/green for Shopping UI. The three storage shelves are colored folders: Fresh is pink, Pantry is yellow, Leftover is blue.

### Backend contract (`../backend/app/main.py`)

These endpoints are used: `GET /users/{id}`, `GET /products`, `GET|POST /users/{id}/pantry`, `GET /users/{id}/savings`, `POST /convince-me`.

- Trust principle: **code does the math, the LLM writes the words**. Prices, savings and verdicts come from the backend's `engine`. The client only sums cart totals. When adding to the cart, use `verdict.engine.product` / `.alternative`, not model text.
- `/convince-me` may return `source: "engine"` (no AI key, or a timeout). The UI must look complete in that case.
- `/convince-me` logs Swap savings to the ledger on every call (backend default `log: true`).
- Sign-in just loads a user by id; there is no auth. The demo user is `665f00000000000000000001` (after `python seed.py`).

### Client-only state (no backend endpoint yet)

- **Cart and checkout** live in `CartProvider`; checkout is a mock payment.
- **Pantry shelf** is derived in `shelfOf()`: unit `leftover` → Leftover, expiring within 14 days → Fresh, else Pantry.
- **Finished / Trashed / Move to fridge** are session-only overrides in `PantryProvider`.
- **Upload receipt** and **Group cart** tiles are shown as "Soon".

When the backend adds endpoints for any of these, replace the local state rather than layering on top of it.
