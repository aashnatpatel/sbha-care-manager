import { Shield } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <h1 className="font-heading text-4xl font-semibold text-gray-800 mb-8">Settings</h1>

      <div className="card p-6 md:p-8">
        <h2 className="font-heading text-2xl font-semibold text-gray-700 mb-1">Security</h2>
        <p className="font-body text-sm text-gray-400 mb-6">Manage how you access your account.</p>

        <div className="border-t border-gray-100 pt-6">
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ backgroundColor: '#EEF2FB' }}
            >
              <Shield size={20} style={{ color: '#4F7EE0' }} />
            </div>
            <div>
              <h3 className="font-body font-semibold text-gray-700 text-sm mb-1">
                Two-Factor Authentication
              </h3>
              <p className="font-body text-sm text-gray-400">
                Two-factor authentication will be available in a future update.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
