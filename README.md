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

The local backend exposes `GET http://localhost:3001/api/health` and `POST http://localhost:3001/api/claude`.

Set `ANTHROPIC_API_KEY` on the backend deployment. Set `VITE_API_URL` on the frontend deployment to the deployed backend URL, such as `https://your-backend.vercel.app`.

## Enable Accounts And Cloud Storage

1. Create a Supabase project and run `backend/supabase/schema.sql` in the SQL editor.
2. Add these frontend environment variables:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=https://your-backend.vercel.app
```

3. Set `ANTHROPIC_API_KEY` on the backend Vercel project. The browser only receives the Supabase anon key; the Anthropic key stays server-side.

Without Supabase variables, the app runs in local browser-storage mode for development.

## Deploy Backend On Vercel

Create a separate Vercel project for this repository with `backend` as its Root Directory. Vercel will deploy `backend/api/health.js` at `/api/health` and `backend/api/claude.js` at `/api/claude`.

## Checks

```bash
npm run build
npm run lint
```
