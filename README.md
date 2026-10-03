# Hillside Hangout

A cozy little browser game where friends drop into a village on a sea cliff as fluffy chibi animals. You can walk around, chat, emote, sit on benches, kick a beach ball, fish off the dock, toast marshmallows, swing, jam on the stage, hike the woods, collect things you find, take the steps down the cliff to the cove and sail boats around the bay — or just hang out. There's no goal and no way to lose.

It looks realistic by default (physically based materials, a real sky, waves, swaying grass, sun rays and soft shadows), and there's a toon look in the graphics menu if you prefer the old style.

It's plain static files (Three.js 0.160 from a CDN, no bundler). One **Cloudflare Worker** serves the game, and a **Durable Object** per room keeps everyone in sync. The free Workers plan is enough.

![Title screen](docs/title.jpg)

| | |
|---|---|
| ![Friends in the plaza](docs/plaza-day.jpg) | ![The plaza at night](docs/plaza-night.jpg) |
| ![The café](docs/cafe.jpg) | ![Toasting marshmallows at the campfire](docs/campfire.jpg) |
| ![A signposted trail in the woods](docs/woods.jpg) | ![Mossfall Falls](docs/falls.jpg) |
| ![The summit at golden hour](docs/summit.jpg) | ![The fairy glen at night](docs/glen-night.jpg) |
| ![The cove and its dock](docs/cove.jpg) | ![Sailing past the cliff steps](docs/sailing.jpg) |
| ![The character creator](docs/creator.jpg) | |

## What's in the world

- **Plaza:** a fountain, cobbles, string lights and benches.
- **Café:** a timbered two-storey café with a serving hatch, a striped awning and a terrace. Grab a mug of cocoa or a milkshake at the counter, sit on a stool or at a bistro table.
- **Pond:** a dock to fish from, lily pads, and ducks paddling in loops.
- **Park:** a swing set, a seesaw, a picnic blanket and a basket of snacks.
- **Stage:** a piano, drums and a xylophone.
- **Campfire:** log seats around it.
- **Lookout:** a hilltop telescope looking out over the sea, where boats sail by.
- **The woods:** rolling wooded hills all round the village, laced with ten signposted trails (Woodland Loop, Summit Path, Ridge Walk, Windmill Way, Meadow Cut, Falls Path, Creekside Walk and spurs). Out there: a summit with a cairn and a view, Mossfall Falls and its pool, a creek you can follow to where it pours off the cliff into the sea, a footbridge, a woodcutter's cabin with rocking chairs, old ruins with an arch and a well, a fairy ring that glows at night, and a meadow where deer graze.
- **The cove:** steps cut down the cliff face lead to a sandy beach with a boathouse, deck chairs, rock pools and a dock with three sailboats.
- **Things to find:** 24 kinds of finds — mushrooms, feathers, acorns, shells, sea glass, crystals, a golden acorn, a message in a bottle — and animals to spot, all kept in your journal.
- **Ambient life:** butterflies, ducks, a sleeping cat on a barrel, chimney smoke and swaying grass.
- **Day and night:** a full day takes 20 minutes, and everyone in a room shares the same clock. New rooms start at golden hour. Lamps glow, fireflies come out and stars appear at night.

## How to play

| | Keyboard / mouse | Phone |
|---|---|---|
| Walk / run | WASD or arrows, hold Shift to run | left-hand joystick (push far to run) |
| Look / zoom | drag, mouse wheel | drag with one finger, pinch |
| Hop | Space | ⤒ button |
| Use / sit / stand | E | orange **E** button |
| Emotes | Q (then 1–8) | 😊 |
| Chat | Enter to type, Enter to send, Esc to close | 💬 |
| Ping a spot | G | – |
| Journal (fish, finds, wildlife) | B | 📖 |
| First person / third person | V, or scroll all the way in | 👀 |
| Sound on/off | M | 🔊 |
| Put down what you're holding | R | – |
| Menu (and Graphics) | Esc | ☰ |

**Activities**

- **Ball:** walk into it, or press E next to it for a big kick.
- **Fishing:** go to the end of the dock and press E. Press E again to cast, then E as soon as the bobber dips. Catches are saved in your fish book on this device. Some only bite at night or at golden hour.
- **Campfire:** anyone can light it, and it burns for 10 minutes. Press E to toast a marshmallow, then E again to pull it out when it's golden. Your marshmallow stays in your paws so everyone can see it.
- **Swings:** press Space or E to pump higher.
- **Seesaw:** two friends on it bob each other up and down.
- **Instruments:** press keys 1–8 or tap the pads. Notes play on a pentatonic scale and snap lightly to a shared beat, so jamming together sounds nice.
- **Telescope:** look through it to see the boats out at sea.
- **Hiking and finding things:** follow the trails out of the village. Little things glint beside the paths, by the creek, on the summit, in the fairy glen and on the beach. Walk up and press E to pick one up. Everyone in a room sees the same finds (a fresh batch turns up every few minutes), and a rare find makes you show it off. Some only appear after dark. Coming close to a deer, a rabbit, a crab or the owl on the cabin roof counts as spotting it.
- **Sailing:** take the cliff steps down to the cove, walk out on the dock and press E by a boat. W trims the sails in, S eases them (and paddles backwards when you're stopped), A/D steer. The breeze comes from the west: you can't sail straight into it, and you're fastest with it on your side. Friends can hop aboard as crew while the boat's at the dock. Press E to head back.
- **Emotes:** one at a time — a new one waits until the last has finished.

## Graphics

Open the menu (Esc or ☰) and choose **Graphics**, or use the link on the title screen. Presets go from **Low** to **Ultra**, and every option can be set on its own: resolution, shadows, lamp lights at night, grass, glow (bloom), sun rays, ambient occlusion, sea reflections, fluffy fur, anti-aliasing, field of view, first or third person, the realistic or toon look, and an FPS counter. Settings are saved on each device. With **Auto-adjust** on, the game lowers the resolution a little (and then the post effects) when frames start dropping, and brings them back when things are smooth.

## Run it locally

You need Node 18 or newer.

```sh
npm install
npx wrangler dev --persist-to /tmp/hangout-rooms
```

Open http://localhost:8787. To try multiplayer, open a second browser window (or a private window), then either join with the room code or paste the invite link.

Keep the `--persist-to` folder outside the project. Wrangler watches the project folder, and saving room state inside it makes the dev server reload itself in a loop. For the same reason, the test screenshots go to `/tmp/hangout-shots`.

## Deploy it from scratch (macOS)

1. **Install Node.** Download the LTS installer from https://nodejs.org and run it. Then open **Terminal** and check that it worked:
   ```sh
   node -v
   ```
2. **Get the code.**
   ```sh
   git clone https://github.com/adjames1021-dotcom/Cliff-Side-Hang.git
   cd Cliff-Side-Hang
   npm install
   ```
   If macOS offers to install the "command line developer tools" when you run `git`, say yes and run the command again. You can also download the ZIP from GitHub and `cd` into the unzipped folder.
3. **Log in to Cloudflare.** A free account is fine.
   ```sh
   npx wrangler login
   ```
   A browser window opens. Click **Allow**, then come back to Terminal.
4. **Deploy.**
   ```sh
   npx wrangler deploy
   ```
5. **Pick a workers.dev subdomain if it asks.** The first time, Wrangler may ask you to register one (for example `yourname`). You can also do this in the Cloudflare dashboard under **Workers & Pages**. When the deploy finishes, it prints your address, something like `https://hillside-hangout.yourname.workers.dev`.
6. **Check it's alive.** Open `https://hillside-hangout.yourname.workers.dev/health`. You should see `{"ok":true}`.
7. **Share it.** Open the site, press **Play**, make your critter and press **Create a room**. Then use **Copy invite link** (in the ☰ menu, or by tapping the room code in the top-left corner) and send it to your friends. Opening the link drops them straight into your room.

### Updating later

```sh
cd Cliff-Side-Hang
git pull
npx wrangler deploy
```

Rooms keep their state (the clock, the ball and the campfire) across deploys.

### Will the free plan be enough?

Yes, for friends hanging out. At the time of writing, the [Workers Free plan](https://developers.cloudflare.com/durable-objects/platform/pricing/) includes SQLite-backed Durable Objects with:
- 100,000 requests a day
- 13,000 GB-s of duration a day
- 5 GB of storage

How this game uses that:
- **Static files** (the game itself) are free.
- **Movement:** each player sends about 10 small messages a second, and only while moving. Cloudflare counts incoming WebSocket messages at 20:1, so eight people walking around nonstop use roughly 4 requests a second. That works out to several hours of busy play a day.
- **Idle players** only send a keepalive ping every 20 s. The room answers it automatically without waking up.
- **Quiet rooms** hibernate, and hibernating rooms aren't billed for duration.

If you ever go over a daily limit, new requests fail until the next day. Nothing is charged on the free plan.

## Hosting the page somewhere else

The Worker can serve everything. If you'd rather host the page elsewhere (GitHub Pages, Netlify and so on), keep the Worker for the rooms and either:

- set `DEFAULT_SERVER` at the top of [`src/net.js`](src/net.js) to your Worker's address, or
- on the character screen, click **Server → change** and paste the Worker's address. It's remembered on that device.

Invite links made this way carry the server address along, so friends connect to the right place. With no server at all, **Wander solo** still lets you explore everything on your own.

## How it fits together

```
index.html            page, HUD, lobby, creator, chat and all the styles
src/main.js           game loop, camera (third and first person), input, players, seats, chat, emotes, pings, graphics settings
src/world.js          the village map, terrain, cliff, café, houses, colliders, seats, ducks/boats/butterflies
src/wilds.js          layout of the woods, trails, creek, cliff steps, cove and dock; heights and where you can walk
src/woods.js          the forest, trail dressing, creek water, waterfall, footbridge, summit, cabin, ruins, fairy ring, meadow
src/cove.js           the cliff steps, beach, boathouse and dock
src/boats.js          sailboats (lofted hull, rigging, sails that fill and luff) and rowboats
src/foliage.js        trees, ferns, bushes, rocks and leaf litter, grouped into chunks
src/grass.js          GPU grass tufts around the camera, with wind and footsteps
src/water.js          the sea (Gerstner waves, foam, surf, reflections) and pond water
src/materials.js      physically based materials with procedural surface detail, and the realistic/toon switch
src/settings.js       graphics presets, options and the graphics menu
src/post.js           ambient occlusion, sun rays, bloom, colour grading
src/characters.js     plush chibi animals (fur shells, glossy eyes, knit jumpers), accessories, props, animations
src/toon.js           shape helpers, mesh merging, toon materials and ink outlines
src/daynight.js       physical sky, sun/moon, clouds, stars, fog, sky lighting, lamp lights, fireflies
src/effects.js        particles: hearts, sparkles, notes, puffs, z's, confetti, mist, foam, glows
src/ui.js             character creator, toasts, action prompt, emote wheel
src/net.js            connection, reconnects, lobby panel, chat box, invite links
src/sync.js           interpolation of other players, shared clock, seats, campfire
src/audio.js          WebAudio piano/xylophone/drums and little sound effects
src/activities/*.js   ball, fishing, campfire, playground, music, café, lookout, sailing, forage (finds + wildlife)
server/worker.js      the Worker (assets, /health, /room/CODE) and the Room Durable Object
wrangler.toml         Worker + Durable Object config (SQLite-backed, free plan friendly)
tests/*.mjs           Playwright checks (multiplayer, activities, custom server, screenshots)
```

**The room server** (`server/worker.js`) uses the WebSocket Hibernation API and SQLite storage. It:
- holds up to 8 players
- lets each player play one emote at a time
- sends each newcomer the roster, the room clock and the shared state
- relays movement
- referees seats ("someone's already there")
- validates and rate-limits every message: names are capped at 16 characters, chat at 140, and positions are clamped
- sweeps sockets that silently vanish

The beach ball is simulated by whoever touched it last, and the server keeps it in bounds. A second connection with the same client id replaces the first, so a reload or a network blip never leaves a ghost behind. Someone turned away from a full room never triggers a "left" message.

## Tests

The checks drive real headless browsers against `wrangler dev`:

```sh
npx wrangler dev --persist-to /tmp/hangout-rooms     # in one terminal
npx playwright install chromium                      # once
node tests/multiplayer.mjs     # joining by code/link, movement, chat, emotes, seats, props, ball, campfire, sailing together, full room, reloads
node tests/activities.mjs      # fishing, toasting, swings, seesaw, music, café, telescope, ball, pings, emotes, hiking, cliff steps, sailing, finds
node tests/look.mjs "?hq" "name:js"   # render a view after running some code in the page (handy for checking looks)
python3 -m http.server 8790 &  # then: page hosted elsewhere + pasted server address
node tests/server-address.mjs
node tests/screens.mjs         # screenshots into /tmp/hangout-shots
```

You need Playwright installed (`npm i -D playwright`, or set `PLAYWRIGHT_MODULE` to an existing install). Pages opened with `?norender` skip drawing, so several software-rendered browsers can share one machine.

## Credits

Made with [Three.js](https://threejs.org), the [Fredoka](https://fonts.google.com/specimen/Fredoka) font, and Cloudflare Workers + Durable Objects. Every sound is synthesized in the browser.
