// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@vite-pwa/nuxt"],
  nitro: {
    preset: "cloudflare_module",
    cloudflare: { deployConfig: false, nodeCompat: true },
  },
  runtimeConfig: {
    dictionaryBaseUrl: "https://dict.hearsense.top",
    dictionaryTimeoutMs: 6000,
  },
  css: ["~/assets/css/main.css"],
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      titleTemplate: "%s · 听义 HearSense",
      meta: [
        {
          name: "description",
          content: "从声音直达词义的英语听力词汇学习应用",
        },
        { name: "theme-color", content: "#4f46e5" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
      ],
    },
  },
  pwa: {
    registerType: "autoUpdate",
    client: { installPrompt: true },
    manifest: {
      name: "听义 HearSense",
      short_name: "听义",
      description: "从声音直达词义的英语听力词汇学习应用",
      lang: "zh-CN",
      start_url: "/",
      display: "standalone",
      background_color: "#faf9ff",
      theme_color: "#4f46e5",
      icons: [
        {
          src: "/icons/hearsense.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        },
        {
          src: "/icons/hearsense-maskable.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      navigateFallback: null,
      globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
      runtimeCaching: [
        {
          urlPattern: /^https?:\/\/[^/]+\/api\//,
          handler: "NetworkFirst",
          options: {
            cacheName: "hearsense-api-v1",
            networkTimeoutSeconds: 4,
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 },
          },
        },
        {
          urlPattern: /^https?:\/\/[^/]+\/(?!api\/)/,
          handler: "NetworkFirst",
          options: {
            cacheName: "hearsense-pages-v1",
            networkTimeoutSeconds: 4,
            expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 },
          },
        },
      ],
    },
  },
});
