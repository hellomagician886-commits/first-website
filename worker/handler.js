const REPLICATE_MODEL = "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";
const REPLICATE_API = "https://api.replicate.com/v1";
const OPENROUTER_MODEL = "openai/gpt-5.4-image-2";
const OPENROUTER_IMAGES_API = "https://openrouter.ai/api/v1/images";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "auto"]);
const ALLOWED_QUALITIES = new Set(["auto", "low", "medium", "high"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function replicateHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function uploadImage(file, token) {
  const payload = new FormData();
  payload.append("content", file, file.name || "upload.png");
  payload.append("metadata", JSON.stringify({ source: "xiaoyue-personal-site" }));

  const response = await fetch(`${REPLICATE_API}/files`, {
    method: "POST",
    headers: replicateHeaders(token),
    body: payload,
  });
  const data = await safeJson(response);
  if (!response.ok || !data?.urls?.get) {
    throw new Error("图片上传失败，请稍后再试。");
  }
  return data;
}

async function getPrediction(url, token) {
  const response = await fetch(url, { headers: replicateHeaders(token) });
  const data = await safeJson(response);
  if (!response.ok) throw new Error("暂时无法获取处理结果，请稍后再试。");
  return data;
}

async function createPrediction(imageUrl, token) {
  const response = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: replicateHeaders(token, {
      "content-type": "application/json",
      Prefer: "wait=60",
      "Cancel-After": "90s",
    }),
    body: JSON.stringify({
      version: REPLICATE_MODEL,
      input: { image: imageUrl },
    }),
  });
  let prediction = await safeJson(response);
  if (!response.ok) {
    throw new Error("AI 服务未能开始处理，请确认账户额度后重试。");
  }

  for (let attempt = 0; attempt < 6 && ["starting", "processing"].includes(prediction.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const statusUrl = prediction?.urls?.get;
    if (!statusUrl) break;
    prediction = await getPrediction(statusUrl, token);
  }

  if (!["succeeded", "successful"].includes(prediction.status)) {
    const reason = prediction.status === "failed"
      ? "AI 未能识别这张图片，请换一张主体更清晰的图片。"
      : "处理时间超过预期，请稍后重试。";
    throw new Error(reason);
  }
  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const outputUrl = typeof output === "string" ? output : output?.url;
  if (!outputUrl) throw new Error("AI 已完成处理，但没有返回图片结果。");
  return { outputUrl, predictionId: prediction.id || "" };
}

async function removeBackground(request, env, ctx) {
  const token = env.REPLICATE_API_TOKEN;
  if (!token) return json({ error: "服务尚未配置，请联系网站所有者。" }, 503);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "无法读取上传内容，请重新选择图片。" }, 400);
  }

  const image = form.get("image");
  if (!(image instanceof File)) return json({ error: "请选择一张图片后再试。" }, 400);
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) return json({ error: "仅支持 JPG、PNG 或 WebP 图片。" }, 415);
  if (image.size > MAX_FILE_BYTES) return json({ error: "图片不能超过 10 MB。" }, 413);

  let uploadedFile;
  try {
    uploadedFile = await uploadImage(image, token);
    const { outputUrl, predictionId } = await createPrediction(uploadedFile.urls.get, token);
    const outputResponse = await fetch(outputUrl, { headers: replicateHeaders(token) });
    if (!outputResponse.ok || !outputResponse.body) {
      throw new Error("结果图片暂时无法下载，请稍后重试。");
    }

    return new Response(outputResponse.body, {
      headers: {
        "content-type": outputResponse.headers.get("content-type") || "image/png",
        "content-disposition": 'inline; filename="removed-background.png"',
        "cache-control": "no-store",
        "x-prediction-id": predictionId,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "处理失败，请稍后再试。" }, 502);
  } finally {
    if (uploadedFile?.urls?.get && ctx?.waitUntil) {
      ctx.waitUntil(fetch(uploadedFile.urls.get, {
        method: "DELETE",
        headers: replicateHeaders(token),
      }).catch(() => undefined));
    }
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function generateImage(request, env) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) return json({ error: "图像生成服务尚未配置，请联系网站所有者。" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求内容无法读取，请重新提交。" }, 400);
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const aspectRatio = ALLOWED_ASPECT_RATIOS.has(body?.aspectRatio) ? body.aspectRatio : "1:1";
  const quality = ALLOWED_QUALITIES.has(body?.quality) ? body.quality : "medium";
  if (prompt.length < 3) return json({ error: "请至少输入 3 个字的画面描述。" }, 400);
  if (prompt.length > 2000) return json({ error: "画面描述不能超过 2000 个字符。" }, 400);

  let response;
  try {
    response = await fetch(OPENROUTER_IMAGES_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": "https://xiaoyue-ai-lab-2026.lemony-spice-7059.chatgpt.site",
        "X-OpenRouter-Title": "胡筱悦的 AI 图像实验室",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        prompt,
        n: 1,
        aspect_ratio: aspectRatio,
        quality,
        background: "opaque",
      }),
    });
  } catch {
    return json({ error: "暂时无法连接图像生成服务，请稍后重试。" }, 502);
  }

  const data = await safeJson(response);
  if (!response.ok) {
    const statusMessages = {
      401: "OpenRouter 密钥无效，请联系网站所有者更新。",
      402: "OpenRouter 账户额度不足，请充值后重试。",
      429: "请求过于频繁，请稍等片刻再试。",
    };
    return json({ error: statusMessages[response.status] || data?.error?.message || "图像生成失败，请稍后重试。" }, response.status);
  }

  const generated = data?.data?.[0];
  if (!generated?.b64_json) return json({ error: "模型没有返回图片，请调整描述后重试。" }, 502);

  const mediaType = typeof generated.media_type === "string" && generated.media_type.startsWith("image/")
    ? generated.media_type
    : "image/png";
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/webp" ? "webp" : "png";
  const headers = {
    "content-type": mediaType,
    "content-disposition": `inline; filename="generated-image.${extension}"`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (typeof data?.usage?.cost === "number") headers["x-generation-cost"] = String(data.usage.cost);
  return new Response(base64ToBytes(generated.b64_json), { headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/remove-bg") {
      if (request.method !== "POST") {
        return json({ error: "只支持 POST 请求。" }, 405);
      }
      return removeBackground(request, env, ctx);
    }

    if (url.pathname === "/api/generate-image") {
      if (request.method !== "POST") {
        return json({ error: "只支持 POST 请求。" }, 405);
      }
      return generateImage(request, env);
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        services: {
          removeBackground: Boolean(env.REPLICATE_API_TOKEN),
          imageGeneration: Boolean(env.OPENROUTER_API_KEY),
        },
      });
    }

    if (url.pathname !== "/") return new Response("Not found", { status: 404 });

    return new Response(page, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "permissions-policy": "camera=(), microphone=(), geolocation=()",
      },
    });
  },
};
