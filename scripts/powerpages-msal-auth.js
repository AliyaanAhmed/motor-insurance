/* Client helper for the authenticated Power Pages Server Logic endpoint. */
export async function getInquiryDocumentsFromServerLogic() {
  const tokenResponse = await fetch('/_layout/tokenhtml', {
    method: 'GET',
    credentials: 'include',
  })
  if (!tokenResponse.ok) {
    throw new Error(`Could not get the Power Pages verification token (${tokenResponse.status}).`)
  }

  const tokenHtml = await tokenResponse.text()
  const tokenDocument = new DOMParser().parseFromString(tokenHtml, 'text/html')
  const verificationToken = tokenDocument
    .querySelector('input[name="__RequestVerificationToken"]')
    ?.getAttribute('value')
  if (!verificationToken) throw new Error('Power Pages verification token was missing.')

  const response = await fetch('/_api/serverlogics/Token', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      __RequestVerificationToken: verificationToken,
    },
    // No inquiry ID: the Server Logic FetchXML uses its own hard-coded ID.
    body: JSON.stringify({}),
  })

  const responseText = await response.text()
  let envelope
  try {
    envelope = responseText ? JSON.parse(responseText) : null
  } catch {
    throw new Error(responseText || `Server Logic returned an invalid response (${response.status}).`)
  }
  if (!response.ok || envelope?.success === false) {
    throw new Error(envelope?.error || envelope?.Error || `Document request failed (${response.status}).`)
  }

  // Power Pages wraps the Server Logic's JSON string in envelope.data.
  let result = envelope?.data ?? envelope?.Data ?? envelope
  if (typeof result === 'string') {
    try { result = JSON.parse(result) }
    catch { throw new Error('Server Logic returned an unreadable response.') }
  }
  if (result?.success === false) {
    throw new Error(result.error || 'Server Logic could not retrieve SharePoint documents.')
  }

  // The Server Logic returns its Dataverse response inside result.data.
  let apiResult = result?.data ?? result?.Data
  if (typeof apiResult === 'string') {
    try { apiResult = JSON.parse(apiResult) }
    catch { throw new Error('The Dataverse response from Server Logic was unreadable.') }
  }

  const rows = apiResult?.retrieveResponse ?? apiResult?.documents ?? result?.documents
  if (!Array.isArray(rows)) {
    throw new Error('Server Logic response did not contain SharePoint document rows.')
  }
  return rows
}
