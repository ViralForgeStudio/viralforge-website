export default function handler(req, res) {
  const state = crypto.randomUUID();

  res.setHeader(
    "Set-Cookie",
    `tiktok_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: "user.info.basic,video.publish,video.upload",
    response_type: "code",
    redirect_uri: "https://viralforge-website.vercel.app/api/tiktok/callback",
    state
  });

  res.writeHead(302, {
    Location: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  });

  res.end();
}
