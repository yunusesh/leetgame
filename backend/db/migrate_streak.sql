-- One-time migration: replaces practice_days with user_streaks.
-- Run once against the existing database before deploying the new backend.

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak            INT         NOT NULL DEFAULT 1 CHECK (streak >= 1),
  last_practiced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_streaks (user_id, streak, last_practiced_at)
SELECT pd.user_id, s.streak,
  TIMEZONE('UTC', (SELECT MAX(day)::TIMESTAMP FROM practice_days WHERE user_id = pd.user_id))
FROM (SELECT DISTINCT user_id FROM practice_days) pd
CROSS JOIN LATERAL (
  WITH ranked AS (
    SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
    FROM practice_days WHERE user_id = pd.user_id
  )
  SELECT COUNT(*)::INT AS streak FROM ranked
  WHERE day = (SELECT MAX(day) FROM practice_days WHERE user_id = pd.user_id) - CAST(rn - 1 AS INTEGER)
) s
ON CONFLICT (user_id) DO NOTHING;

DROP TABLE practice_days;
