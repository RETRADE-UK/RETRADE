# Desktop Tax workspace UX audit — 26 September 2026

## Scope

Desktop-only redesign of the RETRADE Tax workspace. Mobile and tablet behaviour, tax calculations, export values and filing logic are intentionally unchanged.

## Research findings

The redesign follows four recurring principles from established UX and accessibility guidance:

1. **Use the top of the page for the most important information.** W3C cognitive accessibility guidance recommends keeping critical information and controls easy to find without unnecessary scrolling.
2. **Use clear grouping and hierarchy rather than simply stretching a narrow layout.** W3C guidance recommends visually distinct logical regions, consistent structure, and whitespace/borders that communicate relationships.
3. **Reduce dashboard scrolling while preserving detail.** UK Government Analysis Function dashboard guidance recommends an inverted-pyramid structure, minimising scrolling and clicks, and keeping detailed information in appropriate secondary sections.
4. **Use progressive disclosure for secondary complexity, not primary working information.** Nielsen Norman Group recommends keeping the primary level focused while relegating less-frequent detail. For RETRADE this means retaining Overview / Filing guide / Monthly as the top-level switch while showing the working Overview detail directly on desktop.
5. **Use a real responsive grid rather than fixed desktop widths.** CSS Grid with fractional tracks and minmax() allows the desktop workspace to use available space while maintaining minimum usable widths.

Sources:
- W3C, clear and understandable page structure: https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p03-page-structure/
- W3C, make important information easy to find: https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p04-page-important/
- W3C, designing for web accessibility: https://www.w3.org/WAI/tips/designing/
- Government Analysis Function, dashboard design/accessibility testing: https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-testing-dashboards-for-design-and-accessibility/
- ONS dashboard guidance: https://service-manual.ons.gov.uk/data-visualisation/guidance/dashboards
- Nielsen Norman Group, progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- MDN, CSS Grid: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Grids

## Existing desktop problem

The previous desktop breakpoint expanded the same disclosure-based content but then moved **Income & deductions** into the right-hand stack. This created two tall columns rather than a true desktop workspace:

- the left column had the comparison/reconciliation;
- the right column stacked income/deductions, tax estimate and payment detail;
- horizontal space was under-used while the right column became vertically long;
- tax settings could be compressed into two narrow form columns;
- the KPI row and controls consumed more height than necessary;
- the loading skeleton mirrored the same imbalance.

The mobile/tablet structure itself was sound and should not be redesigned.

## Chosen information architecture

At widths of 1281px and above the Overview becomes three visual lanes. This threshold is deliberately later than the 1000px fixed-sidebar breakpoint so the post-sidebar canvas has enough room for two analysis lanes plus the rail:

- **Analysis lane 1:** How your profit compares + full reconciliation.
- **Analysis lane 2:** Income & deductions.
- **Right rail:** Tax settings & estimate, followed by stock & partner payment detail.

The first two lanes share the main canvas equally. The right rail is intentionally narrower because it contains shorter, action/settings-oriented content rather than long reconciliation rows.

This creates a natural reading order:
1. headline KPIs;
2. Overview / Filing guide / Monthly switch;
3. business-profit reconciliation;
4. deductions;
5. tax estimate/settings;
6. payment timing detail.

## Density changes

Desktop-only density is tightened without reducing touch/keyboard usability:

- KPI padding and type scale are reduced slightly;
- section/card padding is reduced;
- reconciliation rows use tighter vertical rhythm;
- the view switch and export action become a compact toolbar row;
- tax settings return to one clear column in the narrow right rail;
- the monthly table keeps the full workspace width;
- the Filing guide retains a wide reading column plus references.

The minimum interactive height remains approximately 40–44px.

## Responsive preservation

The breakpoint relocation is reversible. On desktop, only **Stock & partner payment detail** moves into the right rail. On return below 1281px, Income & deductions and payment detail are restored before the Monthly section in the existing mobile/tablet reading order.

Disclosure open/closed state is preserved through the existing `data-mobile-open` mechanism.

## Loading and performance

The Tax route skeleton now uses the same desktop placement as the loaded workspace so the layout does not jump when data arrives.

The implementation does not add observers, charts, framework dependencies or repeated layout measurement. It consists of:

- CSS Grid changes scoped to the desktop media query;
- a small breakpoint DOM relocation already owned by `_syncTaxDesktopDetails`;
- matching skeleton placement.

## Regression coverage

Desktop browser coverage checks:

- comparison and income begin on the same row;
- income sits to the right of comparison;
- tax settings begin in a third, narrower rail;
- payment detail follows tax settings in that rail;
- desktop working details are open;
- tablet/mobile retain the established vertical order;
- Monthly still fills the available workspace width.

Tax calculation regression tests remain unchanged.
