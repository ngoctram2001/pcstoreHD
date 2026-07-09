-- ============================================
-- Add "messages" table for the general contact form
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a message (no login required)
DROP POLICY IF EXISTS "anyone_insert_messages" ON messages;
CREATE POLICY "anyone_insert_messages" ON messages
  FOR INSERT WITH CHECK (true);

-- Only logged-in admin can read messages
DROP POLICY IF EXISTS "authenticated_read_messages" ON messages;
CREATE POLICY "authenticated_read_messages" ON messages
  FOR SELECT TO authenticated USING (true);

-- Only logged-in admin can update message status (e.g. mark as read)
DROP POLICY IF EXISTS "authenticated_update_messages" ON messages;
CREATE POLICY "authenticated_update_messages" ON messages
  FOR UPDATE TO authenticated USING (true);
