# Cliffside Hang

A modern house on a cliff at sunset, with chibi bears hanging out and boats sailing by.
It runs as a **Cloudflare Worker**. The scene in `public/` is served through Workers Static Assets.

## Things to try
- **Tap a bear** to make it wave (with hearts and its name).
- **Tap the water** to put a new boat there.
- **Tap the house** to turn the lights on and off.

## Run locally
```sh
npm install
npm run dev        # http://localhost:8787
```

## Deploy
```sh
npx wrangler login
npm run deploy     # publishes to https://cliff-side-hang.<your-subdomain>.workers.dev
```
You can also connect this repo in the Cloudflare dashboard (Workers & Pages → Create → Import a repository) so that every push deploys automatically.

## Layout
- `src/index.js`: the Worker. It serves the static scene and a small `/api/health` endpoint.
- `public/index.html`: the page shell and title overlay.
- `public/scene.js`: the canvas scene (sky, sea, cliff, house, bears, boats).
- `wrangler.jsonc`: the Worker config.
