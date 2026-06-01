#!/usr/bin/env python3
"""One-time script to backfill leetcode_id from the HuggingFace dataset."""

import os
import psycopg2
from datasets import load_dataset

DATABASE_URL = os.environ["DATABASE_URL"]

print("Loading dataset...")
ds = load_dataset("newfacade/LeetCodeDataset", split="train")
print(f"Loaded {len(ds)} problems.")

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

updated = 0
skipped = 0

try:
    for row in ds:
        slug = row.get("task_id") or ""
        raw_id = row.get("question_id")
        if not slug or raw_id is None:
            skipped += 1
            continue
        leetcode_id = int(raw_id)
        cur.execute(
            "UPDATE problems SET leetcode_id = %s WHERE slug = %s AND leetcode_id IS NULL",
            (leetcode_id, slug),
        )
        if cur.rowcount > 0:
            updated += 1
        else:
            skipped += 1
    conn.commit()
    print(f"Updated: {updated}, Skipped: {skipped}")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
    raise
finally:
    cur.close()
    conn.close()
