# Phase 1 — Mobile App (Expo) (Nov 20 – Dec 13, 2026)

Goal: the hero flow. A user shares a screenshot from Instagram or WhatsApp to Cheapa and sees where it is cheapest, in one tap.

Stack: Expo SDK (latest stable), Expo Router, NativeWind, TanStack Query for all API calls (search and user data, one NestJS API), Clerk (optional sign-in), `@sentry/react-native`, `posthog-react-native`, `expo-image`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-share-intent` (requires a development build, not Expo Go), `expo-notifications`.

App id: `ng.cheapa.app`. Android first (most Nigerian users), iOS in the same codebase.

---

## 6.0 Design source (read first)

Every screen in this app has a finished design. Before building any screen:

1. Read `docs/design/DESIGN.md` (tokens, components, screen map, copy rules).
2. Open the matching file in `docs/design/screens/` and reproduce it: layout, spacing, radii, type, colours and copy.
3. Build shared components (`Button`, `Chip`, `ListingRow`, `BottomSheet`, `TabBar`, etc.) once in `apps/mobile/components/` before building screens.

First session for this phase: "Read `CLAUDE.md` and `docs/design/DESIGN.md`. Create `packages/config/tokens.ts`, the NativeWind theme, font loading and every component in DESIGN.md §2 with a `/dev/components` gallery route. Stop when the gallery matches the design files."

**Acceptance (design):** side-by-side screenshots of each built screen against its design file, within 2 px on spacing and exact on colours and type.

## 6.1 Screens

| Route | Design file | Purpose |
| --- | --- | --- |
| `/onboarding` | `Welcome`, `Onboarding2` | Snap pitch, share-from-any-app (two steps; no city: Cheapa doesn't deliver) |
| `/` (Home) | `Home` | Snap hero + gallery, text search, recent searches, real price drops |
| `/camera` | `Camera` | Full-screen camera, Product/Screenshot mode, shutter → search |
| `/search/[requestId]` | `Searching`, `Results`, `Confirm` (sheet), `NotFound` (empty) | Loading checklist, results, variant confirmation, not-found state |
| `/product/[slug]` | `Product`, `WatchSheet` (sheet) | Deal check, price chart, store table, Buy + Watch |
| `/watches` | `Watches` | Watched products, target-hit banner (v1, needs sign-in) |
| `/history` | `History` | Past searches grouped by day |
| `/settings` | `Profile` | Profile, Premium upsell, preferences, privacy, sign out |
| `/sign-in` (modal) | `SignIn` | Phone OTP (+234) or Google |

## 6.2 Share-sheet flow (priority #1)

1. Configure `expo-share-intent` for images (and text/URLs for paste-link in v1).
2. On share: app opens directly to a "Searching…" state with the shared image thumbnail.
3. Downscale to max 1080px, JPEG 0.8 (`expo-image-manipulator`) before upload to keep data use low.
4. `POST /search/image`; show progressive status ("Reading the product… Checking 14 stores…").
5. Land on results.

**Acceptance:** on a real Android device, sharing an Instagram screenshot to Cheapa shows results in < 6 s on 4G; works when the app was fully closed.

## 6.3 Results UI

- **Detected card** at top: "Looks like: Black satin slip dress (women)" (or "Tecno Camon 30, 8GB/256GB" for electronics) with an "Edit" link to correct it (re-runs a text search).
- **Item picker chips** when the photo shows several items ("The dress" / "The bag" / "The shoes").
- **Confirmation chips** when `needsConfirmation` ("128GB" / "256GB").
- **Product group card:** image, title, "Cheapest new ₦X at Store", "Used from ₦Y", listing count.
- **Listing rows:** store name + tier badge, price (big), old price struck through, condition pill, stock, "seen 3h ago", flags ("Check seller", "Live result", "Sponsored" labelled).
- Sort: price (default within a product), and filters: size, colour, condition, store, in stock. Show "From ₦X" prices as such and pack counts per item ("2-pack, ₦3,676 each").
- Tap listing → `/go/:listingId` in an in-app browser (`expo-web-browser`), so affiliate tracking works and the user returns easily.
- **"Looks like this, for less"**: lookalikes in a 2-column image grid below exact matches; when there is no exact match it becomes the main result (`13-fashion-and-beauty.md` 13.5, 13.7). Not yet in `Results.dc.html`: compose from existing components and flag for design review.
- Empty state: "We couldn't find this one yet" + text search + "Tell us where you saw it" (feeds discovery).

## 6.4 Data-light and offline behaviour

- Results cached locally (TanStack Query persist) so back-navigation is instant.
- Images via `expo-image` with memory+disk cache, thumbnails only (≤ 300px).
- Clear offline banner; queued search retries when connection returns.

## 6.5 Accounts (optional)

- Search works signed-out (anonymous id stored in SecureStore, sent as the `X-Cheapa-Device` header).
- After sign-in, call `POST /me/link-device` so signed-out history moves to the account.
- Sign-in (Clerk, phone or Google) only to watch prices and sync across devices.

## 6.6 Analytics and crash reporting

PostHog (free tier, EU host): `search_started`, `search_completed` (latency, source=camera/share/gallery/text), `confirmation_shown`, `listing_clicked`, `watch_added`. No image content, no PII in events. `distinct_id` = the anonymous device id until sign-in, then the user id (the API aliases them). Autocapture and session recording off; screen views on.

Sentry (`@sentry/react-native`, Expo config plugin): crashes and JS errors, source maps uploaded from EAS Build, `release` = app version + build number. This is the source for the crash-free ≥ 99% gate. Same scrubbing rules as `01-foundation.md` 1.7; never attach screenshots or the shared image.

## 6.7 Release

- EAS Build profiles: `development`, `preview` (internal testers via APK link), `production`.
- Play Store listing: "Cheapa: Snap & Compare Prices" with screenshots of the share flow.
- Closed beta with 30–50 testers from Dec 1; public Play release Dec 14.

**Acceptance (phase):** 30 beta testers complete 5+ searches each; crash-free sessions ≥ 99%; share flow works on Android 10+ and iOS 16+.
