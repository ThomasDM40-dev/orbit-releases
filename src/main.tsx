import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useLangState } from './i18n/useLangState'

// Remount the whole tree when the language changes so every `t(...)` call
// re-reads the active dictionary without per-component i18n plumbing.
function Root() {
  const lang = useLangState()
  return <App key={lang} />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
