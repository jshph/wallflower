# Add `last_edited_by` to list items #219

**Merged** · devr merged 4 commits into `main` from `devr/item-last-edited-by` on Oct 27, 2026
Labels: `sharing` `api` `ios` `android`
Reviewers: lzhou ✅
Linked issues: none

---

**devr** commented on Oct 21, 2026

Small one. Stores the editor's user id on item update and shows "edited by Wes" in the item detail sheet. Doesn't touch sharing permissions.

Context: Priya's been getting "who added this?" tickets ~3/week. We already store `created_by`, so "added by" was free. This adds the edit side.

**Changes**
- migration: `list_items.last_edited_by uuid null references users(id)`
- `PATCH /items/:id` sets `last_edited_by = current_user.id` when `name`, `quantity`, or `note` changes. Checking/unchecking does **not** count as an edit
- sync payload: adds `last_edited_by` (nullable, older clients ignore it)
- iOS + Android item detail sheet: "Added by Lin · edited by Wes" under the item name. Hidden on single-member households
- backfill: none. Existing items show "Added by" only until edited

**Testing**
- unit tests for the PATCH handler (edit vs. check)
- manual: two accounts, same household, edit on one and check the sheet on the other
- older client (3.13) against new API: no crash, field ignored

**Screenshots**
| iOS | Android |
|---|---|
| `item-sheet-edited-by-ios.png` | `item-sheet-edited-by-android.png` |

---

**lzhou** reviewed on Oct 22, 2026 · `api/models/list_item.rb`

```diff
+    t.uuid :last_edited_by, null: true
```

nit: `edited_by` is fine, we don't have `first_edited_by`. otherwise LGTM

---

**devr** commented on Oct 22, 2026

fair but `last_` makes it obvious it's overwritten. leaving it unless you feel strongly

---

**lzhou** commented on Oct 22, 2026

don't feel strongly

---

**lzhou** reviewed on Oct 23, 2026 · `ios/Larder/Items/ItemDetailSheet.swift`

```diff
+        if household.members.count > 1 {
```

Should this be `> 1` active members? Pending invites count toward `members` right now I think.

---

**devr** commented on Oct 26, 2026

good catch, switched to `activeMembers`. pushed

---

**lzhou** approved these changes on Oct 26, 2026

---

**devr** merged commit `5a1d8e3` into `main` on Oct 27, 2026
