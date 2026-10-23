import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, BadgeCheck, CarFront, ChevronDown, ChevronRight, ExternalLink, RefreshCw,
  CircleDollarSign, FileArchive, FileCode, FileImage, FileSpreadsheet, FileText, Inbox, Info, Mail, Music2, Paperclip, Search, ShieldCheck, UserRound, Video,
} from 'lucide-react'
import { isSubmissionRecoveryCandidate } from './inquiryData'
import type { InquiryRecord } from './inquiryData'
import type { InquiryEmailActivity, SharePointInquiryDocument } from './powerPagesApi'

const isLivePortal = () => window.location.hostname.toLowerCase().endsWith('powerappsportals.com') || window.location.hostname.toLowerCase().endsWith('powerpages.microsoft.com')

function premiumMoney(value: number) {
  return `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function premiumPercent(value: number) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

function premiumPercentWhole(value: number) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`
}

function DocumentFileIcon({ name, type = '' }: { name: string; type?: string }) {
  const source = `${name} ${type}`.toLowerCase()
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  let kind = 'generic'
  let Icon = FileText
  if (extension === 'pdf' || /\bpdf\b|application\/pdf/.test(source)) kind = 'pdf'
  else if (/\.(xlsx?|csv|ods)\b|spreadsheet|excel/.test(source)) { kind = 'spreadsheet'; Icon = FileSpreadsheet }
  else if (/\.(png|jpe?g|gif|webp|svg|bmp|tiff?)\b|image\//.test(source)) { kind = 'image'; Icon = FileImage }
  else if (/\.(zip|rar|7z|tar|gz)\b|compressed|archive/.test(source)) { kind = 'archive'; Icon = FileArchive }
  else if (/\.(mp3|wav|m4a|aac|ogg)\b|audio\//.test(source)) { kind = 'audio'; Icon = Music2 }
  else if (/\.(mp4|mov|avi|mkv|webm)\b|video\//.test(source)) { kind = 'video'; Icon = Video }
  else if (/\.(js|ts|tsx|jsx|json|html|css|xml|md)\b|text\/|javascript/.test(source)) { kind = 'code'; Icon = FileCode }
  else if (/\.(docx?|rtf|odt)\b|wordprocessingml/.test(source)) kind = 'word'
  else if (/\.(pptx?|odp)\b|presentationml/.test(source)) kind = 'presentation'
  return <span className={`document-type-icon document-type-icon-${kind}`} aria-hidden="true"><Icon size={20} />{kind === 'pdf' && <small>PDF</small>}</span>
}

function InquiryStatus({ status }: { status: string }) {
  const className = status.toLowerCase().replace(/[^a-z]+/g, '-')
  return <span className={`inquiry-status ${className}`}>{status}</span>
}

function InquiryLoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`inquiry-loading-state ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
    <span className="inquiry-loading-mark" aria-hidden="true">
      <i className="inquiry-loading-halo" />
      <svg viewBox="0 0 64 40" fill="none"><path className="inquiry-heartbeat-trace" d="M3 21h13l6-12 10 24 8-17 5 5h16" /></svg>
      <i className="inquiry-loading-core" />
    </span>
    <span className="inquiry-loading-copy">{!compact && <small>SECURE INQUIRY</small>}<b>{label}</b>{!compact && <span>Getting the latest saved details</span>}</span>
  </div>
}

function PremiumBreakdownHeader({ premium, available, status }: { premium: InquiryRecord['premiumBreakdown']; available: boolean; status: string }) {
  const [expanded, setExpanded] = useState(true)
  const statusKey = status.trim().toLowerCase()
  const showEstimateNote = available && !['751820009', '751820016', 'awaiting review', 'quote sent to customer'].includes(statusKey)
  const rateItems = [
    { label: 'Base premium percentage', value: premium.basePremium == null ? '—' : premiumPercentWhole(premium.basePremium) },
    { label: 'Additional premium percentage', value: premium.additionalPremiumPercentage == null ? '—' : premiumPercent(premium.additionalPremiumPercentage) },
    { label: 'Total premium percentage', value: premium.totalPremiumPercentage == null ? '—' : premiumPercent(premium.totalPremiumPercentage) },
  ]
  const amountItems = [
    { label: 'Gross premium', value: premium.grossPremium == null ? '—' : premiumMoney(premium.grossPremium) },
    { label: 'VAT', value: premium.vat == null ? '—' : premiumPercent(premium.vat) },
    { label: 'Total premium to be charged', value: premium.totalPremiumToBeCharged == null ? '—' : premiumMoney(premium.totalPremiumToBeCharged) },
  ]

  return <>
    <section className={`premium-summary ${available ? '' : 'pending'}`} aria-label="Premium breakdown">
      <div className="premium-summary-top">
        <div className="premium-summary-total">
          <h2 className="premium-summary-kicker"><CircleDollarSign size={18} /> Premium breakdown</h2>
          <span className="premium-summary-total-label">Total premium to be charged</span>
          <strong>{available ? premiumMoney(premium.totalPremiumToBeCharged!) : 'Awaiting premium details'}</strong>
        </div>
        {available && <button type="button" className="premium-summary-toggle" aria-expanded={expanded} aria-controls="premium-summary-details" aria-label={expanded ? 'Hide premium breakdown details' : 'Show premium breakdown details'} title={expanded ? 'Hide breakdown details' : 'Show breakdown details'} onClick={() => setExpanded((value) => !value)}><ChevronDown size={17} /></button>}
      </div>
      {available && expanded && <div className="premium-summary-details" id="premium-summary-details">
        <div className="premium-rate-equation" role="group" aria-label={`${rateItems[0].label}: ${rateItems[0].value}, plus ${rateItems[1].label}: ${rateItems[1].value}, equals ${rateItems[2].label}: ${rateItems[2].value}`}>
          {rateItems.map((item, index) => <div className={`premium-rate-item ${index === rateItems.length - 1 ? 'total' : ''}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
        </div>
        <dl className="premium-amount-summary">{amountItems.map((item) => <div className={item.label === 'Total premium to be charged' ? 'total' : ''} key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      </div>}
      {showEstimateNote && <aside className="premium-estimate-note"><Info size={16} aria-hidden="true" /><p>The premium displayed is an estimate based on the information provided. The final premium will be determined after our AI-powered underwriting evaluation and may vary depending on the assessment results.</p></aside>}
    </section>
  </>
}

export function InquiryGrid({ inquiries, loading = false, error = '', onRetry }: { inquiries: InquiryRecord[]; loading?: boolean; error?: string; onRetry?: () => void }) {
  const [search, setSearch] = useState('')
  const scoped = useMemo(() => inquiries.filter((inquiry) => {
    const haystack = `${inquiry.id} ${inquiry.title} ${inquiry.payload['Driver details']['Email address']} ${inquiry.payload['Vehicle make']} ${inquiry.payload['Vehicle model']}`.toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  }), [inquiries, search])

  return <main className="inquiries-page">
    <div className="inquiries-titlebar">
      <div><span className="eyebrow">MOTOR INSURANCE · WORKSPACE</span><h1>Inquiries</h1><p>Review quote requests and the details behind each one.</p></div>
      <Link className="button button-primary" to="/quote/0">Create inquiry <ArrowRight size={16} /></Link>
    </div>
    <section className="inquiry-register" aria-label="Inquiry register">
      <div className="inquiry-register-toolbar"><label className="inquiry-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inquiries" aria-label="Search inquiries" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search">×</button>}</label>{onRetry && <button type="button" className="button button-outline inquiry-list-refresh" onClick={onRetry}><RefreshCw size={15} /> Refresh</button>}</div>
      {loading ? <div className="inquiry-card-state"><InquiryLoadingState label="Loading inquiries" compact /></div>
        : error ? <div className="inquiry-card-state"><span className="inquiry-card-state-icon"><Inbox size={19} /></span><b>Could not load inquiries</b><small>{error}</small>{onRetry && <button type="button" className="button button-outline" onClick={onRetry}>Try again</button>}</div>
          : scoped.length ? <div className="inquiry-card-grid">{scoped.map((inquiry) => {
            const driver = inquiry.payload['Driver details']
            const vehicle = [inquiry.payload['Model year'], inquiry.payload['Vehicle make'], inquiry.payload['Vehicle model']].filter(Boolean).join(' ')
            return <Link to={`/inquiries/${inquiry.id}`} className="inquiry-card" key={inquiry.id} aria-label={`Open ${inquiry.title}`}>
              <div className="inquiry-card-top"><span className="inquiry-card-icon"><ShieldCheck size={20} /></span><InquiryStatus status={inquiry.status} /><ArrowRight className="inquiry-card-arrow" size={18} aria-hidden="true" /></div>
              <span className="inquiry-card-product">{inquiry.payload['Insurance product'] || 'Motor Insurance'}</span>
              <h2>{inquiry.title}</h2>
              <div className="inquiry-card-customer"><UserRound size={15} /><span>{driver['Full name'] || driver['Email address'] || 'Customer details unavailable'}</span></div>
              <div className="inquiry-card-vehicle"><CarFront size={16} /><span>{vehicle || inquiry.type}</span></div>
              <div className="inquiry-card-plan"><span>Selected plan</span><b>{inquiry.plan}</b></div>
              <div className="inquiry-card-footer"><span><small>Total premium to be charged</small><b>{inquiry.premiumBreakdown.totalPremiumToBeCharged == null ? '—' : premiumMoney(inquiry.premiumBreakdown.totalPremiumToBeCharged)}</b></span><span><small>Updated</small><b>{inquiry.updatedAt}</b></span></div>
              <div className={`inquiry-card-action ${inquiry.status === 'Incomplete Inquiry' || isSubmissionRecoveryCandidate(inquiry) ? 'inquiry-card-action-complete' : ''}`}><FileText size={15} /><span>{inquiry.status === 'Incomplete Inquiry' ? 'Complete inquiry' : isSubmissionRecoveryCandidate(inquiry) ? 'Finish inquiry' : 'View inquiry'}</span><ArrowRight size={16} /></div>
            </Link>
          })}</div>
            : <div className="inquiry-card-state"><span className="inquiry-card-state-icon"><Search size={19} /></span><b>No inquiries match this view</b><small>Try a different category or search term.</small></div>}
      {!loading && !error && <div className="inquiry-register-foot"><span>Showing {scoped.length} of {inquiries.length} inquiries</span>{!isLivePortal() && <span className="demo-data-note"><i /> Sample data · local proof of concept</span>}</div>}
    </section>
  </main>
}

function FieldValue({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) {
  return <div className={`detail-field ${wide ? 'wide' : ''}`}><span>{label}</span><b>{value?.trim() || '—'}</b></div>
}

function DetailSection({ id, icon, title, description, children }: { id: string; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="inquiry-detail-card" id={id}><header className="detail-section-heading"><span className="detail-section-icon">{icon}</span><span><h2>{title}</h2><p>{description}</p></span></header>{children}</section>
}

export function InquiryDetailPage({ inquiries, loading = false, error = '', onRetry, documents, documentsLoading = false, documentsError = '', onRetryDocuments, emails, emailsLoading = false, emailsError = '', onRetryEmails }: { inquiries: InquiryRecord[]; loading?: boolean; error?: string; onRetry?: () => void; documents?: SharePointInquiryDocument[]; documentsLoading?: boolean; documentsError?: string; onRetryDocuments?: () => void; emails?: InquiryEmailActivity[]; emailsLoading?: boolean; emailsError?: string; onRetryEmails?: () => void }) {
  const { inquiryId } = useParams()
  const inquiry = inquiries.find((record) => record.id === inquiryId)

  if (loading) return <main className="inquiry-loading-page"><InquiryLoadingState label="Loading inquiry details" /></main>
  if (error) return <main className="inquiry-not-found"><span className="detail-section-icon"><FileText size={20} /></span><span className="eyebrow">INQUIRY UNAVAILABLE</span><h1>We couldn’t load this record.</h1><p>{error}</p>{onRetry && <button type="button" className="button button-primary" onClick={onRetry}>Retry</button>} <Link className="button button-outline" to="/inquiries"><ArrowLeft size={16} /> Back to inquiries</Link></main>

  if (!inquiry) return <main className="inquiry-not-found"><span className="detail-section-icon"><FileText size={20} /></span><span className="eyebrow">INQUIRY NOT FOUND</span><h1>This record isn’t available.</h1><p>It may have been removed from this local session.</p><Link className="button button-primary" to="/inquiries"><ArrowLeft size={16} /> Back to inquiries</Link></main>

  const driver = inquiry.payload['Driver details']
  const premium = inquiry.premiumBreakdown
  const hasCompletePremiumBreakdown = Object.values(premium).every((value) => value !== null)
  const isMotorInsurance = inquiry.payload['Insurance product'].trim().toLowerCase().startsWith('motor insurance')
  const vehicleLabel = [inquiry.payload['Model year'], inquiry.payload['Vehicle make'], inquiry.payload['Vehicle model']].filter(Boolean).join(' ')

  return <main className="inquiry-detail-page">
    <div className="detail-toolbar"><div className="detail-breadcrumb"><Link to="/inquiries">Inquiries</Link><ChevronRight size={14} /><span>Request details</span></div><Link className="button button-outline detail-back" to="/inquiries"><ArrowLeft size={15} /> Back to inquiries</Link></div>
    <header className="inquiry-detail-titlebar"><div className="inquiry-detail-titlecopy"><span className="eyebrow">INQUIRY</span><h1>{inquiry.title}</h1><p>{inquiry.payload['Insurance product']} <span>·</span> {inquiry.type}</p><div className="detail-title-actions"><InquiryStatus status={inquiry.status} />{isLivePortal() && onRetry && <button type="button" className="button button-outline detail-refresh" onClick={onRetry} aria-label="Refresh inquiry" title="Refresh inquiry"><RefreshCw size={15} /> Refresh</button>}</div></div><PremiumBreakdownHeader premium={premium} available={hasCompletePremiumBreakdown} status={inquiry.status} /></header>
    <div className="inquiry-detail-layout">
      <div className="inquiry-detail-main">
        {isMotorInsurance && <DetailSection id="customer" icon={<UserRound size={17} />} title="Driver Information" description="Contact and driving experience provided with this inquiry.">
          <div className="detail-fields"><FieldValue label="Full name" value={driver['Full name']} /><FieldValue label="Age range" value={driver['Age range']} /><FieldValue label="Email address" value={driver['Email address']} /><FieldValue label="Mobile number" value={driver['Mobile number']} /><FieldValue label="Nationality" value={driver.Nationality} /><FieldValue label="Licence experience" value={inquiry.payload['License age']} /><FieldValue label="Claims history" value={inquiry.payload['Claims history']} /></div>
        </DetailSection>}
        {isMotorInsurance && <DetailSection id="vehicle" icon={<CarFront size={18} />} title="Vehicle Information" description="The vehicle details supplied for the requested cover.">
          <div className="vehicle-summary-banner"><span className="vehicle-summary-icon"><CarFront size={21} /></span><span><small>INSURED VEHICLE</small><b>{vehicleLabel || 'Vehicle details pending'}</b></span><span className="vehicle-summary-value"><small>VEHICLE VALUE</small><b>{inquiry.vehicleValue}</b></span></div>
          <div className="detail-fields"><FieldValue label="Condition" value={inquiry.payload['Vehicle condition']} /><FieldValue label="Model year" value={inquiry.payload['Model year']} /><FieldValue label="Make" value={inquiry.payload['Vehicle make']} /><FieldValue label="Model" value={inquiry.payload['Vehicle model']} /><FieldValue label="Body type" value={inquiry.payload['Body type']} /><FieldValue label="Engine" value={inquiry.payload['Engine details']} /><FieldValue label="Vehicle use" value={inquiry.payload['Vehicle use']} /><FieldValue label="First registration" value={inquiry.payload['First registration']} /><FieldValue label="Specification" value={inquiry.payload['Vehicle specification']} /></div>
        </DetailSection>}
        <DetailSection id="plan" icon={<ShieldCheck size={17} />} title="Plan and cover" description="Selected product information for this inquiry.">
          <div className="plan-detail-panel"><div><span className="eyebrow">SELECTED PLAN</span><h3>{inquiry.plan}</h3><p>Cover details will be connected to the insurer’s product catalogue in a later phase.</p></div><span className="plan-detail-badge"><BadgeCheck size={16} /> Selected</span></div>
          <div className="detail-fields"><FieldValue label="Product" value={inquiry.payload['Insurance product']} /><FieldValue label="Vehicle use" value={inquiry.payload['Vehicle use']} /><FieldValue label="Specification" value={inquiry.payload['Vehicle specification']} /><FieldValue label="Updated" value={inquiry.updatedAt} /></div>
        </DetailSection>
        <InquiryCommunications emails={emails ?? []} loading={emailsLoading} error={emailsError} onRetry={onRetryEmails} inquiryId={inquiry.id} contactEmail={driver['Email address']} />
        <DetailSection id="documents" icon={<FileText size={17} />} title="Documents" description="Documents attached to this quote request.">
          <div className="inquiry-documents">
            {documentsLoading ? <InquiryLoadingState label="Loading documents" compact /> : documentsError ? <div className="documents-error" role="alert"><span>{documentsError}</span>{onRetryDocuments && <button type="button" className="text-button" onClick={onRetryDocuments}>Retry</button>}</div> : documents ? documents.length ? documents.map((document) => <a className="inquiry-document inquiry-document-link" key={document.id} href={document.url || undefined} target={document.url ? '_blank' : undefined} rel={document.url ? 'noopener noreferrer' : undefined} aria-disabled={!document.url} onClick={!document.url ? (event) => event.preventDefault() : undefined}><DocumentFileIcon name={document.name} type={document.fileType} /><span className="inquiry-document-copy"><b>{document.name}</b><small>{document.fileType || 'Document'}{document.modified ? ` · Updated ${formatDocumentDate(document.modified)}` : ''}</small></span>{document.url ? <ExternalLink size={16} className="document-ready" /> : <small className="document-link-unavailable">Link unavailable</small>}</a>) : <p className="documents-empty">No saved documents are linked to this inquiry.</p> : inquiry.payload.Documents.length ? inquiry.payload.Documents.map((document) => <div className="inquiry-document" key={document.name}><DocumentFileIcon name={document.name} type={document.type} /><span className="inquiry-document-copy"><b>{document.name}</b><small>{document.type || 'File'} · {(document.size / 1024).toFixed(0)} KB</small></span><BadgeCheck size={17} className="document-ready" /></div>) : <p className="documents-empty">No documents were selected for this inquiry.</p>}
          </div>
        </DetailSection>
      </div>
    </div>
  </main>
}

function InquiryCommunications({ emails, loading, error, onRetry, inquiryId, contactEmail }: { emails: InquiryEmailActivity[]; loading: boolean; error: string; onRetry?: () => void; inquiryId: string; contactEmail: string }) {
  const [search, setSearch] = useState('')
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null)
  const scoped = useMemo(() => {
    const term = search.trim().toLowerCase()
    return emails.filter((email) => !term || [email.subject, email.from, ...email.to, emailPreview(email.body), ...email.attachments.map((item) => item.fileName)].join(' ').toLowerCase().includes(term))
  }, [emails, search])
  const compactCollapsedEmails = scoped.length > 3
  return <section className="detail-side-card communications-card" aria-labelledby="communications-heading">
    <header className="communications-heading"><span><small>Email activity timeline</small><h2 id="communications-heading">Inquiry communications</h2><p>All email activity linked to {inquiryId.slice(0, 8).toUpperCase()} from the Dataverse email timeline.</p></span><span className="communications-count" aria-label={`${emails.length} emails`}>{emails.length}</span></header>
    <div className="communications-tools"><label className="communications-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email activity..." aria-label="Search email activity" /></label><a className="communications-compose" href={`mailto:${contactEmail}`}><Mail size={14} />Compose email</a></div>
    {loading ? <div className="communications-state"><InquiryLoadingState label="Loading email activity" compact /></div> : error ? <div className="communications-state communications-error" role="alert"><span>{error}</span>{onRetry && <button className="text-button" type="button" onClick={onRetry}>Retry</button>}</div> : scoped.length ? <ol className="communications-timeline">{scoped.map((email) => {
      const expanded = expandedEmailId === email.id
      const preview = emailPreview(email.body)
      return <li className={`communication-row ${expanded ? 'expanded' : ''}`} key={email.id}>
        <div className="communication-date"><time dateTime={email.date}>{formatEmailDate(email.date)}</time></div>
        <span className={`communication-marker ${email.direction}`} aria-hidden="true"><Mail size={15} /></span>
        <article className="communication-card">
          <button type="button" className="communication-toggle" aria-expanded={expanded} onClick={() => setExpandedEmailId(expanded ? null : email.id)}>
            <span className="communication-meta"><b>{email.direction === 'sent' ? 'SENT EMAIL' : 'RECEIVED EMAIL'}</b><span className={`communication-status ${email.direction}`}>{email.status}</span></span>
            <strong>{email.subject}</strong>
            {(!compactCollapsedEmails || expanded) && <span className="communication-address"><span>From: {email.from || 'Unknown sender'}</span><span>To: {email.to.length ? email.to.join('; ') : contactEmail || 'No recipient listed'}</span></span>}
            {!compactCollapsedEmails && !expanded && preview && <span className="communication-preview">{preview}</span>}
            <ChevronDown size={16} className="communication-chevron" aria-hidden="true" />
          </button>
          {email.attachments.length > 0 && (!compactCollapsedEmails || expanded) && <div className="communication-attachments"><div className="attachments-heading"><Paperclip size={13} /><b>Attachments ({email.attachments.length})</b></div><div className="attachment-list">{email.attachments.map((file) => <span className="email-attachment" key={file.id} title={`${file.fileName} · ${file.mimeType || 'file'}`}><span className="attachment-file-icon"><FileText size={13} /></span><span><b>{file.fileName}</b><small>{formatFileSize(file.fileSize)}{file.mimeType ? ` · ${file.mimeType}` : ''}</small></span></span>)}</div></div>}
          {expanded && <div className="communication-body" dangerouslySetInnerHTML={{ __html: formatEmailBody(email.body) }} />}
        </article>
      </li>
    })}</ol> : <div className="communications-empty"><span><Inbox size={19} /></span><b>{search ? 'No email activity matches this search' : 'No email activity yet'}</b><small>{search ? 'Try another sender, subject, or attachment name.' : 'Emails regarding this inquiry will appear here.'}</small></div>}
  </section>
}

function emailPreview(value: string) {
  const document = new DOMParser().parseFromString(value || '', 'text/html')
  const root = document.querySelector('.ck-content') ?? document.body
  return (root.textContent ?? value).replace(/_x0020_/gi, ' ').replace(/\s+/g, ' ').trim()
}

function formatEmailBody(value: string) {
  if (/<(?:html|body|div|p|br|table|ul|ol|li|h[1-6]|b|strong|span|blockquote)\b/i.test(value)) return sanitizeEmailHtml(value)
  return plainTextEmailToHtml(value)
}

function plainTextEmailToHtml(value: string) {
  const decoded = new DOMParser().parseFromString(value || '', 'text/html').body.textContent ?? value
  const text = decoded.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim()
  if (!text) return '<p>No message content.</p>'

  const headingPattern = /Summary of Information Received|Information:|What Happens Next\?/i
  const headingMatch = headingPattern.exec(text)
  if (!headingMatch) return proseParagraphs(text)

  const opening = text.slice(0, headingMatch.index).trim()
  const remainder = text.slice(headingMatch.index)
  const summaryMatch = /Summary of Information Received/i.exec(remainder)
  const infoMatch = /Information:/i.exec(remainder)
  const nextMatch = /What Happens Next\?/i.exec(remainder)
  let html = opening ? proseParagraphs(opening) : ''

  if (summaryMatch) {
    const start = summaryMatch.index + summaryMatch[0].length
    const end = infoMatch && infoMatch.index > summaryMatch.index ? infoMatch.index : nextMatch?.index ?? remainder.length
    const summaryText = remainder.slice(start, end).trim()
    html += `<h3>Summary of Information Received</h3>${proseParagraphs(summaryText)}`
  }

  if (infoMatch) {
    const start = infoMatch.index + infoMatch[0].length
    const end = nextMatch && nextMatch.index > infoMatch.index ? nextMatch.index : remainder.length
    const infoText = remainder.slice(start, end).trim()
    const attachmentStart = infoText.search(/\bname:\s*.+?\s+size:\s*\d+\s+type:\s*[\w.+/-]+/i)
    const fieldText = attachmentStart >= 0 ? infoText.slice(0, attachmentStart).trim() : infoText
    const attachmentText = attachmentStart >= 0 ? infoText.slice(attachmentStart) : ''
    const fields = parseEmailFields(fieldText)
    html += '<h3>Information received</h3>'
    if (fields.length) html += `<ul class="email-submission-list">${fields.map(([label, fieldValue]) => `<li><strong>${escapeEmailHtml(label)}:</strong> ${escapeEmailHtml(fieldValue)}</li>`).join('')}</ul>`
    else if (fieldText) html += proseParagraphs(fieldText)
    const attachments = parseInlineAttachments(attachmentText)
    if (attachments.length) html += `<h3>Attached files</h3><ul class="email-attachment-summary">${attachments.map((file) => `<li><strong>${escapeEmailHtml(file.name)}</strong><span>${escapeEmailHtml(file.size)} · ${escapeEmailHtml(file.type)}</span></li>`).join('')}</ul>`
  }

  if (nextMatch) {
    const start = nextMatch.index + nextMatch[0].length
    const after = remainder.slice(start).trim()
    const signoff = /\bBest regards,?/i.exec(after)
    const nextSteps = signoff ? after.slice(0, signoff.index).trim() : after
    html += `<h3>What Happens Next?</h3>${proseParagraphs(nextSteps)}`
    if (signoff) html += proseParagraphs(after.slice(signoff.index).trim())
  }

  return html || proseParagraphs(text)
}

function parseEmailFields(value: string): Array<[string, string]> {
  const pattern = /([A-Za-z][A-Za-z0-9]*(?:_x0020_[A-Za-z0-9]+)+|Nationality)\s*:\s*/gi
  const matches = [...value.matchAll(pattern)]
  return matches.map((match, index) => {
    const valueStart = (match.index ?? 0) + match[0].length
    const valueEnd = matches[index + 1]?.index ?? value.length
    const label = match[1].replace(/_x0020_/gi, ' ').replace(/\s+/g, ' ').trim()
    return [label, value.slice(valueStart, valueEnd).trim()] as [string, string]
  }).filter(([, fieldValue]) => fieldValue.length > 0)
}

function parseInlineAttachments(value: string) {
  const pattern = /\bname:\s*(.+?)\s+size:\s*(\d+)\s+type:\s*([\w.+/-]+)/gi
  return [...value.matchAll(pattern)].map((match) => ({ name: match[1].trim(), size: formatFileSize(Number(match[2])), type: match[3].trim() }))
}

function proseParagraphs(value: string) {
  const paragraphs = value.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean)
  const normalized = paragraphs.length > 1 ? paragraphs : value.split(/(?<=[.!?])\s+(?=[A-Z])/).reduce<string[]>((groups, sentence, index) => {
    const groupIndex = Math.floor(index / 2)
    groups[groupIndex] = `${groups[groupIndex] ? `${groups[groupIndex]} ` : ''}${sentence.trim()}`
    return groups
  }, [])
  const greeting = normalized[0]?.match(/^(Dear\s+[^,]+,)\s+(.+)$/i)
  if (!greeting) return normalized.map((paragraph) => `<p>${escapeEmailHtml(paragraph)}</p>`).join('')
  return `<p>${escapeEmailHtml(greeting[1])}</p><p>${escapeEmailHtml(greeting[2])}</p>${normalized.slice(1).map((paragraph) => `<p>${escapeEmailHtml(paragraph)}</p>`).join('')}`
}

function escapeEmailHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function sanitizeEmailHtml(value: string) {
  const parsed = new DOMParser().parseFromString(value || '', 'text/html')
  const root = parsed.querySelector('.ck-content') ?? parsed.body
  root.querySelectorAll('script,style,iframe,object,embed,form,svg,math,blockquote,.gmail_quote,#divRplyFwdMsg').forEach((node) => node.remove())
  const allowed = new Set(['P','DIV','SPAN','BR','B','STRONG','I','EM','U','UL','OL','LI','A','H1','H2','H3','H4','HR','PRE','CODE','TABLE','THEAD','TBODY','TR','TD','TH'])
  const walker = parsed.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  const nodes: Element[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Element)
  for (const element of nodes.reverse()) {
    const originalHref = element.tagName === 'A' ? element.getAttribute('href') : null
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name)
    if (element.tagName === 'A') {
      const original = originalHref ?? ''
      try {
        const url = new URL(original, window.location.origin)
        if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
          element.setAttribute('href', url.href)
          element.setAttribute('target', '_blank')
          element.setAttribute('rel', 'noopener noreferrer')
        }
      } catch { /* Keep unsafe or malformed links as plain text. */ }
    }
    if (!allowed.has(element.tagName)) element.replaceWith(...Array.from(element.childNodes))
  }
  return root.innerHTML
}

function formatEmailDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatFileSize(bytes: number) {
  if (!bytes || bytes < 0) return 'Size unavailable'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDocumentDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}


