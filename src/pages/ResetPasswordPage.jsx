import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import sbhaLogo from '../assets/sbha-logo.png'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  // AuthContext sets session when PASSWORD_RECOVERY fires and navigates here.
  // We use session as the readiness signal — no need for a second listener.
  const { session, loading: authLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('Failed to update password. The reset link may have expired — please request a new one.')
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-white to-mauve-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
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

        <div className="bg-white rounded-2xl shadow-card p-8">
          <h2 className="font-heading text-2xl font-semibold text-gray-700 mb-1">
            Set New Password
          </h2>
          <p className="font-body text-sm text-gray-400 mb-6">
            Choose a new password for your account.
          </p>

          {authLoading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4F7EE0', borderTopColor: 'transparent' }} />
              <p className="font-body text-sm text-gray-400">Verifying reset link…</p>
            </div>
          ) : !session ? (
            <div className="text-center py-6">
              <p className="font-body text-sm text-red-500 mb-4">
                This reset link is invalid or has expired. Please request a new one.
              </p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="btn-primary py-2 px-6 rounded-xl text-sm font-semibold"
              >
                Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  autoFocus
                  minLength={6}
                />
              </div>

              <div>
                <label className="label">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                />
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
                    Updating…
                  </>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center font-body text-xs text-gray-400 mt-6">
          Personalized Care Navigation
        </p>
      </div>
    </div>
  )
}
