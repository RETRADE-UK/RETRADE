# Startup and motion audit (22 September 2026)

## Branch ownership

- `RETRADE` is the production repository for focused fixes and polish. Use a `fix/*` or `ui/*` branch, run CI, review a pull request, then merge to its `main`.
- `RETRADE-STAGING` is the separate repository for alpha features, including gestures. Do not copy production changes into it automatically while that work is active.

## Current startup path

`index.html` paints the launch plate, then loads accounting, reports, Supabase and `app.js`. The entrypoint loads `launch-experience.js`, preloads the 1.6 MB `app-core.js`, and evaluates the core after the shield animation. The core checks the session, chooses login or app, and loads data. The motion stack then releases the dashboard skeleton after its readiness gate. Secondary feature scripts run after the first reveal.

The number of files is not itself a performance problem. Total JavaScript is roughly 2.8 MB before transfer compression; the large core, script evaluation on the main thread, and overlapping chart/number motion are the material startup costs. Versioned enhancement files have several overlapping presentation owners, so deleting or bundling them by filename would risk changing render order.

## Changes in this pass

- Keep the welcome visible through the session check, then raise/fade its lockup into the login form for signed-out users.
- Deduplicate sign-in attempts, accept a session delivered by either the sign-in response or auth event, and clear the error when an auth event wins the race.
- Preload the core during the welcome animation and defer its evaluation until the shield/title sequence finishes. Preserve the existing dashboard reveal and deferred feature ordering.
- Align the CI launch-timing assertion with the current welcome durations.

## Next measured cleanup

1. Record cold and warm traces on desktop Chrome and actual iOS Safari/Android Chrome. Capture long tasks, first usable dashboard time, layout shifts, script evaluation, and animation frames. Compare signed-in, signed-out, slow-network and reduced-motion cases.
2. Establish a single owner for each motion phase: launch, auth handoff, skeleton release, dashboard charts and KPI counts. Remove overlapping wrappers only after checking call sites and comparing recordings.
3. Split `app-core.js` by behaviour at stable boundaries, keeping explicit load order and a small boot entrypoint. Consolidate versioned presentation layers after mapping their overrides and dependencies. Make each change in a separate PR with regressions for inventory, sales and partner pages.
4. Reserve chart sizes before data arrives; animate transforms and opacity where possible; coordinate chart and KPI starts from one dashboard-ready signal. Keep ordinary navigation immediate and limit the full welcome to cold starts.

Visual performance still requires device testing. Automated CI verifies syntax and source contracts, but cannot prove frame pacing or a successful live Supabase login.
