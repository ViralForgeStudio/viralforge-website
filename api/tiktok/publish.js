export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const cookies = req.headers.cookie || "";
  const match = cookies.match(/(?:^|;\s*)tiktok_access_token=([^;]+)/);

  if (!match) {
    return res.status(401).json({
      error: "TikTok not connected"
    });
  }

  const accessToken = decodeURIComponent(match[1]);

  const { video_url, title } = req.body || {};

  if (!video_url) {
    return res.status(400).json({
      error: "Missing video_url"
    });
  }

  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({
          post_info: {
            title: title || "ViralForge test video",
            privacy_level: "SELF_ONLY",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.error?.code !== "ok") {
      return res.status(400).json({
        error: data.error?.code || "publish_init_failed",
        message: data.error?.message || "Unknown error",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      publish_id: data.data?.publish_id
    });

  } catch (error) {
    return res.status(500).json({
      error: "server_error",
      message: error.message
    });
  }
}
