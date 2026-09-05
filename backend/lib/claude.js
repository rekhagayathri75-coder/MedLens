const anthropicUrl = 'https://api.anthropic.com/v1/messages'

export async function requestClaude({ system, messages }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const error = new Error('ANTHROPIC_API_KEY is not configured')
    error.status = 503
    throw error
  }

  const response = await fetch(anthropicUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      max_tokens: 1200,
      system,
      messages,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Anthropic request failed')
    error.status = response.status
    throw error
  }

  return data
}
