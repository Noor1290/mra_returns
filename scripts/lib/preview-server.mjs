// Serves the production build (dist/) on localhost for the check scripts, exactly as GitHub
// Pages would: static files only, under /mra_returns/.
import { preview } from 'vite'

export async function startPreview(port = 4329) {
  const server = await preview({ preview: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' })
  const origin = `http://127.0.0.1:${port}`
  return { origin, url: `${origin}/mra_returns/`, close: () => server.close() }
}
