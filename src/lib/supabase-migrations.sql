-- SBHA Care Manager — Migrations
-- Run these in the Supabase SQL Editor (safe to run multiple times with IF NOT EXISTS)

-- Add client_since to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS client_since DATE;

-- Add notes to providers
ALTER TABLE providers ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add notes to medications (separate from concerns)
ALTER TABLE medications ADD COLUMN IF NOT EXISTS notes TEXT;

-- Upgrade notes table for rich notes system
ALTER TABLE notes ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type TEXT DEFAULT 'General';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS custom_type_label TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS body TEXT;
