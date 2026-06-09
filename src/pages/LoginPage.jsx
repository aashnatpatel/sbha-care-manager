import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import sbhaLogo from '../assets/sbha-logo.png'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [view, setView] = useState('login') // 'login' | 'forgot' | 'forgot-sent'
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)


  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('Invalid email or password. Please try again.')
    }
    setLoading(false)
  }

  const handleResetRequest = async (e) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    const redirectTo = window.location.hostname === 'localhost'
      ? 'http://localhost:5173/reset-password'
      : 'https://sbha-care-manager.vercel.app/reset-password'
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo })
    setResetLoading(false)
    if (error) {
      setResetError('Something went wrong. Please check the email address and try again.')
    } else {
      setView('forgot-sent')
    }
  }

  const branding = (
    <div className="text-center mb-8">
      <img
        src={sbhaLogo}
        alt="South Bay Health Advocates"
        className="h-20 w-auto mx-auto mb-4"
      />
      <h1 className="font-heading text-4xl font-semibold text-gray-800 mb-1">
        South Bay Health Advocates
      </h1>
      <p className="font-body text-sm text-gray-400 tracking-wide">
        Care Manager
      </p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-white to-mauve-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {branding}

        {/* Login form */}
        {view === 'login' && (
          <div className="bg-white rounded-2xl shadow-card p-8">
            <h2 className="font-heading text-2xl font-semibold text-gray-700 mb-6">
              Welcome back
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => { setView('forgot'); setResetEmail(email); setResetError('') }}
                  className="mt-1.5 font-body text-xs text-primary hover:underline"
                  style={{ color: '#4F7EE0' }}
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-600 font-body">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 rounded-xl text-base font-semibold mt-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Forgot password form */}
        {view === 'forgot' && (
          <div className="bg-white rounded-2xl shadow-card p-8">
            <button
              type="button"
              onClick={() => setView('login')}
              className="flex items-center gap-1.5 font-body text-sm text-gray-500 hover:text-gray-700 mb-5 -ml-1"
            >
              <ArrowLeft size={16} />
              Back to login
            </button>

            <h2 className="font-heading text-2xl font-semibold text-gray-700 mb-1">
              Reset Password
            </h2>
            <p className="font-body text-sm text-gray-400 mb-6">
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={handleResetRequest} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              {resetError && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-600 font-body">
                  {resetError}
                </div>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full btn-primary py-3 rounded-xl text-base font-semibold mt-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resetLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Success state */}
        {view === 'forgot-sent' && (
          <div className="bg-white rounded-2xl shadow-card p-8 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#EEF2FB' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F7EE0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 className="font-heading text-2xl font-semibold text-gray-700 mb-2">
              Check your email
            </h2>
            <p className="font-body text-sm text-gray-400 mb-6">
              We sent a password reset link to <span className="text-gray-600 font-medium">{resetEmail}</span>.
            </p>
            <button
              type="button"
              onClick={() => { setView('login'); setResetEmail('') }}
              className="w-full btn-primary py-3 rounded-xl text-base font-semibold"
            >
              Back to Login
            </button>
          </div>
        )}

        <p className="text-center font-body text-xs text-gray-400 mt-6">
          Personalized Care Navigation
        </p>
      </div>
    </div>
  )
}
