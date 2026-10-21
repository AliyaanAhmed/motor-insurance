# Dataverse Tables and Power Pages Web API

This guide explains how the Motor Insurance SPA configures Dataverse tables for Power Pages and how its adapter retrieves, creates, updates, filters, and expands table data. Use it as the implementation pattern for the Health Insurance SPA, while verifying that the Health tables, relationships, columns, and security scopes are designed for that product.

This guide covers the supported Power Pages `/_api` Web API and Power Automate flow integration. It does not cover custom APIs or server-logic scripts.

## 1. Know the names Dataverse uses

Each Dataverse table has several names. Get these from the table/column metadata in the maker portal or Dataverse metadata; do not infer them by pluralizing a label.

| Identifier | Used for | Motor example |
| --- | --- | --- |
| Display name | Maker UI and labels | Quote |
| Logical name | Web API site-setting key, FetchXML entity, attribute prefix | `aur_quotes` |
| Entity set name | OData collection URL and lookup binding | `aur_quoteses` |
| Primary key | Select/filter a specific row | `aur_quotesid` |
| Lookup column | Relationship column on a row | `aur_plan` (read as `_aur_plan_value`) |
| Navigation property | `$expand` or `@odata.bind` relationship name | `aur_plan`; confirm in metadata |

For example, the table setting uses `Webapi/aur_quotes/...`, while the URL is `/_api/aur_quoteses`. A product-to-plans relationship in this app is expanded using its collection navigation property `aur_plan_product_aur_products`; it is not the product table name. Confirm actual names from metadata for every Health table.

## 2. Prepare a new table before using it

Complete these steps for each table the SPA will read or write.

### 2.1 Design and create the Dataverse schema

1. Decide whether Health Insurance should reuse an existing shared table or use a dedicated health table. Avoid reusing a Motor-specific record simply because it has similar columns.
2. Create the table with the appropriate ownership model, publisher/schema prefix, primary name column, and primary key.
3. Add only required columns. Choose correct Dataverse types: text, whole number, decimal, currency, date/time, choice, yes/no, or lookup.
4. Create relationships and lookups between the tables. Note the relationship schema name and the navigation property exposed to OData.
5. Publish the customizations and confirm the table is available in the target environment.

Record the table logical name, entity set name, primary key, each column's logical name/type, lookup targets, and navigation property names. That metadata becomes the adapter and configuration contract.

### 2.2 Enable the Power Pages Web API table and columns

In the Health site's `.powerpages-site/site-settings`, add the two Web API settings for the new table. This repository stores these as separate PAC YAML records. Example for a hypothetical `health_application` table:

```yaml
# Webapi-health_application-enabled.sitesetting.yml
id: <new unique Dataverse site-setting record GUID>
name: Webapi/health_application/enabled
source: 0
value: true
```

```yaml
# Webapi-health_application-fields.sitesetting.yml
id: <different new unique Dataverse site-setting record GUID>
name: Webapi/health_application/fields
source: 0
value: health_applicationid,health_name,statuscode,_health_contact_value
```

Use the **table logical name** in the `name` property. The `fields` value is a comma-separated allowlist of exact column logical names. Include the primary key and only fields the UI needs, including lookup columns required for filtering/association. Use new unique IDs for new settings; retain IDs when editing existing records. Prefer PAC/Power Pages tooling to create these records so the IDs and project format are valid.

These settings enable and allowlist Web API columns. They do **not** grant users access to rows.

### 2.3 Configure both permission layers

Create a Power Pages table permission for the table with only the operations the app needs, and associate it with the intended Health web role. Choose the narrowest suitable scope (for example, contact, account, self, or parent relationship, as the data model allows). Separately, ensure the underlying Dataverse security role has the necessary privileges.

The Web API setting, Power Pages table permission, and Dataverse security privilege are separate controls. All must permit the operation. Do not use anonymous or broad/global access for health, contact, or document data. UI conditions and client-side filters do not secure Dataverse records.

After importing/syncing the settings and permission changes, clear the site cache/restart if the portal has not picked them up.

## 3. How the app sends Power Pages Web API requests

The shared request helpers are at the top of [`src/powerPagesApi.ts`](src/powerPagesApi.ts):

- `getPortalToken()` requests `/_layout/tokenhtml` with same-origin credentials and extracts `__RequestVerificationToken`.
- `portalRequest()` calls the same-origin `/_api/...` endpoint with portal cookies and that token. It sends JSON and OData headers, parses JSON responses, and converts portal errors into readable exceptions.
- `getAll()` follows OData `@odata.nextLink` pages so list reads are not limited to only the first response page.

The SPA uses the signed-in Power Pages session. It does not obtain a Dataverse access token in the browser. Keep data requests in a typed adapter function and call that function from components; avoid repeating fetch/auth/error-handling code in UI components.

Here is the shape of a simple GET using the same request helper:

```ts
const rows = await getAll<HealthApplicationRow>(
  '/_api/health_applications?$select=health_applicationid,health_name,statuscode&$orderby=createdon desc'
)
```

`getAll` is a private helper in the current adapter. For a new app, either follow that implementation or expose a similarly typed helper from the adapter module. Keep `$select` explicit; avoid retrieving every column.

## 4. Retrieve records

### 4.1 List with `$select`, `$filter`, `$orderby`, and `$top`

The contact lookup in this app reads a specific subset of fields, filters by email, and limits the result:

```ts
const email = "driver@example.com".replace(/'/g, "''")
const filter = encodeURIComponent(`emailaddress1 eq '${email}'`)
const path = `/_api/contacts?$select=contactid,fullname,emailaddress1&$filter=${filter}&$top=1`
const matches = await getAll<ContactRow>(path)
```

Common query options:

- `$select=column1,column2`: return only required columns.
- `$filter=column eq value`: filter on a column; encode the filter as a URL component and escape apostrophes in OData string literals by doubling them.
- `$orderby=createdon desc`: sort newest first.
- `$top=1`: cap a lookup result when only one match is expected.
- `@odata.nextLink`: continuation URL returned when more records remain. The current `getAll` helper follows it.

GUID comparisons in OData typically use the unquoted GUID. String values need single quotes with apostrophes doubled. URL-encode the query component; do not build a filter from untrusted input without escaping it.

### 4.2 Retrieve one row by its primary key

The app reads an inquiry by filtering its collection on the quote primary key:

```ts
const id = '00000000-0000-0000-0000-000000000000'
const path = `/_api/aur_quoteses?$select=aur_quotesid,aur_name,statuscode&$filter=aur_quotesid eq ${id}`
const rows = await getAll<QuoteRow>(path)
const quote = rows[0]
```

Validate IDs at application boundaries and return a not-found result if the collection is empty. Power Pages table permissions still determine whether the caller can see that row.

### 4.3 Read lookup values

For a Dataverse lookup, OData commonly returns the referenced GUID under an underscore-prefixed property such as `_aur_plan_value`. If the Web API setting permits it, select that property to read the ID. The formatted annotation may also include a display label, for example `_aur_plan_value@OData.Community.Display.V1.FormattedValue`.

The lookup's logical column, the OData lookup-value property, and the relationship navigation property are related but not interchangeable. Verify each in metadata and use the correct form for the operation.

## 5. Retrieve related rows with `$expand`

`$expand` returns related records in the same OData response. It needs the relationship's OData navigation property, not the target table logical name.

### 5.1 Product to plans (one-to-many/many-to-many navigation)

The current adapter retrieves products and expands the associated plans, selecting only plan fields the screen uses:

```ts
const path =
  '/_api/aur_productses' +
  '?$select=aur_productsid,aur_name' +
  '&$expand=aur_plan_product_aur_products($select=aur_planid,aur_base_premium,aur_vat,aur_name,_transactioncurrencyid_value)' +
  "&$filter=contains(aur_name,'Motor Insurance')"
const products = await getAll<ProductWithPlans>(path)
const plans = products[0]?.aur_plan_product_aur_products ?? []
```

Here:

- `aur_productses` is the product entity set in the request URL.
- `aur_plan_product_aur_products` is the relationship navigation property.
- The nested `$select` limits which plan fields come back.
- The `plans` property is an array because a product can have multiple related plans.

### 5.2 Inquiry to its selected plan (many-to-one lookup)

The inquiry list/detail query expands the quote's selected plan:

```ts
const path =
  '/_api/aur_quoteses' +
  '?$select=aur_quotesid,aur_name,statuscode,_aur_plan_value' +
  '&$expand=aur_plan($select=aur_name,aur_base_premium,aur_vat)' +
  '&$orderby=createdon desc'
const quotes = await getAll<QuoteWithPlan>(path)
const planName = quotes[0]?.aur_plan?.aur_name
```

`aur_plan` in `$expand` is the lookup navigation property on the quote. The expanded object is a single plan object. For a one-to-many relationship, the expanded value is an array. Check the actual relationship cardinality and response shape before typing it.

### 5.3 Practical `$expand` rules

- Find the exact navigation property in Dataverse metadata. Do not derive it from display labels.
- Add the expanded columns to the appropriate table Web API allowlists as required by the portal configuration.
- Use nested `$select` to limit related fields.
- If a collection `$expand` produces nested continuation links that Power Pages rejects or handles poorly, retrieve parent and child collections separately and join them by lookup GUID. The motor catalog adapter uses this strategy for vehicle makes and models.
- Verify the Power Pages permissions allow both the parent and related table. An expand is still subject to each table's permissions.

## 6. Create records with `POST`

The adapter creates Contacts, Quotes, and Motor Master Data with `portalRequest('POST', entitySetUrl, record)`.

### 6.1 Simple row creation

Contact creation sends normal column values to the Contact entity set:

```ts
const { response } = await portalRequest('POST', '/_api/contacts', {
  firstname: 'Alex',
  lastname: 'Example',
  emailaddress1: 'alex@example.com',
})
const id = createdId(response)
```

The current `createdId()` helper parses the new GUID from a response header such as `entityid`, `OData-EntityId`, or `Location`. Confirm the portal returns the expected header for the table and operation.

### 6.2 Set a lookup using `@odata.bind`

When creating a row with lookups, bind each lookup to an entity set and GUID:

```ts
await portalRequest('POST', '/_api/aur_quoteses', {
  aur_name: 'Health application - alex@example.com',
  'aur_contact@odata.bind': `/contacts(${contactId})`,
  'aur_product@odata.bind': `/aur_productses(${productId})`,
  'aur_plan@odata.bind': `/aur_plans(${planId})`,
  statuscode: 751820006,
})
```

The left side (`aur_plan@odata.bind`) is the lookup/navigation property; the right side (`/aur_plans(id)`) uses the **target entity set name**. Both must match Dataverse metadata. This app's quote creation maps the selected contact, product, and plan this way.

### 6.3 Use Dataverse values, not labels

For choice columns, send the integer option value, not the label text. For lookup columns, send the `@odata.bind` path. For currency/decimal/whole-number columns, send a JSON number compatible with the Dataverse column type. For dates, use an ISO-compatible value that matches the column behavior. Validate/convert form input before creating the record.

Keep mappings from UI labels to choice values explicit and centralized. Avoid silently sending `0` for unknown input; surface a validation error instead.

## 7. Update records with `PATCH`

The adapter updates an existing quote using its entity set and primary key:

```ts
await portalRequest(
  'PATCH',
  `/_api/aur_quoteses(${inquiryId})`,
  { statuscode: 751820007 },
)
```

The shared request helper sends `If-Match: *` for PATCH and uses JSON. PATCH should contain only fields being changed; omitted fields remain unchanged. Use a validated GUID and ensure the Web API setting includes the updated field, the Power Pages table permission grants Update, and the Dataverse role has Update privileges. If the UI needs to re-read the record after update, perform a GET and render the server's returned value rather than assuming the write won a race with another process.

For concurrency-sensitive updates, use an ETag/conditional `If-Match` policy appropriate to the operation instead of blindly overwriting a newer version. The current helper's `If-Match: *` does not enforce optimistic concurrency.

## 8. Current Motor table/API mapping

| Operation | Entity set / key | Selected or written fields (examples) |
| --- | --- | --- |
| Read vehicle catalog | `aur_vehicle_makes`, `aur_vehicle_models` | IDs, `aur_name`, model `_aur_vehicle_make_value` |
| Read products and plans | `aur_productses`; expand `aur_plan_product_aur_products` | Product ID/name; plan ID/name, base premium, VAT, currency |
| Find/create contact | `contacts` / `contactid` | Email lookup; name, email, country, mobile on create |
| Create quote | `aur_quoteses` / `aur_quotesid` | Name, product/plan/contact bindings, premium values, vehicle value, customer JSON, status, risk score |
| Update quote status | `aur_quoteses(<aur_quotesid>)` | `statuscode` |
| Create motor master record | `aur_motor_master_datas` | Driver/vehicle fields and make/model bindings |
| Read inquiry list/detail | `aur_quoteses` | Quote columns and `$expand=aur_plan(...)` |
| Read inquiry document paths | `aur_quoteses` | `aur_documents_url` |
| Read quote emails and parties | `emails`, `activityparties`, `activitymimeattachments` | Quote relation, activity IDs, recipients and attachment metadata; access must be narrowly scoped |

The field allowlists are stored in `.powerpages-site/site-settings` as `Webapi-<logical-name>-enabled.sitesetting.yml` and `Webapi-<logical-name>-fields.sitesetting.yml`. Review those settings and the permissions whenever adapter fields change.

## 9. Error handling and troubleshooting

When a request fails, inspect the browser Network panel for the request URL, status, and response body. Check these in order:

1. Is the browser signed in to the correct Power Pages site?
2. Is the URL using the correct entity set, primary key, and navigation name?
3. Is the table enabled and is every selected/written column allowed by its `/fields` site setting?
4. Does the web role have the correct table permission, operation, scope, and parent relationship?
5. Does the Dataverse security role grant the same operation?
6. Does the request include the anti-forgery token for writes?
7. Does the table/column type accept the JSON value, choice integer, lookup binding, or date format supplied?
8. For `$expand`, are both tables permitted and is the relationship navigation property valid?

A 403 commonly points to authentication, table permission, scope, or Dataverse privileges. A 400 commonly points to an incorrect field/entity set/navigation name, a blocked field allowlist, or a value/type mismatch. Use the detailed portal error only for troubleshooting and turn inner-error diagnostics back off after the issue is resolved.

## 10. Checklist for every new Health table

- [ ] Table, columns, data types, ownership, and relationships are published.
- [ ] Logical name, entity set name, primary key, and navigation properties are recorded from metadata.
- [ ] The typed adapter has focused read/create/update functions and explicit `$select` fields.
- [ ] Any `$filter` values are correctly escaped and encoded; list reads handle `@odata.nextLink`.
- [ ] Related data uses verified `$expand` navigation names and nested `$select` fields.
- [ ] New table `Webapi/<logical-name>/enabled` and `/fields` records use unique IDs and minimum necessary columns.
- [ ] Power Pages table permissions are scoped to the Health site's intended web role.
- [ ] Dataverse security privileges agree with the required CRUD operations.
- [ ] Create/update includes correct choice values and lookup `@odata.bind` entity sets.
- [ ] Access is checked with intended, unrelated, and anonymous identities where applicable.
- [ ] Portal cache/configuration is refreshed and the hosted Health site is verified.

## Reference files

- [`src/powerPagesApi.ts`](src/powerPagesApi.ts): Web API helpers, table endpoints, CRUD payloads, and query examples.
- [`.powerpages-site/site-settings`](.powerpages-site/site-settings): Current Motor site setting records, including Web API table/field allowlists.
- [`POWER-PAGES-SPA-GUIDE.md`](POWER-PAGES-SPA-GUIDE.md): Overall SPA, Power Pages, deployment, tables, and flow architecture.
