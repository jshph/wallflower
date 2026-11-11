LAR-88 Item comments

Status: Backlog
Priority: Low
Labels: sharing
Project: none
Cycle: none
Assignee: Unassigned
Estimate: 5
Created: Sep 22, 2026 by Sam Ortiz

Let household members leave a short comment on an item instead of editing the item name.

Right now people put the conversation in the item text itself ("yogurt — the Greek one, not vanilla", "they were out, got store brand"). It works, but the name gets long, gets truncated on Home, and the original item is lost when someone edits it.

Rough shape:
- tap item → comment field under the name
- comments visible to everyone in the household
- small dot on the item in the list when there's an unread comment

Open questions: notifications? do comments survive the item being checked/unchecked?

Figma: Item detail / comments exploration (Sam, Sep)

---

Activity

Sam Ortiz created the issue · Sep 22
Sam Ortiz added label sharing · Sep 22
Dev Raman set estimate to 5 · Sep 29

**Dev Raman** · Sep 29
Not small. Comments need their own sync channel or the item payload gets huge. Probably 2 cycles with notifications.

Maya Okafor moved from Triage to Backlog · Oct 6
Maya Okafor set priority to Low · Oct 6

**Maya Okafor** · Oct 6
Not for Q4. Revisit after recipe import ships.

**Sam Ortiz** · Oct 15
adding for later: usability session today, one household had "eggs (the brown ones, dad, not the sad ones)" as an item
