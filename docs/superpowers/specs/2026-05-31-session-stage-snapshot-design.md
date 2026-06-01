# Session Stage Snapshot Design

**Goal:** Prevent active stage changes from silently affecting an in-progress conversation, and give users an explicit way to restart the current problem with new stages.

**Architecture:** Add a `sessionActiveStages` snapshot in App.tsx that captures `activeStages` when a problem loads. All in-session logic (streamChat, stage progression) uses the snapshot. When the snapshot diverges from the current `activeStages`, a dismissable banner appears above the practice area offering a restart.

---

## State

- `sessionActiveStages: ActiveStage[]` — snapshot of active stages at problem load time
- `stageBannerDismissed: boolean` — hides the banner until `activeStages` changes again

## Behavior

- `resetPracticeState()` snapshots `activeStages` into `sessionActiveStages`
- `handleStagesChange()` resets `stageBannerDismissed` to `false` so the banner reappears on any new change
- `streamChat` uses `sessionActiveStages` (not `activeStages`)
- Banner is shown when: problem loaded, stage !== 'complete', not dismissed, and `sessionActiveStages !== activeStages`
- **Restart**: calls `resetPracticeState()` which snapshots new stages and clears history/stage
- **Dismiss**: sets `stageBannerDismissed = true`; banner hides until next settings change

## UI

Full-width banner above the problem/chat split:
> "Stage settings changed. [Restart with new stages] [×]"
