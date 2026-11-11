# Wallflower demo: spec (draft 2)

A recorded demo, about 3 minutes. Nothing is live. The source docs are invented and live in this folder. The agent's side is a scripted chat. The board is the real board, driven through its real states, so its motion is the product, not a mock. The person's side is you, live, while recording.

What the demo has to make felt:
1. **The agent sees across sources.** Each thread is split across tools. No single doc states it.
2. **The room does the seeing.** The first board is sparse. Most connections are left for people, and the read-back shows the ones they made.
3. **Narrowing is warranted.** When you drop a sticky, the second pass pulls things you couldn't have seen, including one that pushes back.

Every piece of copy below is written from its author's position, in their tool's register. A support ticket sounds like someone who just lost their list in a parking lot. A Linear title sounds like an engineer triaging between meetings. Nothing reads like a summary of itself.

---

## The story

**Larder**, a shared grocery list app for households. The team is five people. Three weeks ago the PM wrote up the Q4 bet: **recipe import**. Since then, customer calls and the support inbox have been circling something else, and it's scattered across six tools where nobody has put it together.

The room's two acts on Thursday:
- **Notice:** what are people actually using the list for?
- **Decide:** what does November go to?

## Cast

| Person | Role | Slack | GitHub | How they write |
|---|---|---|---|---|
| Maya Okafor | PM | @maya | mokafor | Notion in full sentences with headers; Slack quick and wry |
| Dev Raman | engineer | @dev | devr | PRs thorough; Slack mostly emoji reactions and "on it" |
| Lin Zhou | engineer | @lin | lzhou | issues with repro steps; dry |
| Sam Ortiz | designer, runs customer calls | @sam | — | Slack in lowercase, screenshots, "ok this is amazing" |
| Priya Nair | support | @priya | — | warm macro replies to customers; blunt in #support |

Customers, heard through Granola. Each gets one concrete, slightly odd detail:
- **Teresa**, two teenagers. The list is where the kids leave her notes.
- **Jonah**, with roommate Wes. "I make the list, he gets blamed."
- **Ana**, 72. Her daughter shops for her from across town and photographs Ana's fridge first.
- **Rob**, a power user. He strips everything down to quantities and wants a "pro mode". He's the counterexample.

The same person has different handles per tool on purpose. The agent has to count people, not accounts.

## How each source sounds

**Granola notes** are the AI summary, tidy and a little generic, under its own headings:

> ### Current workflow
> - Teresa uses Larder primarily to coordinate grocery runs with her two teenagers
> - Notes that the kids "use it more than I do, but not for groceries"

**Granola transcripts** are speech, with the stops and restarts left in:

> **Teresa:** So this one, this is Leo, he wrote — hang on — "milk, the GOOD one, sorry about Tuesday." And I still don't know what happened Tuesday. *(laughs)* But that's, like, that's how I find out stuff.

**Slack** is lowercase, threaded, half-finished, and mostly noise:

> **#random · sam** ok users are writing letters to each other in this app 😭
> > "eggs (the brown ones, dad, not the sad ones)"
> **maya** lol we built a messaging app by accident
> **dev** 💀
>
> **#eng · deploybot** ✅ larder-api deploy #482 succeeded (main@4f1c9e2)
> **#random · lin** anyone want thai

**GitHub** is engineer to engineer, with templates, code in backticks, and review nits:

> **#212 Lists auto-archive when every item is checked** · lzhou
> **Steps to reproduce**
> 1. Check off all items on a shared list
> 2. List moves to Archive after 10s, for all members
>
> **Expected:** ?? This is the behavior from #141, but support says people are surprised. Filing so we can decide on purpose.

> **PR #219 Add `last_edited_by` to list items** · devr
> Small one. Stores the editor's user id on item update and shows "edited by Wes" in the item detail sheet. Doesn't touch sharing permissions.
> **review · lzhou:** nit: `edited_by` is fine, we don't have `first_edited_by`. otherwise LGTM

**Linear** is titles, priorities, and the occasional deferral in a comment:

> **LAR-88 Item comments** · Backlog · Low · `sharing`
> **maya:** Not for Q4. Revisit after recipe import ships.
>
> **LAR-102 Photo attachment on item** · Canceled · `requests`
> **maya:** Two asks, both from the same household? Closing. Reopen if it comes up again.

**Notion** is the PM making a case, with decision, rationale, metric and non-goals:

> # Q4: Recipe import
> **Status:** Decided · **Owner:** Maya · **Oct 3**
> ## Why
> New households come to Larder because someone in the house already plans meals. Recipe import meets them at that moment: paste a link, get the ingredients on the shared list.
> ## Success metric
> +15% new households per week by Dec 31.
> ## Non-goals
> Changes to sharing or permissions. These are working.

**The persona doc** is design research from last year, earnest and composite:

> ## Meet Morgan, the Household Manager
> Morgan keeps the house running. They plan the week's meals on Sunday, own the list, and delegate the run.

**The metrics note** is Maya again, but reading numbers, and hedging:

> **Recipe import, 3 weeks in (Oct 24).** 3.1% of weekly actives have used it at least once. Too early to call, but it's not the pull we hoped. Sharing invites are up 22% over the same period, and I can't fully explain why.

**Support tickets** are customers mid-crisis, answered by Priya's warm macro:

> **Subject: WHERE IS MY LIST**
> Hi, I checked off everything at the store and the whole list disappeared?? We've had that list since March, there was stuff on it for Thanksgiving. Please tell me it's somewhere
> — Jonah
>
> **Priya:** Hi Jonah! So sorry for the scare 💛 Your list is safe, it's in Archive (menu → Archive). We're looking at making this less surprising!

## Five threads

Each thread has a **tip** (one card on the first board), a **reserve** (fragments across other tools that the first board leaves out), and **one counterexample**. All lines are verbatim from the docs above or ones like them.

**1. The list is a conversation.** (never stated anywhere)
- **Tip,** Granola, Teresa: *"milk, the GOOD one, sorry about Tuesday."*
- **Reserve:**
  - Slack #random, Sam: *"ok users are writing letters to each other in this app 😭"*
  - GitHub #198, a user-filed issue: *"Can you allow emoji in items? My son only replies in emoji"*
  - Linear LAR-88 Item comments, with Maya's *"Not for Q4."*
  - Granola, Ana: *"It's how we talk when we're not talking, me and my daughter."*
- **Counterexample,** Granola, Rob: *"I strip all that out. It's a list. Eggs, twelve."*

**2. The shopper isn't the planner.**
- **Tip,** Granola, Jonah: *"I make the list, he gets blamed. Like, he's the one standing in the store."*
- **Reserve:**
  - Notion persona doc: *"Morgan… owns the list, and delegates the run."*
  - Dev's PR #219 adds "edited by Wes".
  - Linear LAR-71 Assign items to a person, Canceled: *"adds complexity for one request."*
  - Slack #product, Maya: *"genuine question, who's our user here, the planner or the shopper"*, with no replies.
- **Counterexample,** support, from someone who lives alone: *"How do I turn off sharing? It's just me."*

**3. Checking before buying.**
- **Tip,** Granola, Ana: *"She takes a picture of my fridge first. Every time. Then she knows."*
- **Reserve:**
  - Two support tickets: *"Can I add a photo to an item?"*
  - Slack #product, Sam: *"we're competing with the camera roll and losing"*
  - Linear LAR-102 Photo attachment, Canceled, *"both from the same household?"* (they weren't).
- **Counterexample,** Granola, Teresa: *"A photo of my fridge would tell you nothing, it's chaos in there."*

**4. "Done" means two things.**
- **Tip,** support, Jonah: *"I checked off everything at the store and the whole list disappeared??"*
- **Reserve:**
  - GitHub #141 auto-archive on complete, from last spring.
  - Lin's #212: *"support says people are surprised. Filing so we can decide on purpose."*
  - Granola, Jonah: *"We've had that list since March."*
  - Slack #support, Maya: *"nobody should be keeping a list for 3 months lol"*
- **Counterexample,** Granola, Rob: *"Auto-archive is the best thing you built."*

**5. Decision drift** (the operational one).
- **Tip,** Notion, Oct 3: *"Q4: Recipe import · Decided"*
- **Reserve:**
  - Metrics note, Oct 24: *"3.1% of weekly actives… Sharing invites are up 22% and I can't fully explain why."*
  - GitHub: 3 of Dev's last 4 PRs touch sharing, none touch import.
  - Slack #eng, Dev: *"doing the sharing fix first, quick one"*
  - Linear: the import cycle slipped twice.
- **Counterexample,** Slack, Maya: *"import is how new households get in the door. sharing only matters once they're here."*

### Link map (sparse by design)

The web of possible connections across first-board cards has about 10 links. Each card has 0–2, and no card connects to everything.

- **The agent pairs two:**
  - the Oct 3 decision with the Oct 24 metrics note (5);
  - the persona doc with Jonah's "he gets blamed", a doc against a voice (2).
- **Left for the room,** for example:
  - Teresa's apology with Jonah's blame: the list carries both (1×2);
  - Ana's fridge photo with Teresa's notes: a list between generations (1×3);
  - the vanished-list ticket with anything that suggests lists live a long time (4).

`wallflower diff`'s "Connections people made that the agent did not" lists what the room found.

## The first board

The agent writes the board copy as a facilitator would: plain and descriptive, never concluding. Gists say what is there, and the quote says the rest.

- **Board title:** *Thursday: what's the list for, and what gets November?*
- **Prompts:**
  - *Start here. What are people using the list for? Move things, write what you see.*
  - *Drag into November what we're doing next.*
- **Groups:** 3, unnamed (naming them is the room's act). The agent groups by where things came from, with `why` noting it for the read-back:
  - things customers said;
  - things we wrote down;
  - things in the code and the queue.
- **Zone:** **November**, empty.
- **About 15 cards.** Example gists in the agent's voice:

| Kind | Gist (title) | Hook (body) | Source line |
|---|---|---|---|
| quote | Teresa reads an item out loud | milk, the GOOD one, sorry about Tuesday | Call with Teresa · Oct 14 |
| quote | Jonah on who makes the list | I make the list, he gets blamed | Call with Jonah · Oct 17 |
| quote | Ana on how her daughter shops | She takes a picture of my fridge first. Every time. | Call with Ana · Oct 21 |
| note | A list disappeared after the last item was checked | We've had that list since March | Support · Oct 22 |
| note | Q4 bet: recipe import | Decided Oct 3. Success: +15% new households a week | Notion |
| note | Recipe import, three weeks in | 3.1% of weekly actives. Sharing invites up 22%, unexplained | Maya's metrics note · Oct 24 |
| note | The household we designed for | "Morgan… owns the list, and delegates the run." | Persona doc |
| note | Item comments | Backlog, low. "Not for Q4." | Linear LAR-88 |

Plus two real but dead-end cards (a pricing-page experiment, an onboarding copy tweak), so people have something to throw out.

## The chat

The person asking is **Maya**, the PM. That makes the drift thread personal without anyone saying so: the agent pairs *her* Q4 doc with *her* numbers.

The chat is incidental, and the board carries the story. Maya types the way people type to their agent. The agent answers the way a capable colleague would: short, specific, with a small real snag, and never explaining the product. Nobody says "the room". Time passes between messages.

> **Wed 4:12 PM · Maya:** can you put together a board for planning tomorrow. main thing is figuring out what we're doing in november. calls, slack, whatever's open in linear/gh
>
> *(tool chips tick by)*
>
> **Agent:** It's up: board.example.com/?board=…
> 15 cards, mostly from the October calls and support, plus what's open in Linear and GitHub. Your Q4 doc and your numbers from last week are next to each other.
> Granola had two calls with Jonah. I used the 17th, the first one cuts off.

During the meeting, unprompted. Nobody asked; the board handed it the pass:

> **Thu 11:06 AM · Agent:** Kim asked for another pass. Added four around "the list is a conversation", mostly from the calls. One of them disagrees.

After:

> **Thu 12:02 PM · Maya:** ok we're out. what moved
>
> **Agent:** Three pairings I hadn't made, one of them Ana next to Jonah. One group got a name, "the list is a conversation". Q4 came out of November, and item comments went in.
> Full read-back's below if you want it.

The last message is filled from the real `wallflower diff`, so its specifics are whatever happened on the take. "Full read-back's below" expands to the diff itself.

## Beat sheet (about 3 minutes)

| t | Chat | Board | Docs pane |
|---|---|---|---|
| 0:00 | Wed 4:12 PM: Maya's ask | empty | — |
| 0:10 | Tool calls tick by as chips: `granola · 4 calls`, `slack · #product #support`, `gh issue list`, `linear · cycles 7–8`, `notion · Q4: Recipe import` | — | Each doc flashes by with the line it kept lit |
| 0:35 | "It's up…" | Cards drop in, neighborhood by neighborhood | — |
| 0:50 | — | **You**: drag the vanished-list ticket next to Teresa; sticky on Teresa: "the list is a conversation"; drag the Q4 card out of November; **Take another pass** | — |
| 1:40 | Thu 11:06 AM, unprompted: "Kim asked for another pass…" + 2 chips | Four cards ring the sticky; Rob's "I strip all that out" lands among them | The new docs flash by |
| 2:10 | — | **You**: pair Ana's line with Jonah's; name the group; drag Item comments into November | — |
| 2:30 | Thu 12:02 PM, Maya: "ok we're out. what moved" | — | — |
| 2:40 | The read-back | Camera fits the board | — |

## The player

One page with three panes, so the viewer sees cause and effect:

```
┌───────────────┬──────────────────────────────────┬──────────────┐
│ chat          │ board (the real one, live)        │ doc being    │
│ (scripted)    │                                   │ read, the    │
│ tool chips    │                                   │ kept line    │
│               │                                   │ lit          │
└───────────────┴──────────────────────────────────┴──────────────┘
```

- **Stepped by you.** A key advances to the next agent beat. Agent beats come from `script.json`: chat lines type out, chips tick, the doc pane shows the file, and the step's board change goes through the real server, so the animation is real.
- **Your moves are live.** The second-pass plan targets `around` your sticky, whatever you wrote on it.
- **The read-back is real** `wallflower diff`; the agent's last message is filled from it.
- **Resettable** with one command, for another take.
- **Recording-friendly:** a fixed window, no dev chrome, a large chat font, and an optional slower pace.

## Open questions for you

1. Does Larder and this cast feel right, or do you want a domain closer to your world?
2. Five threads, or three for a 2-minute cut?
3. Should Rob's counterexample land visibly, as above, or sit at the edge of the ring?
4. Is the player its own `/demo` page, or does it wrap the normal board?
