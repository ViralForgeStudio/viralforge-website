export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <h1>TikTok authorization failed</h1>
      <p>${error}</p>
      <p>${error_description || ""}</p>
    `);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache"
      },
      body: new URLSearchParams({
  client_key: process.env.TIKTOK_CLIENT_KEY,
  client_secret: process.env.TIKTOK_CLIENT_SECRET,
  code: code,
  grant_type: "authorization_code",
  redirect_uri: "https://viralforge-website.vercel.app/api/tiktok/callback"
})
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(400).send(`
        <h1>TikTok token exchange failed</h1>
        <p>${data.error || "unknown_error"}</p>
        <p>${data.error_description || "Unknown error"}</p>
      `);
    }
    const creatorResponse = await fetch(
  "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${data.access_token}`,
      "Content-Type": "application/json"
    }
  }
);

const creatorData = await creatorResponse.json();
    if (!creatorResponse.ok || creatorData.error?.code !== "ok") {
  return res.status(400).send(`
    <h1>Creator info failed</h1>
    <p>${creatorData.error?.code || "unknown_error"}</p>
    <p>${creatorData.error?.message || "Unknown error"}</p>
  `);
}

    res.setHeader("Set-Cookie", [
  `tiktok_access_token=${encodeURIComponent(data.access_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
  `tiktok_refresh_token=${encodeURIComponent(data.refresh_token || "")}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
]);

return res.status(200).send(`
  <h1>TikTok connected successfully!</h1>
  <p>Authorization completed successfully.</p>
  <p>State: ${state ? "OK" : "missing"}</p>
  <p>Open ID received: ${data.open_id ? "YES" : "NO"}</p>
  <p>Access token received: ${data.access_token ? "YES" : "NO"}</p>
  <p>Refresh token received: ${data.refresh_token ? "YES" : "NO"}</p>
`);

  } catch (err) {
    return res.status(500).send(`
      <h1>Server error</h1>
      <p>${err.message}</p>
    `);
  }
}
