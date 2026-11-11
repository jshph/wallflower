LAR-93 Sync retry: exponential backoff

Status: Done
Priority: High
Labels: sync, infra
Project: Reliability
Cycle: Cycle 8
Assignee: Lin Zhou
Created: Sep 3, 2026 by Lin Zhou

When a sync request fails, clients retry every 2s forever. During the Sep 1 API blip this turned into ~40k req/min from about 9k devices and kept the API down for 12 minutes after the actual fix.

- exponential backoff starting at 1s, cap at 60s, with jitter
- reset on success or app foreground
- respect `Retry-After` when the API sends it
- same logic on iOS and Android (shared constants)

Repro: block `api.larder.app` with a local proxy, watch the request rate.

---

Activity

Lin Zhou created the issue · Sep 3
Lin Zhou set priority to High · Sep 3

**Dev Raman** · Sep 4
+1. also we should send Retry-After from the load balancer on 503s, right now it doesn't

**Lin Zhou** · Sep 4
yep, adding to the LB config as part of this

Lin Zhou added to Cycle 8 · Oct 12

**Lin Zhou** · Oct 16
PR #218. Most of the diff is deleting the old retry loop.

Lin Zhou changed status from In Progress to Done · Oct 23
