const tenantId = '189fd6af-5f23-41d9-8763-cde57608f4e8'
const clientId = '233e78e7-47a4-4d58-8c3e-8b47b4441e0a'
const clientSecret = process.env.DATAVERSE_CLIENT_SECRET
const organizationUrl = 'https://insureai.api.crm6.dynamics.com'
const customApiUrl = `${organizationUrl}/api/data/v9.2/dga_WebApiForPortal`

if (!clientSecret) {
  console.error('Set DATAVERSE_CLIENT_SECRET to the rotated app secret, then run this script again.')
  process.exit(1)
}

async function main() {
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: `${organizationUrl}/.default`,
      }),
    },
  )

  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok) {
    console.error('Token request failed:', tokenResponse.status, tokenData)
    process.exitCode = 1
    return
  }

  console.log('Token acquired. Expires in:', tokenData.expires_in, 'seconds.')

  const fetchXml = [
    '<fetch>',
    '  <entity name="aur_quotes">',
    '    <attribute name="aur_quotesid" />',
    '    <attribute name="aur_vehicle_value" />',
    '  </entity>',
    '</fetch>',
  ].join('')

  const apiResponse = await fetch(customApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      actionName: 'retrievemultiple',
      isAdmin: true,
      userId: '',
      fetchXml,
    }),
  })

  const responseText = await apiResponse.text()
  let responseData
  try {
    responseData = responseText ? JSON.parse(responseText) : null
  } catch {
    responseData = responseText
  }

  console.log('Custom API HTTP status:', apiResponse.status)
  console.log('Custom API response:', responseData)
  if (Array.isArray(responseData?.retrieveResponse)) {
    console.table(responseData.retrieveResponse)
  }
  if (!apiResponse.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('Custom API check failed:', error.message)
  process.exitCode = 1
})
