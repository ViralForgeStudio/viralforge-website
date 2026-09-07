export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const cookies = req.headers.cookie || "";

  const match = cookies.match(
    /(?:^|;\s*)tiktok_access_token=([^;]+)/
  );

  if (!match) {
    return res.status(401).json({
      error: "TikTok not connected"
    });
  }

  const accessToken =
    decodeURIComponent(match[1]);

  const { publish_id } = req.body || {};

  if (!publish_id) {
    return res.status(400).json({
      error: "Missing publish_id"
    });
  }

  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          "Authorization":
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json; charset=UTF-8"
        },
        body: JSON.stringify({
          publish_id
        })
      }
    );

    const data = await response.json();

    if (
      !response.ok ||
      data.error?.code !== "ok"
    ) {
      return res.status(
        response.status || 400
      ).json({
        error:
          data.error?.code ||
          "status_fetch_failed",
        message:
          data.error?.message ||
          "Unknown TikTok error",
        details:
          data
      });
    }

    return res.status(200).json({
      success: true,
      status:
        data.data?.status || null,
      fail_reason:
        data.data?.fail_reason || null,
      publicly_available_post_id:
        data.data?.publicly_available_post_id || null
    });

  } catch (error) {
    return res.status(500).json({
      error: "server_error",
      message: error.message
    });
  }
}
