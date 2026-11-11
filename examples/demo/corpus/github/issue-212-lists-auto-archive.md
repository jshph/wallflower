# Lists auto-archive when every item is checked #212

**Open** · lzhou opened this issue on Oct 13, 2026 · 3 comments
Labels: `lists` `needs-decision`
Assignees: none

---

**lzhou** commented on Oct 13, 2026

**Steps to reproduce**
1. Check off all items on a shared list
2. List moves to Archive after 10s, for all members
3. Other members see the list disappear from Home with no toast

**Expected:** ?? This is the behavior from #141, but support says people are surprised. Filing so we can decide on purpose.

**Context**
- Priya had two tickets on Oct 12 where someone thought we deleted their list
- Both were shared lists, and in both cases the person who checked the last item wasn't the one who wrote in
- Per #141 only the person who checks the last item sees the toast. Everyone else just sees it vanish

**Data** (last 30 days)
- 14.2k lists auto-archived
- 4.3% unarchived within 48h
- of those, 71% were lists older than 30 days

Not proposing a fix. Options I can think of, not exhaustive:
- toast for all members
- don't auto-archive lists older than N days
- per-list setting
- leave it

---

**priya-larder** commented on Oct 22, 2026

Another one today (ticket #4502). Checked off everything at the store, list gone, customer thought it was deleted. They've used that same list since March. Pointed them to Archive.

That's 7 since Sept 20 that I've tagged.

---

**devr** commented on Oct 22, 2026

the 30+ day stat is interesting. those aren't trips, those are like, standing lists

---

**lzhou** commented on Oct 22, 2026

yeah. that's the part I don't know what to do with
