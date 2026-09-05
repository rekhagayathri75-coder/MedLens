# MedLens

MedLens is organized as two applications:

- `frontend/` contains the React and Vite client.
- `backend/` contains the Node.js API server and Vercel functions.

## Development

Install frontend dependencies:

```bash
npm install --prefix frontend
```

Run the frontend:

```bash
npm run dev:frontend
```

Run the local backend in a second terminal:

```bash
npm run dev:backend
```

The local backend exposes `GET http://localhost:3001/api/health`.

## Deploy Backend On Vercel

Create a separate Vercel project for this repository with `backend` as its Root Directory. Vercel will deploy `backend/api/health.js` at `/api/health`.

## Checks

```bash
npm run build
npm run lint
```
