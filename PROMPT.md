# Prompt: Hillside Hangout, a cozy multiplayer toon village (Cloudflare Workers)

This is an improved version of the prompt this project was built from. It describes what exists in the repo now, so you can rebuild it from scratch or extend it. Paste everything below the line into Claude Code in an empty folder.

---

Build **Hillside Hangout**: a cozy browser game where up to 8 friends drop into a little toon village on a **sea cliff** as chibi animals. They walk around, chat, emote, sit on benches, play small shared games, and just hang out. There is no goal and no way to lose. It should feel like a warm golden-hour afternoon in a tiny village.

Multiplayer runs on **Cloudflare Workers + one Durable Object per room**. The same Worker also serves the game. Everything must fit the free Workers plan.

Decisions already made (don't ask again):
- 8 players per room.
- Third-person follow camera.
- The village sits on a cliff above the sea, and boats sail past.
- New rooms start at golden hour.
- The ball, fishing, the campfire and the swings/seesaw get the most polish. Music is simpler.

## Look and feel

- **Rendering:** Three.js **0.160** from jsDelivr through an import map (`three` and `three/addons/`). Plain ES modules, static files, no bundler, no framework.
- **Toon shading:** `MeshToonMaterial` with a 4-step gradient `DataTexture`. Patch `gradientmap_pars_fragment` so the gradient's **RGB** is used, not just `.r`, which lets the darker steps be warm and rosy instead of grey. Use one warm directional sun or moon with shadows, plus a strong hemisphere light, so shadows stay light. With `renderer.shadowMap.autoUpdate = false`, re-bake the shadow map only when the sun has moved about half a degree.
- **Ink outlines:** inverted hulls in chocolate brown `#4B2E1D` (never black), as a `ShaderMaterial` with `side: BackSide`.
  - Push the hull out in clip space along a `smoothNormal` attribute (normals averaged per position), so hard edges don't gap.
  - Keep the width in pixels (the shader takes `uRes` and `uThickness`) and fade it to 35% with distance.
  - Include the fog chunks.
  - Darken the ink slightly at night.
- **Shapes:** chunky and soft, like vinyl toys. Use rounded boxes (`RoundedBoxGeometry`, 2 segments by default), capsules, spheres, and lathe shapes with rounded profiles (including a `roundCyl` helper). Nothing thin or sharp.
- **Palette:** cream `#F8E8C8`/`#FFF3DC`, apricot `#F4A646`, pumpkin `#E8893A`, pink `#F7B9C4`, sage `#AFCB9C`, powder blue `#AFD6EC`, butter `#FFE08A` and honey woods. No cold greys.
  - Watch out: lavender light on sage grass turns grey. Use periwinkle moonlight at night so the grass stays a colourful blue-green.
- **Mesh merging:** a `Builder` collects parts with vertex colours and merges them per area into one toon mesh plus one outline mesh. Small details (eyes, blush, flowers, cobbles) skip outlines.
  - The world comes out at about 60 draw calls, and around 180 with 8 players.
  - Keep the triangle budget near 800k. Grass tufts are instanced lathe blades, not capsules, which are surprisingly heavy.
- **Characters:** chibi cat, bunny, bear, puppy and fox.
  - Big heads (about a 1:1 head-to-body ratio), dot eyes with highlights, blush, a "ω" mouth, little paws and a blob-shadow decal.
  - Separate pivots for body, neck, eyes (blink by scaling), arms, legs and tail.
  - A bouncy waddle: bounce, roll, leg and arm swing. Squash on landing, stretch while hopping.
- **Effects:** two `Points` clouds sharing one canvas atlas (glow, sparkle, heart, note, puff, z, confetti, droplet). One is additive, one normal-blended.
  - Used for hearts, sparkles, notes, puffs, z's, confetti, splashes, embers, smoke, fireflies at night, dust motes in the golden light, and static additive lamp glows that fade in at night.
  - Tint smoke and puffs darker at night.
- **UI:**
  - Fredoka from Google Fonts.
  - Cream pill buttons with thick brown borders and a hard drop shadow; orange for primary actions.
  - Speech bubbles with tails and name tags as DOM elements projected over heads.
  - An emote wheel and toasts.
- **No clipping:**
  - Things rest exactly on surfaces. Place props by sampling the ground under their footprint and extend legs downward.
  - Lily pads stay clear of the ducks' loop.
  - Hats are exclusive (beret or flower crown), so they never poke through each other.
  - The far-away title camera uses near 4 / far 520.
  - The telescope camera sits outside the telescope mesh. From inside you'd see the outline hull's back faces as a brown screen.
- **Performance:** lower the pixel ratio automatically when the frame rate drops, and raise it again when there's headroom.

## The world (about 40 × 40 m; north is −z, the sea is to the west)

- **Plaza:** cobbled, with a two-tier fountain, 4 benches (2 seats each), 6 lamp posts and sagging string lights with coloured bulbs.
- **Café:** cream walls, a pumpkin roof, a striped awning, a counter with a coffee machine, cups and a cake. Three stools, a painted "Café" sign, flower boxes, and a **sleeping cat** curled on a barrel (it breathes and puffs z's).
- **Pond:** a sandy shore, a dock with posts, lily pads with flowers, reeds, rocks, and three ducks paddling loops driven by the shared clock.
- **Park:** a swing set (2 swings), a seesaw, and a checkered picnic blanket (2 ground seats) with a snack basket. A striped beach ball.
- **Stage:** a raised wooden stage with a front step, a two-tone shell with bunting, speakers, an upright piano with a bench, a drum kit with a stool, and a xylophone (played standing).
- **Campfire:** a stone ring and log pile, with 3 logs as seats (2 seats each).
- **Lookout:** a hill near the cliff with a telescope, a bench and a sign.
- **Cliff and sea:**
  - A rocky banded sandstone cliff face down to the sea, with foam at its base.
  - Sea stacks and distant islands.
  - A wooden fence along the edge.
  - A big stylized sea shader with wave crests and a dashed sun path.
  - Three boats sailing past on routes driven by the shared clock.
- **Around the edge:**
  - Rising painted hills (part of the terrain) and big hill blobs further out.
  - Trees: round, pine and pink blossom.
  - 8 little houses whose windows glow at night and whose chimneys smoke.
  - Bushes, flowers, and about 1,500 instanced grass tufts that sway in a vertex shader.
- **Walking surfaces:** the terrain is a warped grid (fine near the middle, coarse far away) with vertex colours for grass, paths, the plaza, sand and the pond bed. A `groundHeight(x, z)` function covers everything you can stand on: terrain, cobbles, the stage, the dock.
- **Movement rules:**
  - Colliders are circles and boxes.
  - The pond is water except for the dock.
  - You can't step up more than 22 cm without hopping.
  - A soft invisible wall keeps you in.
- **Day and night:**
  - 20 minutes per day on a room clock (`start`, `frac`, `dayMs` sent by the server).
  - The sun rises in the east and sets over the sea; the moon takes over at night.
  - Keyframed sky, fog, light, hemisphere, sea and water colours.
  - Stars in the sky shader, lamps and windows glowing, fireflies, and dust motes at golden hour.

## Players

- **Flow:** title screen (far camera over the village), then the character creator (preview critter in the plaza, drag to spin), then play. Opening an invite link joins straight away with your saved look, or a random one plus a hint that you can change it from the menu.
- **Creator:** name (16 characters), animal, fur (8 swatches), outfit (8 swatches), and up to two accessories: beret, bow tie, scarf, flower crown, glasses, backpack. Saved in `localStorage`.
- **Controls:**
  - WASD/arrows to walk, Shift to run, Space to hop.
  - Mouse drag to orbit, wheel to zoom.
  - Phones: a dynamic left joystick (full tilt runs), drag to orbit, pinch to zoom, and buttons for hop, E, emotes and chat.
- **Interaction:** E (or the orange button) uses the nearest thing, shown in a prompt pill. `priority` only breaks ties between nearby things, it doesn't extend reach. The café counter gets a nudge over the stools in front of it.
- **Name tags** float over everyone.
- **Emotes** (Q, or press 1–8 while the wheel is open):
  - wave (sparkles)
  - dance (notes)
  - clap (sparkles at the paws)
  - laugh ("Hehe!")
  - sit on the ground (puff)
  - heart (hearts)
  - sleep (floating z's; stays until you move)
  - cheer (confetti)
- **Sitting:** benches, stools (dangling legs), logs, the blanket, swings, the seesaw and instruments. You snap to the seat and face the right way. Moving stands you up at the seat's exit spot (so never inside the piano).
- **Props:**
  - Café: cocoa → milkshake → put it back.
  - Basket: sandwich → apple → cookie → put it back.
  - E sips or eats (also while seated). Food lasts 3 bites, drinks 5 sips.
  - R puts it away. Others see the prop in your paw.
- **Chat:** Enter to type, Enter to send, Esc to close. Messages appear as speech bubbles and in a fading log in the corner. Text is shown with `textContent` only and capped at 140 characters.
- **Pings:** G ray-marches the camera's centre ray against `groundHeight` and drops a bouncing pin with your name for 5 s.

## Shared activities

- **Ball:**
  - Walk into it to nudge it, or press E for a big kick.
  - The kicker becomes the owner and simulates it at 90 Hz, sending its state at 10 Hz. The ball bounces off colliders, rolls down slopes, and floats and drifts to shore in the pond.
  - Everyone else simulates locally and blends toward corrections.
  - The server only accepts a claim if the kicker is near the ball, keeps the ball in bounds, caps its speed, and stops it if the owner leaves.
  - Send your own position just before a kick so the server's nearness check sees it.
- **Fishing:**
  - At the end of the dock: cast, wait 2–6.5 s, then the bobber dips with a splash and you have 0.9 s to reel in. Too early or too late and it gets away.
  - 10 catches with rarity stars. The Wishing Star only bites at night and the Golden Carp only at golden hour.
  - Catch card, collection book in `localStorage`.
  - Others see your rod, line and bobber, and a "Caught a …!" bubble.
- **Campfire:**
  - Anyone can light it; it burns for 10 minutes on the room clock. Lit fires have flickering flames, embers, smoke, a ground glow and crackle.
  - Toasting: a 4.5 s heat meter (raw, toasty, golden, burnt). Press when golden. Leave it in too long and it catches fire.
  - Your marshmallow stays in your paws and you show it off with a bubble. While you hold one, the fire doesn't offer to re-toast, since that would throw it away.
- **Swings:** Space or E pumps the amplitude, which slowly decays. The angle is `amp · sin(roomTime · ω)`, so every client sees the same swing.
- **Seesaw:** with two players it bobs on the room clock. With one, it tips to that side. Empty, it rests on one end touching the ground.
- **Music:**
  - Piano, drums and xylophone. Keys 1–8 or on-screen pads.
  - A pentatonic scale, synthesized with WebAudio. Notes snap to a 75 ms grid on the room clock when that's less than 45 ms away.
  - The server only relays notes from the player sitting at that instrument.
- **Telescope:** zooms to a 15° view over the sea, starts aimed at the nearest boat, and pans with drag or A/D.

## Multiplayer (Cloudflare)

- **`server/worker.js`:**
  - Serves the static game through the `ASSETS` binding (`[assets] directory = "."`). `.assetsignore` excludes `server`, `wrangler.toml`, `.git`, `.wrangler`, `node_modules`, the package files, `tests`, `docs` and the markdown files.
  - Answers `/health` with `{ ok: true }` (with CORS).
  - Routes WebSocket upgrades on `/room/CODE` to `env.ROOMS.idFromName(code)`. Codes are 4 characters from `A-H J-N P-Z 2-9`.
- **`Room` Durable Object:**
  - Hibernation API (`ctx.acceptWebSocket`, attachments) and SQLite storage (`new_sqlite_classes`; a small `kv` table holds the clock start, the ball and the fire).
  - The roster is rebuilt from socket attachments after waking.
  - `setWebSocketAutoResponse('ping' → 'pong')`, so keepalives don't wake it.
  - An alarm every 30 s sweeps players with no message or ping for 75 s.
- **Messages:** small JSON with `t`.
  - **From clients:** `hello`, `move`, `emote`, `chat`, `sit`, `prop`, `note`, `ball`, `fire`, `ping`, `look`.
  - **From the server:** `roster` (the welcome: you, players, clock, fire, ball, seats), `join`, `leave`, `full`, plus the same relays.
  - **Validation:** names 16 characters, chat 140, positions clamped, poses, emotes, props and seats from allow-lists, at most 2 KB per message.
  - **Token buckets per socket:** 25 msg/s, chat 0.6/s with a burst of 4, pings 0.5/s.
- **Identity:**
  - Clients keep a private id in `localStorage`. The public id is a hash of it, so reloads come back as the same player.
  - A `hello` with an id that's already present swaps the socket quietly (close code 4000 to the old one, no `leave`).
  - A full room gets `full` and close code 4001 and is never counted, so no `leave`.
- **Clients:**
  - Reconnect with exponential backoff, and re-assert their seat and prop after reconnecting.
  - Send moves at 10 Hz, only while something changed.
  - Interpolate others about 110 ms behind and smooth their turning.
  - Predict their own movement.
- **Rooms:** create (random code) or join by code, or use **Copy invite link** (`#room=CODE`, plus `&server=` when the page isn't on the Worker). A lobby panel shows who's here. Leave the room from the pause card.
- **Server address:**
  - Same origin if `/health` answers there.
  - Otherwise a pasted address (saved), or the `DEFAULT_SERVER` constant in `src/net.js`.
  - With none of those, solo mode still works and every activity runs locally.

## Files

| File | Contents |
|---|---|
| `index.html` | page, HUD, lobby, creator, chat, overlays, all styles |
| `src/main.js` | loop, camera, input, players, seats, chat, emotes, pings, net handlers |
| `src/world.js` | the map, colliders, seats, ambient life (ducks, boats, butterflies, cat, smoke) |
| `src/characters.js` | animals, accessories, props, animation and emotes |
| `src/toon.js` | materials, outlines, rounded shapes, `Builder` merge helper |
| `src/daynight.js` | sky, sun/moon, fog, keyframes, lamp glow, fireflies, motes |
| `src/effects.js` | particle atlas and point clouds |
| `src/ui.js` | creator, toasts, prompt, emote wheel |
| `src/net.js` | connection, lobby, chat, invite links |
| `src/sync.js` | interpolation, room clock, shared seats and fire |
| `src/audio.js` | WebAudio instruments, sound effects, ambience |
| `src/activities/*.js` | ball, campfire, fishing, playground, music, café, lookout |
| `server/worker.js` | Worker and Room |
| `wrangler.toml`, `README.md`, `PROMPT.md` | config and docs |
| `tests/*.mjs` | Playwright checks |

## Testing (do this, don't just say it works)

- Run `npx wrangler dev --persist-to /tmp/hangout-rooms`. **Write test screenshots outside the project too.** Wrangler watches the project folder, and a new file there reloads the Worker and kicks everyone mid-test.
- Headless Chromium needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL. Software rendering is slow, so give tests a `?norender` flag that keeps simulating without drawing, and use small viewports.
- If the CDN or fonts can't be reached from the test browser, route those requests to local copies.
- **`tests/multiplayer.mjs`** uses 4–5 separate browser contexts (separate client ids) plus raw WebSocket bots. Bots must send `ping` every 20 s like real clients, or the stale sweep removes them. It checks:
  - joining by code and by invite link
  - everyone sees everyone move (within ~0.25 m)
  - chat both ways, never parsed as HTML, trimmed to 140
  - emotes, sitting, and the server refusing a taken seat even when forced
  - props
  - the ball staying in sync and agreeing on its owner
  - the campfire and seats for a late joiner
  - the eighth player fitting, the ninth told the room is full with no `leave` broadcast
  - a reload returning the same id with no ghost
  - a duplicate socket replacing the old one
- **`tests/activities.mjs`** checks every activity in solo: fishing to a book entry, toasting golden and burnt, eating, swing pumping, seesaw rest, piano pads, café and basket props, telescope, ball, ping, sleep.
- **`tests/server-address.mjs`** checks a page on a plain static server talking to the Worker through a pasted address, including invite links.
- **`tests/screens.mjs`** takes screenshots of:
  - the title
  - the creator
  - the plaza by day and by night
  - emotes
  - the campfire at golden hour and while toasting at night
  - the park
  - fishing
  - the stage
  - the café
  - the telescope
  - the emote wheel
  - the lobby
  - a phone layout

  Look at every one and fix anything that clips, floats, overlaps or reads badly.

## Deploy

The README walks through deploying from scratch on macOS:
1. Install Node LTS from nodejs.org.
2. `git clone` and `npm install`.
3. `npx wrangler login`.
4. `npx wrangler deploy`.
5. Register a workers.dev subdomain if asked.
6. Check `/health`.
7. Create a room and share the invite link.

Updating later is `git pull` then `npx wrangler deploy`. The README also explains why the free plan is enough: SQLite Durable Objects are on the free plan, incoming WebSocket messages count at 20:1, idle rooms hibernate, and auto-responded pings don't wake them.

## Working style

- Build in order: the world and one player → the creator → rooms and movement sync → chat and emotes → sitting and props → the shared activities → day/night tuning → polish. Commit after each working step.
- Keep code readable, with comments only where they help.
- At the end, say plainly what works, what you tested and how, and what's rough or untested.
