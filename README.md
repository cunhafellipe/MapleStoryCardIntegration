# MapleStory Card Integration

Maple-specific companion artwork migration and demo composition for [DigitalCardFramework](https://github.com/zkkng/DigitalCardFramework). Portable contract 0.1.0. This repository contains code/configuration only: no art, sprite sheets, game files or credentials.

## Tools

Keep the framework checkout as a sibling `DigitalCardFramework`, install its pinned optional presentation dependencies, and provide your own approved artwork outside Git.

1. `node tools/migrate-companions.mjs DEMO_DIST EXTERNAL_OUTPUT SHARP_MODULE_PATH` converts the approved night/day layers into portable bundles. Requires Sharp 0.35.4. This initial conversion does not replace the final renderer-captured posters.
2. `node tools/stage-presentation.mjs EXTERNAL_OUTPUT SITE_DIST` copies the generic runtime, bundles optional adapters/import workers, stages the host composition, and copies external packages selected by `cards.json`.
3. Serve the Site output locally. `node tools/finalize-companions.mjs PLAYWRIGHT_MODULE_PATH SHARP_MODULE_PATH EXTERNAL_OUTPUT PREVIEW_URL` captures the actual renderer into face posters and finalizes immutable content-addressed directories. Requires Playwright with Edge installed. Stage once more afterward.

Staging bundles the browser entry points with their framework dependencies. Catalog directory and archive paths must be relative to the external content folder, use letters, digits, dots, underscores or hyphens, and contain no parent-directory segments. Symbolic links and junctions are rejected. Keep deployment output separate from the content folder. Run `node --test tools/test-stage-paths.mjs` to check these boundaries without artwork or optional dependencies.

`demo/` holds the host page shell, layout and public-player wiring. `together.html` displays the companions; `library.html` proves a different poster-grid/inspector composition; `studio.html` opens the generic editor. They use the same card bundles. Existing demo navigation expects the surrounding Maple demo routes. `stage-presentation` builds from source; do not edit generated `player/` copies.

Artwork and `.dcard` files stay in an external content directory and Site hosting. The host's original bespoke page is preserved separately when the migrated page replaces it. Game authentication, NX wallets, reward redemption and a live Maple server bridge are not implemented by these art migration tools.

## Access boundary

The published companion demo is a static playground. Local editing/export cannot publish packs or create inventory in the collector system. A production integration must connect verified host identity and server permissions using the framework's `docs/access-and-identity.md`, and mount import/publishing APIs only behind that authority.

## Verify imported packages

Run `node tools/verify-companions.mjs ../PortableCardAssets` against your external packages. The tool verifies pinned digests, layer separation and the companion format. Keep artwork outside Git.

Private hosting requires a session-aware content loader. Configure the authenticated host and verify asset loading, interaction and failure recovery in your deployment.

## Display quality

Companion views request the standard texture tier. The host caps decoded texture edges at 1024 pixels on coarse-pointer devices and 1536 otherwise, with estimated stage budgets of 96 MiB and 192 MiB respectively. Canvas resolution separately follows native screen density up to 3 and pinch zoom up to 3, bounded by the framework's pixel, memory and hardware limits. These are configurable host choices in `demo/together-portable.js`; source detail and available memory still limit magnification. The library inspector also requests standard quality.

Run `node tools/test-private-demo.mjs SITE_DIST PLAYWRIGHT_MODULE_PATH OUTPUT_DIRECTORY chromium` to check authenticated asset loading, interaction, density, zoom and recovery against staged external artwork. Substitute `webkit` for a WebKit engine check; the pinch assertion uses Chromium's emulation API. Desktop emulation does not measure physical iPhone GPU performance or thermal behavior. See the framework runtime guide for quality controls and diagnostics.

Run `node tools/test-demo-lifecycle.mjs . PLAYWRIGHT_MODULE_PATH RESULT_JSON_PATH` to check late inspector failures and back/forward-cache restoration in Edge. This test uses controlled renderer fixtures and no artwork; it checks the host lifecycle rather than GPU rendering. Returning to a cached companion page reloads its disposed views.
