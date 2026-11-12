---
name: wallflower
description: Populate a shared whiteboard (Wallflower, built on tldraw) with what's worth discussing before a meeting or a private review, take further passes when people ask for more, then read back what people did to it and separate their judgment from yours. Use from a prep thread, cold or already holding context, when the user asks to "put this on the board", "prep the board", "populate the board", "take another pass", or "what did the room do with the board".
---

# Wallflower

AI does the prep, and the room does the thinking. Your job is to set what the conversation starts from: the material, placed so the relations worth arguing about are visible, with nothing that looks finished. Afterwards, read back what people did to the board, because that is the record of their judgment.

## Setup

`wallflower` (or its short form `wf`) comes from the `wallflower-board` npm package: `npm install -g wallflower-board`, or prefix commands with `npx wallflower-board` in place of `wallflower`. Boards go to the public server at board.byenzyme.com unless the user has set up another (`wallflower server` says which). Nothing needs starting.

For a board on this machine (`--server local`), start the local server in the background first:

```bash
(nohup wallflower serve > /tmp/wallflower.log 2>&1 &)
```

In a checkout of the repo, `npm run dev` runs the local server with a live-reloading UI instead.

The whole interface:

```
wallflower new "Title" [--id ID]     create a board and make it current
wallflower put plan.json|-           add or update groups and cards; prints the layout, warnings, and layout problems
wallflower view                      layout map, then every card with its position
wallflower diff                      what people changed since they first touched the board
wallflower wait [--timeout SECONDS]  block until someone presses "Take another pass"; prints that round
wallflower url [--name Name]         the URL to hand over, with the user's name in it
wallflower share                     the link for other people; says on stderr whether they can reach it
wallflower delete [id]               delete a board you created, for everyone
wallflower server                    which server new boards go to
wallflower list | wallflower use <id>
```

`wallflower url` prints where the board opens. A local server only answers on this machine; don't expose it yourself. New boards go to board.byenzyme.com, or to the user's own server if they've set one up (in `~/.config/wallflower/config.env`, or `WALLFLOWER_URL` and `WALLFLOWER_TOKEN`); `wallflower server` says which. Boards on board.byenzyme.com are deleted after 90 days without activity. `--server <url>` points any command elsewhere, and `--server local` at this machine: use it for a board only the user will see that holds private material, unless they've said otherwise. Pass it to `wallflower new` or `wallflower use`; later commands on that board stay on its server without it. A hosted board's link is its only key: anyone holding it can edit and read the board, so hand it only to the people who should be in the room, and don't paste it anywhere public. To work on a board someone else created, take the id from its link (`?board=<id>`) and run `wallflower use <id>`; no token needed.

## 0. Decide what the board is for

Settle three things before gathering. If you can't infer them, ask.

- **What is the room here to judge?** Every meeting exists for one act that belongs to the people in it: choosing, prioritizing, assessing, naming. The act tells you what to gather and what is worth noticing; it doesn't move where you stop. Even when the act is a decision, the board's part is noticing: it gives the room relations to see, not options to pick from. Your interpretation stops at meaning (see Writing the cards), on every board.
- **Who is in the room?** This decides what may appear (see Privacy).
- **What will this board show that the sources don't?** Write it in one sentence. If the answer is "the same notes, in tiles", the board has no job yet. The usual answer is relations between sources that no single source shows: the same note from three people, a decision next to what someone said later, two efforts touching the same thing.

**When the audience is one person** (a private look back, a week in review), they were in every meeting and have read every note. Excerpts tell them nothing. Build the board from patterns across sources, each one shown as two or three cards from different places placed together, plus one orientation card on where things stand (what's pending, who owes whom). Expect fewer, stronger cards. The stop line doesn't loosen for one person: show each pattern by placement and leave naming it to them.

| Setting | The room's act | Worth noticing |
|---|---|---|
| Agent-native standup or planning | what needs a human, priority, who takes it | collisions; agents contradicting each other; spec vs. what got built |
| Design review or crit | taste: what to keep | the same note returning across versions; reviewers who disagree |
| Research synthesis | the themes and insights | outliers; one word meaning two things; what people did vs. said |
| Strategy or founders | choosing and committing | re-arguing a settled decision; stated priorities vs. where time goes |
| Private review | the person's own assessment | feedback that repeats across people; drift from a stated criterion; open loops |

These rows are inferences from a few real calls. Let the read-back correct them.

## 1. Gather

Use the search tools you have directly: full-text search (`rg -il`) for names, project words and tags, sorted by date for recency, then follow links from the anchors. If a semantic search over the notes is available (Enzyme's `enzyme petri` / `enzyme catalyze`, or similar), use it for concepts. For agent work, read the agents' threads and git logs; for calls, read the transcripts.

A first semantic pass usually returns the notes' most frequent themes rather than this meeting's material. Before writing the plan, check:

1. **Anchors.** Name the 3 to 6 sources the meeting obviously depends on (the scoping note, the latest calls, the decision it continues). Have you read them, in full?
2. **Fresh.** Does the material include the last week of work on the topic?
3. **Voices.** Are the people who matter represented in their own words?

If not, rephrase in the user's words, search exactly, follow links, or ask the user one specific question. Read files before using them; snippets mislead. When distilled notes exist (meeting debriefs, prior summaries), remember that they have already done some noticing. Quote the people in them, not their conclusions, and look for what connects them.

### Privacy

Anything on a shared board must come from sources everyone in the room may see. Personal reflections, private notes and anything tagged personal stay off a shared board even when relevant. Distilled notes (debriefs, summaries) often mix what was said with the writer's private read of it: only the said parts are shareable. Phrase the point as an open question instead, or leave it out. This includes the preview a card carries (below): about 200 words of its source go onto the board with it.

## 2. Write the plan

Write the plan JSON by hand, in a file or on stdin, and put it in one go: groups, cards, and their placements together. Don't build a generator script, and don't write a validator: `wallflower put` lays the board out, truncates copy that is over budget, and checks the result.

```json
{
  "title": "Looking back at the launch review",
  "groups": [
    { "id": "g1", "col": 0, "why": "the same worry from two reviewers" },
    { "id": "next", "label": "Carry into next week", "col": 2, "zone": true }
  ],
  "cards": [
    { "id": "rosa", "kind": "quote", "title": "Rosa on the onboarding flow", "body": "I couldn't tell what it wanted from me",
      "source": { "label": "Launch review, Mar 4", "file": "/…/notes/2026-03-04 review.md", "url": "obsidian://open?…", "author": "Rosa", "date": "Mar 4" },
      "place": { "in": "g1" }, "why": "same confusion as Kim's empty-state question" },
    { "id": "kim", "kind": "quote", "title": "Kim asked it twice", "body": "what am I supposed to do first?",
      "source": { "author": "Kim", "date": "Mar 6" }, "place": { "near": "rosa", "side": "right", "overlap": true } }
  ]
}
```

```bash
wallflower put plan.json
```

Plans can be partial. Put the same id again to edit or move a card, and `{ "id": "x", "delete": true }` removes it. Anywhere an id goes you can use a card's number instead (`"#17"`), which is how rounds and `wallflower view` show people's stickies. Groups sit on a grid (`col`, `row`); you never compute pixels. Leave groups unlabeled, because naming them is the room's act; `why` is for the read-back, not the board. Zones are the exception: label them (`"Decided"`, `"Carry into next week"`), since a zone's name is the instruction.

Until a person touches the board, every `put` lays the whole board out again from your placements, so moving a group to another `row` or a card to another group just works. After that, anything a person placed stays where they put it: your new cards go in around it, and only your own untouched groups shift to make room.

`put` prints the layout as text, then a check. `layout check: no overlaps, every card in its group, no cut-off text` means you're done. Otherwise each `problem:` line names the cards or groups by id (groups overlapping or too close, a card that reads as in the wrong group, cards covering each other, a title that wraps past three lines, text the browser reported as cut off); fix the plan and put again. `wallflower view` lists the same problems at the end. Overlaps people made are theirs and are never reported. Don't screenshot the board to check layout.

### Placement

| `place` | Use for |
|---|---|
| `{ "in": "g1" }` | material that belongs together (the group grows) |
| `{ "near": "c1", "side": "right", "overlap": true }` | two cards to read as one thing: a disagreement, drift, a repeat across people |
| `{ "around": "c1" }` | expanding a neighborhood: each card lands on a loose ring around `c1` (a card or a person's sticky), in a different direction, inside its group |
| `{ "near": "c1", "side": "below" }` | a card beside another, without overlap; it stays in the partner's group, which grows |
| `{ "edge": "g1", "side": "right" }` | an outlier, or something you aren't sure belongs |
| `{ "at": { "x": 0, "y": -200 } }` | prompts, and rare manual spots |

### Card kinds

Width is fixed per kind and height follows the copy.

| kind | for | title | body |
|---|---|---|---|
| `quote` | any verbatim hook, spoken or written; `source.author` = who | gist, ≤90 | the hook, ≤200 (aim under 120) |
| `note` | an object (a doc, ticket, PR, session), or a note that does one of the jobs below | ≤90 | ≤300 |
| `prompt` | marker text on the board: the start card, an open question | ≤160 | ≤200 |
| `sticky` | what people add (you rarely should) | ≤140 | none |

Set `people` (an array of names, `["Rosa", "Kim", "Lee"]`) when breadth matters; it renders as "from 3 people". A pattern resting on one or two voices should look thin. Pick the line that sticks, even when it is an outlier, and let `people` say how many said it: a vivid line from one voice should read as one voice. Put a link in `source.url` only if everyone in the room can open it (a shared doc, a ticket, a PR); never a link to private notes, which is useless to them and leaks where your files live. For files, use `source.file` (below), which stays on your machine.

**Source previews.** Give every card that comes from a file its `source.file` (an absolute path; a `file://` url works too). `wallflower put` reads the file on your machine and attaches about 200 words around the card's quote, which people open by double-clicking the card or clicking its source line. The quote is a quote card's `body`; on a note card, set `source.quote` to a verbatim phrase from the file, or the preview is the file's opening. The file itself never leaves your machine. Never write a preview yourself: `put` drops any `source.passage` in the plan. For a source that isn't a file (an email, a ticket), save its raw text with a shell redirect (`gog … > /tmp/src-1.md`) and point `source.file` at that. If `put` warns that a quote wasn't found, the hook isn't verbatim: fix the hook, not the warning.

## Writing the cards

A board is read at a glance by people who jump off whatever catches them. Most cards should be readable in two seconds.

- **Title = gist**: what this card is about, in plain words, up to about 60 characters: who and what, so people can see at a glance which cards go together. Describe, don't claim: "Rosa on the onboarding flow", not "Onboarding confuses new users". The gist is for clustering; the hook carries the voice.
- **Body = hook**: the shortest verbatim fragment that still sticks. Prefer the odd, concrete or vivid line. Verbatim does not mean the whole passage.

Every piece of text has to answer one question: **what does this let the reader notice, remember, or investigate?** Text whose only job is explaining why you included something (a card that says what it is evidence of, a note that describes the board) is you narrating your preparation. Cut it. Source attribution can sit quietly underneath.

A note earns its place by doing one of these jobs, roughly in order of how much they help a room make sense of things:

1. **Hold two things together** so the relationship can be investigated, disputed, or pulled apart.
2. **Expose a missing piece**: where the evidence runs out ("What did the client actually see you decide?").
3. **Recover a sequence** that a single quote can't hold.
4. **Unsettle a reading** that has settled too quickly, by putting what cuts against it beside it, not by arguing for another.
5. **Bring back an expectation** (what was planned) beside what happened.
6. **Make room for rehearsal**, usually after the room has made sense of things.

Often the right note is none: two well-placed cards already do job 1. A status note with real information (what's pending, who owes whom) is fine; a note explaining the board is not.

Questions are for the one or two notes exposing a missing piece (job 2). A wall of second-person question titles does the room's asking for it and reads as machine-written, just like the self-justifying text it replaces. Titles stay gists.

Stop at meaning, on every board, private ones included. Don't name groups, don't write "this shows…", "key insight", or "the theme here is…", and don't caption why two cards sit together. Placement makes the claim, and someone can dispute a placement by moving a card. Don't hedge on every card either: a caveat belongs on the one card it changes.

| Instead of | Write |
|---|---|
| title "Pricing notes, Jul 23", body: a 280-character excerpt | gist "What visitors from shared links do", hook "they read it once and leave" |
| title "Kim, support call", body: a full sentence about the export | gist "Kim on exporting to a spreadsheet", hook "I just want the raw rows." |

Targets: about 9 to 14 cards for a working session, up to about 40 for synthesis, and a handful of strong pairings rather than many weak ones.

### Two prompts on every board

Add both to `cards`:

```json
{ "id": "start", "kind": "prompt", "title": "Start here", "body": "Pull out the three cards you'd talk about first. Move anything. Write what's missing.", "place": { "at": { "x": 0, "y": -220 } } },
{ "id": "memory", "kind": "prompt", "title": "This board remembers how it gets rearranged, so the next session starts where this one ends.", "place": { "at": { "x": 1040, "y": -200 } } }
```

Adjust the start prompt to the room's act ("Pull out what needs a person today").

## 3. Hand it over

Give the user `wallflower url --name <Their Name>`, then offer to share the board. Ask who else should be in the room, and run `wallflower share`:

- On a hosted server it prints a link anyone can open. Give it to the user to send, along with what the board is for in one line. The link is the board's only key: anyone holding it can edit and read it back, so it goes only to the people who should be in the room. Don't post or send it yourself unless the user asks. Whoever opens it is asked their name; the board has a **Share** button too.
- On a local server it says the link only opens on this machine. Say so, and if the user wants others in, offer to recreate the board on their hosted server (with `WALLFLOWER_URL` and `WALLFLOWER_TOKEN` set: `wallflower new`, then `wallflower put` the same plan), or point them to the README's hosted mode.

People drag cards, double-click a group's name to name it, use **+ Group** and **+ Zone**, press `n` and click to add a sticky, and delete what doesn't belong. A sticky dropped onto a card gets a pin; while it is dragged, the card or group it will be read as attached to is outlined. When they want more, they press **Take another pass**, optionally with a line of steer.

The proposal is recorded automatically the moment a person first touches the board, so there is nothing to snapshot.

Don't write a note about building the board. The board is the artifact. Write a note only after the read-back, and only for a decision or reframe the user wants to keep.

## 4. Take another pass

After handing the board over, run `wallflower wait` and let it block. It returns when someone presses **Take another pass** (at once, if someone already pressed it while you weren't waiting) and prints that round: every sticky people wrote with what it sits on or in, the cards nearby and the source files behind them; cards people moved; groups named, made, split or emptied; removals; cards people dropped onto each other; and the steer line if they wrote one. Each round covers only what people did since the last pass, never your own cards.

It waits up to 20 minutes by default. In tools that cap how long a command can run, use `--timeout` a little under the cap and run it again when it exits 2 ("no pass requested yet").

Read the round as a whole, the way a colleague would read the board after stepping out. A sticky's words say what it wants ("more of this", "go further back", "I remember this differently"); its placement says what "this" is. A statement left on the board may want nothing. There are no asks to close: decide what the round as a whole calls for.

Then recall, don't elaborate. Re-read the source files the round lists (and follow their links) before writing anything, so new cards come from what you left out rather than restatements of what you picked. Add a few cards where people pointed, in one `put`: `"place": { "around": "#17" }` (the number the round shows, or an id) rings them around what they answer, inside its group, which grows to hold them; neighboring groups of yours shift to make room, and nothing people placed moves. Don't move or tidy what people arranged: `put` refuses to move a card a person placed. On the board the camera visits each neighborhood in the order you wrote them and drops the cards in there, so write neighborhood by neighborhood. Regroup if the round changed what a group is about, but leave names to people. Then `wallflower view` to re-read the whole neighborhood, and `wallflower wait` again.

A pass with nothing on the board changed is still a steer: the line they wrote is the whole request.

## 5. Read back

```bash
wallflower diff
```

It compares the board with how it looked just before a person first touched it: what happened to each proposed group (kept, thinned when single cards left it, split when it came apart in blocs, merged, dissolved, moved to a zone) with your `why` beside it, how many of your pairings survived, connections people made that you didn't (cards they carried into another group, and cards they dropped onto each other), names people gave, what landed in each zone, every card that moved or was edited, what nobody touched, and, separately, what agents added on later passes.

Interpret it as a delta in judgment, keeping what people did separate from your inferences:

1. **Where the room agreed**: groups and pairs kept.
2. **Where it redrew the lines**: cards carried out of groups, splits, merges, cards dropped onto each other. Each is a claim about the material you didn't make. Say what it implies.
3. **What it named**: quote the label and compare it with the `why` you recorded.
4. **What it brought**: stickies and new groups.
5. **What it ignored or deleted**: untouched cards are often the most informative line, especially pairings.
6. **What was decided**: cards in a decision zone. Draft a decision record for each and ask before writing it anywhere.

Report with card numbers and quotes. Don't defend the original layout.

## 6. The next session

The board tells people it remembers, so the next session starts where this one ended. Keep that promise: the board is the memory. When the same room meets again on the same question, reopen its board instead of starting a new one. Run `wallflower use <id>` (ask the user for the link if you don't have it; a hosted server won't list boards), then `wallflower diff` and `wallflower view` to see where the room left it. Then gather what is new since, and add it in one `put` around what the room built, the way you would take a pass. Their groups, names and zones are the starting point: don't rebuild or rename them.

Start a new board only when the question has changed. Then begin from the last read-back: what the room named, paired, set aside and left open. Quote their names and stickies as theirs, with their authors, never as your labels.
