# Power Pages SPA Development Guide

This guide describes how the Motor Insurance SPA in this repository is built and connected to Power Pages. It is intended as a starting point for a separate Health Insurance code SPA in the same Power Platform environment.

The health site can share the environment and selected Dataverse data, but should have its own site configuration, application code, landing page, table access rules, and flow setup. Do not upload the health build using the Motor site configuration.

## 1. Architecture at a glance

The application is a React single-page application (SPA), built into static files by Vite and hosted as a Power Pages **code site**:

1. React renders the application in the `#root` element in `index.html`.
2. Vite compiles TypeScript/TSX, CSS, and imported assets into `dist/`.
3. PAC CLI uploads the compiled files to the Power Pages code site selected by `powerpages.config.json` and the local Power Pages project configuration.
4. In the portal, the SPA uses hash routes such as `#/inquiries`; this keeps navigation client-side without requiring the portal to resolve each React route as a server page.
5. On a Power Pages host, the data adapter calls the same-origin `/_api/...` Power Pages Web API using the signed-in portal session and anti-forgery token. During local Vite development, the app uses its local sample data paths instead.

This is different from adding React components to a traditional Power Pages site. The code-site upload publishes the compiled SPA as its own site; it does not import this bundle into an arbitrary existing traditional site.

## 2. Technology stack

| Area | Technology in this repository | Role |
| --- | --- | --- |
| UI | React 19 + React DOM | Components and browser rendering |
| Language | TypeScript 6 | Typed application code and compile-time checks |
| Build/dev server | Vite 8 + `@vitejs/plugin-react` | Local development and production bundle generation |
| Routing | React Router DOM 7 with hash-based navigation | Client-side pages suitable for portal hosting |
| Controls/icons | Radix UI Select, Lucide React, Simple Icons | Accessible select behavior and visual icons |
| Portal data access | Power Pages Web API (`/_api`) | Same-origin access to configured Dataverse tables |
| Workflow integration | Power Pages cloud-flow endpoint and Power Automate | Server-side workflow actions initiated by the app |
| Code quality | TypeScript build checks and Oxlint | Catch type and lint issues |

Useful entry points are [`src/main.tsx`](src/main.tsx), [`src/App.tsx`](src/App.tsx), [`src/powerPagesApi.ts`](src/powerPagesApi.ts), [`vite.config.ts`](vite.config.ts), and [`package.json`](package.json).

## 3. Local development and production build

Install dependencies once, then run the development server:

```sh
npm install
npm run dev
```

The development server supports fast refresh. Since it is not running on the Power Pages origin, the current app intentionally uses sample data in local development rather than relying on portal cookies and portal table permissions.

Create the production bundle with:

```sh
npm run build
```

The `build` script runs `tsc -b` first, then `vite build`. Vite writes the deployable site to `dist/`. The TypeScript step catches type errors; it is part of the build rather than a separate test suite.

To inspect the production bundle locally, run `npm run preview` after building.

## 4. Power Pages configuration files

### `powerpages.config.json`

The root [`powerpages.config.json`](powerpages.config.json) currently contains:

```json
{
  "siteName": "Motor Insurance SPA",
  "compiledPath": "dist",
  "defaultLandingPage": "index.html",
  "bundleFilePatterns": ["index-*.js", "index-*.css"]
}
```

- **`siteName`** identifies the Power Pages site PAC should target. Use a distinct name for Health Insurance.
- **`compiledPath`** tells PAC where the built site files live. It should match Vite's output directory (`dist`).
- **`defaultLandingPage`** is the compiled entry document.
- **`bundleFilePatterns`** identifies generated, hash-named JS/CSS assets. PAC uses these patterns to clean up previous generated bundles during subsequent uploads so stale bundles do not remain alongside the new ones.

For a health app, make a separate project/configuration targeting the Health Insurance code site. Check the PAC target and authentication before upload; the fact that both sites are in one environment does not make the target interchangeable.

### `.powerpages-site/`

The [`.powerpages-site`](.powerpages-site/) directory is the local Power Pages site project. It contains site metadata and folders for site settings, web pages, web templates, web roles, and web files. PAC uses this project content when syncing the site. A code SPA may still have portal metadata around the hosted application; do not assume every file in this directory is part of the React bundle.

The project also contains YAML records, including the Web API site settings described below. Treat it as environment/site configuration, not as a Vite build manifest.

### Is there a YAML build pipeline here?

No. This repository does not currently contain a GitHub Actions or Azure DevOps YAML pipeline. The `.yml` files under `.powerpages-site/` serialize Power Pages records such as site settings, templates, and web roles. They describe portal configuration; they do not run `npm run build` or deploy the SPA by themselves.

If CI/CD is added later, its pipeline YAML would separately define steps such as installing Node dependencies, running `npm run build`, authenticating PAC securely, and uploading to a chosen site. Keep credentials in the CI secret store, not in YAML committed to the repository.

## 5. What a Power Pages site-setting YAML file means

A current example is [the quote Web API enabled setting](.powerpages-site/site-settings/Webapi-aur_quotes-enabled.sitesetting.yml):

```yaml
id: <Dataverse site-setting record GUID>
name: Webapi/aur_quotes/enabled
source: 0
value: true
```

Another setting allowlists columns:

```yaml
id: <Dataverse site-setting record GUID>
name: Webapi/aur_quotes/fields
source: 0
value: aur_quotesid,aur_name,statuscode
```

- **`id`** identifies the Dataverse site-setting record. Existing records should retain their IDs when edited. Use the supported Power Pages tooling to create new records/IDs; do not copy an existing ID onto a second record.
- **`name`** is the Power Pages setting key. The Web API setting uses the table's **logical name**, not its entity-set name.
- **`source`** marks the source of the value in this exported configuration. Preserve the value PAC generated for the project's existing files.
- **`value`** is the setting value. `enabled` is a boolean; `fields` is an explicit comma-separated column allowlist.

For each table accessed through the Power Pages Web API, configure the matching settings, for example:

```text
Webapi/<table-logical-name>/enabled = true
Webapi/<table-logical-name>/fields = <explicit list of columns>
```

The fields list should include only columns the UI actually reads or writes, including primary keys and lookup columns needed for relationships. It is a Web API exposure/configuration allowlist; **it does not grant data access**. Power Pages table permissions and Dataverse security privileges are still required.

After changing site settings, sync/publish the site configuration as appropriate and clear the portal cache/restart the site if the changed setting has not taken effect.

## 6. How the Motor app uses Dataverse tables

The adapter is in [`src/powerPagesApi.ts`](src/powerPagesApi.ts). It uses explicit `$select` columns, OData filters/expansions, and collection paging. On Power Pages it obtains the anti-forgery token from `/_layout/tokenhtml`, sends that token with Web API writes, and relies on the signed-in portal session cookie. It does not need a Dataverse bearer token in the browser.

Power Pages uses two different table identifiers that are easy to confuse:

- Site settings and FetchXML use a table **logical name**, such as `aur_quotes`.
- OData collection URLs use an **entity set name**, such as `/_api/aur_quoteses`.

Confirm entity set names, primary keys, lookup navigation names, and column types from Dataverse metadata for every new table. Do not guess pluralized names.

| Motor app data | Dataverse table(s) | Use in the app | Typical access |
| --- | --- | --- | --- |
| Vehicle catalog | `aur_vehicle_make`, `aur_vehicle_model` | Populate make/model choices; models are associated with a make | Read |
| Insurance catalog | `aur_products`, `aur_plan` | Find a product and its plan, base premium, VAT, and currency | Read |
| Customer/contact | `contact` | Find a contact by email or create a contact during submission | Read + Create, with a deliberately chosen scope |
| Inquiry | `aur_quotes` | Create inquiries and read/list/update permitted inquiry fields | Read + Create; Update only if the UI needs it |
| Motor details | `aur_motor_master_data` | Store vehicle and driver details linked to the inquiry/contact as configured | Create |
| Inquiry documents | `aur_quotes.aur_documents_url`; SharePoint storage | Read comma-separated document paths from the inquiry and link to files | Quote read permission; SharePoint access separately enforced |
| Inquiry email timeline | `email`, `activityparty`, `activitymimeattachment`, `activitypointer` | Read email rows related to a quote, participants, and attachment metadata | Read, narrowly scoped to authenticated staff and the related quote/email |

Table names and permissions in the table are the current app pattern, not a prescription to reuse Motor Insurance tables for Health Insurance. Decide which data should be shared and which needs separate health-specific tables before implementing the health application.

### Current create/read flow

At a high level, the motor submission creates or finds a Contact, creates the Quote, creates motor master data, and then sends selected files through the configured flow. The application keeps limited in-memory retry state if a later submission stage fails. Inquiry detail reads the quote and selected related data and renders the result in the view form.

Vehicle make/model and plan/product catalogs are read from Dataverse. The app uses the selected plan's base premium and VAT and calculates the displayed/recorded estimate from the vehicle value range. The exact form fields, option values, and calculations belong to this Motor Insurance experience and will need health-specific equivalents.

## 7. Adding a Dataverse table to the Health SPA

Use this sequence for each new table.

### Step 1: Design the data model

In the same environment, create or identify the Dataverse table, columns, relationships, ownership model, and primary key. Use the correct publisher/schema prefix for new custom tables. Decide which records are shared with Motor Insurance, if any. Avoid storing the same customer or sensitive health data twice without a clear business reason.

For health information, decide up front who should be allowed to see each record. A frontend filter or hidden button is not a security boundary.

### Step 2: Add an adapter type and operations

In the Health app's data adapter, define TypeScript types for only the fields the screen needs. Add read/create/update functions that call the Power Pages Web API on the same origin:

```ts
const result = await fetch('/_api/<entity-set>?$select=<column1>,<column2>', {
  credentials: 'same-origin',
  headers: {
    Accept: 'application/json',
    '__RequestVerificationToken': token,
  },
})
```

Follow the established adapter structure rather than scattering requests through components. For writes, include the anti-forgery token, JSON content type, and the exact Dataverse lookup binding/navigation property. Encode filter values correctly, select only needed columns, and handle `@odata.nextLink` if the result can span pages.

The app should show clear loading, empty, error, and retry states. Keep local sample data isolated from the Power Pages adapter so local development remains possible.

### Step 3: Configure Web API site settings

Add/update the table's `Webapi/<logical-name>/enabled` and `Webapi/<logical-name>/fields` site settings in the Health site's configuration. Use the Dataverse table logical name in the setting keys and list only necessary columns. Keep primary keys and lookup values needed for linking records.

Do not copy Motor settings wholesale. Some tables may look similar, but their columns, relationships, or sensitivity can differ.

### Step 4: Create table permissions and Dataverse privileges

In Power Pages, create a table permission with the minimum operation rights needed by the UI (Read, Create, Update, Delete) and the narrowest supported scope. Associate it only with the intended Health site web role. Separately make sure the Dataverse security role for the identity used by the portal has the matching privilege.

Both layers must allow the action: Web API settings expose a table/columns; table permissions authorize portal users; Dataverse security privileges authorize the underlying operation. One layer does not replace another.

Health, medical, contact, and document data are sensitive. Do not assign broad/global or Anonymous Users permissions for convenience. If access must be restricted to a particular user, contact, organization, or parent record, enforce that with the table-permission relationship/scope and test it with accounts both inside and outside that scope.

### Step 5: Validate the complete path

On the Health site, verify the request in the browser Network panel and confirm:

- the request goes to that site's `/_api/<entity-set>` endpoint;
- the response includes only intended columns and records;
- reads and writes work for the intended signed-in role;
- anonymous users and unrelated signed-in users cannot read or modify protected records;
- lookups resolve to the intended table/record;
- paging, no-results, and API errors render correctly.

After changing site settings or permissions, refresh the portal cache as needed. Do not use production health data as local demo fixtures.

## 8. Adding a Power Automate flow

The application can call a flow for a task that should run in Power Automate—for example, validating a health application, calculating an external value, or storing uploaded documents. Keep the business logic and authorization in the flow/secured service where appropriate, and define the request and response contract before wiring the UI.

### Recommended setup

1. Create the cloud flow in the target environment and choose a trigger supported for Power Pages integration.
2. Define an explicit input schema: required properties, types, size limits, and allowed values. Define the output shape the SPA will consume.
3. Configure the flow's Power Pages site/role permissions and connection references. Grant access only to the intended user role.
4. In the app adapter, call the site's supported cloud-flow endpoint with the anti-forgery token, same-origin credentials, and serialized flow input. The current document upload path uses this style (`/_api/cloudflow/v1.0/trigger/...` and an `eventData` form parameter).
5. Parse and validate the response; show pending, success, and failure states. Handle timeouts and prevent duplicate submission where the operation is not idempotent.
6. Enforce authorization, file type and size checks, and record ownership in the flow or downstream service. Do not trust client-supplied record IDs as proof of access.

An HTTP-triggered flow can also be called directly from a browser, but its signed URL contains a credential. Do not commit that URL to source control or ship it in the public SPA bundle. Prefer the Power Pages cloud-flow integration or a secured server-side broker, and rotate any URL that has already been exposed. Configure CORS/origin policy and authentication deliberately; CORS alone is not authentication.

For file uploads, agree on content encoding and maximum size, validate MIME type and extension on the server side, and avoid logging file contents or personal/medical data. The UI should make clear whether an upload completed before marking an application submitted.

## 9. Starting the Health Insurance site in the same environment

1. Create a separate React + TypeScript + Vite project or a separate, clearly isolated app directory/branch. Keep the Motor SPA available for fixes and deployments.
2. Initialize a distinct Power Pages code site/project for Health Insurance in the same Dataverse environment. Confirm the target site name and PAC authentication before deploying.
3. Give the Health app its own `powerpages.config.json` (health `siteName`, its `dist` folder, landing page, and bundle patterns) and its own `.powerpages-site` configuration. Do not reuse the Motor site configuration for an upload.
4. Design the Health landing page, application/detail fields, statuses, and validation from the health requirements; these are a separate product experience from the motor form.
5. Design health-specific tables and relationships. Reuse generic tables only when sharing is intentional and permissions support the health site's access model.
6. Add only the required `Webapi/<table>/enabled` and `/fields` settings, then create Health-specific table permissions and role associations.
7. Add flows to the same environment or an appropriate solution, configure connections and Power Pages permissions, and document each flow contract. Avoid copying environment-specific endpoints into the SPA.
8. Build and deploy to the Health site. With PAC CLI authenticated to the intended environment, the established code-site command is:

   ```sh
   npm run build
   pac pages upload-code-site --rootPath .
   ```

   Run the upload from the Health project root with its Health-specific site configuration. Check the PAC output to confirm the intended site. A first uploaded site may appear as inactive and need activation in Power Pages.
9. Verify authentication, role permissions, table reads/writes, flow calls, mobile layout, and error/retry states on the hosted site. Keep the Motor and Health releases independently deployable.

## 10. Security and operational checklist

- Never put client secrets, OAuth client-credentials tokens, or flow signatures in React code, YAML, or source control.
- Use Power Pages session authentication and anti-forgery tokens for same-origin Web API/flow calls.
- Treat Web API field allowlists, table permissions, and Dataverse privileges as separate required controls.
- Scope permissions to the intended authenticated role and related record. Do not attach sensitive table permissions to Anonymous Users.
- Do not rely on UI visibility, route guards, or client-side filters to secure data.
- Keep health data out of console logs, URLs, analytics, local storage, and sample fixtures unless explicitly sanitized and approved.
- Limit upload type/size and verify access to the associated application/record on the server side.
- Use separate site configuration and validate the target before every deployment.
- Refresh portal cache after relevant configuration changes and confirm behavior using users with different roles.

## 11. Files to know

| File/folder | Purpose |
| --- | --- |
| [`src/main.tsx`](src/main.tsx) | React bootstrap and global stylesheet import |
| [`src/App.tsx`](src/App.tsx) | Application routes and page composition |
| [`src/powerPagesApi.ts`](src/powerPagesApi.ts) | Power Pages Web API, flow adapters, and Dataverse mappings |
| [`src/inquiryData.ts`](src/inquiryData.ts) | Inquiry data types and local/sample data behavior |
| [`index.html`](index.html) | Vite HTML entry page mounted by the SPA |
| [`vite.config.ts`](vite.config.ts) | Vite and React plugin configuration |
| [`tsconfig.app.json`](tsconfig.app.json) | Browser application TypeScript settings |
| [`powerpages.config.json`](powerpages.config.json) | PAC code-site deployment settings |
| [`.powerpages-site/site-settings`](.powerpages-site/site-settings) | Exported Power Pages settings, including Web API table/field setup |

This guide intentionally covers the SPA, the Power Pages Web API, tables, and Power Automate flows. It does not describe custom API or server-logic scripts.
