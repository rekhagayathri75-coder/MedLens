import { requestClaude } from '../lib/claude.js'

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_ORIGIN || '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { system, messages } = request.body || {}
  if (typeof system !== 'string' || !Array.isArray(messages) || messages.length === 0) {
    response.status(400).json({ error: 'system and messages are required' })
    return
  }

  try {
    response.status(200).json(await requestClaude({ system, messages }))
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message })
  }
}
