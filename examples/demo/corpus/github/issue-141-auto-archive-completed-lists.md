# Auto-archive completed lists #141

**Closed** · lzhou opened this issue on Apr 8, 2026 · 5 comments
Labels: `enhancement` `lists`
Assignees: lzhou
Linked pull requests: #146

---

**lzhou** commented on Apr 8, 2026

**Problem**

Completed lists clutter the home screen. Once every item on a list is checked, the list stays on Home forever unless someone manually archives it, and almost nobody does. From the analytics export last week:

- median household has 7 lists on Home
- 61% of those have every item checked
- the "Archive" swipe action is used by ~4% of WAU

So Home is mostly dead lists, and the one you actually need is below the fold.

**Proposal**

When the last unchecked item on a list is checked:

1. Wait 10s (so an accidental last check can be undone)
2. Show a toast: "List complete. Moved to Archive." with **Undo**
3. Move the list to Archive for all members

Unarchiving restores it to Home with items still checked.

**Out of scope**

- Auto-deleting anything. Archive keeps everything.
- A setting to turn it off. Can add later if people ask.

**Notes**

Server side this is just `lists.archived_at`, which already exists. The 10s delay is client-side; if the client goes away, a job sweeps lists where every item has been checked for > 1 min.

---

**mokafor** commented on Apr 8, 2026

+1. Home being 80% finished lists is the top thing in onboarding sessions too. People think the app is "full."

---

**devr** commented on Apr 9, 2026

Should the toast show for everyone on the list or just whoever checked the last item? Feels weird to get "List complete" on your phone when you're not the one shopping.

---

**lzhou** commented on Apr 9, 2026

Just the person who checked it. Everyone else just sees it leave Home.

---

**mokafor** commented on Apr 10, 2026

Agree. Let's ship it in 3.9.

---

**lzhou** closed this as completed in #146 on May 2, 2026
