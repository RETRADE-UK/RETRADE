# Runtime ownership

The source of truth for execution order is `app.js`. Service-worker cache lists in `sw.js` must track shipped assets. These classic scripts share globals and wrap existing render functions: alphabetising or concatenating them changes behaviour.

| Stage / responsibility | Owner |
| --- | --- |
| First frame, shield and launch plate | `index.html` |
| Script scheduling and build identifier | `app.js` |
| Welcome, authentication handoff and dashboard release | `launch-experience.js` |
| Session, application state, routing, primary views, KPI counting | `app-core.js` |
| Accounting and reporting calculations | `accounting.js`, `reports.js` |
| Analytics cache and post-reveal warming | `performance-system.js` |
| Navigation and background/resume | `navigation-stability.js`, `app-lifecycle.js` |
| Dashboard SVG geometry and responsive redraw | `chart-polish.js` |
| Chart motion, finishing and reveal | `chart-motion.js`, `chart-finalize.js`, `chart-reveal.js`, `motion-system.js` |
| Sales chart sequencing | `sales-chart-sequence.js` |
| Partner, bundle, cashflow and export extensions | Ordered `files` list in `app.js` |
| On-demand statement modules | Lazy asset lists in `sw.js` and statement loaders |

## Loading contract

Fetch the core during the brand introduction; evaluate after the initial shield motion. Install the critical presentation stack before dashboard release. `retrade:motion-ready` means that stack is installed; `retrade:launch-settled` means the reveal has completed. Optional modules run serially at idle opportunities after the latter event, pausing during a login handoff. Analytics warming also waits for dashboard settlement.

Ordinary navigation does not restart the cold welcome. Hidden responsive chart copies retain their latest data and render when resized into view. KPI text updates only when its formatted value changes.

## Archived scripts

`archive/retired-runtime/` contains previously inactive files and superseded runtime owners, with their replacements recorded in its README. They were not loaded before this move, so this improves repository clarity rather than download size. Do not reintroduce them into app or service-worker manifests.

## Further extraction

The approximately 1.6 MB core remains the main structural debt. Extract pure formatting first, then feature renderers with explicit inputs, then routing/auth state. Preserve accounting and persistence behaviour with feature regressions at each step. Consolidate partner presentation overrides only after tracing their wrapper order. A large folder rename or automatic bundle will not resolve main-thread contention by itself.

Production fixes belong in RETRADE. Alpha gestures remain in the separate RETRADE-STAGING repository. The maintainer also keeps a local backup checkout at `C:\RETRADE-UK\RETRADE`.

Dashboard actual/forecast reveal timing is owned by `chart-motion.js`; global motion must not override its durations. The former timer-driven `chart-forecast-sequence.js` was retired in v1.5.59.
