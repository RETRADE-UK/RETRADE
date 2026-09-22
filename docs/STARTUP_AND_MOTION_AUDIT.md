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

## Follow-up: v1.5.56

Browser reproduction exposed two concrete sequencing defects: the launch seal made the login visibility check fail, and a cold-start class was removed before its entrance animation completed. Fix the visibility check, keep the class through the local header reveal, and remove the full-dashboard scale/translation. Slow core loading now retains the brand; core download errors offer a retry.

Defer secondary script evaluation and analytics warming until reveal settlement. Stop rebuilding hidden responsive charts; cap chart stagger duration; animate money-flow transforms instead of width. Cache currency formatters, skip repeated KPI text writes and hidden KPI animation, and restrict export observation to relevant panels rather than every animated dashboard text change.

Moved 13 unreferenced scripts into `archive/retired-runtime/`; see `RUNTIME_MAP.md`. This does not shrink downloads because these files were already inactive. Broader core extraction is still outstanding.

Validation uses populated synthetic data in headless Chromium, desktop and mobile viewports, and reduced-motion mode. It checks final KPI values, chart visibility and resizing, navigation, duplicate auth events, invalid credentials, accepted-session/transient-response races and slow core loading. Isolated frame traces show remaining long frames and vary in this software-rendered environment; they do not establish a universal frame-rate improvement or prove performance on physical Safari/Android devices. The earlier syntax-only limitation is supplemented by the new browser CI job.
