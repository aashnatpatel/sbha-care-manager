import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const TIMEOUT_MS = 60 * 60 * 1000       // 60 minutes
const WARNING_BEFORE_MS = 5 * 60 * 1000 // warn 5 minutes before

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)
  const navigate = useNavigate()

  // Refs so the timer callbacks always see the latest values without
  // needing to re-register event listeners.
  const sessionRef = useRef(session)
  const signOutTimerRef = useRef(null)
  const warningTimerRef = useRef(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // ── Auth state ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(session)
        navigate('/reset-password', { replace: true })
        return
      }
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Inactivity timeout ──────────────────────────────────────────────────────
  const clearTimers = () => {
    clearTimeout(signOutTimerRef.current)
    clearTimeout(warningTimerRef.current)
  }

  const resetTimers = () => {
    // Only run timers when there is an active session
    if (!sessionRef.current) return

    clearTimers()
    setShowTimeoutWarning(false)

    // Show warning 5 minutes before sign-out
    warningTimerRef.current = setTimeout(() => {
      if (sessionRef.current) setShowTimeoutWarning(true)
    }, TIMEOUT_MS - WARNING_BEFORE_MS)

    // Sign out after full timeout
    signOutTimerRef.current = setTimeout(async () => {
      if (sessionRef.current) {
        setShowTimeoutWarning(false)
        await supabase.auth.signOut()
        navigate('/login', { replace: true })
      }
    }, TIMEOUT_MS)
  }

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    const handleActivity = () => resetTimers()

    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    resetTimers() // start timers on mount / session change

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity))
      clearTimers()
    }
  }, [session]) // re-register whenever session changes (sign-in / sign-out)

  // ── Auth helpers ────────────────────────────────────────────────────────────
  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  const staySignedIn = () => {
    setShowTimeoutWarning(false)
    resetTimers()
  }

  return (
    <AuthContext.Provider value={{ session, signIn, signOut, loading: session === undefined }}>
      {children}

      {/* Inactivity warning modal */}
      {showTimeoutWarning && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '24rem',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '3rem', height: '3rem', borderRadius: '0.75rem',
                backgroundColor: '#FEF3C7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1rem',
                fontSize: '1.5rem',
              }}
            >
              ⏱
            </div>
            <h2
              style={{
                fontFamily: '"Cormorant Garamond", serif',
                fontSize: '1.5rem', fontWeight: 600,
                color: '#374151', marginBottom: '0.5rem',
              }}
            >
              Still there?
            </h2>
            <p
              style={{
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '0.875rem', color: '#6B7280',
                marginBottom: '1.5rem', lineHeight: '1.5',
              }}
            >
              You'll be signed out in 5 minutes due to inactivity.
            </p>
            <button
              onClick={staySignedIn}
              style={{
                width: '100%',
                backgroundColor: '#4F7EE0',
                color: '#fff',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '0.75rem 1rem',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
