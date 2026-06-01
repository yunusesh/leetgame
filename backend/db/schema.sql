-- backend/db/schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS problems (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  difficulty  TEXT        NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  topic_tags  TEXT[]      NOT NULL DEFAULT '{}',
  leetcode_id INT         UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS practice_days (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id       UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_stages TEXT[]  NOT NULL DEFAULT '{pattern,algorithm,tc_sc}',
  hide_title    BOOLEAN NOT NULL DEFAULT TRUE
);
