import { cloneElement, isValidElement, useMemo, useRef, useState } from 'react'
import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as Select from '@radix-ui/react-select'
import type { SimpleIcon } from 'simple-icons'
import { useCallback, useEffect } from 'react'
import { siAstonmartin, siBentley, siFerrari, siPorsche, siTesla } from 'simple-icons'
import {
  ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, Car, CarFront,
  Check, ChevronDown, CircleDollarSign, CircleHelp, FileCheck2, FileText, Globe2, RefreshCw,
  Info, KeyRound, LoaderCircle, LockKeyhole, Menu,
  ShieldCheck, SlidersHorizontal, Sparkles, Upload, UserRound, X,
} from 'lucide-react'
import {
  siToyota, siNissan, siHonda, siMitsubishi, siHyundai, siKia, siMazda,
  siFord, siBmw, siAudi, siChevrolet, siJeep,
} from 'simple-icons'
import logoAsset from './assets/al-buhaira-logo.webp'
import sedanAsset from './assets/vehicle-sedan.png'
import suvAsset from './assets/vehicle-suv.png'
import hatchbackAsset from './assets/vehicle-hatchback.png'
import skylineAsset from './assets/dubai-skyline.png'
import licenceExample from './assets/driving-licence-example.svg'
import registrationExample from './assets/vehicle-registration-example.svg'
import { InquiryDetailPage, InquiryGrid } from './Inquiries'
import { demoInquiries, isSubmissionRecoveryCandidate, resolveVehicleMake, resolveVehicleSelection } from './inquiryData'
import type { InquiryRecord, QuotePayload } from './inquiryData'
import { calculateVehiclePremium, completeIncompleteInquiry, createIncompleteInquiry, createMotorMasterData, createQuoteRecord, findOrCreateContact, getDataverseInquiry, getDataverseInquiries, getInquiryDocuments, getInquiryEmails, getInquiryStatusCode, getInsuranceCatalog, getVehicleCatalog, getVehicleValueRange, invokeDocumentFlow, isIncompleteInquiryStatus, isPowerPagesRuntime, markQuoteProductMatched, saveIncompleteInquiry } from './powerPagesApi'
import type { InquiryEmailActivity, SharePointInquiryDocument, VehicleValueRange } from './powerPagesApi'
import type { InsuranceCatalog, VehicleMakeOption } from './powerPagesApi'
import './App.css'
import './FormRevamp.css'
import './BrandTheme.css'
import './InquiryPages.css'

type Answers = {
  product: string; fullName: string; email: string; mobile: string; age: string; nationality: string
  condition: string; year: string; make: string; model: string; body: string; engine: string
  usage: string; registration: string; licence: string; specification: string; claims: string
  documents: File[]; contact: string; notes: string
}

const currentYear = new Date().getFullYear()
const blank: Answers = {
  product: '', fullName: '', email: '', mobile: '', age: '', nationality: '', condition: '', year: String(currentYear),
  make: '', model: '', body: '', engine: '', usage: '', registration: String(currentYear), licence: '',
  specification: '', claims: '', documents: [], contact: 'Email', notes: '',
}

function createQuotePayload(answers: Answers, resumeStep?: number): QuotePayload {
  const mobile = answers.mobile.trim()
  return {
    'Insurance product': answers.product,
    'Driver details': {
      'Full name': answers.fullName,
      'Email address': answers.email,
      'Mobile number': mobile ? mobile.startsWith('+971') ? mobile : `+971 ${mobile}` : '',
      'Age range': answers.age,
      Nationality: answers.nationality,
    },
    'Vehicle condition': answers.condition,
    'Model year': answers.year,
    'Vehicle make': answers.make,
    'Vehicle model': answers.model,
    'Body type': answers.body,
    'Engine details': answers.engine,
    'Vehicle use': answers.usage,
    'First registration': answers.registration,
    'License age': answers.licence,
    'Vehicle specification': answers.specification,
    'Claims history': answers.claims,
    Documents: answers.documents.map(({ name, size, type }) => ({ name, size, type })),
    'Preferred contact': answers.contact,
    'Additional notes': answers.notes,
    ...(resumeStep === undefined ? {} : { 'Resume step': resumeStep }),
  }
}

function answersFromPayload(payload: QuotePayload): Answers {
  const mobile = payload['Driver details']['Mobile number'].replace(/^\+971\s*/i, '')
  return {
    product: payload['Insurance product'],
    fullName: payload['Driver details']['Full name'],
    email: payload['Driver details']['Email address'],
    mobile,
    age: payload['Driver details']['Age range'],
    nationality: payload['Driver details'].Nationality,
    condition: payload['Vehicle condition'],
    year: payload['Model year'],
    make: payload['Vehicle make'],
    model: payload['Vehicle model'],
    body: payload['Body type'],
    engine: payload['Engine details'],
    usage: payload['Vehicle use'],
    registration: payload['First registration'],
    licence: payload['License age'],
    specification: payload['Vehicle specification'],
    claims: payload['Claims history'],
    // Browsers cannot restore file bytes after a tab closes. Metadata is shown
    // separately and the customer reselects files before final submission.
    documents: [],
    contact: payload['Preferred contact'] || 'Email',
    notes: payload['Additional notes'] || '',
  }
}

function firstIncompleteStep(payload: QuotePayload) {
  const driver = payload['Driver details']
  let firstMissing = 14
  if (!driver['Full name'].trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driver['Email address']) || !driver['Mobile number'] || !driver['Age range'] || !driver.Nationality) firstMissing = 1
  const remaining = [payload['Vehicle condition'], payload['Model year'], payload['Vehicle make'], payload['Vehicle model'], payload['Body type'], payload['Engine details'], payload['Vehicle use'], payload['First registration'], payload['License age'], payload['Vehicle specification'], payload['Claims history']]
  const missing = remaining.findIndex((value) => !value)
  if (missing >= 0) firstMissing = Math.min(firstMissing, missing + 2)
  if (payload.Documents.length) firstMissing = Math.min(firstMissing, 13)
  const savedStep = Number(payload['Resume step'])
  return Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 14 ? Math.min(savedStep, firstMissing) : firstMissing
}

function buildInquiry(id: string, payload: QuotePayload, catalog?: InsuranceCatalog): InquiryRecord {
  const vehicleName = [payload['Vehicle make'], payload['Vehicle model']].filter(Boolean).join(' ')
  const createdAt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  return {
    id,
    title: `Inquiry for ${payload['Insurance product']} - ${payload['Driver details']['Email address']}`,
    type: payload['Vehicle use'] === 'Commercial' ? 'Company Vehicle' : 'Personal Vehicle',
    plan: catalog?.planName ?? 'Comprehensive Insurance',
    broker: 'No broker linked',
    brokerAgent: '—',
    status: 'Product Matched',
    underwriterActionStatus: '',
    underwriterSubAction: '',
    riskScore: 50,
    vehicleValue: 'Not calculated',
    basePremium: catalog?.basePremium ?? 0,
    discount: 0,
    tax: 0,
    totalPremium: catalog?.basePremium ?? 0,
    premiumBreakdown: {
      basePremium: null,
      additionalPremiumPercentage: null,
      totalPremiumPercentage: null,
      grossPremium: null,
      vat: null,
      totalPremiumToBeCharged: null,
    },
    createdAt,
    updatedAt: createdAt,
    description: `Quote request for ${vehicleName || 'a vehicle'}. Sample local inquiry; no data was sent.`,
    payload,
  }
}

const makes = ['Toyota', 'Nissan', 'Honda', 'Mitsubishi', 'Hyundai', 'Kia', 'Lexus', 'Mazda', 'Ford', 'Mercedes-Benz', 'BMW', 'Audi', 'Chevrolet', 'Jeep']
const makeIcons: Record<string, SimpleIcon> = { TOYOTA: siToyota, NISSAN: siNissan, HONDA: siHonda, MITSUBISHI: siMitsubishi, HYUNDAI: siHyundai, KIA: siKia, MAZDA: siMazda, FORD: siFord, BMW: siBmw, AUDI: siAudi, CHEVROLET: siChevrolet, JEEP: siJeep, 'ASTON MARTIN': siAstonmartin, BENTLEY: siBentley, FERRARI: siFerrari, PORSCHE: siPorsche, TESLA: siTesla }
const models: Record<string, string[]> = {
  Toyota: ['Camry', 'Corolla', 'Land Cruiser', 'RAV4', 'Yaris', 'Fortuner'], Nissan: ['Altima', 'Patrol', 'Sunny', 'X-Trail', 'Pathfinder'],
  Honda: ['Accord', 'Civic', 'CR-V', 'City'], Mitsubishi: ['Outlander', 'Pajero', 'Lancer', 'ASX'], Hyundai: ['Tucson', 'Elantra', 'Santa Fe', 'Accent'],
  Kia: ['Sportage', 'Seltos', 'Sorento', 'Cerato'], Lexus: ['ES', 'RX', 'LX', 'IS'], Mazda: ['CX-5', 'Mazda 6', 'Mazda 3'],
  Ford: ['Territory', 'Everest', 'Edge', 'Mustang'], 'Mercedes-Benz': ['C-Class', 'E-Class', 'GLE', 'GLC'], BMW: ['3 Series', '5 Series', 'X3', 'X5'],
  Audi: ['A4', 'A6', 'Q5', 'Q7'], Chevrolet: ['Captiva', 'Tahoe', 'Malibu'], Jeep: ['Wrangler', 'Grand Cherokee', 'Compass'],
}
const localVehicleMakes: VehicleMakeOption[] = makes.map((name) => ({ id: `local-make-${name}`, name, models: (models[name] ?? ['Other']).map((model, index) => ({ id: `local-model-${name}-${index}`, name: model })) }))
const bodies = ['Saloon / Hatchback', 'Station / 4WD / SUV', 'Coupe']
const steps = ['Product', 'Driver details', 'Vehicle condition', 'Model year', 'Vehicle make', 'Vehicle model', 'Body type', 'Engine details', 'Vehicle use', 'First registration', 'License age', 'Vehicle specification', 'Claims history', 'Documents']
const groups = [
  { label: 'Your details', first: 0, last: 1 }, { label: 'Vehicle', first: 2, last: 11 },
  { label: 'Driving history', first: 12, last: 12 }, { label: 'Documents', first: 13, last: 13 }, { label: 'Quote', first: 14, last: 14 },
]
const yearOptions = Array.from({ length: 61 }, (_, i) => String(currentYear - 30 + i))
const registrationOptions = Array.from({ length: 31 }, (_, i) => String(currentYear - 30 + i))
let portalUserContextLogged = false

function titleCaseMake(value: string) {
  const titled = value.toLocaleLowerCase('en').replace(/(^|[\s-])([a-z])/g, (_, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`)
  return titled.replace(/\bBmw\b/g, 'BMW').replace(/\bByd\b/g, 'BYD').replace(/\bMg\b/g, 'MG')
}

function Brand({ small = false, onHomeClick }: { small?: boolean; onHomeClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return <Link className={`brand ${small ? 'brand-small' : ''}`} to="/" onClick={onHomeClick} aria-label="Al-Buhaira National Insurance home">
    <img className="brand-logo" src={logoAsset} alt="Al-Buhaira National Insurance Co." />
  </Link>
}

function SiteHeader({ compact = false, onHomeClick }: { compact?: boolean; onHomeClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return <header className="site-header"><div className="header-inner"><Brand small={compact} onHomeClick={onHomeClick} />
    <div className="header-tools"><span className="language-pill"><Globe2 size={16} /> English <ChevronDown size={13} /></span><span className="header-divider" />
      <Link to="/" className="help-link" onClick={onHomeClick}><CircleHelp size={19} /> <span>Need help?</span></Link>
    </div></div></header>
}

function Landing() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const beginQuote = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (leaving) return
    setLeaving(true)
    window.setTimeout(() => navigate('/quote/0'), 240)
  }

  return <div className={`marketing-page ${leaving ? 'route-leaving' : ''}`}><SiteHeader />
    <main>
      <section className="hero-wrap"><div className="hero-copy">
        <div className="hero-kicker"><span className="kicker-dot" /> COVER FOR THE ROAD AHEAD <span className="kicker-rule" /> UAE</div>
        <h1>Cover that moves<br /><em>with you.</em></h1>
        <p className="hero-intro">Tell us a little about your car and driving history. We’ll help you prepare a quote request, one clear step at a time.</p>
        <div className="hero-route" aria-label="What the quote journey covers">
          <div><span>01</span><b>Driver & vehicle</b></div>
          <i aria-hidden="true" />
          <div><span>02</span><b>Driving history</b></div>
          <i aria-hidden="true" />
          <div><span>03</span><b>Documents</b></div>
        </div>
        <div className="hero-actions"><Link className="button button-primary button-large" to="/quote/0" onClick={beginQuote} aria-disabled={leaving}>Create quote <ArrowRight size={18} /></Link><Link className="button button-outline button-large" to="/inquiries">View Inquiries <FileText size={16} /></Link></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="art-sun" />
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <img className="hero-skyline" src={skylineAsset} alt="" />
        <div className="art-stamp"><span>YOUR JOURNEY</span><strong>01 <b>/ 14</b></strong><div className="stamp-line"><i /></div><small>A little closer to covered</small></div>
        <div className="art-road"><span /><span /></div><span className="art-spark"><Sparkles size={21} /></span>
        <div className="art-caption"><span className="caption-icon"><BadgeCheck size={19} /></span><span><b>Your journey, made clearer</b><small>Driver · vehicle · driving history</small></span></div>
      </div>
      </section>
    </main>
  </div>
}
function Choice({ label, sub, value, current, onClick, icon, className = '' }: { label: string; sub?: string; value: string; current: string; onClick: (v: string) => void; icon?: React.ReactNode; className?: string }) {
  const selected = current === value
  return <button type="button" className={`choice-card ${selected ? 'selected' : ''} ${className}`} aria-pressed={selected} onClick={() => onClick(value)}>
    {icon && <span className="choice-icon">{icon}</span>}<span className="choice-copy"><b>{label}</b>{sub && <small>{sub}</small>}</span>
  </button>
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, { 'aria-describedby': error ? `${id}-error` : undefined })
    : children
  return <div className={`field ${error ? 'field-error' : ''}`}><label htmlFor={id}>{label}</label>{control}{error && <small id={`${id}-error`} className="field-message" role="alert">{error}</small>}</div>
}

function CustomSelect({
  id, value, onValueChange, options, placeholder, invalid, 'aria-describedby': describedBy,
}: {
  id: string; value: string; onValueChange: (value: string) => void; options: string[]; placeholder: string
  invalid?: boolean; 'aria-describedby'?: string
}) {
  return <Select.Root value={value || undefined} onValueChange={onValueChange}>
    <Select.Trigger id={id} className="custom-select" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
      <Select.Value placeholder={placeholder} /><Select.Icon className="custom-select-icon"><ChevronDown size={17} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="custom-select-content" position="popper" sideOffset={7} align="start">
      <Select.Viewport className="custom-select-viewport">{options.map((option) => <Select.Item key={option} value={option} className="custom-select-item"><Select.ItemText>{option}</Select.ItemText><Select.ItemIndicator><Check size={16} /></Select.ItemIndicator></Select.Item>)}</Select.Viewport>
    </Select.Content></Select.Portal>
  </Select.Root>
}

function YearGrid({ value, onSelect, years, featured = false }: { value: string; onSelect: (v: string) => void; years: string[]; featured?: boolean }) {
  const [search, setSearch] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)
  const currentYearRef = useRef<HTMLButtonElement>(null)
  const filtered = years.filter((y) => y.includes(search))
  const list = filtered

  useEffect(() => {
    const grid = gridRef.current
    const current = currentYearRef.current
    if (!grid || !current || search) return
    grid.scrollTop = current.offsetTop - grid.offsetTop - (grid.clientHeight - current.offsetHeight) / 2
  }, [years, search])

  return <div className="year-picker">
    <div className="search-field"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={featured ? 'Search model year...' : 'Search registration year...'} aria-label="Search years" /><span><SlidersHorizontal size={16} /></span></div>
    {!search && <p className="picker-label">{featured ? 'Model year · 30 years before and after this year' : 'First registration · this year and 30 years earlier'}</p>}
    <div className="year-grid" ref={gridRef} aria-label={featured ? 'Model years' : 'First registration years'}>{list.map((year) => {
      const isCurrentYear = Number(year) === currentYear
      return <button type="button" key={year} ref={isCurrentYear ? currentYearRef : undefined} className={`year-option ${value === year ? 'selected' : ''} ${isCurrentYear ? 'current-year' : ''}`} aria-current={isCurrentYear ? 'date' : undefined} aria-pressed={value === year} onClick={() => onSelect(year)}><span className="year-label">{year}</span></button>
    })}{!list.length && <p className="empty-note">No matching year. Try another search.</p>}</div>
    {search && <p className="year-hint">Showing {list.length} matching {list.length === 1 ? 'year' : 'years'}.</p>}
  </div>
}

function MakeGrid({ value, onSelect, makes: vehicleMakes }: { value: string; onSelect: (v: string) => void; makes: VehicleMakeOption[] }) {
  const [search, setSearch] = useState('')
  const filtered = vehicleMakes.map((make) => make.name).filter((make) => make.toLowerCase().includes(search.toLowerCase()))
  return <><div className="search-field"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vehicle make..." aria-label="Search vehicle makes" /><span><SlidersHorizontal size={16} /></span></div><div className="option-grid make-grid">{filtered.map((m) => { const icon = makeIcons[m.trim().toUpperCase()]; const selected = value.trim().toLocaleLowerCase() === m.trim().toLocaleLowerCase(); return <button type="button" key={m} className={`make-choice ${selected ? 'selected' : ''}`} onClick={() => onSelect(m)} aria-pressed={selected}>{icon ? <svg className="make-logo" viewBox="0 0 24 24" role="img" aria-label={`${m} logo`}><path fill={`#${icon.hex}`} d={icon.path} /></svg> : m.toUpperCase().includes('MERCEDES') ? <svg className="make-logo custom-make-logo" viewBox="0 0 32 32" role="img" aria-label={`${m} logo`}><circle cx="16" cy="16" r="13" /><path d="M16 4v12L7 22m9-6 9 6" /></svg> : <span className="make-wordmark" aria-label={`${m} logo`}>{m.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase()}</span>}<span>{m}</span></button> })}{!filtered.length && <p className="empty-note">No matching make. Try another search.</p>}</div></>
}

function VehicleGlyph({ body }: { body: string }) {
  const src = body.includes('SUV') ? suvAsset : body === 'Coupe' ? hatchbackAsset : sedanAsset
  return <img className="vehicle-art-image" src={src} alt="" />
}

function bodyArt(label: string) {
  const src = label.includes('SUV') ? suvAsset : label === 'Coupe' ? hatchbackAsset : sedanAsset
  return <img className="body-choice-image" src={src} alt="" loading="eager" decoding="async" />
}

function DocumentDrop({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const add = (selected: FileList | null) => { if (selected) onChange([...files, ...Array.from(selected)]) }
  const remove = (index: number) => onChange(files.filter((_, i) => i !== index))
  const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`
  return <>
    <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={(e) => { add(e.currentTarget.files); e.currentTarget.value = '' }} aria-label="Choose documents" />
    <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) }}>
      <span className="upload-icon"><Upload size={25} /></span><b>Choose files or drag them here</b><small>Selected files are sent with your quote request when you submit.</small>
      <button type="button" className="button button-outline button-small" onClick={() => inputRef.current?.click()}>Browse files</button>
    </div>
    {files.length > 0 && <div className="file-list" aria-live="polite"><h3>Selected files <span>{files.length}</span></h3>{files.map((f, i) => <div className="file-row" key={`${f.name}-${i}`}><span className="file-type"><FileText size={17} /></span><span className="file-name"><b>{f.name}</b><small>{formatSize(f.size)} · Selected locally</small></span><button type="button" aria-label={`Remove ${f.name}`} onClick={() => remove(i)} className="icon-button"><X size={17} /></button></div>)}</div>}
  </>
}

function QuoteWizard({ onCreateInquiry, draftRecord, submissionRecovery = false }: { onCreateInquiry: (payload: QuotePayload, catalog: InsuranceCatalog) => InquiryRecord; draftRecord?: InquiryRecord; submissionRecovery?: boolean }) {
  const { step: stepParam } = useParams()
  const navigate = useNavigate()
  const [resumeStep, setResumeStep] = useState(() => draftRecord ? firstIncompleteStep(draftRecord.payload) : 0)
  const step = draftRecord ? resumeStep : Math.min(14, Math.max(0, Number(stepParam) || 0))
  const [a, setA] = useState<Answers>(() => draftRecord ? answersFromPayload(draftRecord.payload) : blank)
  const lastSavedDraftPayload = useRef(draftRecord ? JSON.stringify(createQuotePayload(answersFromPayload(draftRecord.payload), draftRecord.payload['Resume step'])) : '')
  const [productConfirmed, setProductConfirmed] = useState(Boolean(draftRecord))
  const [creatingInquiry, setCreatingInquiry] = useState(false)
  const [productLoadError, setProductLoadError] = useState('')
  const catalogRequest = useRef<Promise<InsuranceCatalog> | undefined>(undefined)
  const [submissionStatus, setSubmissionStatus] = useState('')
  const [submissionError, setSubmissionError] = useState('')
  const [catalog, setCatalog] = useState<InsuranceCatalog>()
  const [vehicleMakes, setVehicleMakes] = useState<VehicleMakeOption[]>([])
  const [vehicleMakesLoading, setVehicleMakesLoading] = useState(false)
  const [vehicleMakesError, setVehicleMakesError] = useState('')
  const [vehicleCatalogReady, setVehicleCatalogReady] = useState(false)
  const vehicleMakesRef = useRef<VehicleMakeOption[]>([])
  const vehicleMakesLoaded = useRef(false)
  const vehicleMakesRequest = useRef<Promise<VehicleMakeOption[]> | undefined>(undefined)
  const [vehicleValueRange, setVehicleValueRange] = useState<VehicleValueRange>()
  const [vehicleValueInputKey, setVehicleValueInputKey] = useState('')
  const [vehicleValueLoading, setVehicleValueLoading] = useState(false)
  const [vehicleValueError, setVehicleValueError] = useState('')
  const [vehicleValueRetry, setVehicleValueRetry] = useState(0)
  const [submissionProgress, setSubmissionProgress] = useState({ quoteId: '', quoteStatusUpdated: false, motorDataCreated: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [mobileMenu, setMobileMenu] = useState(false)
  const [draftId, setDraftId] = useState(draftRecord?.id ?? '')
  const draftIdRef = useRef(draftRecord?.id ?? '')
  const draftCreateRef = useRef<Promise<string> | undefined>(undefined)
  const draftContactRepairStarted = useRef(false)
  const draftSaveChain = useRef<Promise<void>>(Promise.resolve())
  const draftSaveVersion = useRef(0)
  const draftContactId = useRef(draftRecord?.contactId ?? '')
  const draftContactEmail = useRef(draftRecord?.payload['Driver details']['Email address'].trim().toLowerCase() ?? '')
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(() => draftRecord ? 'saved' : 'idle')
  const [draftSaveError, setDraftSaveError] = useState('')
  const loadVehicleMakes = useCallback((): Promise<VehicleMakeOption[]> => {
    if (vehicleMakesLoaded.current) return Promise.resolve(vehicleMakesRef.current)
    if (vehicleMakesRequest.current) return vehicleMakesRequest.current
    setVehicleMakesLoading(true)
    setVehicleMakesError('')
    const request = (async () => {
      const makes = isPowerPagesRuntime() ? await getVehicleCatalog() : localVehicleMakes
      vehicleMakesRef.current = makes
      vehicleMakesLoaded.current = true
      setVehicleMakes(makes)
      setVehicleCatalogReady(true)
      return makes
    })().catch((error) => {
      setVehicleMakesError(error instanceof Error ? error.message : 'Could not load vehicle makes.')
      throw error
    }).finally(() => {
      vehicleMakesRequest.current = undefined
      setVehicleMakesLoading(false)
    })
    vehicleMakesRequest.current = request
    return request
  }, [])
  const loadCatalogForProduct = (product: string) => {
    if (catalog?.productName === product) return Promise.resolve(catalog)
    if (catalogRequest.current) return catalogRequest.current
    setProductLoadError('')
    const request = getInsuranceCatalog(product)
      .then((value) => { setCatalog(value); return value })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Could not load the selected plan.'
        setProductLoadError(message)
        throw error
      })
      .finally(() => {
        catalogRequest.current = undefined
      })
    catalogRequest.current = request
    return request
  }
  // Load makes and models once as soon as either create or incomplete-edit
  // wizard opens. Both forms then use the same complete Dataverse catalog,
  // regardless of which step the user resumes on.
  useEffect(() => {
    void loadVehicleMakes().catch(() => undefined)
  }, [loadVehicleMakes])
  useEffect(() => {
    if (!draftRecord || !isPowerPagesRuntime()) return
    let active = true
    void getInsuranceCatalog(draftRecord.payload['Insurance product']).then((value) => { if (active) setCatalog(value) }).catch((error) => {
      if (active) {
        setDraftSaveState('error')
        setDraftSaveError(error instanceof Error ? error.message : 'Could not reload the saved plan.')
      }
    })
    return () => { active = false }
  }, [draftRecord])
  useEffect(() => {
    if (step < 5) return
    for (const src of [sedanAsset, suvAsset, hatchbackAsset]) {
      const image = new Image()
      image.decoding = 'async'
      image.src = src
    }
  }, [step])
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setA((current) => ({ ...current, [key]: value }))
  const saveEditInBackground = (answers: Answers, resumeAt: number) => {
    if (!isPowerPagesRuntime() || submissionRecovery) return
    const payload = createQuotePayload(answers, resumeAt)
    void persistDraft(payload).catch(() => undefined)
  }
  const setChoice = (key: keyof Answers) => (value: string) => {
    const next = { ...a, [key]: value } as Answers
    set(key, value as never)
    setErrors((e) => ({ ...e, [key]: '' }))
    if (key === 'product' && isPowerPagesRuntime()) void loadCatalogForProduct(value).catch(() => undefined)
    // Driver details remain on the same step; single-answer steps resume at
    // the next question. This runs in the background and never blocks Continue.
    saveEditInBackground(next, step === 1 ? step : Math.min(step + 1, 14))
  }
  const goToStep = (next: number) => {
    if (draftRecord) setResumeStep(next)
    else navigate(`/quote/${next}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const ensureDraft = async (payload = createQuotePayload(a, step)) => {
    if (!isPowerPagesRuntime() || draftIdRef.current) return draftIdRef.current
    const driver = payload['Driver details']
    if (!payload['Insurance product'] || !driver['Full name'].trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driver['Email address'])) return ''
    if (draftCreateRef.current) return draftCreateRef.current
    const selectedCatalog = catalog ?? (catalogRequest.current ? await catalogRequest.current : undefined)
    if (!selectedCatalog) return ''
    setDraftSaveState('saving'); setDraftSaveError('')
    const creation = (async () => {
      const contactId = await findOrCreateContact(payload)
      const id = await createIncompleteInquiry(payload, selectedCatalog, contactId)
      lastSavedDraftPayload.current = JSON.stringify(payload)
      draftContactId.current = contactId
      draftContactEmail.current = driver['Email address'].trim().toLowerCase()
      draftIdRef.current = id
      setDraftId(id)
      setDraftSaveState('saved')
      return id
    })().catch((error) => {
      setDraftSaveState('error')
      setDraftSaveError(error instanceof Error ? error.message : 'Could not create your saved inquiry.')
      throw error
    }).finally(() => { draftCreateRef.current = undefined })
    draftCreateRef.current = creation
    return creation
  }
  const persistDraft = async (payload = createQuotePayload(a, step), expectedVersion?: number) => {
    if (!isPowerPagesRuntime()) return
    // Keep prior attachment names in the saved JSON until the customer selects
    // the files again. Browsers cannot restore the file bytes after a reload.
    const savedFiles = draftRecord?.payload.Documents ?? []
    const payloadToSave = !payload.Documents.length && savedFiles.length
      ? { ...payload, Documents: savedFiles }
      : payload
    const id = await ensureDraft(payloadToSave)
    if (!id) return
    if (draftContactId.current && JSON.stringify(payloadToSave) === lastSavedDraftPayload.current) {
      setDraftSaveState('saved')
      return
    }
    const version = expectedVersion ?? ++draftSaveVersion.current
    setDraftSaveState('saving'); setDraftSaveError('')
    const email = payloadToSave['Driver details']['Email address'].trim().toLowerCase()
    const save = draftSaveChain.current.catch(() => undefined).then(async () => {
      if (!draftContactId.current || email !== draftContactEmail.current) {
        draftContactId.current = await findOrCreateContact(payloadToSave)
      }
      await saveIncompleteInquiry(id, payloadToSave, draftContactId.current)
      draftContactEmail.current = email
      lastSavedDraftPayload.current = JSON.stringify(payloadToSave)
    })
    draftSaveChain.current = save
    try {
      await save
      if (version === draftSaveVersion.current) setDraftSaveState('saved')
    } catch (error) {
      if (version === draftSaveVersion.current) {
        setDraftSaveState('error')
        setDraftSaveError(error instanceof Error ? error.message : 'Could not save your latest answers.')
      }
      throw error
    }
  }
  useEffect(() => {
    if (!draftRecord || !isPowerPagesRuntime() || draftRecord.contactId || draftContactRepairStarted.current) return
    const driver = draftRecord.payload['Driver details']
    if (!driver['Full name'].trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driver['Email address'])) return
    draftContactRepairStarted.current = true
    setDraftSaveState('saving')
    setDraftSaveError('')
    void (async () => {
      try {
        const contactId = await findOrCreateContact(draftRecord.payload)
        await saveIncompleteInquiry(draftRecord.id, draftRecord.payload, contactId)
        draftContactId.current = contactId
        draftContactEmail.current = driver['Email address'].trim().toLowerCase()
        setDraftSaveState('saved')
      } catch (error) {
        setDraftSaveState('error')
        setDraftSaveError(error instanceof Error ? error.message : 'Could not restore the linked contact.')
      }
    })()
  }, [draftRecord])
  const retryDraftSave = async () => {
    try {
      if (draftRecord && !catalog) {
        setCatalog(await getInsuranceCatalog(draftRecord.payload['Insurance product']))
        setDraftSaveState('idle')
        setDraftSaveError('')
        return
      }
      await persistDraft()
    } catch { /* The inline error state keeps the retry available. */ }
  }
  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (draftSaveState !== 'saving' && draftSaveState !== 'error') return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnIfUnsaved)
    return () => window.removeEventListener('beforeunload', warnIfUnsaved)
  }, [draftSaveState])
  const progress = step < 14 ? Math.round((step / 13) * 100) : 100
  // Resolve the make independently of the model. Requiring both here meant
  // the make disappeared as soon as the model field was blank, leaving the
  // model picker with an empty options array.
  const selectedMake = resolveVehicleMake(vehicleMakes, a.make)
  const modelOptions = useMemo(() => selectedMake?.models ?? [], [selectedMake])
  const selectedModel = selectedMake?.models.find((model) => model.name.trim().toLocaleLowerCase() === a.model.trim().toLocaleLowerCase())
  const vehicleValueInput = {
    vehicleMake: a.make.trim(),
    vehicleModel: a.model.trim(),
    vehicleSpecification: a.specification.trim(),
    vehicleYear: a.year.trim(),
  }
  const vehicleValueKey = JSON.stringify(vehicleValueInput)
  const currentVehicleValueRange = vehicleValueInputKey === vehicleValueKey ? vehicleValueRange : undefined
  const premiumCalculation = useMemo(
    () => catalog && currentVehicleValueRange ? calculateVehiclePremium(catalog, currentVehicleValueRange.average) : undefined,
    [catalog, currentVehicleValueRange],
  )
  useEffect(() => {
    if (!isPowerPagesRuntime() || Object.values(vehicleValueInput).some((value) => !value)) {
      setVehicleValueRange(undefined)
      setVehicleValueInputKey('')
      setVehicleValueLoading(false)
      setVehicleValueError('')
      return
    }

    const controller = new AbortController()
    let current = true
    setVehicleValueRange(undefined)
    setVehicleValueInputKey('')
    setVehicleValueLoading(true)
    setVehicleValueError('')
    void getVehicleValueRange(vehicleValueInput, controller.signal)
      .then((value) => { if (current) { setVehicleValueRange(value); setVehicleValueInputKey(vehicleValueKey) } })
      .catch((error) => {
        if (current && !controller.signal.aborted) setVehicleValueError(error instanceof Error ? error.message : 'Could not calculate the vehicle value.')
      })
      .finally(() => { if (current) setVehicleValueLoading(false) })
    return () => { current = false; controller.abort() }
  }, [a.make, a.model, a.specification, a.year, vehicleValueRetry])
  const validate = () => {
    const e: Record<string, string> = {}
    if (step === 0 && !a.product) e.product = 'Choose an insurance product to continue.'
    if (step === 1) {
      if (!a.fullName.trim()) e.fullName = 'Enter your full name.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) e.email = 'Enter a valid email address.'
      if (!/^\+?[0-9 ()-]{8,20}$/.test(a.mobile)) e.mobile = 'Enter a valid mobile number.'
      if (!a.age) e.age = 'Choose your age range.'
      if (!a.nationality) e.nationality = 'Choose your nationality.'
    }
    const fields: Record<number, keyof Answers> = { 2: 'condition', 3: 'year', 4: 'make', 5: 'model', 6: 'body', 7: 'engine', 8: 'usage', 9: 'registration', 10: 'licence', 11: 'specification', 12: 'claims' }
    const key = fields[step]
    if (key && !a[key]) e[key] = 'Choose an option to continue.'
    setErrors(e)
    return Object.keys(e).length === 0
  }
  const advance = async () => {
    if (creatingInquiry) return
    if (!validate()) return
    if (step === 0) {
      setErrors({})
      if (!isPowerPagesRuntime()) setCatalog({ productId: 'local-product', productName: a.product, planId: 'local-plan', planName: 'Comprehensive Insurance', basePremium: 0, formattedBasePremium: '', currency: '', vat: null })
      else if (!catalog && !catalogRequest.current) void loadCatalogForProduct(a.product).catch(() => undefined)
      setProductConfirmed(true)
      navigate('/quote/1')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (step === 14) {
      // File metadata in a recovered draft is only a filename and size; the
      // browser cannot recover those bytes after reload. Require reselection
      // before changing status or starting the upload flow.
      if (isPowerPagesRuntime() && draftRecord?.payload.Documents.length && !a.documents.length) {
        const message = 'Please reselect your saved documents before getting a quote. The browser cannot restore their file contents after you leave.'
        setErrors({ documents: message })
        setSubmissionError('')
        goToStep(13)
        return
      }
      const payload = createQuotePayload(a, step)
      setSubmissionError('')
      setCreatingInquiry(true)
      try {
        let inquiryId = submissionProgress.quoteId
        let quoteStatusUpdated = submissionProgress.quoteStatusUpdated
        let motorDataCreated = submissionProgress.motorDataCreated
        if (!isPowerPagesRuntime()) {
          setSubmissionStatus('Preparing your local inquiry')
          const inquiry = onCreateInquiry(payload, catalog ?? { productId: '', productName: a.product, planId: '', planName: 'Comprehensive Insurance', basePremium: 0, formattedBasePremium: '', currency: '', vat: null })
          navigate(`/inquiries/${inquiry.id}`)
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        // A resumed draft often opens on Documents or Review, so the make/model
        // lookup has not necessarily run. Load and resolve both IDs before the
        // inquiry status is advanced, preventing a half-completed record.
        setSubmissionStatus('Loading vehicle details')
        const availableMakes = vehicleMakesLoaded.current ? vehicleMakesRef.current : await loadVehicleMakes()
        const submissionVehicle = resolveVehicleSelection(availableMakes, a.make, a.model)
        if (!submissionVehicle) {
          throw new Error('We couldn’t match the saved vehicle make and model to the current vehicle list. Your inquiry is still saved as incomplete. Please retry loading the vehicle list or reselect the vehicle before submitting.')
        }
        let currentCatalog = catalog
        if (!currentCatalog) {
          setSubmissionStatus('Finishing plan lookup')
          currentCatalog = catalogRequest.current
            ? await catalogRequest.current
            : await getInsuranceCatalog(a.product)
          setCatalog(currentCatalog)
        }
        if (!currentVehicleValueRange) throw new Error('The latest vehicle value is not ready yet. Check the estimate in the vehicle panel and retry before submitting.')
        if (!currentCatalog) throw new Error('The selected insurance plan could not be loaded. Return to the product step and try again.')
        const currentPremiumCalculation = calculateVehiclePremium(currentCatalog, currentVehicleValueRange.average)
        if (!currentPremiumCalculation) throw new Error('The selected plan must include valid base premium and VAT percentages before the inquiry can be created.')
        let isSavedDraft = Boolean(draftRecord || draftIdRef.current)
        if (!isSavedDraft && !submissionProgress.quoteId) {
          const createdDraftId = await ensureDraft(payload)
          if (createdDraftId) {
            inquiryId = createdDraftId
            isSavedDraft = true
          }
        }
        if (isSavedDraft) {
          inquiryId = draftIdRef.current || submissionProgress.quoteId
          const currentStatus = await getInquiryStatusCode(inquiryId)
          if (currentStatus === 751820021) {
            setSubmissionStatus('Saving your latest answers')
            await persistDraft(payload)
            if (!submissionProgress.quoteId) {
              setSubmissionStatus('Completing your saved inquiry')
              await completeIncompleteInquiry(inquiryId, payload, currentCatalog, currentVehicleValueRange, currentPremiumCalculation)
              setSubmissionProgress({ quoteId: inquiryId, quoteStatusUpdated: false, motorDataCreated: false })
            }
          } else if (currentStatus === 751820006 || currentStatus === 751820007) {
            quoteStatusUpdated = currentStatus === 751820007 || submissionProgress.quoteStatusUpdated
            if (!submissionProgress.quoteId) {
              setSubmissionProgress({ quoteId: inquiryId, quoteStatusUpdated, motorDataCreated: false })
            }
          } else {
            throw new Error('This inquiry has changed status. Refresh the page before continuing.')
          }
        }
        if (!inquiryId) {
          setSubmissionStatus('Finding your contact record')
          const contactId = await findOrCreateContact(payload)
          setSubmissionStatus('Creating your inquiry')
          inquiryId = await createQuoteRecord(payload, currentCatalog, contactId, currentVehicleValueRange, currentPremiumCalculation)
          setSubmissionProgress({ quoteId: inquiryId, quoteStatusUpdated: false, motorDataCreated: false })
        }
        if (!motorDataCreated) {
          setSubmissionStatus('Saving vehicle details')
          await createMotorMasterData(payload, submissionVehicle.make.id, submissionVehicle.model.id)
          motorDataCreated = true
          setSubmissionProgress((current) => ({ ...current, quoteId: inquiryId, quoteStatusUpdated, motorDataCreated: true }))
        }
        if (!quoteStatusUpdated) {
          setSubmissionStatus('Matching your product')
          await markQuoteProductMatched(inquiryId)
          quoteStatusUpdated = true
          setSubmissionProgress((current) => ({ ...current, quoteId: inquiryId, quoteStatusUpdated: true }))
        }
        setSubmissionStatus(a.documents.length ? `Uploading documents (0/${a.documents.length})` : 'Finishing your inquiry')
        console.info('[Inquiry submission] Document upload starting', {
          inquiryId,
          fileCount: a.documents.length,
          totalBytes: a.documents.reduce((total, file) => total + file.size, 0),
        })
        try {
          await invokeDocumentFlow(inquiryId, a.documents)
        } catch (uploadError) {
          const detail = uploadError instanceof Error ? uploadError.message : 'The document flow returned an error.'
          console.error('[Inquiry submission] Inquiry saved; document flow response', { inquiryId, error: detail })
        }
        console.info('[Inquiry submission] Inquiry ready to view', { inquiryId })
        navigate(`/inquiries/${inquiryId}`, {
          state: { submissionCompleted: true },
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } catch (error) {
        setSubmissionError(error instanceof Error ? error.message : 'The inquiry could not be completed.')
      } finally {
        setCreatingInquiry(false)
      }
      return
    }
    setErrors({})
    goToStep(step + 1)
  }
  const back = () => {
    if (submissionRecovery) {
      if (step > 13) goToStep(13)
      else navigate('/inquiries')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (step <= 1) {
      if (draftRecord) navigate('/inquiries')
      else { setProductConfirmed(false); navigate(step === 0 ? '/' : '/quote/0') }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else goToStep(step - 1)
  }
  const leaveWizard = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate('/')
  }
  const title = step === 0 ? 'Choose your insurance product' : steps[step] ?? 'Your quote request'

  const renderStep = () => {
    switch (step) {
      case 0: return <><p className="step-description">Start with the cover you're looking for.</p><div className="product-grid">
        {[['Motor Insurance', <CarFront />], ['Medical Insurance', <ShieldCheck />], ['Travel Insurance', <Globe2 />], ['Home Insurance', <LockKeyhole />], ['Jet Ski Insurance', <Car />], ['Yacht Insurance', <Car />]].map(([name, icon]) => <button type="button" key={String(name)} className={`product-card ${a.product === name ? 'selected' : ''} ${name !== 'Motor Insurance' ? 'unavailable' : ''}`} disabled={name !== 'Motor Insurance'} onClick={() => setChoice('product')(String(name))}><span className="product-icon">{icon as React.ReactNode}</span><b>{String(name)}</b>{name === 'Motor Insurance' ? <small>For your car</small> : <small>Available in a later release</small>}</button>)}
      </div>{errors.product && <p className="form-alert" role="alert">{errors.product}</p>}</>
      case 1: return <><p className="step-description">Enter your personal details to begin your motor quote.</p><div className="form-grid">
        <Field label="Full name" error={errors.fullName}><input autoComplete="name" id="field-full-name" value={a.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={() => { void persistDraft(createQuotePayload(a, step)).catch(() => undefined) }} placeholder="e.g. Ali Ahmed" aria-invalid={!!errors.fullName} /></Field>
        <Field label="Email address" error={errors.email}><input autoComplete="email" id="field-email-address" type="email" value={a.email} onChange={(e) => set('email', e.target.value)} onBlur={() => { void persistDraft(createQuotePayload(a, step)).catch(() => undefined) }} placeholder="you@example.com" aria-invalid={!!errors.email} /></Field>
        <Field label="Mobile number" error={errors.mobile}><div className="phone-input"><span>+971</span><input autoComplete="tel-national" id="field-mobile-number" type="tel" value={a.mobile} onChange={(e) => set('mobile', e.target.value)} onBlur={() => { void persistDraft(createQuotePayload(a, step)).catch(() => undefined) }} placeholder="50 000 0000" aria-invalid={!!errors.mobile} /></div></Field>
        <Field label="Age range" error={errors.age}><CustomSelect id="field-age-range" value={a.age} onValueChange={setChoice('age')} placeholder="Select your age range" options={['18–24', '25–34', '35–44', '45–54', '55–64', '65+']} invalid={!!errors.age} /></Field>
        <Field label="Nationality" error={errors.nationality}><CustomSelect id="field-nationality" value={a.nationality} onValueChange={setChoice('nationality')} placeholder="Select your nationality" options={['United Arab Emirates', 'Jordan', 'India', 'Pakistan', 'United Kingdom', 'Other']} invalid={!!errors.nationality} /></Field>
      </div><p className="form-footnote"><LockKeyhole size={14} /> Your details are submitted to the insurer when you select Get quote.</p></>
      case 2: return <><p className="step-description">Is your vehicle brand new or previously registered?</p><div className="choice-grid two-col"><Choice label="Brand new" sub="Just purchased / never used" value="Brand new" current={a.condition} onClick={setChoice('condition')} icon={<CarFront />} /><Choice label="Used vehicle" sub="Previously owned / registered" value="Used vehicle" current={a.condition} onClick={setChoice('condition')} icon={<Car />} /></div>{errors.condition && <p className="form-alert" role="alert">{errors.condition}</p>}</>
      case 3: return <><p className="step-description">Select your vehicle's model year.</p><YearGrid value={a.year} onSelect={setChoice('year')} years={yearOptions} featured />{errors.year && <p className="form-alert" role="alert">{errors.year}</p>}</>
      case 4: return <><p className="step-description">Choose your car's manufacturer.</p>{vehicleMakesLoading || !vehicleCatalogReady ? <p className="inline-note" role="status"><LoaderCircle size={16} className="quote-spinner" /> Loading vehicle makes…</p> : vehicleMakesError ? <div className="form-alert" role="alert">{vehicleMakesError}<button type="button" className="text-button" onClick={() => void loadVehicleMakes().catch(() => undefined)}>Retry</button></div> : <MakeGrid makes={vehicleMakes} value={a.make} onSelect={(value) => { const next = { ...a, make: value, model: '' }; set('make', value); set('model', ''); setErrors((e) => ({ ...e, make: '' })); saveEditInBackground(next, Math.min(step + 1, 14)) }} />}{errors.make && <p className="form-alert" role="alert">{errors.make}</p>}</>
      case 5: return <><p className="step-description">Select the exact model of your {a.make || 'vehicle'}.</p>{!a.make ? <p className="inline-note"><Info size={16} /> Choose a vehicle make first.</p> : vehicleMakesLoading || !vehicleCatalogReady ? <p className="inline-note" role="status"><LoaderCircle size={16} className="quote-spinner" /> Loading vehicle models…</p> : vehicleMakesError ? <div className="form-alert" role="alert">{vehicleMakesError}<button type="button" className="text-button" onClick={() => void loadVehicleMakes().catch(() => undefined)}>Retry</button></div> : modelOptions.length ? <div className="option-grid model-grid">{modelOptions.map((model) => <Choice key={model.id} label={model.name} value={model.name} current={selectedModel?.name ?? a.model} onClick={setChoice('model')} className="compact-choice" />)}</div> : <div className="form-alert" role="alert">No models are available for {a.make}.<button type="button" className="text-button" onClick={() => { vehicleMakesLoaded.current = false; setVehicleCatalogReady(false); void loadVehicleMakes().catch(() => undefined) }}>Reload vehicle models</button></div>}{errors.model && <p className="form-alert" role="alert">{errors.model}</p>}</>
      case 6: return <><p className="step-description">Choose the body type that best describes your vehicle.</p><div className="choice-grid body-grid">{bodies.map((v) => <Choice key={v} label={v} value={v} current={a.body} onClick={setChoice('body')} icon={bodyArt(v)} />)}</div>{errors.body && <p className="form-alert" role="alert">{errors.body}</p>}</>
      case 7: return <><p className="step-description">How many cylinders does the engine have?</p><div className="choice-grid three-col">{['4 Cylinders', '6 Cylinders', '8 Cylinders'].map(v => <Choice key={v} label={v} value={v} current={a.engine} onClick={setChoice('engine')} icon={<SlidersHorizontal />} />)}</div>{errors.engine && <p className="form-alert" role="alert">{errors.engine}</p>}</>
      case 8: return <><p className="step-description">What is the primary use of your vehicle?</p><div className="choice-grid two-col"><Choice label="Private" sub="For personal use" value="Private" current={a.usage} onClick={setChoice('usage')} icon={<UserRound />} /><Choice label="Commercial" sub="For business use" value="Commercial" current={a.usage} onClick={setChoice('usage')} icon={<BriefcaseBusiness />} /></div>{errors.usage && <p className="form-alert" role="alert">{errors.usage}</p>}</>
      case 9: return <><p className="step-description">Select the year your vehicle was first registered.</p><YearGrid value={a.registration} onSelect={setChoice('registration')} years={registrationOptions} />{errors.registration && <p className="form-alert" role="alert">{errors.registration}</p>}</>
      case 10: return <><p className="step-description">How long have you held a UAE driving licence?</p><div className="choice-grid two-col"><Choice label="More than 12 months" value="More than 12 months" current={a.licence} onClick={setChoice('licence')} icon={<KeyRound />} /><Choice label="Less than 12 months" value="Less than 12 months" current={a.licence} onClick={setChoice('licence')} icon={<KeyRound />} /></div>{errors.licence && <p className="form-alert" role="alert">{errors.licence}</p>}</>
      case 11: return <><p className="step-description">Choose your vehicle specification.</p><div className="choice-grid two-col"><Choice label="GCC specification" sub="Manufactured for Gulf markets" value="GCC" current={a.specification} onClick={setChoice('specification')} icon={<Globe2 />} /><Choice label="Non-GCC specification" sub="Imported from another market" value="Non-GCC" current={a.specification} onClick={setChoice('specification')} icon={<Globe2 />} /></div>{errors.specification && <p className="form-alert" role="alert">{errors.specification}</p>}</>
      case 12: return <><p className="step-description">Have you made a motor insurance claim before?</p><div className="choice-grid three-col">{['Never', 'Within 12 months', '12 Months+'].map(v => <Choice key={v} label={v} value={v} current={a.claims} onClick={setChoice('claims')} icon={<ShieldCheck />} />)}</div>{errors.claims && <p className="form-alert" role="alert">{errors.claims}</p>}</>
      case 13: return <><p className="step-description">Add documents to help complete your quote request.</p>{draftRecord?.payload.Documents.length && !a.documents.length ? <p className="inline-note"><Info size={16} /> Previously selected files are listed in your saved inquiry, but browsers don’t retain file contents after you leave. Please select them again to upload.</p> : null}{errors.documents && <p className="form-alert" role="alert">{errors.documents}</p>}<div className="document-examples"><article className="document-example"><img src={licenceExample} alt="Illustration of a UAE driving licence" /><b>Driving licence</b><small>Front and back, if available</small></article><article className="document-example"><img src={registrationExample} alt="Illustration of a vehicle registration card" /><b>Vehicle registration</b><small>Mulkiya / registration card</small></article></div><DocumentDrop files={a.documents} onChange={(files) => { const next = { ...a, documents: files }; set('documents', files); setErrors((current) => ({ ...current, documents: '' })); saveEditInBackground(next, step) }} /><p className="inline-note"><Info size={16} /> Selected documents will be sent with your inquiry.</p></>
      case 14: return <><p className="step-description">{submissionRecovery ? 'Your saved inquiry is ready to finish. Review its details before continuing.' : 'Review the details before submitting your quote request.'}</p><div className="review-card"><div className="review-heading"><h3>Your details</h3>{!submissionRecovery && <button type="button" className="text-button" onClick={() => goToStep(1)}>Edit details</button>}</div><div className="review-row"><span>Name</span><b>{a.fullName}</b></div><div className="review-row"><span>Email</span><b>{a.email}</b></div><div className="review-row"><span>Mobile</span><b>+971 {a.mobile}</b></div><div className="review-row"><span>Vehicle</span><b>{a.year} {a.make} {a.model}</b></div><div className="review-row"><span>Plan</span><b>{catalog?.planName || 'Comprehensive Insurance'}</b></div>{catalog?.vat != null && <div className="review-row"><span>VAT</span><b>{catalog.vat.toLocaleString('en-US', { maximumFractionDigits: 2 })}%</b></div>}<div className="review-row"><span>Documents</span><b>{a.documents.length ? `${a.documents.length} selected` : draftRecord?.payload.Documents.length ? 'Reselect saved files to upload' : 'None attached'}</b></div></div>{!submissionRecovery && <div className="form-grid final-fields"><Field label="Preferred contact"><CustomSelect id="field-preferred-contact" value={a.contact} onValueChange={setChoice('contact')} placeholder="Choose contact method" options={['Email', 'Phone']} /></Field><Field label="Note (optional)"><textarea id="field-note-optional" value={a.notes} onChange={(e) => set('notes', e.target.value)} onBlur={() => { void persistDraft(createQuotePayload(a, step)).catch(() => undefined) }} placeholder="Anything else you'd like us to know?" rows={3} /></Field></div>}{submissionError && <p className="form-alert" role="alert">{submissionError}</p>}</>
      default: return null
    }
  }

  return <div className="app-shell"><SiteHeader compact onHomeClick={(event) => { void leaveWizard(event) }} />
    <div className="mobile-progress"><button type="button" className="mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu}><Menu size={19} /> Journey</button><span>Step {Math.min(step + 1, 14)} of 14</span><div className="mobile-progress-track"><i style={{ width: `${progress}%` }} /></div></div>
    <main className="quote-layout">
      <nav className={`journey-nav ${mobileMenu ? 'open' : ''}`} aria-label="Quote journey">{groups.map((g, i) => { const active = step >= g.first && step <= g.last || (step === 14 && i === 4); const done = step > g.last; return <div className={`journey-item ${active ? 'active' : ''} ${done ? 'complete' : ''}`} key={g.label}><span className="journey-marker">{done ? <Check size={15} /> : i === 0 ? <UserRound size={15} /> : i === 1 ? <Car size={15} /> : i === 2 ? <ShieldCheck size={15} /> : i === 3 ? <FileText size={15} /> : <FileCheck2 size={15} />}</span><span><b>{g.label}</b><small>{done ? 'Completed' : active ? (i === 4 ? 'Current step' : `${steps[step]}`) : 'Upcoming'}</small></span></div> })}</nav>
      <section className="form-panel" aria-labelledby="step-title"><div className="form-panel-top"><span className="eyebrow">MOTOR INSURANCE</span><span className="today-date">{draftRecord ? 'Continue your saved inquiry' : 'UAE · ' + new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span></div>
        {isPowerPagesRuntime() && !submissionRecovery && (draftId || draftSaveState !== 'idle') && <div className={`draft-save-indicator ${draftSaveState}`} role={draftSaveState === 'error' ? 'alert' : 'status'} aria-live="polite"><span className="draft-save-dot" /><span>{draftSaveState === 'saving' ? 'Saving your progress…' : draftSaveState === 'saved' ? 'Progress saved securely' : draftSaveState === 'error' ? draftSaveError || 'Progress could not be saved' : 'Your progress will be saved'}</span>{draftSaveState === 'error' && <button type="button" onClick={() => void retryDraftSave()}>Retry save</button>}</div>}
        <div className="progress-meta"><span className="progress-step-count"><b>{String(Math.min(step + 1, 14)).padStart(2, '0')}</b><i>/ 14</i></span><span className="progress-stage-name">{groups.find((group) => step >= group.first && step <= group.last)?.label ?? 'Quote'}</span><span className="progress-completion">{progress}% complete</span></div><div className="progress-track" role="progressbar" aria-label="Quote journey progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
        {submissionRecovery && <p className="inline-note" role="status"><Info size={16} /> This inquiry was saved, but its submission did not finish. Complete this final step to continue.</p>}
        {step === 14 ? <div className="quote-form-heading"><span className="eyebrow">{submissionRecovery ? 'FINISH SAVED INQUIRY' : 'FINAL STEP'}</span><h1 id="step-title">Your quote request</h1></div> : <div className="quote-form-heading"><h1 id="step-title">{title}</h1></div>}
        {productLoadError && <div className="form-alert" role="alert">{productLoadError}<button type="button" className="text-button" onClick={() => void loadCatalogForProduct(a.product).catch(() => undefined)}>Retry</button></div>}
        <div className="step-content" key={step}>{renderStep()}</div>
        <div className="form-actions"><button type="button" className="button button-back" onClick={back}><ArrowLeft size={16} /> {draftRecord && step <= 1 ? 'Back to inquiries' : step === 0 ? 'Home' : 'Back'}</button>
          {step === 14 ? <button type="button" className="button button-primary" onClick={advance} disabled={creatingInquiry}>{creatingInquiry ? (submissionStatus || 'Submitting inquiry') : 'Get quote'} {creatingInquiry ? <LoaderCircle size={17} className="quote-spinner" /> : <ArrowRight size={17} />}</button> : <button type="button" className="button button-primary" onClick={advance} disabled={creatingInquiry}>Continue {creatingInquiry ? <LoaderCircle size={17} className="quote-spinner" /> : <ArrowRight size={17} />}</button>}
        </div><p className="form-privacy"><LockKeyhole size={13} /> {submissionRecovery ? 'Your saved inquiry details are read-only while we finish submission.' : draftRecord || draftId ? 'Your answers are saved as an incomplete inquiry until you select Get quote.' : 'Your answers are saved once your name and email are entered.'}</p>
        {creatingInquiry && <div className="quote-submit-loading" role="status" aria-live="polite"><span><LoaderCircle size={23} className="quote-spinner" /></span><b>{submissionStatus || 'Preparing your inquiry'}</b><small>Saving your quote request and selected documents…</small></div>}
      </section>
      <aside className={`summary-panel ${productConfirmed && a.product === 'Motor Insurance' ? 'summary-panel-confirmed' : ''}`}>
        <div className="summary-landscape" aria-hidden="true"><img src={skylineAsset} alt="" /></div>
        <div className="summary-views">
        <div className={`summary-view summary-view-empty ${productConfirmed ? 'summary-view-hidden' : 'summary-view-visible'}`} aria-hidden={productConfirmed}>
          <div className="summary-empty-state">
            <div className="summary-empty-heading">
              <span className="summary-empty-icon"><ShieldCheck size={23} /></span>
              <span className="eyebrow">A SIMPLE, GUIDED JOURNEY</span>
              <h2>Choose a cover.<br />We’ll guide you from there.</h2>
              <p>Your quote takes shape one clear step at a time. Here’s what to expect.</p>
            </div>
            <div className="summary-journey" aria-label="What to expect">
              <div className="summary-journey-item"><span className="summary-journey-icon"><FileCheck2 size={17} /></span><span className="summary-journey-copy"><small>FIRST</small><b>Choose a product</b><em>Start with the cover you need</em></span><span className="summary-journey-number">01</span></div>
              <div className="summary-journey-item"><span className="summary-journey-icon"><UserRound size={17} /></span><span className="summary-journey-copy"><small>NEXT</small><b>Share a few details</b><em>We’ll guide you through each step</em></span><span className="summary-journey-number">02</span></div>
              <div className="summary-journey-item"><span className="summary-journey-icon"><BadgeCheck size={17} /></span><span className="summary-journey-copy"><small>THEN</small><b>Review your request</b><em>Check your answers before continuing</em></span><span className="summary-journey-number">03</span></div>
            </div>
            <div className="summary-empty-foot"><span className="summary-empty-line" /><span>YOUR COVER · YOUR DETAILS · YOUR REVIEW</span></div>
          </div>
        </div>
        <div className={`summary-view summary-view-live ${productConfirmed ? 'summary-view-visible' : 'summary-view-hidden'}`} aria-hidden={!productConfirmed}>
          <div className="summary-head"><span className="eyebrow">YOUR QUOTE SO FAR</span><h2>{a.make ? `${titleCaseMake(a.make)} ${a.model}` : 'Your vehicle'}</h2><p>{[a.year, a.usage, a.specification].filter(Boolean).join(' · ') || 'Your selections will appear here'}</p></div>
          <div className="summary-vehicle"><VehicleGlyph body={a.body} /><span>{a.body || 'Vehicle details'}</span></div>
          {a.make && a.model && a.year && a.specification && <section className={`vehicle-value-result ${vehicleValueLoading ? 'is-loading' : ''} ${vehicleValueError ? 'has-error' : ''}`} aria-live="polite" aria-busy={vehicleValueLoading}>
            <span className="vehicle-value-result-label"><CircleDollarSign size={15} /> Estimated vehicle value</span>
            {vehicleValueLoading ? <b className="vehicle-value-result-state"><LoaderCircle size={15} className="quote-spinner" /> Calculating estimate…</b>
              : currentVehicleValueRange ? <b className="vehicle-value-result-average">AED {currentVehicleValueRange.average.toLocaleString('en-AE', { maximumFractionDigits: 2 })}</b>
                : vehicleValueError ? <><span className="vehicle-value-result-error">{vehicleValueError}</span><button type="button" className="vehicle-value-retry" onClick={() => setVehicleValueRetry((count) => count + 1)}><RefreshCw size={13} /> Retry estimate</button></>
                  : <span className="vehicle-value-result-state">Estimate appears when all vehicle details are selected.</span>}
            {!vehicleValueLoading && premiumCalculation && catalog?.vat !== null && catalog?.vat !== undefined && <div className="vehicle-premium-preview" aria-label="Estimated premium breakdown">
              <div className="vehicle-premium-preview-heading"><span>Premium estimate</span><small>Based on selected plan</small></div>
              <div className="vehicle-premium-preview-line"><span>Base premium</span><b>{premiumCalculation.basePremiumPercentage}%</b></div>
              <div className="vehicle-premium-preview-line"><span>Gross premium</span><b>AED {premiumCalculation.grossPremium.toLocaleString('en-AE', { maximumFractionDigits: 4 })}</b></div>
              <div className="vehicle-premium-preview-line"><span>VAT ({catalog.vat}%)</span><b>AED {(premiumCalculation.grossPremium * catalog.vat / 100).toLocaleString('en-AE', { maximumFractionDigits: 2 })}</b></div>
              <div className="vehicle-premium-preview-line vehicle-premium-preview-total"><span>Estimated total</span><b>AED {premiumCalculation.totalAmountCharge.toLocaleString('en-AE')}</b></div>
            </div>}
          </section>}
          <div className="summary-list">
            {[{ icon: <Car />, label: a.make ? `${titleCaseMake(a.make)} ${a.model || ''}`.trim() : 'Vehicle', sub: a.year ? `${a.year}${a.body ? ` · ${a.body}` : ''}` : 'Make and model' },{ icon: <SlidersHorizontal />, label: a.usage || 'Vehicle use', sub: a.specification ? `${a.specification} specification` : 'Usage and specification' },{ icon: <ShieldCheck />, label: a.claims || 'Claims history', sub: a.licence || 'Driving history' }].map((x) => <div className="summary-item" key={x.label}><span className="summary-item-icon">{x.icon}</span><span><b>{x.label}</b><small>{x.sub}</small></span><ChevronDown size={15} className="summary-chevron" /></div>)}
          </div>
        </div>
        </div>
      </aside>
    </main>
  </div>
}

function InquiryGridRoute({ inquiries }: { inquiries: InquiryRecord[] }) {
  const live = isPowerPagesRuntime()
  const [records, setRecords] = useState(inquiries)
  const [loading, setLoading] = useState(live)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!live) return
    setLoading(true); setError('')
    try { setRecords(await getDataverseInquiries()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load inquiries.') }
    finally { setLoading(false) }
  }, [live])
  useEffect(() => { void load() }, [load])
  return <div className="app-shell"><SiteHeader compact /><InquiryGrid inquiries={live ? records : inquiries} loading={loading} error={error} onRetry={() => void load()} /></div>
}

function InquiryDetailRoute({ inquiries, onCreateInquiry }: { inquiries: InquiryRecord[]; onCreateInquiry: (payload: QuotePayload, catalog: InsuranceCatalog) => InquiryRecord }) {
  const live = isPowerPagesRuntime()
  const location = useLocation()
  const navigationState = location.state as { submissionCompleted?: boolean } | null
  const submissionCompleted = Boolean(navigationState?.submissionCompleted)
  const { inquiryId } = useParams()
  const [record, setRecord] = useState<InquiryRecord>()
  const [loading, setLoading] = useState(live)
  const [error, setError] = useState('')
  const [documents, setDocuments] = useState<SharePointInquiryDocument[]>()
  const [documentsLoading, setDocumentsLoading] = useState(live)
  const [documentsError, setDocumentsError] = useState('')
  const [emails, setEmails] = useState<InquiryEmailActivity[]>()
  const [emailsLoading, setEmailsLoading] = useState(live)
  const [emailsError, setEmailsError] = useState('')
  const loadDocuments = useCallback(async () => {
    if (!live || !inquiryId) return
    setDocumentsLoading(true); setDocumentsError('')
    try { setDocuments(await getInquiryDocuments(inquiryId)) }
    catch (reason) { setDocumentsError(reason instanceof Error ? reason.message : 'Could not load the saved documents.') }
    finally { setDocumentsLoading(false) }
  }, [live, inquiryId])
  const loadEmails = useCallback(async () => {
    if (!live || !inquiryId) return
    setEmailsLoading(true); setEmailsError('')
    try { setEmails(await getInquiryEmails(inquiryId)) }
    catch (reason) { setEmailsError(reason instanceof Error ? reason.message : 'Could not load inquiry communications.') }
    finally { setEmailsLoading(false) }
  }, [live, inquiryId])
  const load = useCallback(async () => {
    if (!live || !inquiryId) return
    setLoading(true); setError('')
    setDocuments(undefined)
    setEmails(undefined)
    try {
      const fetchedRecord = await getDataverseInquiry(inquiryId)
      // Power Pages may briefly return a cached pre-submit status after the
      // PATCH has succeeded. This navigation comes only after every required
      // submit operation (including the document-flow response) has returned,
      // so keep the destination read-only and show the committed status.
      const nextRecord = submissionCompleted && fetchedRecord
        ? { ...fetchedRecord, status: 'Product Match', statusCode: 751820007 }
        : fetchedRecord
      setRecord(nextRecord)
      if (nextRecord && !isIncompleteInquiryStatus(nextRecord.status) && !isSubmissionRecoveryCandidate(nextRecord)) { void loadDocuments(); void loadEmails() }
      else if (nextRecord) { setDocuments([]); setDocumentsLoading(false); setEmails([]); setEmailsLoading(false) }
      else { setDocuments([]); setDocumentsLoading(false); setEmails([]); setEmailsLoading(false) }
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load this inquiry.') }
    finally { setLoading(false) }
  }, [live, inquiryId, loadDocuments, loadEmails, submissionCompleted])
  useEffect(() => { void load() }, [load])
  const canResumeSubmission = record ? isSubmissionRecoveryCandidate(record) : false
  if (!submissionCompleted && live && !loading && record && (isIncompleteInquiryStatus(record.status) || canResumeSubmission)) {
    return <QuoteWizard key={record.id} onCreateInquiry={onCreateInquiry} draftRecord={record} submissionRecovery={Boolean(canResumeSubmission && !isIncompleteInquiryStatus(record.status))} />
  }
  const selected = live ? (record ? [record] : []) : inquiries
  return <div className="app-shell"><SiteHeader compact /><InquiryDetailPage inquiries={selected} loading={loading} error={error} onRetry={() => void load()} documents={documents} documentsLoading={documentsLoading} documentsError={documentsError} onRetryDocuments={() => void loadDocuments()} emails={emails} emailsLoading={emailsLoading} emailsError={emailsError} onRetryEmails={() => void loadEmails()} /></div>
}

function App() {
  const [inquiries, setInquiries] = useState<InquiryRecord[]>(demoInquiries)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const logPortalUser = () => {
      if (portalUserContextLogged) return
      const portal = (window as Window & {
        Microsoft?: { Dynamic365?: { Portal?: { User?: Record<string, unknown> } } }
      }).Microsoft?.Dynamic365?.Portal
      const user = portal?.User
      const userName = String(user?.userName ?? '').trim()
      const contactId = String(user?.contactId ?? '').trim()
      const email = String(user?.email ?? '').trim()
      if (user && (userName || contactId || email)) {
        portalUserContextLogged = true
        console.info('Power Pages logged-in user:', {
          isAuthenticated: true,
          userName,
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          email,
          contactId,
        })
        return
      }
      if (++attempts < 12) timer = setTimeout(logPortalUser, 250)
      else {
        portalUserContextLogged = true
        console.info('Power Pages user context:', {
          isAuthenticated: false,
          message: 'Portal.User has no username, email, or contact ID. The current portal session is anonymous or its identity is not exposed to this SPA.',
          userName,
          firstName: user?.firstName ?? '',
          lastName: user?.lastName ?? '',
          email,
          contactId,
        })
      }
    }
    logPortalUser()
    return () => { if (timer) clearTimeout(timer) }
  }, [])
  const createInquiry = (payload: QuotePayload, catalog: InsuranceCatalog) => {
    const nextNumber = 1008 + inquiries.length
    const inquiry = buildInquiry(`INQ-${nextNumber}`, payload, catalog)
    setInquiries((current) => [inquiry, ...current])
    return inquiry
  }

  return <HashRouter><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/quote/:step" element={<QuoteWizard onCreateInquiry={createInquiry} />} />
    <Route path="/inquiries" element={<InquiryGridRoute inquiries={inquiries} />} />
    <Route path="/inquiries/:inquiryId" element={<InquiryDetailRoute inquiries={inquiries} onCreateInquiry={createInquiry} />} />
    <Route path="*" element={<Landing />} />
  </Routes></HashRouter>
}

export default App
