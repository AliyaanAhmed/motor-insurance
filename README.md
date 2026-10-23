# Motor Insurance Power Pages SPA

React + TypeScript + Vite starter configured for deployment as a Power Pages single-page application.

## Local development

Run `npm install`, then `npm run dev`.

The app uses hash-based routing (`#/...`) so routes stay client-side on Power Pages.

## Build and upload

Run `npm run build`, then `pac pages upload-code-site --rootPath .`.

`powerpages.config.json` supplies the display name, Vite `dist` folder, landing page, and bundle cleanup patterns for PAC CLI. PAC CLI must be authenticated to the correct Dataverse environment. A first upload is listed under Inactive sites in Power Pages and must be reactivated there.

This starter is prepared as a code SPA site. Power Pages does not import externally built SPA components into an existing traditional site through this upload path; confirm the intended SPA site before the first upload.

## Dataverse quote integration

The app uses the Power Pages same-origin Web API for vehicle catalogs, product/plan lookup, contact lookup/create, inquiry creation, motor master data creation, and inquiry reads. In local Vite development, the app intentionally uses sample catalog and inquiry data; Dataverse calls activate on a Power Pages host.

### Power Pages setup

The `.powerpages-site/site-settings` folder includes `Webapi/<table>/enabled` and `Webapi/<table>/fields` site settings for the tables and columns the app calls. Import/sync those settings to the target site, then clear the site cache and restart the portal if required.

Create separate table permissions for the authenticated staff and customer web roles that use the site. Never associate quote, contact, or activity permissions with the Anonymous Users role. Customer quote access must be scoped to the signed-in Contact; keep the sensitive email and activity permissions staff-only:

| Table | Required access |
| --- | --- |
| Vehicle make, vehicle model, products, plans | Read |
| Contact | Read and Create |
| Quote (`aur_quotes`) | Read, Create, and Update |
| Motor master data | Create |
| SharePoint Document (`sharepointdocument`) | Read, scoped to the related quote; include the required child Document Location Read permission |
| Email (`email`) | Read, scoped to the regarding quote and assigned only to the authenticated staff web role |
| Activity Party (`activityparty`) | Read, scoped through the related Email permission |
| Activity MIME Attachment (`activitymimeattachment`) | Read, scoped through the related Email permission |

The internal contact email lookup requires a scope that can find an existing contact by email. A global Contact Read permission exposes contact rows to users assigned to that web role, so use a restricted internal staff role (or replace contact lookup with a server-side operation that enforces contact access) rather than assigning it to public customer accounts. Keep the staff quote Read permission scoped to the intended role; customer quote permissions are configured separately below and must use Contact scope.

### Customer incomplete inquiries

The create form creates a resumable inquiry after product, full name, and email are available. It stores status reason `751820021` (`Incomplete Inquiry`) and autosaves the form JSON to `aur_customer_data`. Customers can reopen these records from the inquiry list or a link shaped like `https://<site-host>/#/inquiries/<aur_quotesid>`. Only that status opens the editable resume form; other inquiry statuses stay read-only. Final submission updates the same row to `751820006` (`Inquiry Created`), creates motor master data, then changes it to `751820007` (`Product Match`) to preserve the existing automation trigger and document-upload flow.

Before enabling this for customers, add/publish the `Incomplete Inquiry` status reason with value `751820021` on `aur_quotes`, then configure an authenticated customer web role with a Contact-scoped `aur_quotes` table permission through the `aur_contact` relationship. Grant Read, Create, and Write so customers can see and autosave only their own inquiries; do not use Global access or the Anonymous Users role. Configure the corresponding Contact permission so the signed-in user can resolve their own Contact. If the site must create contacts for identities that do not already have a matching authenticated Contact, use a server-side matching/create operation or a carefully constrained permission design; do not grant customers broad Contact read access. The quote Web API allowlist already includes `aur_customer_data`, `aur_contact`, and `statuscode`; enable PATCH/Update for `aur_quotes` and associate the table permission with the appropriate authenticated customer web role. Validate the permission relationship in the target portal because the Web API allowlist does not grant row access by itself.

The UI only opens an edit form for `Incomplete Inquiry`, and it rechecks that status before each save. That is not a server authorization boundary: a Contact-scoped Write permission still allows a customer to PATCH their own completed quote directly. To enforce “only incomplete inquiries are editable,” route draft updates through server-side logic or a Dataverse plug-in/custom API that verifies the current status and caller-contact relationship atomically. Do not treat the client status check as a substitute for that guard.

The browser stores no draft PII or file bytes locally. The Dataverse row is the saved source of truth. File metadata is saved with the answers, but the customer must reselect the actual files after closing or refreshing because browsers cannot restore local file contents. The document flow still runs only when the customer completes the inquiry.

Power Pages must allow the Web API operations for each table and the signed-in role must have the corresponding Dataverse privileges. Site settings use the table logical name (`aur_quotes`); the API URL uses the entity set (`aur_quoteses`). The inquiry primary key is `aur_quotesid`. These names are reflected in `src/powerPagesApi.ts` and the quote Web API site settings. Confirm the portal metadata names for the plan and vehicle model entity sets and lookup navigation properties match the values used in that adapter.

The inquiry detail page retrieves SharePoint Document rows through `/_api/sharepointdocuments?fetchXml=...`, filtered to the current quote through `regardingobjectid`. The `Webapi/sharepointdocument/enabled` and explicit `/fields` settings are included in `.powerpages-site/site-settings`. The authenticated staff web role also needs a Read table permission scoped to the relevant quote, plus the Document Location child Read permission required by SharePoint document management. Do not grant global or anonymous document access. If these permissions are missing, document listing returns a portal authorization error while the inquiry itself remains available.

The inquiry communications card reads `email` rows by their Regarding lookup (`_regardingobjectid_value`), then reads sender and recipient rows from `activityparty` and file metadata from `activitymimeattachment`. The Web API enabled/field allowlists are included in `.powerpages-site/site-settings`; `activitypointer` is enabled only for its `activityid` column because Email inherits that primary key from the base Activity table. Configure Read table permissions for these activity tables for the authenticated staff web role only: scope Email to the related Quote, then scope Activity Party and Activity MIME Attachment through their parent Email permission using the activity relationship. Do not give these permissions to Anonymous Users or broad customer roles; email bodies and recipient details are sensitive. If the portal does not offer the required parent relationships in the permission editor, keep the email tables disabled for the site and expose the timeline through a server-side operation that enforces quote access. Attachments currently display metadata only; the UI does not download their contents.

For troubleshooting a generic `9004010A`, an administrator can temporarily set `Webapi/error/innererror` to `true` on the site, refresh the portal cache, and retry. The SPA will display the inner error when Power Pages returns it. Turn this diagnostic setting off again after resolving the issue.

### Document flow

After quote and motor data creation, the app posts selected files as base64 to the configured Power Automate HTTP endpoint. The `folderPath` property is sent as an empty string because no path was provided. The flow must accept requests from the portal origin and its authentication policy must permit this browser request. Do not place a flow secret in the client bundle; if the flow requires a secret, put a server-side authenticated endpoint in front of it. The flow should reject oversized or unsupported uploads and enforce its own file validation.

### Submission order and recovery

The submission is sequenced as contact lookup/create → quote create → motor master data create → document flow. If the final two operations fail, the form retains the created quote ID in memory and a retry continues from the failed stage to avoid creating duplicate quote records during that session. Refreshing the page clears that in-memory recovery state.
