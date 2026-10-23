import assert from 'node:assert/strict'
import { isSubmissionRecoveryCandidate, resolveVehicleMake, resolveVehicleSelection } from '../src/inquiryData.ts'

const vehicleCatalog = [{
  id: 'make-audi',
  name: 'Audi',
  models: [{ id: 'model-q4', name: 'Q4' }],
}]

assert.deepEqual(
  resolveVehicleSelection(vehicleCatalog, 'AUDI', 'q4'),
  { make: vehicleCatalog[0], model: vehicleCatalog[0].models[0] },
  'saved make/model should resolve despite casing differences',
)
assert.equal(resolveVehicleMake(vehicleCatalog, 'audi'), vehicleCatalog[0], 'selected make should resolve even before a model is selected')
assert.equal(resolveVehicleSelection(vehicleCatalog, 'Audi', 'Q5'), undefined, 'unknown model must not resolve')
assert.equal(resolveVehicleSelection(vehicleCatalog, 'BMW', 'Q4'), undefined, 'unknown make must not resolve')

const completePayload = {
  'Insurance product': 'Motor Insurance',
  'Driver details': {
    'Full name': 'Test Driver', 'Email address': 'test@example.com', 'Mobile number': '+971 500000000',
    'Age range': '25–34', Nationality: 'UAE',
  },
  'Vehicle condition': 'Used vehicle', 'Model year': '2023', 'Vehicle make': 'Audi', 'Vehicle model': 'Q4',
  'Body type': 'SUV', 'Engine details': '4 Cylinders', 'Vehicle use': 'Private',
  'First registration': '2023', 'License age': 'More than 12 months',
  'Vehicle specification': 'GCC', 'Claims history': 'Never', Documents: [],
}
const recoveryRecord = { statusCode: 751820006, payload: completePayload }
assert.equal(isSubmissionRecoveryCandidate(recoveryRecord), true, 'fully completed Inquiry Created rows should be recoverable')
assert.equal(isSubmissionRecoveryCandidate({ ...recoveryRecord, statusCode: 751820021 }), false, 'Incomplete Inquiry continues through the normal edit flow')
assert.equal(isSubmissionRecoveryCandidate({ ...recoveryRecord, statusCode: 751820007 }), false, 'Product Match remains read-only')
assert.equal(isSubmissionRecoveryCandidate({ ...recoveryRecord, payload: { ...completePayload, 'Vehicle model': '' } }), false, 'incomplete payload must not enter submission-only recovery')

console.log('Inquiry recovery scenarios passed (vehicle resolution, casing, missing make/model, eligible and ineligible statuses).')
