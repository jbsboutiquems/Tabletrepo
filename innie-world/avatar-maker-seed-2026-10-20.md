# Innie World — Avatar Maker (Seed Spec)
**Date:** 2026-10-20 · **Status:** seed spec, approved direction by Amber ("Go for it", 2026-10-20)
**Product:** Life OS: Off*Script — the Innie layer (immersive world for the inner/private self; the current app is the Outie layer)

## The idea
The avatar maker is the front door of the Innie world. An Innie is not a selfie and not a scan —
it is the **inner self made visible**. Stylized on purpose: who you are inside, not what the camera sees.

## Tool decision (researched 2026-10-20)
- **Prototype + define the system in VRoid Studio (free).** Deepest option set available at $0:
  full facial/body sliders, procedurally sculpted hair, direct texture painting, plus the Booth
  marketplace of community hairstyles/outfits/textures behind it. Exports **VRM** (converts cleanly to GLB).
  Models created are the creator's to use. Files live on our machines — own-the-rails, no platform dependency.
- **In-app maker comes later**, built or licensed to THIS spec when the Innie layer is built.
  Fallback if a turnkey editor is ever needed fast: Ready Player Me (free SDK, GLB exports).
  Ruled out for now: Avaturn (~$800/mo for the features that matter; photoreal style fights the concept).
- **Environment prototyping:** Q.MetaRam's Q.GALEXI (3D procedural universe) is the reference/sandbox
  for what Innie *space* feels like. Inspiration only — the shipped world lives in our own app.

## "Tons of options" — the taxonomy (what the maker must offer)
### Base self
- Body shapes and heights across a real human range; posture/presence choices
- Skin tones across the full human range, plus fantasy tones for Innie expression
### Face
- Eyes: shape, size, spacing, lids, iris color and pattern (incl. celestial/starfield irises)
- Brows, nose, mouth shape and expression set (the Innie emotes: joy, defiance, grief, mischief…)
- Ears: human, pointed, animal; facial marks, freckles, scars, glyph tattoos
### Hair
- Sculpted styles (procedural), length/volume/curl control
- Any color: single, two-tone, gradient — brand presets in teal #2DA2EE / hot pink #EA4798 / navy
### Off*Script identity layers (the part no generic maker has)
- **Zodiac sets:** per-sign glyph accessories, sign-palette outfit sets, shadow-self variants
- **Season auras:** effects keyed to the 13 Cosmic Forecast seasons (walk a season as that sign)
- **The buddy:** the user's diary-learned buddy animal as companion presence beside the avatar
- **Edition unlockables:** outfits/sets earned by owning editions and quarters (Q volumes = SKU sets) —
  identity basics are NEVER paywalled; monetization is cosmetics and sets only
- **Celebration sets:** Mardi Gras as the flagship Khaos set

## Rules (brand law, applies to every phase)
- Spell it **Khaos**, never Chaos. Brand palette teal #2DA2EE + hot pink #EA4798 on navy;
  purple and green are not brand colors (user-chosen avatar colors are the user's own expression).
- **No selfie required, ever.** Consent-first architecture: no face scans, no photo upload needed to exist in the world.
- The avatar belongs to the user: exportable file (VRM/GLB), no hostage data.
- Tagline order governs sequences: **Think · Imagine · Do · Be**.

## Phases
1. **Prototype (now):** Amber's own Innie + a small reference cast built in VRoid; screenshots become the visual brief alongside GALEXI environment captures.
2. **Spec lock:** this document grows into the full option spec (counts per category, unlock map, buddy rules) from what the prototype teaches.
3. **In-app maker (when the Innie layer builds):** implemented to the locked spec in the Off*Script app; VRM/GLB portability preserved so no avatar is ever rebuilt from zero.
