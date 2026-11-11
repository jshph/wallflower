# iPad: crash when rotating with item sheet open #207

**Closed** · lzhou opened this issue on Oct 3, 2026 · 3 comments
Labels: `bug` `ios` `crash`
Assignees: lzhou
Linked pull requests: #213

---

**lzhou** commented on Oct 3, 2026

**Describe the bug**
App crashes on iPad when you rotate the device while the item detail sheet is open. 38 crashes in the last 7 days, all iPadOS, all on 3.13.x.

**Steps to reproduce**
1. Open a list on iPad (portrait)
2. Tap an item to open the detail sheet
3. Rotate to landscape

**Expected**
Sheet stays open, re-lays out for landscape.

**Actual**
Crash. Top frame:

```
*** Terminating app due to uncaught exception 'NSInternalInconsistencyException',
reason: 'Attempt to present <ItemDetailSheetController: 0x10a8c3e00> on
<ListViewController: 0x10a6f1200> which is already presenting'
```

**Device**
iPad Air (M2), iPadOS 20.0. Couldn't repro on iPad mini.

---

**devr** commented on Oct 6, 2026

Probably `viewWillTransition` re-presenting the sheet on size class change. We added that for split view in 3.12.

---

**lzhou** commented on Oct 7, 2026

Yep. It presents once on the trait change and once from the coordinator. Fix incoming.

---

**lzhou** closed this as completed in #213 on Oct 13, 2026
