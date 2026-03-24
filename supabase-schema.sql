-- Run this in your Supabase SQL Editor

-- Teams Table
CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_banned BOOLEAN DEFAULT FALSE
);

-- Puzzles Table
CREATE TABLE puzzles (
  puzzle_id TEXT PRIMARY KEY,
  puzzle_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('python', 'javascript', 'text'))
);

-- Assignments Table
CREATE TABLE assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT REFERENCES teams(team_id) ON DELETE CASCADE,
  puzzle_id TEXT REFERENCES puzzles(puzzle_id) ON DELETE CASCADE,
  start_time BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'expired'))
);

-- Submissions Table
CREATE TABLE submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT REFERENCES teams(team_id) ON DELETE CASCADE,
  puzzle_id TEXT REFERENCES puzzles(puzzle_id) ON DELETE CASCADE,
  answer_submitted TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('correct', 'incorrect'))
);

-- Lifelines Table
CREATE TABLE lifelines (
  team_id TEXT PRIMARY KEY REFERENCES teams(team_id) ON DELETE CASCADE,
  lifeline_remaining INTEGER DEFAULT 3,
  lifeline_used INTEGER DEFAULT 0
);
