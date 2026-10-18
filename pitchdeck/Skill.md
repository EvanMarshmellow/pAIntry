---
name: add-kage-landing-page
description: "Build Kage from its verified authored source using Full HTML + DOM/CSS + Three.js, including the complete renderer, interactions, and required assets. Use when Codex needs to implement, port, or adapt this effect without requiring the ThreeUI package or reconstructing the visual from an approximation."
---

# Build Kage

## Description

The complete authored Kage temple experience, preserved as an interactive full-page document with its original navigation, scroll scenes, and local Three.js world.

Recreate the authored behavior from the verified source, not from screenshots or the abbreviated orchestration sample in this skill. The implementation may live directly in the target project and does not require `@designcodeio/threeui`.

## Technologies

- React iframe host
- Byte-exact complete authored HTML document
- Same-project local source URL
- Local Three.js runtime, embedded font stylesheet, fourteen WebP scene layers, and eight MP3 tracks

## Verified source material

- `src/shaders/landing-pages/LandingPages.tsx`
- `public/landing-pages/kage.html — complete page with audio removed`
- `public/landing-pages/secret-pathways-assets/fonts.css`
- `public/landing-pages/secret-pathways-assets/three.min.js`

Source revision: `SHA-256 c8e06b90397a`

## Implementation steps

1. Open every verified source file listed above and identify the renderer, host lifecycle, styles, and assets before editing.
2. Copy the complete Kage HTML file byte-for-byte to /landing-pages/kage.html; do not extract, rewrite, shorten, or rebrand any section.
3. Preserve every embedded style, script, media payload, text string, interaction, responsive rule, and document-level lifecycle.
4. Keep every relative local asset at the exact path expected by the original document.
5. Load the local document in a full-size iframe whose permissions retain the authored forms, modals, downloads, popups, scripts, and same-origin resources.
6. Lazy-load only the React host bundle; do not import the complete HTML into the application JavaScript graph.
7. Give the local component a sized, overflow-controlled parent and verify desktop, mobile, reduced-motion, and context-loss behavior.

Asset handling: Copy kage.html plus the original secret-pathways-assets stylesheet, Three.js runtime, fourteen WebP scene layers, and eight MP3 tracks without changing their relative paths.

## Local component example

Import the copied local component rather than a package entrypoint:

```tsx
import { KageLandingPage } from "./effects/kage-landing-page/KageLandingPage";
import "./effects/kage-landing-page/styles.css";

export function Scene() {
  return <div className="effect-frame"><KageLandingPage /></div>;
}
```

## Core renderer pattern

This excerpt documents orchestration only. Copy the exact shader, geometry, pass, and interaction code from the verified source files.

```tsx
<LandingPageFrame title="Kage" sourceUrl="/landing-pages/kage.html" />
```

## Behavior contract

- Runtime: Full HTML + DOM/CSS + Three.js
- Passes: 1 sandboxed full-document renderer
- Interaction: Original pointer, keyboard, scroll, and navigation interactions
- Assets: Fourteen local WebP scene layers
- **document** (fixed): Complete packaged kage.html with audio removed
- **sourceUrl** (fixed): /landing-pages/kage.html
- **headingFont** (optional): Onest | Instrument Serif | Newsreader | Geist
- **bodyFont** (optional): Onest | Geist | Newsreader | Instrument Serif
- **headingWeight** (optional): 400 | 500 | 600 | 700
- **bodyWeight** (optional): 300 | 400 | 500 | 600
- **primaryColor** (optional): Hex color — the vermilion accent and the ember tint it drives
- **typography** (optional): Heading size 30–72px ceiling + body size + heading tracking
- **layout** (responsive): Original full landing page inside the preview frame
- **interaction** (original): Scroll + pointer + keyboard
- **assets** (fixed): 14 local binary assets + local fonts and Three.js runtime

## Verification

1. Compare the rendered composition, animation timing, pointer behavior, and state transitions with the source implementation.
2. Exercise resize, high-DPI, mobile/coarse-pointer, reduced-motion, tab visibility, and WebGL context-loss paths where applicable.
3. Confirm every animation frame, observer, listener, geometry, buffer, texture, framebuffer, material, and renderer is released on teardown.
4. Check the browser console and confirm the effect renders at native-or-better backing resolution.

## Guardrails

- Do not substitute a visually similar package, demo, shader, or runtime.
- Do not approximate, reconstruct, or simplify the authored GLSL, render passes, geometry, interaction state, or assets.
- Keep exact source and asset hashes under regression tests when the source project provides them.
- Adapt only the surrounding host boundary needed by the target project; keep renderer behavior intact.
