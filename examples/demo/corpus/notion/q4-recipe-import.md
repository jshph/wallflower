# Q4: Recipe import

**Status:** Decided · **Owner:** Maya · **Oct 3**
**Contributors:** Dev, Lin, Sam · **Linear:** LAR-110

---

## Decision

Q4 goes to recipe import. We take the beta that's been in the + menu since Sept 30 and make it the front door: import from any recipe link, quantities that make sense, and an import step in onboarding so a new household's first list comes from a meal they already want to make.

## Why

New households come to Larder because someone in the house already plans meals. Recipe import meets them at that moment: paste a link, get the ingredients on the shared list.

A few things point the same way:

- **Who signs up.** In the Q3 signup survey (n=412), 68% of people who created a household said they "plan meals for the week" at least sometimes. Our persona work from last year landed in the same place: the person who sets up Larder is the one who plans, owns the list, and hands off the run.
- **Where people come from.** The top three referrers for new households in Q3 were recipe sites or recipe creators linking to us. People find Larder while they're looking at a recipe.
- **What competitors are doing.** Pantri is shipping meal planning this month. We don't need a planner, but if someone's recipe can't get onto their list in one step, we lose them at the moment they're most motivated.
- **The beta works.** Rough as it is, the + menu import has a 94% parse success rate on the top 50 recipe sites.

## What we're building

1. **Import from any link.** Rewrite the parser to fall back to schema.org Recipe data, then heuristics. (LAR-112)
2. **Quantities that make sense.** "2 onion" should be "2 onions". Merge duplicates with what's already on the list. (LAR-112)
3. **Pantry staples filter.** Don't add salt, oil, pepper unless asked. (LAR-116)
4. **Onboarding entry point.** "Got a recipe in mind? Paste it here" as step 2 of onboarding, before invites. (LAR-114)

Rough timing: parser in Cycle 7, onboarding in Cycle 8, polish in Cycle 9. Done by Thanksgiving.

## Success metric

+15% new households per week by Dec 31.

Measured as households created with at least one item added in the first 24h, weekly, against the Sept 2026 average (1,840/week). Secondary: % of new households whose first list came from an import.

## Non-goals

Changes to sharing or permissions. These are working.

Also not in scope: meal planning or a calendar, nutrition info, pantry/inventory tracking, a "pro mode."

## Alternatives we considered

- **Sharing improvements** (item comments, assigning items, who-did-what). Some support volume here, but it's an existing-household problem. It doesn't bring anyone new in.
- **Android widget.** Real gap with iOS, but it's retention for people already here.
- **Pro mode** for power users. Loud, small group.

## Risks

- Parser quality on the long tail of recipe sites. Mitigation: show the parsed list before adding, let people edit.
- Import is a one-time action, not a habit. If people import once and don't come back, it moves signups but not retention. We'll watch week-2 retention for import households separately.
- Onboarding gets longer by one step.

## Open questions

- Should import create a new list or add to the existing one? (Leaning: add to existing, merge duplicates.)
- Do we need a "recipes" tab, or is import enough on its own? (Leaning: import only for Q4.)

---

*Comments*

**Sam Ortiz** · Oct 5
Onboarding step 2 means invites move to step 3. Fine by me, but we should watch invite rate from onboarding.

**Maya Okafor** · Oct 5
Yes, good call. Adding to the dashboard.

**Lin Zhou** · Oct 5
"Done by Thanksgiving" assumes the parser rewrite fits in one cycle. It might not.
