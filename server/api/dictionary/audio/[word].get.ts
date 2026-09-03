export default defineEventHandler(async (event) => {
  const word = getRouterParam(event, "word")?.trim();
  if (!word)
    throw createError({
      statusCode: 400,
      statusMessage: "WORD_REQUIRED",
      message: "请输入要播放的英文单词。",
    });

  const query = getQuery(event);
  const requestedType =
    query.type === "1" || query.type === "2" ? query.type : null;
  const accent = requestedType === "1" || query.accent === "uk" ? "uk" : "us";
  const type = requestedType ?? (accent === "uk" ? "1" : "2");
  const config = useRuntimeConfig();
  const baseUrl = String(config.youdaoBaseUrl ?? "").replace(/\/+$/, "");
  if (!baseUrl)
    throw createError({
      statusCode: 503,
      statusMessage: "YOUDAO_UNAVAILABLE",
      message: "有道音频服务尚未配置。",
    });

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(250, Number(config.dictionaryTimeoutMs ?? 6_000)),
  );
  const headers = new Headers({ accept: "audio/mpeg, audio/*;q=0.9" });

  try {
    const upstream = await fetch(
      `${baseUrl}/dictvoice?${new URLSearchParams({
        word,
        audio: word,
        type,
      }).toString()}`,
      { signal: controller.signal, headers },
    );
    if (upstream.status === 404)
      throw createError({
        statusCode: 404,
        statusMessage: "AUDIO_NOT_FOUND",
        message: "有道没有找到该词的发音。",
      });
    if (!upstream.ok)
      throw createError({
        statusCode: 502,
        statusMessage: "YOUDAO_AUDIO_UNAVAILABLE",
        message: `有道音频服务返回 HTTP ${upstream.status}`,
      });

    setHeader(
      event,
      "Content-Type",
      upstream.headers.get("content-type") ?? "audio/mpeg",
    );
    setHeader(
      event,
      "Cache-Control",
      "public, max-age=86400, stale-while-revalidate=604800",
    );
    return new Response(await upstream.arrayBuffer());
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error)
      throw error;
    if (controller.signal.aborted)
      throw createError({
        statusCode: 504,
        statusMessage: "YOUDAO_AUDIO_TIMEOUT",
        message: "有道音频请求超时。",
      });
    throw createError({
      statusCode: 502,
      statusMessage: "YOUDAO_AUDIO_UNAVAILABLE",
      message: error instanceof Error ? error.message : "有道音频服务不可用。",
    });
  } finally {
    clearTimeout(timer);
  }
});
