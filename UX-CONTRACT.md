# UX contract

## Scope and ownership

This contract defines the Motor Insurance inquiry list, create, incomplete-draft, and read-only detail workflow. The shared visual owner is the current React wizard in `src/App.tsx` and the inquiry cards/detail surfaces in `src/Inquiries.tsx`; Dataverse behavior belongs to `src/powerPagesApi.ts`. `DESIGN.md` owns the visual language. Power Pages table permissions and Dataverse choice definitions remain environment configuration and are not granted by the client code.

## Inquiry lifecycle

| State | User-visible behavior | Allowed client mutation |
| --- | --- | --- |
| No inquiry | Create wizard begins with product choice | None |
| Incomplete Inquiry (`751820021`) | Card says “Continue inquiry”; opening the inquiry resumes the wizard at the first unanswered step | Read and update that inquiry’s customer JSON and display name |
| Inquiry Created (`751820006`) | Read-only inquiry detail | Refresh reads only |
| Product Match (`751820007`) and later statuses | Read-only inquiry detail | Refresh reads only |

Only the incomplete status opens the editable form. A direct URL to any other status remains the normal detail view. The canonical resume URL is `/#/inquiries/<aur_quotesid>` so it works for both card navigation and an email link.

## Create and resume behavior

- Product selection precedes the driver step. When full name and valid email are both available and the field blurs, resolve the Contact and create one inquiry row with product/plan/contact bindings, partial `aur_customer_data`, and status reason `751820021`.
- Text fields save on blur; option and document selections save when changed. Those writes run in the background so Continue and Back move immediately and do not issue their own saves. The final Get quote action waits for the latest payload before completing the inquiry. The browser never stores customer PII or file bytes locally.
- Saved state is reported as saving, saved only after server confirmation, or failed with an inline error. Failed changes keep the form open and must be retried before step navigation/final submission.
- On resume, hydrate the wizard from `aur_customer_data` and choose the first required unanswered step. If all required answers exist but the payload lists previously selected documents, resume at Documents so the customer can reselect those files.
- Local file names, sizes, and types persist as JSON metadata. File bytes do not survive a browser close/refresh; reselecting is required before they are uploaded.
- Cancellation/back navigation preserves the server-side draft. No discard action is implied.

## Final submission

- Validate all required answers and require a current vehicle-value estimate and premium calculation.
- Reuse the draft row and its Contact; update its JSON, premium fields, average vehicle value, title, and status reason to Inquiry Created (`751820006`).
- Create motor master data, then set Product Match (`751820007`) so the existing automation trigger runs after the row is complete.
- Invoke the existing document flow with the inquiry ID and currently selected file bytes. A failed stage keeps the inquiry ID and successful-stage flags in component state so retry does not create a second inquiry in that session.
- Successful completion navigates to the existing read-only inquiry route.

## Permissions and data safety

- Browser-side status checks are presentation logic only. Power Pages table permissions must enforce customer row scope for every read, create, and update.
- A Contact-scoped Write permission alone still permits direct API updates to completed records. Production must enforce status `751820021` on the server for draft saves and completion, with the caller-contact relationship checked in the same operation.
- Customer `aur_quotes` access must be scoped through the `aur_contact` relationship to the signed-in Contact and limited to Read/Create/Write; never use Global or Anonymous access for customer drafts.
- Contact matching/creation must not expose other customers’ Contact rows. If the portal cannot safely resolve the signed-in Contact by email, move that operation behind a server-side identity-aware endpoint.
- The Dataverse `aur_quotes` choice must contain and publish option `751820021` with label `Incomplete Inquiry`. Final status options retain their existing values.

## Interaction and accessibility

- Continue/back use the existing stepper, preserve answers, and keep the user on the same form surface.
- Every step retains its field labels, validation text, keyboard access, visible focus, and responsive layout.
- Save status uses a textual live region; color is supplemental. Submit and save controls prevent duplicate activation while work is pending.
- The inquiry card remains a single navigation target with the status and action label identifying whether it resumes or views the record.
