import { createServer } from 'node:http'
import { requestClaude } from './lib/claude.js'

const port = Number(process.env.PORT) || 3001

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(body))
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    })
    response.end()
    return
  }

  if (request.url === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok', service: 'medlens-backend' })
    return
  }

  if (request.url === '/api/claude' && request.method === 'POST') {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
      try {
        const payload = JSON.parse(body)
        const data = await requestClaude(payload)
        sendJson(response, 200, data)
      } catch (error) {
        sendJson(response, error.status || 400, { error: error.message })
      }
    })
    return
  }

  sendJson(response, 404, { error: 'Not found' })
})

server.listen(port, () => {
  console.log(`MedLens backend listening on http://localhost:${port}`)
})
