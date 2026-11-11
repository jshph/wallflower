# Recording the demo

Two windows side by side: a scripted agent chat on the left, the real board on the right. You press Space in the chat to play the next turn. Everything on the board, you do live. See `SPEC.md` for the story and why each piece is there.

## Setup

```bash
npm run build
wallflower serve                      # or `node bin/wallflower.mjs serve`; serves the board on :8787
node examples/demo/run.mjs       # the chat driver on :5199; prints the board link
```

To record against your own shared server (see "Run a shared server" in the top-level README), so the link in the chat shows its address, point the driver at it first:

```bash
export WALLFLOWER_URL=https://board.example.com
export WALLFLOWER_TOKEN=…        # the server's token, since each take creates a board
node examples/demo/run.mjs
```

Each take makes a new board. Boards on a shared server can only be deleted by hand on the server, so rehearse locally.

Optional settings:
- `DEMO_NAME=Kim` is who you are on the board, and the name the agent uses.
- `DEMO_SPEED=1.5` slows the agent's tool calls down; `0.7` speeds them up.

## Windows

- **Chat:** http://localhost:5199, about 560 px wide, on the left.
- **Board:** the link the driver printed, the one ending in `&name=Kim`, filling the rest of the screen. Open it **before** the first turn, so the cards drop in while you record.
- Hide bookmarks bars. In Chrome, `--app=<url>` opens each in a window without an address bar.

## What to tap through

| | Where | What you do | What happens |
|---|---|---|---|
| 1 | chat | **Space** | Maya's message types itself and sends. The agent searches Granola, Slack, support, GitHub, Linear and Notion; each read opens briefly to show the line it kept. Then `wallflower put`, and on the board the cards drop in, neighborhood by neighborhood. The agent's reply ends with the board link. |
| 2 | board | Look around for a beat. Then:<br>• drag the "list vanished" ticket next to Teresa's card<br>• press **n** and click on Teresa's card for a sticky, then type something like `the list is a conversation`<br>• drag "Q4 bet: recipe import" out of November<br>• press **Take another pass** (Send, without a note) | The board says "Reading the board…". In the chat, unprompted, a new timestamp appears and the agent reads two more sources and puts four cards around your sticky. On the board, the camera goes to your sticky and the cards land in a ring. |
| 3 | board | • drag Ana's new "how we talk" card onto Jonah's<br>• double-click the group's dotted label and name it, e.g. `the list is a conversation`<br>• drag "Item comments" into November | Nothing in the chat: this part is the room's. |
| 4 | chat | **Space** | Maya types "ok we're out. what moved". The agent runs `wallflower diff` and reads back what you did: the pairings it hadn't made, the group you named, what left and entered November. "Read-back" opens to the full diff. |

**Shift+R** in the chat starts a new take: a fresh board and an empty chat. Re-open the new board link it prints.

### Where the sticky goes decides the second pass

The agent rings four cards around your sticky from whichever thread the card under it belongs to:

| Sticky on | Second pass brings |
|---|---|
| Teresa, or Item comments | the list as a conversation: Sam's "writing letters", the emoji request, Ana's "how we talk", and Rob disagreeing |
| Jonah, the persona doc, or Dev's PR | who the user is: Maya's unanswered question, assign-items closed, Priya's "who added this?", and someone who lives alone |
| Ana, or Sam's camera-roll line | photos: two households asking, LAR-102 closed as "one household", and Teresa saying it wouldn't help |
| the ticket, or "3 months" | what "done" means: Lin's #212, #141, Jonah's "it's the list", and Rob liking auto-archive |
| Q4, or the metrics note | the drift: Dev's "sharing fix first", the PRs, the import slipping twice, and Maya's own reason for import |

A second sticky and another pass bring a second thread.

## Things to know

- Source previews work. Double-click any card, or click its source line, to read the passage it came from.
- If you reload the chat window, it replays the conversation so far without animation.
- The agent's last message is built from the real `wallflower diff`, so it reports whatever you actually did. If you skip a step, it says less.
