LAR-115 Pricing page test: annual-first vs monthly-first

Status: In Progress
Priority: Medium
Labels: growth, experiment
Project: Monetization
Cycle: Cycle 9
Assignee: Maya Okafor
Created: Oct 16, 2026 by Maya Okafor

**Hypothesis:** Showing the annual plan first (with monthly as the secondary option) increases paid conversion from the pricing page without hurting trial starts.

**Variants**
- A (control): monthly first, annual toggle
- B: annual first, "2 months free" badge, monthly as text link

**Split:** 50/50 on new visitors to /pricing (web only). App paywall unchanged.

**Primary metric:** pricing page → checkout start
**Secondary:** checkout completion, refund rate within 14 days
**Guardrail:** trial starts must not drop more than 5%

**Duration:** 2 weeks or ~4,000 visitors per arm, whichever is later. No peeking before Nov 6.

**Copy:** Sam. Checkout flow unchanged.

---

Activity

Maya Okafor created the issue · Oct 16
Maya Okafor added to Cycle 8 · Oct 16

**Sam Ortiz** · Oct 19
Variant B copy in Figma. Went with "2 months free" over "save 17%" since nobody does math on a pricing page.

**Dev Raman** · Oct 21
Flag is `pricing_annual_first`, assignment is sticky by anonymous id. Events wired to the same funnel as the current page.

Maya Okafor changed status from Todo to In Progress · Oct 23

**Maya Okafor** · Oct 23
Live. 50/50. Readout Nov 6.

Linear moved from Cycle 8 to Cycle 9 (incomplete at cycle end) · Oct 25
