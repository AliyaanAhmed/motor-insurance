import type { InquiryRecord, QuotePayload } from './inquiryData'

export type VehicleModelOption = { id: string; name: string }
export type VehicleMakeOption = { id: string; name: string; models: VehicleModelOption[] }
export type InsuranceCatalog = {
  productId: string
  productName: string
  planId: string
  planName: string
  basePremium: number
  formattedBasePremium: string
  currency: string
  vat: number | null
}
export type SharePointInquiryDocument = {
  id: string
  name: string
  fileType: string
  modified: string
  url: string
}
export type InquiryEmailAttachment = { id: string; fileName: string; mimeType: string; fileSize: number }
export type InquiryEmailActivity = {
  id: string
  subject: string
  body: string
  from: string
  to: string[]
  date: string
  status: string
  direction: 'sent' | 'received'
  attachments: InquiryEmailAttachment[]
}
export type VehicleValueRange = { min: number; max: number; value: string; average: number }
export type VehiclePremiumCalculation = {
  basePremiumPercentage: number
  totalPremiumPercentage: number
  grossPremium: number
  totalAmountCharge: number
}

type Collection<T> = { value?: T[]; '@odata.nextLink'?: string }
type VehicleMakeRow = {
  aur_vehicle_makeid: string
  aur_name: string
}
type VehicleModelRow = { aur_vehicle_modelid: string; aur_name: string; _aur_vehicle_make_value?: string | null }

const documentFlowPath = '/_api/cloudflow/v1.0/trigger/11e6c094-41c2-f111-aaaf-6045bd403ec2'
// This signed Power Automate URL is a credential. Calls happen from the browser
// as requested; production should move this call behind an authenticated server endpoint.
const vehicleValueFlowUrl = 'https://15c7cf15bfa4e984a64eef99a12de7.cd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/28/workflows/81a6dbf76ed446ca9f63e6c77876c937/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=PYKUiDdcW5oI8XigEWa-1nV5ZYhmmg7c3YQ3Aq7TSwc'
const inquiryStatusLabels: Record<number, string> = {
  1: 'Draft',
  2: 'Inactive',
  751820001: 'AI Processing',
  751820002: 'Ready to Generate Quote',
  751820003: 'Quote Generated Successfully',
  751820004: 'Generating Quote',
  751820005: 'Further Clarification Required',
  751820006: 'Inquiry Created',
  751820007: 'Product Match',
  751820008: 'Determined Inquiry',
  751820009: 'Awaiting Review',
  751820010: 'Refer to Underwriter',
  751820011: 'Decline',
  751820012: 'Quote Provided',
  751820013: 'Escalate to Head of Aviation',
  751820014: 'Property or Reinsurance Team',
  751820015: 'More Information Required',
  751820016: 'Quote Sent to Customer',
}

export function isPowerPagesRuntime() {
  const host = window.location.hostname.toLowerCase()
  return host.endsWith('powerappsportals.com')
    || host.endsWith('powerpages.microsoft.com')
}

async function getPortalToken(): Promise<string> {
  let response: Response
  try {
    response = await fetch('/_layout/tokenhtml', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed.'
    throw new Error(`Could not retrieve the Power Pages request token: ${detail}`)
  }
  if (!response.ok) throw new Error(`Power Pages token endpoint returned ${response.status}. Sign in again and retry.`)

  const tokenHtml = await response.text()
  const token = new DOMParser()
    .parseFromString(tokenHtml, 'text/html')
    .querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]')?.value.trim()
  if (!token) throw new Error('Power Pages did not return a request token. Sign in again and retry.')
  return token
}

function normalizeApiUrl(path: string) {
  if (path.startsWith('/_api/')) return path
  const url = new URL(path, window.location.origin)
  const apiIndex = url.pathname.indexOf('/api/data/v9.0/')
  if (apiIndex >= 0) return `/_api/${url.pathname.slice(apiIndex + '/api/data/v9.0/'.length)}${url.search}`
  if (url.origin !== window.location.origin) throw new Error('The Dataverse response returned a link outside the Power Pages API.')
  return `${url.pathname}${url.search}`
}

async function portalRequest<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<{ data: T; response: Response }> {
  const token = await getPortalToken()
  let response: Response
  try {
    response = await fetch(normalizeApiUrl(path), {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
        '__RequestVerificationToken': token,
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8', Prefer: 'return=minimal' }),
        ...(method === 'PATCH' ? { 'If-Match': '*' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed.'
    throw new Error(`Power Pages API request failed: ${detail}`)
  }
  const text = response.status === 204 ? '' : await response.text()
  let data: unknown = undefined
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!response.ok) {
    const errorObject = typeof data === 'object' && data !== null && 'error' in data
      ? (data as { error?: { message?: string; innererror?: { message?: string; code?: string } } }).error
      : undefined
    const apiError = errorObject?.innererror?.message || errorObject?.message || ''
    const detail = apiError || (typeof data === 'string' ? data.slice(0, 400) : response.statusText)
    throw new Error(`Power Pages API returned ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  return { data: data as T, response }
}

async function portalCloudFlowRequest(path: string, eventData: unknown) {
  const token = await getPortalToken()
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      '__RequestVerificationToken': token,
      'X-Requested-With': 'XMLHttpRequest',
    },
    // Power Pages cloud-flow API expects an eventData form parameter containing
    // the serialized input object (the documented ajaxSafePost contract).
    body: new URLSearchParams({ eventData: JSON.stringify(eventData) }),
  })
  const text = response.status === 204 ? '' : await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 500)
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      detail = parsed.error?.message ?? detail
    } catch { /* Keep the response text for HTML portal errors. */ }
    throw new Error(`Power Pages cloud flow returned ${response.status}${detail ? `: ${detail}` : ''}`)
  }
}

async function getAll<T>(path: string) {
  const rows: T[] = []
  let next: string | undefined = path
  while (next && rows.length < 10000) {
    const result = await portalRequest<Collection<T>>('GET', next)
    const data: Collection<T> = result.data
    rows.push(...(data.value ?? []))
    next = data['@odata.nextLink']
  }
  return rows
}

function createdId(response: Response) {
  const header = response.headers.get('entityid') || response.headers.get('OData-EntityId') || response.headers.get('Location')
  const id = header?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
  if (!id) throw new Error('Dataverse created the record but did not return its record ID.')
  return id
}

function quoteODataString(value: string) { return value.replace(/'/g, "''") }

export async function getVehicleCatalog(): Promise<VehicleMakeOption[]> {
  // Fetch each table as a simple, explicitly selected collection. Expanding the
  // one-to-many relationship can produce nested @odata.nextLink URLs that the
  // Power Pages Web API rejects for this site, even when the same expansion
  // succeeds in a direct browser request.
  const [makes, models] = await Promise.all([
    getAll<VehicleMakeRow>('/_api/aur_vehicle_makes?$select=aur_vehicle_makeid,aur_name&$orderby=aur_name asc'),
    getAll<VehicleModelRow>('/_api/aur_vehicle_models?$select=aur_vehicle_modelid,aur_name,_aur_vehicle_make_value&$orderby=aur_name asc'),
  ])

  const modelsByMake = new Map<string, VehicleModelOption[]>()
  for (const model of models) {
    const makeId = model._aur_vehicle_make_value?.toLowerCase()
    if (!makeId) continue
    const options = modelsByMake.get(makeId) ?? []
    options.push({ id: model.aur_vehicle_modelid, name: model.aur_name })
    modelsByMake.set(makeId, options)
  }

  return makes.map((make) => ({
    id: make.aur_vehicle_makeid,
    name: make.aur_name,
    models: (modelsByMake.get(make.aur_vehicle_makeid.toLowerCase()) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

export async function getInsuranceCatalog(productName: string): Promise<InsuranceCatalog> {
  const filter = encodeURIComponent(`contains(aur_name,'${quoteODataString(productName)}')`)
  const path = `/_api/aur_productses?$select=aur_productsid,aur_name&$expand=aur_plan_product_aur_products($select=aur_planid,aur_base_premium,aur_vat,aur_name,_transactioncurrencyid_value)&$filter=${filter}`
  const products = await getAll<Record<string, unknown>>(path)
  const product = products.find((row) => String(row.aur_name ?? '').toLowerCase() === productName.toLowerCase()) ?? products[0]
  if (!product) throw new Error(`No Dataverse product matched “${productName}”.`)
  const plans = product.aur_plan_product_aur_products as Record<string, unknown>[] | undefined
  const plan = plans?.find((row) => /comprehensive/i.test(String(row.aur_name ?? ''))) ?? plans?.[0]
  if (!plan) throw new Error(`No insurance plan is configured for “${productName}”.`)
  return {
    productId: String(product.aur_productsid),
    productName: String(product.aur_name),
    planId: String(plan.aur_planid),
    planName: String(plan.aur_name),
    basePremium: Number(plan.aur_base_premium ?? 0),
    formattedBasePremium: String(plan['aur_base_premium@OData.Community.Display.V1.FormattedValue'] ?? ''),
    currency: String(plan['_transactioncurrencyid_value@OData.Community.Display.V1.FormattedValue'] ?? ''),
    vat: nullableNumber(plan.aur_vat),
  }
}

export async function getVehicleValueRange(input: {
  vehicleMake: string
  vehicleModel: string
  vehicleSpecification: string
  vehicleYear: string
}, signal?: AbortSignal): Promise<VehicleValueRange> {
  const response = await fetch(vehicleValueFlowUrl, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  })
  const text = await response.text()
  let body: unknown = text
  try { body = text ? JSON.parse(text) : null } catch { /* Report a useful flow response below. */ }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      ? String((body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error ?? '')
      : String(body ?? '')
    throw new Error(message || `Vehicle value request failed (${response.status}).`)
  }
  const range = parseVehicleValueRange(body)
  if (!range) throw new Error('The vehicle value response did not include a minimum and maximum price.')
  return range
}

function parseVehicleValueRange(input: unknown): VehicleValueRange | undefined {
  const entries: Array<[string, unknown]> = []
  const visit = (value: unknown, depth = 0) => {
    if (depth > 5 || value == null) return
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object') visit(parsed, depth + 1)
      } catch { /* Keep non-JSON text as a possible range. */ }
      return
    }
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return }
    if (typeof value !== 'object') return
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      entries.push([key.toLowerCase().replace(/[^a-z0-9]/g, ''), item])
      if (item && typeof item === 'object') visit(item, depth + 1)
    }
  }
  visit(input)

  const readAmount = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string') return undefined
    const number = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0]
    const parsed = number === undefined ? NaN : Number(number)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const find = (keys: string[]) => {
    const match = entries.find(([key]) => keys.some((candidate) => key === candidate || key.includes(candidate)))
    return match ? readAmount(match[1]) : undefined
  }

  let min = find(['minimumprice', 'minprice', 'minimumvehiclevalue', 'minvehiclevalue', 'minimumvalue', 'minvalue', 'minamount', 'minimum'])
  let max = find(['maximumprice', 'maxprice', 'maximumvehiclevalue', 'maxvehiclevalue', 'maximumvalue', 'maxvalue', 'maxamount', 'maximum'])
  if (min === undefined || max === undefined) {
    const rangeEntry = entries.find(([key, value]) => /vehiclevalue|pricerange|valuerange|range/.test(key) && typeof value === 'string')
    const matches = typeof rangeEntry?.[1] === 'string' ? rangeEntry[1].replace(/,/g, '').match(/\d+(?:\.\d+)?/g) : null
    if (matches?.length && matches.length >= 2) {
      min ??= Number(matches[0])
      max ??= Number(matches[1])
    }
  }
  if (min === undefined || max === undefined || min < 0 || max < min) return undefined
  const raw = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
  return { min, max, value: `${raw(min)} - ${raw(max)}`, average: (min + max) / 2 }
}

export async function findOrCreateContact(payload: QuotePayload) {
  const driver = payload['Driver details']
  const filter = encodeURIComponent(`emailaddress1 eq '${quoteODataString(driver['Email address'].trim())}'`)
  const path = `/_api/contacts?$select=contactid,address1_city,address1_telephone2,emailaddress1,fullname&$filter=${filter}&$top=1`
  const matches = await getAll<Record<string, unknown>>(path)
  if (matches[0]?.contactid) return String(matches[0].contactid)

  const nameParts = driver['Full name'].trim().split(/\s+/)
  const firstName = nameParts.shift() || driver['Full name'].trim()
  const lastName = nameParts.join(' ') || firstName
  const { response } = await portalRequest('POST', '/_api/contacts', {
    emailaddress1: driver['Email address'].trim(),
    firstname: firstName,
    lastname: lastName,
    address1_country: driver.Nationality,
    mobilephone: `+971 ${driver['Mobile number'].trim()}`,
  })
  return createdId(response)
}

export function calculateVehiclePremium(catalog: InsuranceCatalog, estimatedVehicleValue: number): VehiclePremiumCalculation | undefined {
  if (!Number.isFinite(catalog.basePremium) || catalog.basePremium < 0) {
    return undefined
  }
  if (catalog.vat === null || !Number.isFinite(catalog.vat) || catalog.vat < 0) {
    return undefined
  }
  if (!Number.isFinite(estimatedVehicleValue) || estimatedVehicleValue < 0) return undefined
  const roundCurrency = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100
  const grossPremium = roundCurrency(estimatedVehicleValue * catalog.basePremium / 100)
  // aur_total_amount_charge is a Dataverse Whole Number column.
  const totalAmountCharge = Math.round(grossPremium * (1 + catalog.vat / 100))
  return {
    basePremiumPercentage: catalog.basePremium,
    totalPremiumPercentage: catalog.basePremium,
    grossPremium,
    totalAmountCharge,
  }
}

export async function createQuoteRecord(payload: QuotePayload, catalog: InsuranceCatalog, contactId: string, vehicleValue: VehicleValueRange, premium: VehiclePremiumCalculation) {
  const driver = payload['Driver details']
  if (!Number.isFinite(vehicleValue.average) || vehicleValue.average < 0) {
    throw new Error('The vehicle estimate is not valid, so the premium cannot be calculated.')
  }
  const quoteRecord = {
    aur_name: `Inquiry for ${catalog.productName} - ${driver['Email address']}`,
    'aur_product@odata.bind': `/aur_productses(${catalog.productId})`,
    'aur_plan@odata.bind': `/aur_plans(${catalog.planId})`,
    'aur_contact@odata.bind': `/contacts(${contactId})`,
    aur_base_premium: premium.basePremiumPercentage,
    aur_additional_premium_percentage: 0,
    aur_total_premium_percentage: premium.totalPremiumPercentage,
    aur_gross_premium: premium.grossPremium,
    aur_total_amount_charge: premium.totalAmountCharge,
    aur_vehicle_value: String(Number(vehicleValue.average.toFixed(2))),
    aur_customer_data: JSON.stringify(payload),
    statuscode: 751820006,
    aur_risk_score: 50,
  }
  const { response } = await portalRequest('POST', '/_api/aur_quoteses', quoteRecord)
  return createdId(response)
}

export async function markQuoteProductMatched(inquiryId: string) {
  await portalRequest('PATCH', `/_api/aur_quoteses(${inquiryId})`, { statuscode: 751820007 })
}

export async function createMotorMasterData(payload: QuotePayload, makeId: string, modelId: string) {
  if (!makeId || !modelId) throw new Error('Select a vehicle make and model from the Dataverse list before requesting a quote.')
  const driver = payload['Driver details']
  await portalRequest('POST', '/_api/aur_motor_master_datas', {
    aur_body_type: choiceValue(payload['Body type'], { 'saloon/hatchback': 1, 'station/4wd/suv': 2, coupe: 3 }),
    aur_engine_details: choiceValue(payload['Engine details'], ENGINE_DETAIL_CHOICES),
    aur_first_registration_year: numericYear(payload['First registration']),
    aur_name: driver['Full name'],
    aur_email: driver['Email address'],
    aur_claims_history: choiceValue(payload['Claims history'], { never: 1, 'within12months': 2, '12months+': 3 }),
    aur_license_age: choiceValue(payload['License age'], { 'morethan12months': 1, 'lessthan12months': 2 }),
    aur_mobile_number: driver['Mobile number'],
    aur_model_year: numericYear(payload['Model year']),
    aur_vehicle_condition: choiceValue(payload['Vehicle condition'], { 'brandnew': 1, 'usedvehicle': 2 }),
    'aur_vehicle_make@odata.bind': `/aur_vehicle_makes(${makeId})`,
    'aur_vehicle_model@odata.bind': `/aur_vehicle_models(${modelId})`,
    aur_vehicle_specifications: choiceValue(payload['Vehicle specification'], { gcc: 1, 'non-gcc': 2, nongcc: 2 }),
    aur_vehicle_use: choiceValue(payload['Vehicle use'], { private: 1, commercial: 2 }),
  })

}

export async function invokeDocumentFlow(inquiryId: string, files: File[]) {
  if (!files.length) return

  let completed = 0
  for (const file of files) {
    try {
      await portalCloudFlowRequest(documentFlowPath, {
        recordId: inquiryId,
        'File Content': {
          name: file.name,
          contentBytes: await fileToBase64(file),
        },
      })
      completed += 1
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The request was blocked.'
      throw new Error(`Inquiry ${inquiryId} and its vehicle data were created, but document ${completed + 1} of ${files.length} (${file.name}) failed: ${detail}`)
    }
  }
}

const ENGINE_DETAIL_CHOICES: Record<string, number> = { '4 cylinders': 1, '6 cylinders': 2, '8 cylinders': 3, '4 cylinder': 1, '6 cylinder': 2, '8 cylinder': 3 }

function choiceValue(value: string, map: Record<string, number>) {
  const normalize = (text: string) => text.toLowerCase().replace(/[\s/]+/g, '').replace(/[\u2013\u2014]/g, '-')
  const normalized = normalize(value)
  const result = Object.entries(map).find(([label]) => normalize(label) === normalized)?.[1]
  if (result === undefined) throw new Error(`The selected value “${value}” has no Dataverse choice mapping.`)
  return result
}

function numericYear(value: string) {
  const year = Number(value)
  if (!Number.isInteger(year)) throw new Error(`“${value}” isn't a valid year.`)
  return year
}

function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return btoa(binary)
  })
}

export async function getDataverseInquiries(): Promise<InquiryRecord[]> {
  const fields = 'aur_quotesid,aur_name,aur_base_premium,aur_additional_premium_percentage,aur_total_premium_percentage,aur_gross_premium,aur_total_amount_charge,aur_vehicle_value,aur_risk_score,aur_customer_data,statuscode,aur_underwriter_action_status,aur_underwriter_sub_action,createdon,modifiedon,_aur_plan_value'
  const expand = 'aur_plan($select=aur_name,aur_base_premium,aur_vat)'
  const rows = await getAll<Record<string, unknown>>(`/_api/aur_quoteses?$select=${fields}&$expand=${expand}&$orderby=createdon desc`)
  return rows.map(mapInquiry).filter((inquiry) => inquiry.id)
}

export async function getDataverseInquiry(id: string): Promise<InquiryRecord | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined
  const fields = 'aur_quotesid,aur_name,aur_base_premium,aur_additional_premium_percentage,aur_total_premium_percentage,aur_gross_premium,aur_total_amount_charge,aur_vehicle_value,aur_risk_score,aur_customer_data,statuscode,aur_underwriter_action_status,aur_underwriter_sub_action,createdon,modifiedon,_aur_plan_value'
  const expand = 'aur_plan($select=aur_name,aur_base_premium,aur_vat)'
  const rows = await getAll<Record<string, unknown>>(`/_api/aur_quoteses?$select=${fields}&$expand=${expand}&$filter=aur_quotesid eq ${id}`)
  return rows[0] ? mapInquiry(rows[0]) : undefined
}

/** Reads this inquiry's comma-separated SharePoint file paths from aur_documents_url. */
export async function getInquiryDocuments(inquiryId: string): Promise<SharePointInquiryDocument[]> {
  if (!/^[0-9a-f-]{36}$/i.test(inquiryId)) return []
  const rows = await getAll<Record<string, unknown>>(
    `/_api/aur_quoteses?$select=aur_quotesid,aur_documents_url&$filter=aur_quotesid eq ${inquiryId}`
  )
  const value = rows[0]?.aur_documents_url
  if (typeof value !== 'string' || !value.trim()) return []

  const sharePointBaseUrl = 'https://adotdynamicscomau.sharepoint.com/sites/InsureAI'
  return value.split(',').map((entry) => entry.trim()).filter(Boolean).map((entry, index) => {
    const path = entry.replace(/^['"]+|['"]+$/g, '').replace(/^\\+/, '').replace(/^\/+/, '')
    const encodedPath = path.split('/').map(encodeSharePointPathSegment).join('/')
    const url = safeDocumentUrl(`${sharePointBaseUrl}/${encodedPath}`)
    const fileName = path.split('/').filter(Boolean).pop() || `Document ${index + 1}`
    return {
      id: `${inquiryId}-${index}-${fileName}`,
      name: decodeSharePointPathSegment(fileName),
      fileType: fileName.includes('.') ? fileName.split('.').pop() || 'Document' : 'Document',
      modified: '',
      url,
    }
  }).filter((document) => Boolean(document.url))
}

function encodeSharePointPathSegment(segment: string) {
  return encodeURIComponent(decodeSharePointPathSegment(segment))
}

function decodeSharePointPathSegment(segment: string) {
  try { return decodeURIComponent(segment) } catch { return segment }
}

export async function getInquiryEmails(inquiryId: string): Promise<InquiryEmailActivity[]> {
  if (!/^[0-9a-f-]{36}$/i.test(inquiryId)) return []
  const emails = await getAll<Record<string, unknown>>(`/_api/emails?$select=activityid,subject,description,statuscode,directioncode,senton,actualend,createdon,_regardingobjectid_value&$filter=_regardingobjectid_value eq ${inquiryId}&$orderby=createdon desc`)
  if (!emails.length) return []

  const emailIds = emails.map((email) => String(email.activityid ?? '')).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!emailIds.length) return []
  const idFilter = emailIds.map((id) => `_activityid_value eq ${id}`).join(' or ')
  const attachmentFilter = emailIds.map((id) => `(_objectid_value eq ${id} or _activityid_value eq ${id})`).join(' or ')
  const [parties, attachments] = await Promise.all([
    getAll<Record<string, unknown>>(`/_api/activityparties?$select=activitypartyid,_activityid_value,_partyid_value,addressused,participationtypemask&$filter=${encodeURIComponent(idFilter)}`),
    getAll<Record<string, unknown>>(`/_api/activitymimeattachments?$select=activitymimeattachmentid,_objectid_value,_activityid_value,filename,subject,mimetype,filesize&$filter=${encodeURIComponent(attachmentFilter)}`),
  ])

  const partiesByEmail = groupById(parties, '_activityid_value')
  const attachmentsByEmail = groupByAnyId(attachments, ['_objectid_value', '_activityid_value'])
  const activities = emails.map((email) => {
    const id = String(email.activityid ?? '')
    const emailParties = partiesByEmail.get(id.toLowerCase()) ?? []
    const recipients = emailParties.filter((party) => Number(party.participationtypemask) === 2)
    const direction: InquiryEmailActivity['direction'] = email.directioncode === true ? 'sent' : 'received'
    const formattedStatus = email['statuscode@OData.Community.Display.V1.FormattedValue']
    const status = typeof formattedStatus === 'string' && formattedStatus.trim()
      ? formattedStatus.trim()
      : direction === 'sent' ? 'Sent' : 'Received'
    const emailAttachments = [...new Map((attachmentsByEmail.get(id.toLowerCase()) ?? []).map((attachment) => [String(attachment.activitymimeattachmentid ?? ''), attachment])).values()]
    return {
      id,
      subject: String(email.subject ?? '(No subject)'),
      body: String(email.description ?? ''),
      from: 'motorinsurance@datanox.io',
      to: recipients.map(partyAddress).filter(Boolean),
      date: String(email.senton ?? email.actualend ?? email.createdon ?? ''),
      status,
      direction,
      attachments: emailAttachments.map((attachment) => ({
        id: String(attachment.activitymimeattachmentid ?? `${id}-${attachment.filename ?? attachment.subject ?? ''}`),
        fileName: String(attachment.filename ?? attachment.subject ?? 'Attachment'),
        mimeType: String(attachment.mimetype ?? ''),
        fileSize: Number(attachment.filesize ?? 0),
      })),
    }
  })
  // The API is ordered newest first. Collapse by normalized subject and replace
  // a sent copy with its received counterpart whenever both are present.
  const bySubject = new Map<string, InquiryEmailActivity>()
  for (const email of activities) {
    const subjectKey = email.subject.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
    if (!subjectKey) {
      bySubject.set(`__no_subject__${email.id}`, email)
      continue
    }
    const existing = bySubject.get(subjectKey)
    if (!existing || (existing.direction === 'sent' && email.direction === 'received')) {
      bySubject.set(subjectKey, email)
    }
  }
  return [...bySubject.values()].sort((a, b) => dateValue(b.date) - dateValue(a.date))
}

function groupById(rows: Record<string, unknown>[], ...keys: string[]) {
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const value = keys.map((key) => row[key]).find((item) => typeof item === 'string' && item)
    if (typeof value !== 'string') continue
    const id = value.toLowerCase()
    grouped.set(id, [...(grouped.get(id) ?? []), row])
  }
  return grouped
}

function groupByAnyId(rows: Record<string, unknown>[], keys: string[]) {
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key]
      if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) continue
      const id = value.toLowerCase()
      grouped.set(id, [...(grouped.get(id) ?? []), row])
    }
  }
  return grouped
}

function partyAddress(party?: Record<string, unknown>) {
  if (!party) return ''
  const formatted = party['_partyid_value@OData.Community.Display.V1.FormattedValue']
  return String(party.addressused ?? formatted ?? '')
}

function dateValue(value: string) {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function safeDocumentUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'https:' || (url.origin === window.location.origin && url.protocol === 'http:') ? url.href : ''
  } catch { return '' }
}

function mapInquiry(row: Record<string, unknown>): InquiryRecord {
  const payload = parsePayload(row.aur_customer_data)
  const plan = row.aur_plan as Record<string, unknown> | undefined
  const statusValue = Number(row.statuscode)
  const statusLabel = Object.entries(row).find(([key]) => key.toLowerCase() === 'statuscode@odata.community.display.v1.formattedvalue')?.[1]
  const underwriterActionLabels: Record<number, string> = { 2: 'Lost', 3: 'Converted' }
  const underwriterSubActionLabels: Record<number, string> = {
    1: 'Motor Insurance - TPL',
    2: 'Motor Insurance - Non-Agency',
    3: 'Motor Insurance - Agency',
    4: 'Lost to Competitor - High Premium',
    5: 'Rejected by UW - Restricted for Outside Agency Repair Only',
    6: 'Rejected by UW - Restricted Vehicle (TPL cover only)',
    7: 'No Response - From Customer',
    8: 'Rejected by UW - Driver Age Below 25 (TPL cover only)',
    9: 'Rejected by UW - Driving License Less Than 1 Year (TPL cover only)',
    10: 'Rejected by UW - Claims History Exists',
    11: 'Rejected by UW - Vehicle Manufacture Year (TPL cover only)',
    12: 'No Response - from Sales Agent',
    13: 'Customer Not Interested - Quote Sent',
    14: 'Rejected by UW - Non GCC (TPL cover only)',
  }
  const choiceLabel = (field: string, labels: Record<number, string>) => {
    const formatted = row[`${field}@OData.Community.Display.V1.FormattedValue`]
    return typeof formatted === 'string' && formatted.trim()
      ? formatted.trim()
      : labels[Number(row[field])] ?? ''
  }
  const createdAt = formatDate(row.createdon)
  const basePremium = Number(row.aur_base_premium ?? plan?.aur_base_premium ?? 0)
  const premiumBreakdown = {
    basePremium: nullableNumber(row.aur_base_premium),
    additionalPremiumPercentage: nullableNumber(row.aur_additional_premium_percentage),
    totalPremiumPercentage: nullableNumber(row.aur_total_premium_percentage),
    grossPremium: nullableNumber(row.aur_gross_premium),
    vat: nullableNumber(plan?.aur_vat),
    totalPremiumToBeCharged: nullableNumber(row.aur_total_amount_charge),
  }
  return {
    id: String(row.aur_quotesid ?? ''),
    title: String(row.aur_name ?? `Inquiry for ${payload['Insurance product']} - ${payload['Driver details']['Full name']}`),
    type: payload['Vehicle use'] === 'Commercial' ? 'Company Vehicle' : 'Personal Vehicle',
    plan: String(plan?.aur_name ?? '—'),
    broker: '—',
    brokerAgent: '—',
    status: inquiryStatusLabels[statusValue]
      ?? (typeof statusLabel === 'string' && statusLabel.trim() ? statusLabel.trim() : 'Status unavailable'),
    underwriterActionStatus: choiceLabel('aur_underwriter_action_status', underwriterActionLabels),
    underwriterSubAction: choiceLabel('aur_underwriter_sub_action', underwriterSubActionLabels),
    riskScore: Number(row.aur_risk_score ?? 50),
    vehicleValue: formatVehicleValue(row.aur_vehicle_value),
    basePremium,
    discount: 0,
    tax: 0,
    totalPremium: basePremium,
    premiumBreakdown,
    createdAt,
    updatedAt: formatDate(row.modifiedon ?? row.createdon),
    description: `${payload['Model year']} ${payload['Vehicle make']} ${payload['Vehicle model']} - ${payload['Driver details']['Email address']}`,
    payload,
  }
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatVehicleValue(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return 'Not calculated'
  const matches = String(value).match(/\d[\d,]*(?:\.\d+)?/g)
  const amounts = matches?.map((item) => Number(item.replace(/,/g, ''))).filter(Number.isFinite) ?? []
  if (!amounts.length) return 'Not calculated'
  const average = amounts.length >= 2
    ? (amounts[0] + amounts[1]) / 2
    : amounts[0]
  return `AED ${average.toLocaleString('en-AE', { maximumFractionDigits: 2 })}`
}

function parsePayload(value: unknown): QuotePayload {
  if (typeof value === 'string') {
    try { return normalizePayload(JSON.parse(value)) } catch { return emptyPayload() }
  }
  if (typeof value === 'object' && value !== null) return normalizePayload(value)
  return emptyPayload()
}

function emptyPayload(): QuotePayload {
  return {
    'Insurance product': '',
    'Driver details': { 'Full name': '', 'Email address': '', 'Mobile number': '', 'Age range': '', Nationality: '' },
    'Vehicle condition': '', 'Model year': '', 'Vehicle make': '', 'Vehicle model': '', 'Body type': '',
    'Engine details': '', 'Vehicle use': '', 'First registration': '', 'License age': '',
    'Vehicle specification': '', 'Claims history': '', Documents: [],
  }
}

function normalizePayload(value: unknown): QuotePayload {
  const data = value as Record<string, unknown>
  const driver = (data['Driver details'] ?? {}) as Record<string, string>
  return {
    'Insurance product': String(data['Insurance product'] ?? 'Motor Insurance'),
    'Driver details': {
      'Full name': String(driver['Full name'] ?? ''),
      'Email address': String(driver['Email address'] ?? ''),
      'Mobile number': String(driver['Mobile number'] ?? ''),
      'Age range': String(driver['Age range'] ?? ''),
      Nationality: String(driver.Nationality ?? ''),
    },
    'Vehicle condition': String(data['Vehicle condition'] ?? ''),
    'Model year': String(data['Model year'] ?? ''),
    'Vehicle make': String(data['Vehicle make'] ?? ''),
    'Vehicle model': String(data['Vehicle model'] ?? ''),
    'Body type': String(data['Body type'] ?? ''),
    'Engine details': String(data['Engine details'] ?? ''),
    'Vehicle use': String(data['Vehicle use'] ?? ''),
    'First registration': String(data['First registration'] ?? ''),
    'License age': String(data['License age'] ?? ''),
    'Vehicle specification': String(data['Vehicle specification'] ?? ''),
    'Claims history': String(data['Claims history'] ?? ''),
    Documents: Array.isArray(data.Documents) ? data.Documents as QuotePayload['Documents'] : [],
  }
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}
