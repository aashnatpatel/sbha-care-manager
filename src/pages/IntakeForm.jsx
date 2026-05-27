import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ClipboardList, Plus, Trash2, Check, ChevronRight } from 'lucide-react'

const OVERWHELMING_OPTIONS = [
  'Understanding medical information',
  'Managing medications',
  'Coordinating multiple doctors',
  'Preparing for appointments',
  'Following through on care plans',
  'Billing/insurance questions',
  'Caregiving stress',
  'Other',
]

const COMMON_CONDITIONS = [
  'Hypertension', 'Type 2 Diabetes', 'Heart Disease', 'COPD/Asthma',
  'Chronic Kidney Disease', 'Cancer', 'Arthritis', 'Depression/Anxiety',
  'Dementia/Alzheimer\'s', 'Stroke', 'Osteoporosis', 'Thyroid Disorder',
]

const INSURANCE_TYPES = ['Medicare', 'Medicaid', 'Medicare + Medicaid', 'Private Insurance', 'Uninsured', 'Other']

const STEPS = ['Basic Info', 'Goals & Concerns', 'Medical History', 'Medications', 'Care Experience', 'Insurance']

export default function IntakeForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 0: Basic Info
  const [basicInfo, setBasicInfo] = useState({
    first_name: '', last_name: '', dob: '', phone: '', email: '', address: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  })

  // Step 1: Goals & Concerns
  const [reasonForAdvocacy, setReasonForAdvocacy] = useState('')
  const [goals, setGoals] = useState(['', '', ''])
  const [overwhelmingFactors, setOverwhelmingFactors] = useState([])
  const [overwhelmingOtherText, setOverwhelmingOtherText] = useState('')

  // Step 2: Medical History
  const [checkedConditions, setCheckedConditions] = useState([])
  const [customConditions, setCustomConditions] = useState('')
  const [hospitalizations, setHospitalizations] = useState([{ reason: '', hospital: '', admission_date: '', discharge_date: '' }])
  const [providers, setProviders] = useState([{ name: '', role: 'PCP', phone: '', practice: '' }])

  // Step 3: Medications
  const [medications, setMedications] = useState([{ name: '', dose: '', frequency: '', concerns: '' }])

  // Step 4: Care Experience
  const [careExp, setCareExp] = useState({
    clarity: '', feels_heard: '', num_doctors: '', desires_coordination: '',
  })

  // Step 5: Insurance
  const [insuranceType, setInsuranceType] = useState('')
  const [insuranceProvider, setInsuranceProvider] = useState('')
  const [billingConcerns, setBillingConcerns] = useState('')

  function toggleOverwhelming(opt) {
    setOverwhelmingFactors(prev =>
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    )
  }

  function toggleCondition(cond) {
    setCheckedConditions(prev =>
      prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]
    )
  }

  function updateListItem(setter, index, field, value) {
    setter(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function addListItem(setter, template) {
    setter(prev => [...prev, { ...template }])
  }

  function removeListItem(setter, index) {
    setter(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      // Insert patient
      const { data: patient, error: patientError } = await supabase.from('patients').insert({
        first_name: basicInfo.first_name,
        last_name: basicInfo.last_name,
        dob: basicInfo.dob || null,
        phone: basicInfo.phone,
        email: basicInfo.email,
        address: basicInfo.address,
        emergency_contact_name: basicInfo.emergency_contact_name,
        emergency_contact_phone: basicInfo.emergency_contact_phone,
        emergency_contact_relationship: basicInfo.emergency_contact_relationship,
        status: 'active',
        reason_for_advocacy: reasonForAdvocacy,
        overwhelming_factors: overwhelmingFactors.map(f =>
          f === 'Other' && overwhelmingOtherText.trim() ? `Other: ${overwhelmingOtherText.trim()}` : f
        ),
        care_experience: careExp,
      }).select().single()

      if (patientError) throw patientError

      const patientId = patient.id

      // Insert emergency contact into emergency_contacts table
      if (basicInfo.emergency_contact_name.trim()) {
        await supabase.from('emergency_contacts').insert({
          patient_id: patientId,
          name: basicInfo.emergency_contact_name,
          phone: basicInfo.emergency_contact_phone,
          relationship: basicInfo.emergency_contact_relationship,
        })
      }

      // Insert goals into goals table
      const validGoals = goals.filter(g => g.trim())
      if (validGoals.length > 0) {
        await supabase.from('goals').insert(
          validGoals.map(g => ({ patient_id: patientId, goal_text: g }))
        )
      }

      // Insert insurance into insurances table
      if (insuranceType) {
        await supabase.from('insurances').insert({
          patient_id: patientId,
          insurance_type: insuranceType,
          insurance_provider: insuranceProvider || null,
          billing_concerns: billingConcerns || null,
          is_primary: true,
        })
      }

      // Insert conditions
      const allConditions = [
        ...checkedConditions,
        ...customConditions.split(',').map(c => c.trim()).filter(Boolean),
      ]
      if (allConditions.length > 0) {
        await supabase.from('conditions').insert(
          allConditions.map(name => ({ patient_id: patientId, name }))
        )
      }

      // Insert medications
      const validMeds = medications.filter(m => m.name.trim())
      if (validMeds.length > 0) {
        await supabase.from('medications').insert(
          validMeds.map(m => ({ patient_id: patientId, ...m }))
        )
      }

      // Insert providers
      const validProviders = providers.filter(p => p.name.trim())
      if (validProviders.length > 0) {
        await supabase.from('providers').insert(
          validProviders.map(p => ({ patient_id: patientId, ...p }))
        )
      }

      // Insert hospitalizations
      const validHosps = hospitalizations.filter(h => h.reason.trim() || h.hospital.trim())
      if (validHosps.length > 0) {
        await supabase.from('hospitalizations').insert(
          validHosps.map(h => ({ patient_id: patientId, ...h }))
        )
      }

      navigate(`/patients/${patientId}`)
    } catch (err) {
      alert('Error saving patient: ' + err.message)
    }
    setSaving(false)
  }

  const isStepValid = () => {
    if (step === 0) return basicInfo.first_name.trim() && basicInfo.last_name.trim()
    return true
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList size={18} className="text-primary" />
          <h1 className="section-title text-3xl">New Patient Intake</h1>
        </div>
        <p className="font-body text-sm text-gray-400">
          Complete this form to create a new patient profile
        </p>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-all ${
                i === step
                  ? 'bg-primary text-white'
                  : i < step
                  ? 'bg-primary-light text-primary cursor-pointer hover:bg-primary/20'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {i < step && <Check size={11} />}
              {s}
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="card">
        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-heading text-2xl text-gray-800 mb-4">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">First Name *</label>
                <input className="input" value={basicInfo.first_name}
                  onChange={e => setBasicInfo(p => ({ ...p, first_name: e.target.value }))}
                  placeholder="Jane" autoFocus />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input className="input" value={basicInfo.last_name}
                  onChange={e => setBasicInfo(p => ({ ...p, last_name: e.target.value }))}
                  placeholder="Smith" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Date of Birth</label>
                <input className="input" type="date" value={basicInfo.dob}
                  onChange={e => setBasicInfo(p => ({ ...p, dob: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={basicInfo.phone}
                  onChange={e => setBasicInfo(p => ({ ...p, phone: e.target.value }))}
                  placeholder="(555) 000-0000" />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={basicInfo.email}
                onChange={e => setBasicInfo(p => ({ ...p, email: e.target.value }))}
                placeholder="jane@example.com" />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={basicInfo.address}
                onChange={e => setBasicInfo(p => ({ ...p, address: e.target.value }))}
                placeholder="123 Main St, City, State 00000" />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <h3 className="font-body text-sm font-semibold text-gray-600 mb-3">Emergency Contact</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Name</label>
                  <input className="input" value={basicInfo.emergency_contact_name}
                    onChange={e => setBasicInfo(p => ({ ...p, emergency_contact_name: e.target.value }))}
                    placeholder="Full name" />
                </div>
                <div>
                  <label className="label">Relationship</label>
                  <input className="input" value={basicInfo.emergency_contact_relationship}
                    onChange={e => setBasicInfo(p => ({ ...p, emergency_contact_relationship: e.target.value }))}
                    placeholder="e.g. Daughter" />
                </div>
              </div>
              <div className="mt-3">
                <label className="label">Phone</label>
                <input className="input" value={basicInfo.emergency_contact_phone}
                  onChange={e => setBasicInfo(p => ({ ...p, emergency_contact_phone: e.target.value }))}
                  placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Goals & Concerns */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-heading text-2xl text-gray-800 mb-4">Goals & Concerns</h2>
            <div>
              <label className="label">What brings them to SBHA?</label>
              <textarea className="input resize-none" rows={3}
                value={reasonForAdvocacy}
                onChange={e => setReasonForAdvocacy(e.target.value)}
                placeholder="Describe what led this patient to seek advocacy..." />
            </div>

            <div>
              <label className="label">Top 3 Goals</label>
              <div className="space-y-2">
                {goals.map((g, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary-light text-primary text-xs font-semibold font-body flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <input className="input" value={g}
                      onChange={e => setGoals(prev => prev.map((g2, j) => i === j ? e.target.value : g2))}
                      placeholder={`Goal ${i + 1}`} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="label">What feels most overwhelming?</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {OVERWHELMING_OPTIONS.map(opt => (
                  <div key={opt} className={opt === 'Other' && overwhelmingFactors.includes('Other') ? 'col-span-2' : ''}>
                    <button
                      type="button"
                      onClick={() => toggleOverwhelming(opt)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-body text-left transition-all border ${
                        overwhelmingFactors.includes(opt)
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                        overwhelmingFactors.includes(opt) ? 'bg-primary border-primary' : 'border-gray-300'
                      }`}>
                        {overwhelmingFactors.includes(opt) && <Check size={10} className="text-white" />}
                      </div>
                      <span className="text-xs leading-tight">{opt}</span>
                    </button>
                    {opt === 'Other' && overwhelmingFactors.includes('Other') && (
                      <input
                        className="input mt-1.5 text-sm"
                        placeholder="Please describe…"
                        value={overwhelmingOtherText}
                        onChange={e => setOverwhelmingOtherText(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Medical History */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-heading text-2xl text-gray-800 mb-4">Medical History</h2>

            <div>
              <label className="label">Conditions</label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {COMMON_CONDITIONS.map(cond => (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => toggleCondition(cond)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-body text-left transition-all border ${
                      checkedConditions.includes(cond)
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                      checkedConditions.includes(cond) ? 'bg-primary border-primary' : 'border-gray-300'
                    }`}>
                      {checkedConditions.includes(cond) && <Check size={9} className="text-white" />}
                    </div>
                    {cond}
                  </button>
                ))}
              </div>
              <input className="input" value={customConditions}
                onChange={e => setCustomConditions(e.target.value)}
                placeholder="Other conditions (comma-separated)" />
            </div>

            <div>
              <label className="label">Providers</label>
              <div className="space-y-3">
                {providers.map((p, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input bg-white text-sm py-2" value={p.name}
                        onChange={e => updateListItem(setProviders, i, 'name', e.target.value)}
                        placeholder="Provider name" />
                      <select className="input bg-white text-sm py-2"
                        value={p.role}
                        onChange={e => updateListItem(setProviders, i, 'role', e.target.value)}>
                        <option>PCP</option>
                        <option>Cardiologist</option>
                        <option>Neurologist</option>
                        <option>Oncologist</option>
                        <option>Orthopedist</option>
                        <option>Pulmonologist</option>
                        <option>Endocrinologist</option>
                        <option>Nephrologist</option>
                        <option>Psychiatrist</option>
                        <option>Other Specialist</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input bg-white text-sm py-2" value={p.phone}
                        onChange={e => updateListItem(setProviders, i, 'phone', e.target.value)}
                        placeholder="Phone" />
                      <input className="input bg-white text-sm py-2" value={p.practice}
                        onChange={e => updateListItem(setProviders, i, 'practice', e.target.value)}
                        placeholder="Practice/Hospital" />
                    </div>
                    {providers.length > 1 && (
                      <button onClick={() => removeListItem(setProviders, i)}
                        className="text-xs text-red-400 hover:text-red-600 font-body flex items-center gap-1">
                        <Trash2 size={11} /> Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addListItem(setProviders, { name: '', role: 'PCP', phone: '', practice: '' })}
                  className="flex items-center gap-1.5 text-sm text-primary font-body hover:underline"
                >
                  <Plus size={14} /> Add Provider
                </button>
              </div>
            </div>

            <div>
              <label className="label">Hospitalizations / ER Visits (last 12 months)</label>
              <div className="space-y-3">
                {hospitalizations.map((h, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input bg-white text-sm py-2" value={h.reason}
                        onChange={e => updateListItem(setHospitalizations, i, 'reason', e.target.value)}
                        placeholder="Reason" />
                      <input className="input bg-white text-sm py-2" value={h.hospital}
                        onChange={e => updateListItem(setHospitalizations, i, 'hospital', e.target.value)}
                        placeholder="Hospital" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label text-[10px]">Admission</label>
                        <input className="input bg-white text-sm py-2" type="date" value={h.admission_date}
                          onChange={e => updateListItem(setHospitalizations, i, 'admission_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-[10px]">Discharge</label>
                        <input className="input bg-white text-sm py-2" type="date" value={h.discharge_date}
                          onChange={e => updateListItem(setHospitalizations, i, 'discharge_date', e.target.value)} />
                      </div>
                    </div>
                    {hospitalizations.length > 1 && (
                      <button onClick={() => removeListItem(setHospitalizations, i)}
                        className="text-xs text-red-400 hover:text-red-600 font-body flex items-center gap-1">
                        <Trash2 size={11} /> Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addListItem(setHospitalizations, { reason: '', hospital: '', admission_date: '', discharge_date: '' })}
                  className="flex items-center gap-1.5 text-sm text-primary font-body hover:underline"
                >
                  <Plus size={14} /> Add Hospitalization
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Medications */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-heading text-2xl text-gray-800 mb-4">Medications</h2>
            <div className="space-y-3">
              {medications.map((m, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <input className="input bg-white text-sm py-2 col-span-1" value={m.name}
                      onChange={e => updateListItem(setMedications, i, 'name', e.target.value)}
                      placeholder="Medication name" />
                    <input className="input bg-white text-sm py-2" value={m.dose}
                      onChange={e => updateListItem(setMedications, i, 'dose', e.target.value)}
                      placeholder="Dose (e.g. 10mg)" />
                    <input className="input bg-white text-sm py-2" value={m.frequency}
                      onChange={e => updateListItem(setMedications, i, 'frequency', e.target.value)}
                      placeholder="Frequency (e.g. twice daily)" />
                  </div>
                  <input className="input bg-white text-sm py-2" value={m.concerns}
                    onChange={e => updateListItem(setMedications, i, 'concerns', e.target.value)}
                    placeholder="Medication concerns (optional)" />
                  {medications.length > 1 && (
                    <button onClick={() => removeListItem(setMedications, i)}
                      className="text-xs text-red-400 hover:text-red-600 font-body flex items-center gap-1">
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addListItem(setMedications, { name: '', dose: '', frequency: '', concerns: '' })}
                className="flex items-center gap-1.5 text-sm text-primary font-body hover:underline"
              >
                <Plus size={14} /> Add Medication
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Care Experience */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-heading text-2xl text-gray-800 mb-4">Care Experience</h2>

            <RadioGroup
              label="Do they understand their care plan?"
              options={['Always', 'Sometimes', 'Never']}
              value={careExp.clarity}
              onChange={v => setCareExp(p => ({ ...p, clarity: v }))}
            />
            <RadioGroup
              label="Do they feel heard by their doctors?"
              options={['Yes', 'No', 'Sometimes']}
              value={careExp.feels_heard}
              onChange={v => setCareExp(p => ({ ...p, feels_heard: v }))}
            />
            <RadioGroup
              label="How many doctors are they seeing?"
              options={['1–2', '3–4', '5+']}
              value={careExp.num_doctors}
              onChange={v => setCareExp(p => ({ ...p, num_doctors: v }))}
            />
            <RadioGroup
              label="Do they want better care coordination?"
              options={['Yes', 'No']}
              value={careExp.desires_coordination}
              onChange={v => setCareExp(p => ({ ...p, desires_coordination: v }))}
            />
          </div>
        )}

        {/* Step 5: Insurance */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-heading text-2xl text-gray-800 mb-4">Insurance & Billing</h2>
            <div>
              <label className="label">Insurance Type</label>
              <div className="flex flex-wrap gap-2">
                {INSURANCE_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setInsuranceType(type)}
                    className={`px-4 py-2 rounded-xl text-sm font-body transition-all border ${
                      insuranceType === type
                        ? 'bg-primary text-white border-primary'
                        : 'border-gray-200 text-gray-600 hover:border-primary/30'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Insurance Provider / Plan Name</label>
              <input className="input" value={insuranceProvider}
                onChange={e => setInsuranceProvider(e.target.value)}
                placeholder="e.g. Blue Cross Blue Shield, Aetna" />
            </div>
            <div>
              <label className="label">Billing Concerns</label>
              <textarea className="input resize-none" rows={3}
                value={billingConcerns}
                onChange={e => setBillingConcerns(e.target.value)}
                placeholder="Describe any billing concerns, outstanding balances, or insurance issues..." />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="btn-ghost disabled:opacity-0 disabled:pointer-events-none"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!isStepValid()}
              className="btn-primary flex items-center gap-2 py-2.5 px-6 disabled:opacity-50"
            >
              Continue <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary flex items-center gap-2 py-2.5 px-6 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={15} />
                  Create Patient Profile
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RadioGroup({ label, options, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-4 py-2 rounded-xl text-sm font-body transition-all border ${
              value === opt
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/30'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
