// Cloudflare Worker entry point.
// Static files in ./public (the scene) are served by Workers Static Assets;
// anything else falls through to this handler.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, scene: "cliffside sunset" });
    }

    return env.ASSETS.fetch(request);
  },
};
