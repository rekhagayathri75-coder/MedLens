import { createServer } from 'node:http'

const port = Number(process.env.PORT) || 3001

const server = createServer((request, response) => {
  if (request.url === '/api/health' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ status: 'ok', service: 'medlens-backend' }))
    return
  }

  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, () => {
  console.log(`MedLens backend listening on http://localhost:${port}`)
})
