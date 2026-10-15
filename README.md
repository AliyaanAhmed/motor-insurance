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

Create table permissions and associate them only with the authenticated internal user web role used by this app. Do not associate these permissions with the Anonymous Users role:

| Table | Required access |
| --- | --- |
| Vehicle make, vehicle model, products, plans | Read |
| Contact | Read and Create |
| Quote (`aur_quotes`) | Read and Create |
| Motor master data | Create |
| SharePoint Document (`sharepointdocument`) | Read, scoped to the related quote; include the required child Document Location Read permission |
| Email (`email`) | Read, scoped to the regarding quote and assigned only to the authenticated staff web role |
| Activity Party (`activityparty`) | Read, scoped through the related Email permission |
| Activity MIME Attachment (`activitymimeattachment`) | Read, scoped through the related Email permission |

The contact email lookup requires a scope that can find an existing contact by email. A global Contact Read permission exposes contact rows to users assigned to that web role, so use a restricted internal staff role (or replace contact lookup with a server-side operation that enforces contact access) rather than assigning it to public customer accounts. Keep quote Read permission scoped to the intended staff role as well.

Power Pages must allow the Web API operations for each table and the signed-in role must have the corresponding Dataverse privileges. Site settings use the table logical name (`aur_quotes`); the API URL uses the entity set (`aur_quoteses`). The inquiry primary key is `aur_quotesid`. These names are reflected in `src/powerPagesApi.ts` and the quote Web API site settings. Confirm the portal metadata names for the plan and vehicle model entity sets and lookup navigation properties match the values used in that adapter.

The inquiry detail page retrieves SharePoint Document rows through `/_api/sharepointdocuments?fetchXml=...`, filtered to the current quote through `regardingobjectid`. The `Webapi/sharepointdocument/enabled` and explicit `/fields` settings are included in `.powerpages-site/site-settings`. The authenticated staff web role also needs a Read table permission scoped to the relevant quote, plus the Document Location child Read permission required by SharePoint document management. Do not grant global or anonymous document access. If these permissions are missing, document listing returns a portal authorization error while the inquiry itself remains available.

The inquiry communications card reads `email` rows by their Regarding lookup (`_regardingobjectid_value`), then reads sender and recipient rows from `activityparty` and file metadata from `activitymimeattachment`. The Web API enabled/field allowlists are included in `.powerpages-site/site-settings`; `activitypointer` is enabled only for its `activityid` column because Email inherits that primary key from the base Activity table. Configure Read table permissions for these activity tables for the authenticated staff web role only: scope Email to the related Quote, then scope Activity Party and Activity MIME Attachment through their parent Email permission using the activity relationship. Do not give these permissions to Anonymous Users or broad customer roles; email bodies and recipient details are sensitive. If the portal does not offer the required parent relationships in the permission editor, keep the email tables disabled for the site and expose the timeline through a server-side operation that enforces quote access. Attachments currently display metadata only; the UI does not download their contents.

For troubleshooting a generic `9004010A`, an administrator can temporarily set `Webapi/error/innererror` to `true` on the site, refresh the portal cache, and retry. The SPA will display the inner error when Power Pages returns it. Turn this diagnostic setting off again after resolving the issue.

### Document flow

After quote and motor data creation, the app posts selected files as base64 to the configured Power Automate HTTP endpoint. The `folderPath` property is sent as an empty string because no path was provided. The flow must accept requests from the portal origin and its authentication policy must permit this browser request. Do not place a flow secret in the client bundle; if the flow requires a secret, put a server-side authenticated endpoint in front of it. The flow should reject oversized or unsupported uploads and enforce its own file validation.

### Submission order and recovery

The submission is sequenced as contact lookup/create → quote create → motor master data create → document flow. If the final two operations fail, the form retains the created quote ID in memory and a retry continues from the failed stage to avoid creating duplicate quote records during that session. Refreshing the page clears that in-memory recovery state.
