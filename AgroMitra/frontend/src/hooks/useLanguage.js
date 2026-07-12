// ============================================================
//   AgroMitra — useLanguage hook
//   Global EN/BN language toggle
// ============================================================

import { useState, useEffect } from 'react'

const LANG_KEY = 'agromitra_lang'

export function useLanguage() {
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || 'en')

  const toggleLang = () => {
    const next = lang === 'en' ? 'bn' : 'en'
    setLang(next)
    localStorage.setItem(LANG_KEY, next)
    // dispatch event so other components can sync
    window.dispatchEvent(new CustomEvent('agromitra-lang-changed', { detail: next }))
  }

  // sync across tabs/components
  useEffect(() => {
    const handler = (e) => setLang(e.detail)
    window.addEventListener('agromitra-lang-changed', handler)
    return () => window.removeEventListener('agromitra-lang-changed', handler)
  }, [])

  return { lang, toggleLang, isBn: lang === 'bn' }
}
