# Motor Insurance SPA — design direction

## Product intent

An English-first UAE motor quote request experience for Al-Buhaira National Insurance Co. The wizard collects the customer’s stated details in sequence, supports document selection, and submits a quote request through the authenticated Power Pages Web API. Local development keeps sample catalogs and inquiry rows so the interface remains usable without portal credentials.

## Visual language: Harbour Blue

Follow the latest brand direction from the product owner: crisp white surfaces, a cool near-white blue-tinted canvas, navy typography, and restrained confident blue actions. Use the supplied company logo and Dubai and vehicle illustrations. The document examples are clean, clearly labeled illustrative cards. Avoid teal/aqua as an interface accent, generic car iconography for vehicle body choices, decorative clutter, and invented brand claims.

| Token | Value | Use |
| --- | --- | --- |
| Navy | `#12324A` | Headings and key text |
| Brand blue | `#175CD3` | Primary actions, focus, selected state, progress |
| Deep blue | `#1249AD` | Primary action hover |
| White | `#FFFFFF` | Forms and control surfaces |
| Mist | `#F4F7FA` | Page canvas and quiet panels |
| Border | `#D9E2EC` | Inputs, cards, separators |
| Muted | `#61778B` | Supporting text |

Typography uses Roboto with a Segoe UI fallback to match the clean sans-serif reference. Lucide is reserved for interface actions; manufacturer marks use the Simple Icons brand artwork where available, with names retained as labels. The sedan, SUV, hatchback, Dubai skyline, company logo and document-example illustrations live in `src/assets`.

## Layout and behavior

- Landing page: editorial hero with the supplied skyline and sedan artwork, one primary “Start my quote” action, three process explanations, and an explicit POC disclosure. No footer.
- Quote journey: stage rail, centered form card, and live vehicle/history summary on wide screens. Small screens use a compact progress bar and collapsible stage list.
- The 14 form pages preserve the user’s order: product, driver details, condition, model year, make, model, body type, engine, use, registration year, licence age, vehicle specification, claims history, documents. The year screen emphasizes recent model years and offers search for earlier years. A separate final review screen follows “Get quote”. No footer.
- Selections are never silently prefilled. “Back” retains prior answers. A dependent model list is cleared when the vehicle make changes. Validation runs before advancing and identifies missing or malformed answers inline.
- The final review prepares a local demo completion state only. No premium is invented, and the app does not claim to submit a quote.
- The browser file picker can display and remove local selections. In the portal, selected documents are sent to the configured Power Automate endpoint after the inquiry and vehicle data records are created.
- No personal data or file bytes are written to browser storage. Refreshing starts a new quote session. Submission recovery IDs remain in component memory only.
- Honor reduced motion, maintain visible keyboard focus, use semantic buttons/labels, and keep responsive controls touch friendly.

## Integration seam

`src/powerPagesApi.ts` is the Power Pages adapter for vehicle catalogs, product and plan lookup, contact lookup/create, quote and motor master data creation, inquiry reads, and document flow invocation. The quote path is contact lookup/create → quote create → motor master data create → flow call. API access depends on authenticated Web API site settings, table permissions, Dataverse privileges, and flow authentication/CORS configuration documented in `README.md`. Local mode intentionally uses fixtures.

## Inquiry record view

The inquiry title, status, refresh action, and premium summary belong to one shared white header surface above the full-width record sections. Premium figures use an invoice-style arithmetic presentation: base percentage plus additional percentage equals total percentage, followed by gross premium, VAT rate, and total charged. Avoid charts that imply unrelated dimensions or financial calculations not present in the record. Keep the premium details disclosure keyboard accessible and usable on narrow screens.

## Landing hero motion

The single-screen landing hero uses a restrained arrival sequence: copy enters in order, then the Dubai scene, vehicle and small supporting details settle into place. Only the sun, vehicle, and journey marker continue with slow ambient movement. Respect `prefers-reduced-motion` by removing all motion; never make content depend on animation to become visible.
