# SBHA Care Manager — Claude Code Guide

## What This Project Is
A full-stack patient management web app built for South Bay Health Advocates (SBHA), a healthcare advocacy business run by a PharmD with 25 years of experience. This is both a real tool for the business AND a portfolio project for the developer (Aashna, a marketing major learning to vibe code).

## Startup Sequence (run every session)
**Terminal 1 — Claude Code:**
source ~/.bashrc
cd ~/Documents/sbha-care-manager
npx claude

**Terminal 2 — Dev server:**
source ~/.bashrc
cd ~/Documents/sbha-care-manager
pkill -f vite
npm run dev

Then open http://localhost:5173 in Chrome.

**End of session — always remind Aashna to run:**
cd ~/Documents/sbha-care-manager
git add .
git commit -m "describe what was built"
git push origin main

## Tech Stack
- Frontend: React + Vite, Tailwind CSS, React Router
- Database: Supabase (PostgreSQL with Row Level Security)
- Auth: Supabase Auth (single user per account)
- Hosting: Vercel (auto-deploys on push to main)
- Rich text: TipTap editor
- Icons: Lucide React

## Live URLs
- Production: https://sbha-care-manager.vercel.app
- GitHub: https://github.com/aashnatpatel/sbha-care-manager
- Supabase project: fzwvcmqyekxflwzbotmm

## Accounts
- Mom's account: info@southbayhealthadvocates.com — NEVER touch or modify this user's data
- Demo account: demo@demo.com — safe to use for testing

## Design System (never introduce new colors without asking Aashna first)
- Primary blue: #4F7EE0 — buttons, icons, pills, links, active states
- Accent mauve: #A671AA — hover border on cards, Intake & Background button, AI Briefing button
- Green: active status badge ONLY
- Gray #6B7280: passive icons, timestamps, secondary text, trash icons
- Background: #FFFFFF
- Headings font: Cormorant Garamond (Google Fonts)
- Body font: Montserrat (Google Fonts)
- Card style: white background, subtle gray border (#E5E7EB), soft shadow, rounded-xl
- Hover effect on cards: border-left 3px solid #A671AA, transparent at rest, 0.2s transition
- Document icons: mauve for PDF, blue for images, gray for other
- If you want to introduce any color not listed above, ask Aashna first

## Coding Rules
- Always use onMouseEnter/onMouseLeave with React state for hover styles — never Tailwind hover: classes (they don't work reliably in this project)
- Never use position: fixed inside modals
- All modals must have overflow-y-auto and pb-20 on mobile so content is never hidden behind the bottom nav bar
- Desktop is the priority layout but always add mobile responsive classes (sm:, md:, lg:) from the start — don't leave mobile as an afterthought
- Always give Aashna the SQL to run manually in Supabase — never try to run SQL automatically
- When making schema changes, provide ALTER TABLE statements, not DROP and recreate
- Always explain what you're doing and why — Aashna is learning to vibe code and wants to understand, not just copy-paste

## Supabase Schema Notes
- All tables have RLS enabled
- user_id on patients, documents, appointments links data to the logged-in user
- Child tables (conditions, medications, notes, etc.) inherit access through patient relationship
- Soft delete pattern: patients use deleted_at, notes use deleted_at
- Archive pattern: patients use status = 'archived' and archived_at
- Always run migrations as ALTER TABLE ADD COLUMN IF NOT EXISTS — never DROP columns without asking

## Phase 2 Roadmap (keep in mind when building)
- AI Briefing with real patient data (deferred — needs HIPAA BAA with Anthropic)
- Google Form → auto-populate into app
- Patient portal (built but disabled — needs HIPAA compliance first)
- Apple Calendar two-way sync (currently one-way .ics export only)

## HIPAA Note
This app is NOT yet fully HIPAA compliant. Mom should not use it with real sensitive patient data until:
1. Supabase BAA is signed (paid plan required)
2. Hosting is on a HIPAA-eligible platform
3. A healthcare compliance attorney reviews the setup
The app is currently being used for portfolio demonstration purposes.

## Terminology
- Always use "patients" in code and UI (not "clients")
- Archive = temporarily inactive patients (status = 'archived')
- Delete = soft delete (deleted_at set, not permanently removed unless "Permanently Delete" is chosen)
