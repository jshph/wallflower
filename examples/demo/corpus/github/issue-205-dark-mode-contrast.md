# Dark mode: checked items nearly invisible #205

**Closed** · lzhou opened this issue on Oct 2, 2026 · 2 comments
Labels: `bug` `design` `accessibility`
Assignees: lzhou
Linked pull requests: #215

---

**lzhou** commented on Oct 2, 2026

**Describe the bug**
In dark mode, checked items render at `#3A3A3C` on `#1C1C1E`. That's ~1.4:1. You basically can't see them.

**Steps to reproduce**
1. Turn on dark mode (system)
2. Open any list with checked items
3. Scroll to the checked section

**Expected**
Checked items readable but clearly de-emphasized. WCAG AA for body text is 4.5:1, we can probably get away with 3:1 since it's de-emphasized on purpose, but 1.4 is not that.

**Device**
iPhone 16, iOS 20.0.1, Larder 3.13.2. Same on Pixel 9.

**Screenshots**
`dark-checked-before.png`

---

**sam-ortiz** commented on Oct 5, 2026

Use `text.tertiary` from the dark palette (`#8E8E93`), that's ~5.2:1 on the background. Strikethrough stays. I'll update the Figma tokens so it doesn't drift again.

---

**lzhou** closed this as completed in #215 on Oct 15, 2026
