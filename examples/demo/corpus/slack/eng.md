# #eng

**deploybot** · Oct 1, 10:12 AM
✅ larder-api deploy #471 succeeded (main@a83d0b1)

**lin** · Oct 1, 10:30 AM
recipe import parser error rate is 6% on day 1. mostly nyt + a couple wordpress themes. not urgent

**deploybot** · Oct 2, 3:44 PM
✅ larder-api deploy #472 succeeded (main@19e7c2f)

**dev** · Oct 5, 9:15 AM
3.14 release branch cut. qa build in testflight, android internal track in ~20
[:rocket: 2]

**deploybot** · Oct 5, 11:02 AM
✅ larder-api deploy #473 succeeded (main@c4b0e91)

**lin** · Oct 5, 2:20 PM
can someone review #208, it's 12 lines
[:eyes: 1]

> **dev** · Oct 5, 2:41 PM
> done
>
> **lin** · Oct 5, 2:42 PM
> ty

**deploybot** · Oct 6, 9:58 AM
✅ larder-ios 3.14.0 submitted to App Store (build 3140.2)

**deploybot** · Oct 6, 10:15 AM
✅ larder-android 3.14.0 rolled out to 100% (versionCode 31400)

**deploybot** · Oct 6, 4:31 PM
✅ larder-api deploy #474 succeeded (main@0f8a2dd)

**lin** · Oct 7, 11:10 AM
ipad crash on rotate is real, #207. only when the item sheet is open. looking

**deploybot** · Oct 7, 5:02 PM
❌ larder-api deploy #475 failed (main@7b31e04): migrations step timed out

> **lin** · Oct 7, 5:05 PM
> that's me. index on list_items is big. retrying off-hours
>
> **deploybot** · Oct 7, 9:48 PM
> ✅ larder-api deploy #476 succeeded (main@7b31e04)

**dev** · Oct 8, 10:00 AM
on-call handoff: quiet week except the 11 false sync alerts. bumping threshold to 5s per retro tomorrow
[:+1: 2]

**deploybot** · Oct 8, 2:12 PM
✅ larder-api deploy #477 succeeded (main@e2c95a8)

**deploybot** · Oct 9, 11:40 AM
✅ larder-api deploy #478 succeeded (main@58fd13c)

**lin** · Oct 12, 9:30 AM
on call this week. pls don't break anything i'm tired

**dev** · Oct 12, 10:18 AM
invite acceptance on android takes ~8s, it's waiting on a full list sync before it shows the list. should be quick

**maya** · Oct 13, 9:40 AM
@dev are you starting the import parser rewrite this cycle (LAR-112)? it's the big piece of LAR-110

> **dev** · Oct 13, 9:52 AM
> doing the sharing fix first, quick one
>
> **maya** · Oct 13, 9:53 AM
> 👍

**lin** · Oct 13, 11:30 AM
filed #212, auto-archive. not proposing anything, just want it written down somewhere other than #support

**deploybot** · Oct 13, 1:15 PM
✅ larder-api deploy #479 succeeded (main@3a9e6f0)

**lin** · Oct 13, 3:00 PM
#207 fixed, it was the sheet presenting twice on size class change

**deploybot** · Oct 14, 10:20 AM
✅ larder-api deploy #480 succeeded (main@d61b7a2)

**dev** · Oct 14, 4:45 PM
invite fix turned into a permissions thing. viewers can check items off right now, which, they shouldn't? opening a separate pr

> **lin** · Oct 14, 4:50 PM
> lol since when
>
> **dev** · Oct 14, 4:51 PM
> since forever i think
>
> **lin** · Oct 14, 4:52 PM
> cool cool cool

**deploybot** · Oct 15, 11:05 AM
✅ larder-api deploy #481 succeeded (main@88c2e4d)

**deploybot** · Oct 16, 2:30 PM
✅ larder-api deploy #482 succeeded (main@4f1c9e2)

**github** · Oct 16, 2:31 PM
devr merged #214 "Viewer role can't check off items"

**lin** · Oct 16, 3:10 PM
sync retry backoff PR up (#218 / LAR-93). it's mostly deleting my own code from last year
[:broom: 2]

**deploybot** · Oct 19, 10:01 AM
✅ larder-api deploy #483 succeeded (main@b5f7a19)

**github** · Oct 19, 4:20 PM
devr merged #216 "Invite links: single use, expire after 7 days"

**deploybot** · Oct 19, 4:35 PM
✅ larder-api deploy #484 succeeded (main@6e0dc38)

**lin** · Oct 20, 9:12 AM
anyone else's local db seed broken after the permissions migration

> **dev** · Oct 20, 9:20 AM
> yeah run `make seed-reset`, sorry
>
> **lin** · Oct 20, 9:31 AM
> 🙏

**deploybot** · Oct 20, 1:45 PM
✅ larder-api deploy #485 succeeded (main@21ac4f8)

**dev** · Oct 21, 11:00 AM
on call this week

**deploybot** · Oct 21, 3:30 PM
✅ larder-api deploy #486 succeeded (main@9d3e7b0)

**deploybot** · Oct 22, 2:58 PM
✅ larder-api deploy #487 succeeded (main@f40b26e)

**github** · Oct 23, 11:12 AM
lzhou merged #218 "Exponential backoff for sync retries"

**deploybot** · Oct 23, 11:30 AM
✅ larder-api deploy #488 succeeded (main@0b8c5d1)

**dev** · Oct 26, 9:40 AM
stripe double charge was a retry on webhook timeout. idempotency key going in today

**dev** · Oct 26, 2:05 PM
#220 up, idempotency key on the stripe webhook handler. would love eyes today

> **lin** · Oct 26, 3:40 PM
> approved w/ one comment

**deploybot** · Oct 26, 4:10 PM
✅ larder-api deploy #489 succeeded (main@c72e9fa)

**github** · Oct 27, 10:22 AM
devr merged #219 "Add `last_edited_by` to list items"

**deploybot** · Oct 27, 10:40 AM
✅ larder-api deploy #490 succeeded (main@5a1d8e3)

**lin** · Oct 27, 11:00 AM
3.15 branch cut wednesday. what's going in besides last_edited_by and backoff

> **dev** · Oct 27, 11:15 AM
> #220 idempotency fix, invite expiry ui
>
> **maya** · Oct 27, 11:20 AM
> import parser?
>
> **dev** · Oct 27, 11:31 AM
> not this one. next
>
> **maya** · Oct 27, 11:32 AM
> ok

**github** · Oct 28, 9:41 AM
devr merged #220 "Idempotency key for Stripe webhook retries"

**deploybot** · Oct 28, 9:55 AM
✅ larder-api deploy #491 succeeded (main@e9147ab)
