import { FileSpreadsheet, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { bridgePort } from './lib/hubWire'
import { HUB_APP_ID } from './lib/runStore'
import { ReturnsScreen } from './screens/ReturnsScreen'

type Theme = 'dark' | 'light'

function initialTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function App() {
  // The theme is chosen inside this app and kept in memory only (nothing is stored in the browser).
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [themeChosen, setThemeChosen] = useState(false)

  // Everything about the dashboard only does something inside its frame. Opened on its own,
  // the bridge stays silent and the app offers fake sample data only.
  const insideDashboard = window.PayrollHubBridge.isEmbedded()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (themeChosen) document.documentElement.dataset.theme = theme
  }, [theme, themeChosen])

  useEffect(() => {
    // This app only asks. With no onData, the bridge itself refuses anything sent to it.
    window.PayrollHubBridge.init({ appId: HUB_APP_ID })
    return window.PayrollHubBridge.onStatus(setConnected)
  }, [])

  return (
    <div className="relative flex h-full flex-col">
      <div className="backdrop" aria-hidden="true" />
      <div className="aurora aurora-a" aria-hidden="true" />
      <div className="aurora aurora-b" aria-hidden="true" />
      <div className="aurora aurora-c" aria-hidden="true" />

      <header className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="icon-tile tone-sky" aria-hidden="true">
            <FileSpreadsheet />
          </span>
          <div>
            <h1 className="m-0 text-[19px] font-semibold tracking-tight">MRA Returns</h1>
            <p className="m-0 text-xs text-muted">CSG (PACO) and PRGF return files</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {insideDashboard && (
            <span className={`badge ${connected ? 'tone-accent' : ''}`} role="status">
              {connected ? 'Dashboard connected' : 'Waiting for the dashboard'}
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setThemeChosen(true)
              setTheme(theme === 'dark' ? 'light' : 'dark')
            }}
          >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
          <ReturnsScreen port={bridgePort} embedded={insideDashboard} connected={connected} />
        </div>
      </main>
    </div>
  )
}
