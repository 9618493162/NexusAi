
-- Reset Supabase database for NexusAI
-- Run this in Supabase SQL Editor

-- Drop existing policies first
DROP POLICY IF EXISTS "Message read own" ON "Message";
DROP POLICY IF EXISTS "Message insert own" ON "Message";
DROP POLICY IF EXISTS "Message update own" ON "Message";
DROP POLICY IF EXISTS "Message delete own" ON "Message";
DROP POLICY IF EXISTS "UploadedFile read own" ON "UploadedFile";
DROP POLICY IF EXISTS "UploadedFile insert own" ON "UploadedFile";
DROP POLICY IF EXISTS "UploadedFile update own" ON "UploadedFile";
DROP POLICY IF EXISTS "UploadedFile delete own" ON "UploadedFile";

-- Drop tables with cascade
DROP TABLE IF EXISTS "RefreshToken" CASCADE;
DROP TABLE IF EXISTS "UsageStat" CASCADE;
DROP TABLE IF EXISTS "Message" CASCADE;
DROP TABLE IF EXISTS "File" CASCADE;
DROP TABLE IF EXISTS "Conversation" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- Also drop any enum types if they exist
DROP TYPE IF EXISTS "Role" CASCADE;
