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

const mobileNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar', end: false },
  { to: '/intake', icon: ClipboardList, label: 'Intake', end: false },
  { to: '/documents', icon: FolderOpen, label: 'Docs', end: false },
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
    <div className="min-h-screen bg-gray-50">

      {/* ── Sidebar (tablet + desktop) ── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-white border-r border-gray-100
                        w-16 lg:w-60 hover:w-60 transition-[width] duration-200 ease-in-out overflow-hidden group/sidebar">

        {/* Logo */}
        <div className="flex items-center justify-center border-b border-gray-100 h-[76px] lg:h-auto lg:py-9 overflow-hidden flex-shrink-0">
          <img src={sbhaLogo} alt="SBHA" className="h-8 lg:h-20 group-hover/sidebar:h-20 w-auto object-contain transition-all duration-200" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-5 flex flex-col gap-1 min-h-0 overflow-hidden">

          {topNavItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-0 lg:gap-3 group-hover/sidebar:gap-3 py-2.5 rounded-xl font-body font-medium transition-all duration-150 min-h-[44px] w-full
                 px-0 lg:px-3 group-hover/sidebar:px-3 justify-center lg:justify-start group-hover/sidebar:justify-start
                 ${isActive ? 'bg-primary-light text-primary' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="hidden lg:block group-hover/sidebar:block text-sm whitespace-nowrap overflow-hidden">
                {label}
              </span>
            </NavLink>
          ))}

          {/* Patients collapsible */}
          <div className="flex flex-col min-h-0">
            <button
              onClick={() => setPatientsOpen(o => !o)}
              title="Patients"
              className={`flex items-center gap-0 lg:gap-3 group-hover/sidebar:gap-3 py-2.5 rounded-xl font-body font-medium transition-all duration-150 w-full min-h-[44px]
                          px-0 lg:px-3 group-hover/sidebar:px-3 justify-center lg:justify-start group-hover/sidebar:justify-start
                          ${currentPatientId ? 'bg-primary-light text-primary' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
            >
              <Users size={18} className="flex-shrink-0" />
              <span className="hidden lg:block group-hover/sidebar:block text-sm flex-1 whitespace-nowrap overflow-hidden text-left">
                Patients
              </span>
              <span className="hidden lg:block group-hover/sidebar:block flex-shrink-0">
                {patientsOpen
                  ? <ChevronDown size={14} className="flex-shrink-0" />
                  : <ChevronRight size={14} className="flex-shrink-0" />}
              </span>
            </button>

            {patientsOpen && (
              <div className="mt-0.5 ml-3 pl-6 border-l border-gray-100 overflow-y-auto max-h-48 flex flex-col gap-0.5">
                {patients.length === 0 ? (
                  <p className="font-body text-xs text-gray-400 py-2 px-2 whitespace-nowrap">No active patients</p>
                ) : (
                  patients.map(p => (
                    <NavLink
                      key={p.id}
                      to={`/patients/${p.id}`}
                      className={`block px-2 py-1.5 rounded-lg font-body text-xs font-medium truncate transition-colors whitespace-nowrap ${
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

          {bottomNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-0 lg:gap-3 group-hover/sidebar:gap-3 py-2.5 rounded-xl font-body font-medium transition-all duration-150 min-h-[44px] w-full
                 px-0 lg:px-3 group-hover/sidebar:px-3 justify-center lg:justify-start group-hover/sidebar:justify-start
                 ${isActive ? 'bg-primary-light text-primary' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="hidden lg:block group-hover/sidebar:block text-sm whitespace-nowrap overflow-hidden">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Install + Sign out */}
        <div className="px-2 pb-6 flex flex-col gap-1 overflow-hidden flex-shrink-0">
          {installPrompt && (
            <button
              onClick={handleInstall}
              title="Install App"
              className="flex items-center gap-0 lg:gap-3 group-hover/sidebar:gap-3 py-2.5 w-full rounded-xl font-body font-medium text-primary hover:bg-primary-light transition-all duration-150 min-h-[44px]
                         px-0 lg:px-3 group-hover/sidebar:px-3 justify-center lg:justify-start group-hover/sidebar:justify-start"
            >
              <Download size={18} className="flex-shrink-0" />
              <span className="hidden lg:block group-hover/sidebar:block text-sm whitespace-nowrap overflow-hidden">
                Install App
              </span>
            </button>
          )}
          <button
            onClick={handleSignOut}
            title="Sign Out"
            className="flex items-center gap-0 lg:gap-3 group-hover/sidebar:gap-3 py-2.5 w-full rounded-xl font-body font-medium text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all duration-150 min-h-[44px]
                       px-0 lg:px-3 group-hover/sidebar:px-3 justify-center lg:justify-start group-hover/sidebar:justify-start"
          >
            <LogOut size={18} className="flex-shrink-0" />
            <span className="hidden lg:block group-hover/sidebar:block text-sm whitespace-nowrap overflow-hidden">
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="md:ml-16 lg:ml-60 min-h-screen overflow-auto pb-20 md:pb-0">
        {children}
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100">
        <div className="flex items-stretch" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {mobileNavItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors min-h-[56px] ${
                  isActive ? 'text-primary' : 'text-gray-400'
                }`
              }
            >
              <Icon size={22} />
              <span className="font-body text-[10px] font-medium mt-0.5">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
