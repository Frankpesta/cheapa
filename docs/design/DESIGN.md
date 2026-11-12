# Cheapa Design Spec (mobile-first)

**Source of truth for all UI.** Every screen in the Expo app (and the web app's matching screens) must be built from the files in `docs/design/screens/` and the tokens below. When code and this spec disagree, the spec wins unless the user says otherwise.

- Visual canvas (owner's private link, for humans): https://claude.ai/artifact/9r8DJYZBkQp2cfkpNkJa51
- Machine-readable source (for Claude Code): `docs/design/screens/*.dc.html`

### How to read a `.dc.html` screen file

Each file is one 390×844 phone screen written as HTML with inline styles:
- The markup inside `<x-dc>` is the layout. Read sizes, spacing, colours, radii and copy directly from the inline `style` attributes.
- `<sc-for list="{{rows}}">` is a repeated list; its sample data lives in the `renderVals()` script at the bottom of the file.
- `<sc-if value="{{x}}">` is conditional UI.
- `onClick="{{fn}}"` plus `this.state` in the script shows the intended interaction (filters, toggles, selection).
- `<a href="Other.dc.html">` is navigation to another screen (see the screen map).
- Ignore `<script src="./support.js">`, `<helmet>` and the `data-props` attribute; they belong to the design tool.
- Sample prices, store names and the `[YOUR PRICE]` placeholder are mock data, never hard-code them.

Translate HTML to React Native faithfully: `div` → `View`, text → `Text`, `a`/`button` → `Pressable` (with `accessibilityRole`), inline SVG icons → `react-native-svg` (or Lucide icons with the same stroke look), CSS gradients → `expo-linear-gradient`.

---

## 1. Design tokens

Put these in `packages/config/tokens.ts` and extend the NativeWind/Tailwind theme from them. Use the token names in code, not raw hex.

### Colour

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#0E1A13` | Primary text, dark surfaces, primary buttons, active states |
| `ground` | `#F4F5EF` | App background |
| `card` | `#FFFFFF` | Cards, inputs, tab bar |
| `line` | `#E3E6DD` | Card borders, dividers |
| `lineDashed` | `#D5DACF` | Dashed "receipt" dividers, inactive toggles |
| `muted` | `#55615A` | Secondary text, mono labels |
| `body2` | `#3A463F` | Long-form body text on light ground |
| `lime` | `#C6F432` | Savings accent: cheapest price, primary CTA on dark, Snap button. Always with `ink` text |
| `green` | `#0A7A3A` | Links, positive figures, small accent text on light |
| `inkSoft` | `#1B2B21` | Raised surfaces on dark |
| `inkLine` | `#2D3D33` / `#3B4D41` | Borders and dashed rings on dark |
| `onInkMuted` | `#C9D2CB` | Secondary text on dark |
| `newBg` / `newFg` | `#E7F5C2` / `#2F4A06` | "New" condition pill, positive badges |
| `usedBg` / `usedFg` | `#E4ECF7` / `#1E3A66` | "UK used / used" pill |
| `dropBg` / `dropFg` | `#FFE9DC` / `#9A3412` | Price-drop %, "Check seller" warning, Sign out text |
| `liveBg` / `liveFg` | `#EEE6F3` / `#4B2A6B` | "Live result" flag |
| `premiumBg` / `premiumFg` | `#FFF1C2` / `#6B4A00` | Premium badge |
| `scrim` | `rgba(14,26,19,0.55)` | Behind bottom sheets |

Product thumbnail tints (placeholder tiles until real images load): `#E6EEDB`, `#F3E3D3`, `#DDE6EE`, `#EEE6F3`, `#F3EDD3`.

### Typography

| Role | Family | Weight | Size / line-height | Notes |
| --- | --- | --- | --- | --- |
| Display XL | Bricolage Grotesque | 800 | 44 / 1.02, tracking −1.5 | Welcome headline |
| Display L | Bricolage Grotesque | 800 | 34–36 / 1.05, tracking −1 | Screen titles, onboarding |
| Display M | Bricolage Grotesque | 800 | 26–30 / 1.05, tracking −0.6 | Card headlines, sheet titles |
| Price L | Bricolage Grotesque | 800 | 26 (summary), 40 (watch target) | Always tabular-looking, `₦` attached |
| Price M | Bricolage Grotesque | 800 | 16–18 | Listing rows |
| Body | Geist | 400/500 | 15–16 / 1.5 | Paragraphs, list text |
| Label | Geist | 600 | 13–15 | Buttons (16–17), row titles |
| Small | Geist | 500 | 11–13 | Meta, tab labels (11) |
| Mono label | Geist Mono | 500 | 10–12, tracking 1, UPPERCASE | "CHEAPEST NEW", "SEEN 2H AGO", counters |

Load with `expo-font` (`@expo-google-fonts/*` packages or bundled TTFs). Price formatting is always `formatNaira(kobo)` → `₦318,500`.

### Shape and spacing

| Token | Value |
| --- | --- |
| Screen padding | 20–24 horizontal; content starts ~58–62 from top (below safe area) |
| Spacing scale | 4, 6, 8, 10, 12, 14, 16, 18, 20, 24 |
| Radius | chip/pill 6; input 14; row/card 16–20; hero card 22–26; sheet top 30; buttons 16–18; Snap button 20 |
| Min touch target | 44 × 44 |
| Primary button height | 54–58 |
| Tab bar | 88 tall incl. bottom inset, white, top border `line` |
| Shadow (floating only) | `0 24px 48px rgba(14,26,19,0.18–0.35)`; Snap button adds a 5 px `ground` ring |

### Iconography

Line icons, 22 px, stroke 1.8, round caps/joins, `currentColor`. Lucide matches: house, bell, camera, clock, user, image, search, chevron-right, arrow-left, x, share, zap, check, map-pin, trending-down, sliders/filter, info, external-link, pencil, shield, mail, link, plus, wifi. The logo mark is a price tag (tag shape + hole) on a lime or ink rounded square.

---

## 2. Components (build once in `apps/mobile/components/`)

| Component | Spec (see screen) | Variants |
| --- | --- | --- |
| `Button` | 54–58 h, radius 16–18, Geist 16–17/600, optional trailing arrow icon | `primary-ink` (ink bg, white text, lime icon), `primary-lime` (lime bg, ink text), `outline` (1.5 ink border), `ghost` (green text) |
| `IconButton` | 44 round; white with `line` border on light, translucent ink on camera | — |
| `Chip` / filter pill | 38 h, radius 19, 1.5 border `lineDashed`; selected = ink bg, white text; optional mono count | `Results` |
| `SegmentedControl` | 30 h mono pills inside a ground track; selected ink | `Product` 7D/30D/90D |
| `ConditionPill` | 11/600, radius 6 | new, used, flag-warn, flag-live |
| `ListingRow` | 12 padding, avatar 40 (store initials on tint), store + pill, mono "seen" line, price right + struck old price; cheapest-new row has a 2 px ink border | `Results` |
| `PriceSummaryCard` | lime card "CHEAPEST NEW" + ink card "USED FROM", 2-col grid | `Results` |
| `DetectedCard` | thumb 54, mono "LOOKS LIKE", Display M name, "Not it?" link to confirm | `Results` |
| `ProductRowCompact` | thumb 48, title, store/seen meta, price + `drop` badge | `Home` |
| `WatchCard` | thumb 52, title/meta, price + change, progress bar (8 h) start → target | `Watches` |
| `BottomSheet` | scrim, radius 30 top, 40×5 grab handle, close IconButton top-right | `Confirm`, `WatchSheet` |
| `RadioOption` | full-width 18-radius card, selected 2 px ink border + `#F8FBEE` | `Confirm` |
| `Toggle` | 48×28 track, 22 knob; on = ink, off = `lineDashed` | `WatchSheet`, `Profile` |
| `SettingsGroup` / `SettingsItem` | white 18-radius group; 52 h rows with icon, label, value, chevron | `Profile` |
| `TabBar` | Home, Watches, centre Snap (62 lime square, raised −26), History, Me; active = ink + 600 | `Home`, `Watches`, `History`, `Profile` |
| `ReceiptDivider` | 1 px dashed `lineDashed` | rows on Searching, Product, History |
| `PriceChart` | 104 h line chart, ink 2.4 stroke, lime end dot, dashed mid gridline, mono hi/now labels | `Product` (use `victory-native` or `react-native-svg`) |
| `ProgressChecklist` | status rows: done (ink circle + lime check), active (spinner), pending (ring) | `Searching` |

Motion: spinner and the lime scan line on Searching are the only looping animations; respect reduced-motion. Sheets slide up 250 ms ease-out. Buttons scale 0.98 on press.

---

## 3. Screen map

| # | Screen | Design file | Expo route | Notes |
| --- | --- | --- | --- | --- |
| 01 | Welcome | `Welcome.dc.html` | `/onboarding` (step 1) | Dark ink screen; accent default lime |
| 02 | Share from any app | `Onboarding2.dc.html` | `/onboarding` (step 2, last) | Mock post + share sheet illustration; CTA "Get started" goes Home |
| 03 | Home | `Home.dc.html` | `/` | Greeting, Snap hero, text search, Recent, Real price drops |
| 04 | Camera | `Camera.dc.html` | `/camera` | Product / Screenshot mode, lime corner frame, shutter = search |
| 05 | Searching | `Searching.dc.html` | `/search/[requestId]` (loading state) | Detected product + store checklist + running cheapest |
| 06 | Results | `Results.dc.html` | `/search/[requestId]` | Detected card, price summary, All/New/Used filter, listings, watch CTA, disclosure |
| 07 | Confirm variant | `Confirm.dc.html` | sheet on `/search/[requestId]` | Shown when `needsConfirmation` is returned |
| 08 | Product | `Product.dc.html` | `/product/[slug]` | Deal-check banner, price chart, store table, Buy + Watch bar |
| 09 | Watch price | `WatchSheet.dc.html` | sheet on `/product/[slug]` | Target stepper, −5/−10/−15/Any, channel toggles, plan limit |
| 10 | Watches | `Watches.dc.html` | `/watches` | Target-hit banner, watch cards with progress |
| 11 | History | `History.dc.html` | `/history` | Grouped by day, source icon, privacy note |
| 12 | Not found yet | `NotFound.dc.html` | `/search/[requestId]` (empty state) | Retype query, "where did you see it", notify-me |
| 13 | Profile & settings | `Profile.dc.html` | `/settings` | Premium upsell, toggles, privacy, money disclosure, sign out |
| 14 | Sign in | `SignIn.dc.html` | `/sign-in` (modal) | Phone (+234) OTP first, Google second, "Not now" |

No delivery city or address anywhere: Cheapa sends shoppers to the store and never delivers (owner decision 2026-11-12).

Tab bar order: Home · Watches · [Snap] · History · Me. The route list in `06-mobile-app.md` §6.1 follows this map (`/history` added).

---

## 4. Copy and voice

Friendly, direct, lightly Nigerian. Keep the pidgin to headlines and empty states; keep instructions plain English.

- Welcome: "Snap am. See who sell am cheapest."
- Home hero: "Wetin you wan buy? Snap am."
- Empty state: "We no find am… yet."
- Disclosure (results footer): "Sorted by price; flagged listings sit last. We may earn a commission, never at the cost of order."
- Privacy (history): "Your photos are never saved. We keep only what we found."

## 5. Rules for implementing

1. Match spacing, radii and type sizes to within 2 px of the design files.
2. All colours come from tokens; no new colours without updating this file.
3. Every interactive element ≥ 44 px, with an accessibility label on icon-only buttons.
4. Lime is only for savings/primary actions and always carries `ink` text; never lime text on white.
5. Never show used and new prices in one "cheapest" figure (see Results summary cards).
6. Web (`07-web-app.md`) reuses these tokens and components' visual rules; layouts widen to a max 1120 px container.
7. If a screen is needed that isn't designed here (e.g. premium checkout), compose it from these components and flag it in your summary for design review.
