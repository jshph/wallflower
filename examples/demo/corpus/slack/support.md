# #support

**helpdesk** · Oct 1, 9:00 AM
Daily digest: 18 new · 15 solved · 3 pending · median first response 2h 41m

**priya** · Oct 1, 9:20 AM
ios 20 sync stuff still trickling in. same macro, "force quit and reopen," it works, i hate it
[:upside_down_face: 2]

> **dev** · Oct 1, 9:45 AM
> fix is in 3.14, ships tue

**helpdesk** · Oct 2, 9:00 AM
Daily digest: 11 new · 13 solved · 1 pending · median first response 1h 58m

**priya** · Oct 2, 2:10 PM
someone wants to know if larder works on their fridge. like the samsung fridge with the screen

> **lin** · Oct 2, 2:15 PM
> no
>
> **priya** · Oct 2, 2:15 PM
> i said "not yet!" with a smiley
> [:joy: 3]

**priya** · Oct 5, 11:30 AM
recipe import tickets so far: 4, all "it put salt on my list." working as intended i assume?

> **maya** · Oct 5, 11:42 AM
> yeah it adds everything. pantry staples filter is on the list
>
> **priya** · Oct 5, 11:43 AM
> ok i'll say "coming soon" 💛

**helpdesk** · Oct 6, 9:00 AM
Daily digest: 22 new · 19 solved · 4 pending · median first response 3h 12m

**priya** · Oct 7, 3:40 PM
"who added this to our list" ticket. household of 4, someone keeps adding energy drinks and nobody will admit it
[:joy: 4]

> **lin** · Oct 7, 3:44 PM
> we know who. we're not telling them

**priya** · Oct 9, 10:05 AM
per retro: if something looks like data loss i'm tagging on-call here instead of DMing. on-call this week is @lin
[:+1: 3]

**helpdesk** · Oct 12, 9:00 AM
Daily digest: 31 new · 24 solved · 7 pending · median first response 4h 05m

**priya** · Oct 12, 9:30 AM
monday. 31. a third of them are password resets because the reset email is going to spam on outlook again

> **dev** · Oct 12, 9:50 AM
> on it. probably DKIM again
>
> **dev** · Oct 12, 11:20 AM
> fixed, was the DKIM rotation. resend should land now
> [:pray: 2]

**priya** · Oct 12, 4:15 PM
two "my list disappeared" tickets today. both checked off the last item and the list went to archive. both thought we deleted it

> **lin** · Oct 12, 4:22 PM
> auto-archive. working as built
>
> **priya** · Oct 12, 4:23 PM
> i know. they don't
>
> **lin** · Oct 12, 4:30 PM
> fair. i'll write it up

**priya** · Oct 13, 1:05 PM
another "who added this?" one. couple, one of them is convinced the other is adding stuff "as a bit"

**helpdesk** · Oct 14, 9:00 AM
Daily digest: 17 new · 20 solved · 2 pending · median first response 2h 03m

**priya** · Oct 15, 11:12 AM
third "who added this?" ticket this week. can we just show it somewhere. like anywhere
[:raised_hand: 2]

> **dev** · Oct 15, 11:20 AM
> we store created_by already, just not who edited. not hard
>
> **maya** · Oct 15, 11:31 AM
> after the invite fix, sure
>
> **dev** · Oct 15, 11:32 AM
> on it

**priya** · Oct 16, 4:00 PM
fyi android widget questions are up, people found the old beta widget in the play store listing screenshots and want it

> **lin** · Oct 16, 4:10 PM
> LAR-97. it's real, it's just not done

**helpdesk** · Oct 19, 9:00 AM
Daily digest: 26 new · 21 solved · 5 pending · median first response 3h 30m

**priya** · Oct 19, 2:48 PM
feature req: photo on an item. "Can I add a photo to an item?" wants to show her husband which coffee. made LAR-102 so it's somewhere
[:+1: 1]

**priya** · Oct 20, 10:30 AM
this one's sweet. guy lives alone, keeps seeing the invite banner, asked how to turn off sharing because it's just him. told him to dismiss the banner, his list is private unless he invites someone

> **sam** · Oct 20, 10:36 AM
> aw
>
> **maya** · Oct 20, 10:40 AM
> banner should go away after you dismiss it twice. does it not?
>
> **priya** · Oct 20, 10:42 AM
> he says it comes back every update
>
> **dev** · Oct 20, 10:50 AM
> yeah the "what's new" sheet resets it. 🫠 noted

**priya** · Oct 22, 9:14 AM
@lin not data loss but it LOOKS like data loss to him. checked off everything on their list at the store, whole list disappeared, he's freaking out. it's in archive. they've had that list since march
[:eyes: 2]

> **lin** · Oct 22, 9:20 AM
> auto-archive again. that's #141 doing its job
>
> **priya** · Oct 22, 9:22 AM
> he did not experience it as a job being done
>
> **maya** · Oct 22, 9:25 AM
> nobody should be keeping a list for 3 months lol
>
> **priya** · Oct 22, 9:31 AM
> i have like 6 of these from the last month fwiw. most just don't write in all caps
>
> **lin** · Oct 22, 9:40 AM
> adding him to #212

**priya** · Oct 22, 9:45 AM
replied to him. pointed at menu → archive. he's ok now

**helpdesk** · Oct 23, 9:00 AM
Daily digest: 24 new · 26 solved · 3 pending · median first response 2h 47m

**priya** · Oct 23, 11:05 AM
another photo-on-item one. added to LAR-102

> **maya** · Oct 23, 4:15 PM
> closed it for now, see comment

**priya** · Oct 26, 9:10 AM
billing: someone got charged twice for annual. stripe shows two succeeded charges 4 min apart
[:grimacing: 2]

> **dev** · Oct 26, 9:15 AM
> on it
>
> **dev** · Oct 26, 10:02 AM
> retry on timeout, webhook came back slow and the app retried. refund the second one, i'll add an idempotency key
>
> **priya** · Oct 26, 10:05 AM
> refunded 💛

**helpdesk** · Oct 27, 9:00 AM
Daily digest: 29 new · 25 solved · 6 pending · median first response 3h 18m

**priya** · Oct 27, 2:20 PM
out fri. jen's covering. macros are up to date, she has the "my list disappeared" one now too
[:pray: 3]

**priya** · Oct 28, 10:40 AM
anyone know if the pricing page test changes the checkout copy? want to make sure the billing macros match

> **maya** · Oct 28, 10:52 AM
> page only. checkout's the same
