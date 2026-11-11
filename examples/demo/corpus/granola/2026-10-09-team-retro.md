# Larder team retro: Cycle 7

Fri, Oct 9, 2026 · 3:00 PM · 42 min
Attendees: Maya Okafor, Dev Raman, Lin Zhou, Sam Ortiz, Priya Nair

### What went well
- 3.14 shipped on time with no rollbacks
- New on-call handoff doc made the weekend rotation smoother
- Support response times stayed under 4 hours despite the iOS 20 update spike
- Recipe import beta rolled out to all users on Sept 30 without incidents

### What didn't go well
- Release notes were written the morning of the release, twice
- TestFlight build sat waiting for review for two days
- Pager alert for sync latency fired 11 times last weekend; most were false positives
- Android build was blocked on a signing key that only one person had access to

### Release process
- Agreed to cut the release branch Wednesday instead of Thursday
- Release notes drafted by whoever merges the last feature PR, reviewed by Maya
- Lin to document Android signing key recovery and add a second keyholder

### On-call
- Raise the sync latency alert threshold from 2s to 5s p95
- Priya to tag on-call in #support for anything that looks like data loss rather than DMing
- Keep rotation at one week; revisit if the team grows

### Action items
- Lin: Android signing key doc + second keyholder
- Dev: tune sync latency alert threshold
- Maya: release notes template
- Sam: move retro to 30 min

## Transcript

**Maya:** Okay, let's do it. Um, I'll keep this short because it's Friday and I can see Dev's already halfway out the door.

**Dev:** I'm right here.

**Maya:** *(laughs)* Physically. Okay, so, cycle seven. What went well. Anyone.

**Lin:** 3.14 went out on Tuesday, nothing rolled back. That's, I think that's the first time in like four releases.

**Maya:** Yes. Thank you. That's real.

**Priya:** The on-call doc helped a lot. Like, last weekend I knew who to ping and what to tell people. I didn't have to guess.

**Dev:** And recipe import beta's been out to everyone since the thirtieth and nothing's on fire. So.

**Maya:** Nothing's on fire is the bar, yeah. Okay, what didn't go well.

**Lin:** Release notes. We wrote them, um, the morning of. Again.

**Maya:** That's on me. I'll own that.

**Lin:** It's not, I mean it's not just you, it's like, nobody knows it's their job.

**Sam:** Could whoever merges the last thing write the first draft? They know what's in it.

**Maya:** Yeah. I like that. And I'll review. Okay. Other stuff.

**Dev:** The sync latency alert. It went off, what, eleven times last weekend? And I think one of those was real.

**Priya:** Was that the Saturday one? Because I did get a couple tickets Saturday morning about stuff not showing up.

**Dev:** Yeah, that was the real one. The rest were, the threshold's just too tight. It's two seconds p95, and the, like, the Android background sync just blows through that whenever someone's phone is in low power mode.

**Maya:** What do you want to set it to?

**Dev:** Five? Five seconds. And then we watch it for a cycle.

**Maya:** Okay, do it. Lin, Android signing.

**Lin:** So, yeah. The signing key is on my laptop and, like, a 1Password item that only I can see, I think. Which was fine until I was out Monday and we couldn't ship the hotfix.

**Maya:** Can you write it up and add, um, Dev, as a second person?

**Lin:** Yeah. I'll do that next week.

**Sam:** Can I add one? The TestFlight thing. We sat for two days waiting on review and I had a customer call where I wanted to show the new onboarding and I couldn't.

**Maya:** Is that a, is there anything we can actually do about that, or is that just Apple.

**Dev:** It's mostly Apple. We could submit earlier. Like, cut Wednesday instead of Thursday.

**Maya:** Okay. Let's cut Wednesday. Everyone okay with that?

**Lin:** Yep.

**Priya:** One more on-call thing. When it looks like data loss, like someone says their list is gone, I've been DMing whoever's on call, and then it gets lost in DMs. Can I just tag in #support?

**Dev:** Yes, please. Way better.

**Maya:** Okay, great. Anything else? No? Sam, can you make this thirty minutes next time.

**Sam:** *(laughs)* Already on it.

**Maya:** Okay, thanks everyone. Go home.
