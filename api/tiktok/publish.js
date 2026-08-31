export default async function handler(req, res) {
  if (req.method !== "GET") {
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

  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
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
        max_video_duration: data.data?.max_video_post_duration_sec,
        comment_disabled: data.data?.comment_disabled,
        duet_disabled: data.data?.duet_disabled,
        stitch_disabled: data.data?.stitch_disabled
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: "server_error",
      message: error.message
    });
  }
}
