export type InquiryDocument = { name: string; size: number; type: string }

export type QuotePayload = {
  'Insurance product': string
  'Driver details': {
    'Full name': string
    'Email address': string
    'Mobile number': string
    'Age range': string
    Nationality: string
  }
  'Vehicle condition': string
  'Model year': string
  'Vehicle make': string
  'Vehicle model': string
  'Body type': string
  'Engine details': string
  'Vehicle use': string
  'First registration': string
  'License age': string
  'Vehicle specification': string
  'Claims history': string
  Documents: InquiryDocument[]
  'Preferred contact'?: string
  'Additional notes'?: string
  'Resume step'?: number
}

export type InquiryRecord = {
  id: string
  statusCode?: number
  contactId?: string
  contactName?: string
  contactEmail?: string
  title: string
  type: string
  plan: string
  broker: string
  brokerAgent: string
  status: string
  underwriterActionStatus: string
  underwriterSubAction: string
  riskScore: number
  vehicleValue: string
  basePremium: number
  discount: number
  tax: number
  totalPremium: number
  premiumBreakdown: {
    basePremium: number | null
    additionalPremiumPercentage: number | null
    totalPremiumPercentage: number | null
    grossPremium: number | null
    vat: number | null
    totalPremiumToBeCharged: number | null
  }
  createdAt: string
  updatedAt: string
  description: string
  payload: QuotePayload
}

// Status 751820006 is the transition point between saving a complete inquiry
// and finishing motor-data, matching, and document operations. Expose a
// recovery path only when its saved payload contains all required answers.
export function isSubmissionRecoveryCandidate(record: InquiryRecord) {
  if (record.statusCode !== 751820006) return false
  const payload = record.payload
  const driver = payload['Driver details']
  const required = [
    payload['Insurance product'], driver['Full name'], driver['Email address'], driver['Mobile number'],
    driver['Age range'], driver.Nationality, payload['Vehicle condition'], payload['Model year'],
    payload['Vehicle make'], payload['Vehicle model'], payload['Body type'], payload['Engine details'],
    payload['Vehicle use'], payload['First registration'], payload['License age'],
    payload['Vehicle specification'], payload['Claims history'],
  ]
  return required.every((value) => value.trim().length > 0)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driver['Email address'])
}

export function resolveVehicleSelection<TMake extends { id: string; name: string; models: { id: string; name: string }[] }>(
  makes: TMake[], makeName: string, modelName: string,
) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase()
  const make = resolveVehicleMake(makes, makeName)
  const model = make?.models.find((candidate) => normalize(candidate.name) === normalize(modelName))
  return make && model ? { make, model } : undefined
}

export function resolveVehicleMake<TMake extends { id: string; name: string }>(makes: TMake[], makeName: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase()
  return makes.find((candidate) => normalize(candidate.name) === normalize(makeName))
}

export const demoInquiries: InquiryRecord[] = [{
  id: 'INQ-1008',
  title: 'Inquiry for Motor Insurance — Samira Noor',
  type: 'Personal Vehicle',
  plan: 'Comprehensive Insurance',
  broker: 'No broker linked',
  brokerAgent: '—',
  status: 'Awaiting Review',
  underwriterActionStatus: '',
  underwriterSubAction: '',
  riskScore: 50,
  vehicleValue: 'AED 12,384.00',
  basePremium: 0,
  discount: 0,
  tax: 0,
  totalPremium: 0,
  premiumBreakdown: {
    basePremium: null,
    additionalPremiumPercentage: null,
    totalPremiumPercentage: null,
    grossPremium: null,
    vat: null,
    totalPremiumToBeCharged: null,
  },
  createdAt: '6 October 2026',
  updatedAt: '6 October 2026',
  description: 'Sample inquiry for a newly purchased Toyota Camry. Demo data for the local proof of concept.',
  payload: {
    'Insurance product': 'Motor Insurance',
    'Driver details': {
      'Full name': 'Samira Noor',
      'Email address': 'samira.noor@example.test',
      'Mobile number': '+971 50 123 4567',
      'Age range': '35–44',
      Nationality: 'Jordan',
    },
    'Vehicle condition': 'Used vehicle',
    'Model year': '2025',
    'Vehicle make': 'Toyota',
    'Vehicle model': 'Camry',
    'Body type': 'Saloon / Hatchback',
    'Engine details': '4 Cylinders',
    'Vehicle use': 'Private',
    'First registration': '2025',
    'License age': 'More than 12 months',
    'Vehicle specification': 'GCC',
    'Claims history': 'Never',
    Documents: [
      { name: 'vehicle-registration.pdf', size: 421000, type: 'application/pdf' },
      { name: 'driving-licence.jpg', size: 268000, type: 'image/jpeg' },
    ],
  },
}]
