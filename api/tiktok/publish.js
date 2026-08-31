export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const { access_token } = req.body || {};

  if (!access_token) {
    return res.status(400).json({
      error: "Missing access_token"
    });
  }

  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok || data.error?.code !== "ok") {
      return res.status(400).json({
        error: data.error?.code || "creator_info_failed",
        message: data.error?.message || "Unknown error"
      });
    }

    return res.status(200).json({
      success: true,
      creator: {
        username: data.data?.creator_username,
        nickname: data.data?.creator_nickname,
        privacy_options: data.data?.privacy_level_options,
        max_video_duration: data.data?.max_video_post_duration_sec
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: "server_error",
      message: error.message
    });
  }
}
