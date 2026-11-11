# emoji in list items?? #198

**Open** · kbrennan-77 opened this issue on Sep 24, 2026 · 3 comments
Labels: `feature-request` `android` `needs-triage`

---

**kbrennan-77** commented on Sep 24, 2026

**Is your feature request related to a problem? Please describe.**
Can you allow emoji in items? My son only replies in emoji and when he adds them on his phone they show up as little boxes on mine. Or sometimes they just disappear. He put something on the list yesterday that was just a box and a question mark and I had no idea what to buy.

**Describe the solution you'd like**
Emoji work in items. Thats it.

**Describe alternatives you've considered**
Texting him. He doesn't answer texts, he answers the list.

**Additional context**
I'm on a Samsung Galaxy A35, he has an iPhone. Not sure if that matters. Love the app otherwise.

---

**lzhou** commented on Sep 25, 2026

Thanks for filing. Emoji should work in item names, but we have an older sanitizer on Android that strips some characters on save (anything outside the basic multilingual plane, which is most emoji). iOS doesn't do this, which is why his look fine on his end.

Leaving this open as a bug rather than a feature. It's probably a small change but it touches the sync payload, so it needs a bit of care.

---

**kbrennan-77** commented on Sep 25, 2026

ok thank you!! fwiw the box was supposed to be 🍕 apparently

---

**priya-larder** commented on Oct 14, 2026

Linking two more support tickets with the same thing (#4388, #4412). One of them is a grandparent who says the grandkids "talk in emoji on the list."
