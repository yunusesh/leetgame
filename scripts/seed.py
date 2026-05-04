#!/usr/bin/env python3
"""One-time script to seed the problems table from the HuggingFace dataset."""

import ast
import os
import uuid
import psycopg2
from datasets import load_dataset

DATABASE_URL = os.environ["DATABASE_URL"]

print("Loading dataset...")
ds = load_dataset("newfacade/LeetCodeDataset", split="train")
print(f"Loaded {len(ds)} problems.")

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

inserted = 0
skipped = 0

try:
    for row in ds:
        slug        = row.get("task_id") or ""
        title       = slug.replace("-", " ").title() if slug else ""
        description = row.get("problem_description") or ""
        difficulty  = (row.get("difficulty") or "").capitalize()
        raw_tags    = row.get("tags") or "[]"
        try:
            topic_tags = ast.literal_eval(raw_tags) if isinstance(raw_tags, str) else list(raw_tags)
        except Exception:
            topic_tags = []

        if not slug or not title or not description or not difficulty:
            skipped += 1
            continue

        cur.execute(
            """
            INSERT INTO problems (id, slug, title, description, difficulty, topic_tags)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (slug) DO NOTHING
            """,
            (str(uuid.uuid4()), slug, title, description, difficulty, topic_tags),
        )
        if cur.rowcount > 0:
            inserted += 1
        else:
            skipped += 1
    conn.commit()
except Exception:
    conn.rollback()
    raise
finally:
    cur.close()
    conn.close()

print(f"Done. inserted={inserted} skipped={skipped}")
