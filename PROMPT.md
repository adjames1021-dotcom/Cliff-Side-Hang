# Prompt: Hillside Hangout, a cozy multiplayer village on a sea cliff (Cloudflare Workers)

This is an improved version of the prompt this project was built from. It describes what exists in the repo now, so you can rebuild it from scratch or extend it. Paste everything below the line into Claude Code in an empty folder. The first part describes the original toon village (still available as the "Toon" look); **Version 2** at the end describes the realistic look and the wider world that are now the default.

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


## Version 2: realistic look, the wider world, sailing and finds

Build everything above first, then upgrade it as follows. The toon look stays available as a graphics option.

### Realistic rendering
- **Materials (`materials.js`):** a shared set of physically based materials (paint, plaster, wood, stone, rock, foliage, ground, fabric, fur, metal, glossy, ceramic, cloth, shine), all vertex-coloured. A procedural RGBA detail texture (fbm noise / Voronoi stones / wood grain / knit) is applied **triplanar** in `onBeforeCompile`, varying albedo and roughness and adding bump. The bump height is in **metres** (millimetres for fur and fabric, a few centimetres for rock) and the detail fades with distance — far too strong a bump turns everything into blocky noise. The `Builder` splits merged parts by material kind; outlines only show in the toon style. `setStyle('toon'|'realistic')` swaps materials on every registered mesh.
- **Sky (`daynight.js`):** Preetham sky in GLSL with a cloud layer, stars, Milky Way, a cratered moon and shooting stars. The same model in JS gives fog and ambient colours. Capture the sky into a PMREM environment map whenever the light changes. Keep sky light at about a third of the sun's (envMapIntensity ~0.34 by day, more at golden hour and night), or everything looks flat. ACES tone mapping; exposure rises at golden hour and night. The sun's shadow camera follows the player, snapped to texels. Light never comes in flatter than ~8° (so a fence doesn't shade the whole village at sunset); sun rays and water glints still use the true sun.
- **Post (`post.js`):** EffectComposer with MSAA: GTAO (skipping GPU-placed objects), screen-space sun rays marched toward the sun, bloom, a grade (vignette, saturation, contrast), OutputPass.
- **Sea (`water.js`):** a camera-following radial grid with six Gerstner waves, ripple normals, foam at the cliff, sea stacks and a moving surf line on the cove beach, subsurface glow, optional planar mirror (Ultra). Export a CPU `seaHeight(x, z, t)` so boats and buoys ride the same waves.
- **Grass (`grass.js`):** GPU tufts (4 blades each) placed from `gl_InstanceID` on a grid around the camera, reading height and density from a baked map (no grass on steep slopes), swaying in gusts, pushed aside by players, glowing when backlit.
- **Foliage (`foliage.js`):** oaks, pines, birches and blossom trees (bark trunks, roots, branches, leaf-cluster cards lit like a round canopy and swaying), ferns, bushes, mossy rocks (welded icosahedra so normals are smooth), leaf litter and instanced pebbles, grouped into 36 m chunks so off-screen patches are culled.
- **Animals:** plush fur (sheen) plus **fur shells** (7 instanced copies pushed out along normals with strands cut by a 3D hash, alpha-to-coverage), glossy eyes with iris, pupil and two catch-lights, glossy noses, chubby cheeks, paw pads, knit jumpers with stripes and ribbing, ears on their own pivots that twitch and flop.

### Graphics menu and options (`settings.js`)
Presets Low / Medium / High / Ultra plus individual options: resolution, shadows (off/low/high/ultra), lamp lights at night, grass, bloom, sun rays, AO, sea reflections, fluffy fur, anti-aliasing, FOV, first/third person, realistic/toon, FPS counter. Saved in localStorage. Auto-adjust lowers the pixel ratio first, then the post effects, and recovers when smooth. `?gfx=ultra` and `?hq` URL flags for screenshots.

### First person and emotes
- **V**, a HUD button, or scrolling all the way in switches to first person: camera at the eyes (smoothed), pointer lock on click, the body hidden from the camera but still casting its shadow, a small crosshair.
- **One emote at a time**: the wheel greys out while one plays; the server enforces it per player.

### The wider world (`wilds.js`, `woods.js`, `cove.js`)
- Rolling hills out to about 60 m in every direction except the sea, rising into wooded mountains that stop you. A summit (≈14 m), a meadow bowl, a rise the creek tumbles off.
- **Ten trails** as Catmull-Rom polylines with smoothed height profiles that flatten the terrain into a worn tread. Dress them with edge stones, leaf litter, timber steps where steep, coloured waymarker posts, signposts (canvas-texture boards readable from both sides) and logs to sit on.
- **Creek**: water levels derived from the terrain so it always runs downhill below its banks; a flowing-water ribbon material; a waterfall sheet into a pool with mist; a footbridge on an arch where a trail crosses; it pours off the clifftop into the sea.
- **Places**: summit (cairn, flag, viewfinder, benches), Mossfall Falls, a log cabin (porch, rocking chairs, woodpile, chimney smoke, lantern), ruins (walls, an arch, a well), a fairy ring that glows at night, a deer meadow.
- **Cliff steps**: three flights cut into the cliff (rock bed, stone treads, rope railing on posts, lanterns on the landings) and a timber stair onto the beach. Walking uses the walker's current height to pick the right flight where they pass above each other.
- **Cove**: sand that darkens toward the waterline, a boathouse, deck chairs and umbrella, driftwood, an upturned rowboat, rock pools, a buoy, and a dock with pilings, bollards, lanterns, a ladder and a bench.
- Walkability is a function (`walkable(x, z, y)`), colliders live in a spatial grid, and the camera backs off from terrain, the cliff and buildings.

### Sailing (`boats.js`, `activities/sailing.js`)
Three detailed sailboats (lofted hull with antifouling, boot stripe and sheer stripe, varnished gunwales, foredeck, cockpit benches, mast with spreaders and rigging, a mainsail and jib built as grids that billow to leeward and luff in irons, a swinging boom, rudder and tiller, fenders, pennant, name on the transom). Take the helm at the dock: W/S trim, A/D steer, a simple polar (no-go zone into the wind, fastest on a reach), heel, wake foam, bumping off shores, stacks and other boats. The helm is a seat: the helmsman's position syncs through normal moves and everyone else places the boat from it. Friends can crew. E returns you to the dock with a short fade.

### Finds and wildlife (`activities/forage.js`)
24 finds across zones (woods, creek, meadow, summit, glen, beach) with rarities and night-only ones. Which find sits on which spot is derived from the shared room clock (a new batch every 4 minutes), so friends see the same things; picking up only hides it for you. Saved in localStorage; rare finds trigger a "Look, a …!" show-off. Deer, rabbits, crabs and an owl (at night) wander, graze and flee; coming close counts as spotting them. The book becomes a **Journal** with Fish / Finds / Wildlife tabs.

### The café
A two-storey corner café: stone plinth, cream plaster, a serving hatch with a peek-in nook (shelves of jars, an espresso machine, a cake under a dome, pendant lamps), a glazed door with wall lanterns, a timbered upper floor with shuttered windows and flower boxes, a tiled roof with a dormer and chimney, a scalloped striped awning with the name on the valance, a hanging cup sign, a tiled counter with a pastry case, and a terrace with bistro tables, an umbrella, olive trees in pots, string lights and a bicycle.

### Tests
Add checks for: hiking out on a trail, the map edge, the cliff steps going down, the beach and dock, taking a boat out and coming back, picking up a find and seeing it in the journal, the café's seats, one-emote-at-a-time, and in multiplayer a friend seeing your boat sail and the helm being refused to someone else.

## Version 3: polish pass (the walk to the boats, the cliff, the forest, houses, grass, characters)

### The walk down to the pier
- A stone gateway marks the top: two pillars with caps and lanterns, a beam and a "Cove & Pier ↓" sign. The fence opens there, and no trees, rocks or posts stand in the way.
- The three flights are wider (about 1.9 m for the stone flights, 1.7 m for the timber stair), and the treads, rock bed and rope posts are all sized from each flight's width. Landings are bigger.
- A plank boardwalk runs from the foot of the stairs across the sand towards the dock. The boathouse, rowboat, umbrella, deck chairs and driftwood sit to the sides, and beach rocks are only at the far ends of the cove. No sea stack stands on the beach.
- The camera never ends up inside the step rock (`stepsSolid`).

### The cliff
- The face is one function, `cliffFaceX(z, y, top)`, used both to build the mesh and for camera collisions. The turf rolls over the lip, there's a slight undercut beneath it, and below that come buttresses and gullies, strata ledges, crags, and a talus apron at the foot. The steps and the cove are carved out of it.
- Colour comes in tilted bands (turf, soil, sandstone layers), with darker gullies, rain streaks, a wet band and algae near the waterline, and moss on anything flat enough. Ferns and bushes grow on the ledges, and scree and boulders lie at the foot (none in the cove).
- The sea stacks have strata ledges, grooves, a flared foot and rounded shoulders.

### The forest
- The woods reach about 72 m out, with mountains beyond. Trees are spaced more tightly, there are glades, and ages vary: saplings, ordinary trees and big old ones. The undergrowth is doubled.
- Fallen trees lie in the deep woods: mossy trunks with branch stubs, a splintered tip and the root plate torn up with the tree. Each has colliders, with ferns and mushrooms along it.
- There are forty extra find spots in the deep woods.
- Ferns, leaf litter and pebbles in chunks more than about 70 m from the camera are hidden (`Foliage.cull`).

### Houses
Cottages come from one builder with five styles. Each style sets wall, roof, trim, door and shutter colours, half-timbering or a stone footing with quoins, an optional porch or door hood, an optional dormer, and one or two floors. Every house has:
- framed windows with glazing bars, sills, louvred shutters, flower boxes and panes that glow at night;
- a panelled door with a fanlight, a step and a mat;
- a lantern;
- gables with small windows;
- tiled roof rows, fascia, gutters, a downpipe and barge boards;
- a ridge cap;
- a chimney with a cap and pots.

### Grass
- Grass only grows on open ground. There is none on the beach, cliff, steps, sand, plaza, café terrace (now flagstones), the trodden earth round the campfire, steep slopes, or under anything solid.
- Tufts with no height collapse to nothing instead of lying flat.

### Characters
- The body under the jumper is the fur colour.
- Faces are cleaner: no whiskers and no eye patch, rounder cheeks and slightly bigger eyes.
- The fur is plush, and the fuzzy fur shells are an experimental option that is off by default (older saved settings are migrated).
