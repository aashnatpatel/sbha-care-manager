-- SBHA Care Manager — Migration SQL
-- Run this in the Supabase SQL Editor if you already ran supabase-schema.sql
-- and need to add the tables/columns added after the initial build.

-- 0. Add client_since to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS client_since DATE;

-- 1. Update notes table to new schema
ALTER TABLE notes ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_date DATE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- If you previously used 'content' column, migrate it to 'body':
-- UPDATE notes SET body = content WHERE body IS NULL AND content IS NOT NULL;

-- 2. Add completed, appointment_type, and type columns to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_type TEXT;
-- 'type' alias requested as fallback — app uses appointment_type
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS type TEXT;

-- 3. Create emergency_contacts table
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'emergency_contacts' AND policyname = 'Authenticated user has full access to emergency_contacts'
  ) THEN
    CREATE POLICY "Authenticated user has full access to emergency_contacts"
      ON emergency_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Create insurances table
CREATE TABLE IF NOT EXISTS insurances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  insurance_type TEXT,
  insurance_provider TEXT,
  billing_concerns TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE insurances ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'insurances' AND policyname = 'Authenticated user has full access to insurances'
  ) THEN
    CREATE POLICY "Authenticated user has full access to insurances"
      ON insurances FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Create caretaker_schedules table
CREATE TABLE IF NOT EXISTS caretaker_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caretaker_id UUID REFERENCES caretakers(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE caretaker_schedules ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'caretaker_schedules' AND policyname = 'Authenticated user has full access to caretaker_schedules'
  ) THEN
    CREATE POLICY "Authenticated user has full access to caretaker_schedules"
      ON caretaker_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Create goals table
CREATE TABLE IF NOT EXISTS goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'goals' AND policyname = 'Authenticated user has full access to goals'
  ) THEN
    CREATE POLICY "Authenticated user has full access to goals"
      ON goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
