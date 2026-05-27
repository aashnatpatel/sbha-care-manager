import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useMatch } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FolderOpen,
  ClipboardList,
  LogOut,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import sbhaLogo from '../assets/sbha-logo.png'

const topNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
]

const bottomNavItems = [
  { to: '/intake', icon: ClipboardList, label: 'Intake Form' },
  { to: '/documents', icon: FolderOpen, label: 'Documents' },
]

export default function Layout({ children }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const patientMatch = useMatch('/patients/:id')
  const currentPatientId = patientMatch?.params?.id ?? null

  const [patientsOpen, setPatientsOpen] = useState(false)
  const [patients, setPatients] = useState([])
  const [installPrompt, setInstallPrompt] = useState(null)

  useEffect(() => {
    const handler = e => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    supabase
      .from('patients')
      .select('id, first_name, last_name')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('first_name')
      .then(({ data }) => setPatients(data || []))
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        {/* Logo */}
        <div className="px-6 py-9 border-b border-gray-100 flex items-center justify-center">
          <img src={sbhaLogo} alt="SBHA" className="h-20 w-auto object-contain" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 flex flex-col gap-1 min-h-0">
          {/* Dashboard + Calendar */}
          {topNavItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              {label}
            </NavLink>
          ))}

          {/* Patients collapsible */}
          <div className="flex flex-col min-h-0">
            <button
              onClick={() => setPatientsOpen(o => !o)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-all duration-150 w-full text-left ${
                currentPatientId
                  ? 'bg-primary-light text-primary'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <Users size={18} className="flex-shrink-0" />
              <span className="flex-1">Patients</span>
              {patientsOpen
                ? <ChevronDown size={14} className="flex-shrink-0" />
                : <ChevronRight size={14} className="flex-shrink-0" />}
            </button>

            {patientsOpen && (
              <div className="mt-0.5 ml-3 pl-6 border-l border-gray-100 overflow-y-auto max-h-48 flex flex-col gap-0.5">
                {patients.length === 0 ? (
                  <p className="font-body text-xs text-gray-400 py-2 px-2">No active patients</p>
                ) : (
                  patients.map(p => (
                    <NavLink
                      key={p.id}
                      to={`/patients/${p.id}`}
                      className={`block px-2 py-1.5 rounded-lg font-body text-xs font-medium truncate transition-colors ${
                        currentPatientId === p.id
                          ? 'bg-primary-light text-primary'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                      }`}
                    >
                      {p.first_name} {p.last_name}
                    </NavLink>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Intake Form + Documents */}
          {bottomNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Install + Sign out */}
        <div className="px-3 pb-6 flex flex-col gap-1">
          {installPrompt && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-body font-medium text-primary hover:bg-primary-light transition-all duration-150"
            >
              <Download size={18} />
              Install App
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-body font-medium text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all duration-150"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
