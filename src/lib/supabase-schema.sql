-- SBHA Care Manager — Supabase Schema
-- Run this in the Supabase SQL Editor to set up your database

-- Patients table
CREATE TABLE patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Demographics
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE,
  address TEXT,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'active', -- active, inactive, discharged

  -- Emergency contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,

  -- Insurance
  insurance_type TEXT,
  insurance_provider TEXT,
  billing_concerns TEXT,

  -- Intake info
  reason_for_advocacy TEXT,
  top_goals TEXT[], -- array of up to 3 goals
  overwhelming_factors TEXT[], -- checkboxes
  care_experience JSONB -- {clarity, feels_heard, num_doctors, desires_coordination}
);

-- Conditions table
CREATE TABLE conditions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Medications table
CREATE TABLE medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dose TEXT,
  frequency TEXT,
  concerns TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Providers table
CREATE TABLE providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT, -- PCP, cardiologist, etc.
  phone TEXT,
  fax TEXT,
  email TEXT,
  practice TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Caretakers table
CREATE TABLE caretakers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT, -- home nurse, family member, etc.
  phone TEXT,
  email TEXT,
  schedule_days TEXT[], -- ['Mon', 'Wed', 'Fri']
  schedule_time TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments table
CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  provider TEXT,
  location TEXT,
  appointment_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes table
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note_type TEXT,
  body TEXT,
  note_date DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emergency contacts table
CREATE TABLE emergency_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goals table
CREATE TABLE goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE, -- null = general/pinned
  name TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hospitalizations table
CREATE TABLE hospitalizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  reason TEXT,
  hospital TEXT,
  admission_date DATE,
  discharge_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE caretakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies (single authenticated user has full access)
CREATE POLICY "Authenticated user has full access to patients"
  ON patients FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to conditions"
  ON conditions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to medications"
  ON medications FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to providers"
  ON providers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to caretakers"
  ON caretakers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to appointments"
  ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to notes"
  ON notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to documents"
  ON documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to hospitalizations"
  ON hospitalizations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to emergency_contacts"
  ON emergency_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated user has full access to goals"
  ON goals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

CREATE POLICY "Authenticated user can manage documents storage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
