-- SBHA Care Manager — Migration SQL
-- Run this in the Supabase SQL Editor if you already ran supabase-schema.sql
-- and need to add the tables/columns added after the initial build.

-- 1. Update notes table to new schema
ALTER TABLE notes ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_date DATE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- If you previously used 'content' column, migrate it to 'body':
-- UPDATE notes SET body = content WHERE body IS NULL AND content IS NOT NULL;

-- 2. Add completed column to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

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

-- 4. Create goals table
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
