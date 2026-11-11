LAR-97 Android home screen widget

Status: Backlog
Priority: Medium
Labels: android
Project: none
Cycle: none
Assignee: Lin Zhou
Created: Sep 15, 2026 by Lin Zhou

Home screen widget showing one pinned list. Parity with the iOS widget (shipped in 3.8).

- 2x2: list name + next 3 unchecked items
- 4x2: list name + up to 6 items, tap to check
- tap header → open list in app
- updates on sync, at most every 15 min in background (Glance + WorkManager)

Old prototype is on `lzhou/android-widget-proto`. It's in the Play Store screenshots by mistake (from the 3.12 listing refresh).

---

Activity

Lin Zhou created the issue · Sep 15
Lin Zhou added to Cycle 7 · Sep 28

**Lin Zhou** · Oct 2
Check-from-widget needs the interactive Glance APIs, which are flaky on some Samsung launchers. Might ship 2x2 read-only first.

Lin Zhou removed from Cycle 7 · Oct 9

**Lin Zhou** · Oct 9
Pulling this to make room for the signing key work. Back to backlog.

**Priya Nair** · Oct 16
Getting tickets asking for it because of the Play Store screenshots. Can we at least swap the screenshot?

**Sam Ortiz** · Oct 17
swapped the screenshot, live on next listing update
