function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  const match = cookies.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  );

  return match
    ? decodeURIComponent(match[1])
    : null;
}

async function upstashCommand(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Upstash environment variables are missing.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error || "Upstash request failed."
    );
  }

  return data.result;
}

async function saveTikTokTokens(data) {
  await upstashCommand([
    "SET",
    "tiktok:credentials",
    JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      open_id: data.open_id || null,
      scope: data.scope || null,
      token_type: data.token_type || "Bearer",
      expires_at: Date.now() + (data.expires_in || 86400) * 1000,
      refresh_expires_at:
        Date.now() +
        (data.refresh_expires_in || 31536000) * 1000
    })
  ]);
}

export default async function handler(req, res) {
  const {
    code,
    state,
    error,
    error_description
  } = req.query;

  if (error) {
    return res.status(400).send(`
      <h1>TikTok authorization failed</h1>
      <p>${error}</p>
      <p>${error_description || ""}</p>
    `);
  }

  if (!code) {
    return res.status(400).send(
      "Missing authorization code"
    );
  }

  try {
    // 1. Validar state para proteger el callback
    const savedState = getCookie(
      req,
      "tiktok_state"
    );

    if (!savedState || !state || savedState !== state) {
      return res.status(400).send(`
        <h1>Invalid OAuth state</h1>
        <p>The TikTok authorization state could not be verified.</p>
      `);
    }

    // 2. Intercambiar authorization code por tokens
    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache"
        },
        body: new URLSearchParams({
          client_key:
            process.env.TIKTOK_CLIENT_KEY,

          client_secret:
            process.env.TIKTOK_CLIENT_SECRET,

          code,

          grant_type:
            "authorization_code",

          redirect_uri:
            "https://viralforge-website.vercel.app/api/tiktok/callback"
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(400).send(`
        <h1>TikTok token exchange failed</h1>
        <p>${data.error || "unknown_error"}</p>
        <p>${data.error_description || "Unknown error"}</p>
      `);
    }

    // 3. Consultar información actual del creador
    const creatorResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${data.access_token}`,

          "Content-Type":
            "application/json"
        }
      }
    );

    const creatorData =
      await creatorResponse.json();

    if (
      !creatorResponse.ok ||
      creatorData.error?.code !== "ok"
    ) {
      return res.status(400).send(`
        <h1>Creator info failed</h1>
        <p>${creatorData.error?.code || "unknown_error"}</p>
        <p>${creatorData.error?.message || "Unknown error"}</p>
      `);
    }

    // 4. GUARDAR TOKENS EN UPSTASH
    await saveTikTokTokens(data);

    // 5. Mantener también las cookies actuales
    res.setHeader("Set-Cookie", [
      `tiktok_access_token=${encodeURIComponent(
        data.access_token
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,

      `tiktok_refresh_token=${encodeURIComponent(
        data.refresh_token || ""
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,

      `tiktok_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
    ]);

    return res.status(200).send(`
      <h1>TikTok connected successfully!</h1>

      <p>Authorization completed successfully.</p>

      <p>State: OK</p>

      <p>Open ID received:
        ${data.open_id ? "YES" : "NO"}
      </p>

      <p>Access token received:
        ${data.access_token ? "YES" : "NO"}
      </p>

      <p>Refresh token received:
        ${data.refresh_token ? "YES" : "NO"}
      </p>

      <p>Tokens stored securely on the server.</p>
    `);

  } catch (err) {
    console.error(
      "TikTok callback error:",
      err
    );

    return res.status(500).send(`
      <h1>Server error</h1>
      <p>Something went wrong while connecting TikTok.</p>
    `);
  }
}
