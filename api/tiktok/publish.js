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


  const {
    video_url,
    title,
    privacy_level,
    disable_duet,
    disable_comment,
    disable_stitch,
    brand_content_toggle,
    brand_organic_toggle
  } = req.body || {};


  if (!video_url) {
    return res.status(400).json({
      error: "Missing video_url"
    });
  }


  if (
    typeof video_url !== "string" ||
    !video_url.startsWith("https://")
  ) {
    return res.status(400).json({
      error: "Invalid video_url"
    });
  }


  if (!privacy_level) {
    return res.status(400).json({
      error: "Missing privacy_level"
    });
  }


  const allowedPrivacy = [
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "SELF_ONLY"
  ];


  if (!allowedPrivacy.includes(privacy_level)) {
    return res.status(400).json({
      error: "Invalid privacy_level"
    });
  }


  try {

    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json; charset=UTF-8"
        },

        body: JSON.stringify({

          post_info: {

            title:
              title ||
              "ViralForge test video",

            privacy_level,

            disable_duet:
              Boolean(disable_duet),

            disable_comment:
              Boolean(disable_comment),

            disable_stitch:
              Boolean(disable_stitch),

            brand_content_toggle:
              Boolean(brand_content_toggle),

            brand_organic_toggle:
              Boolean(brand_organic_toggle),

            is_aigc:
              true

          },

          source_info: {

            source:
              "PULL_FROM_URL",

            video_url

          }

        })
      }
    );


    const data =
      await response.json();


    if (
      !response.ok ||
      data.error?.code !== "ok"
    ) {

      return res.status(
        response.status || 400
      ).json({

        error:
          data.error?.code ||
          "publish_init_failed",

        message:
          data.error?.message ||
          "Unknown TikTok error",

        details:
          data

      });

    }


    return res.status(200).json({

      success:
        true,

      publish_id:
        data.data?.publish_id

    });


  } catch (error) {

    return res.status(500).json({

      error:
        "server_error",

      message:
        error.message

    });

  }
}
