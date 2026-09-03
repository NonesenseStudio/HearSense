interface AccessStatusResponse {
  data: { configured: boolean; authenticated: boolean };
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server || to.path === "/access") return;

  try {
    const response = await $fetch<AccessStatusResponse>("/api/access/status");
    if (response.data.authenticated) return;
    return navigateTo(
      { path: "/access", query: { redirect: to.fullPath } },
      { replace: true },
    );
  } catch (error) {
    const statusCode =
      (error as { response?: { status?: number }; statusCode?: number })
        .response?.status ?? (error as { statusCode?: number }).statusCode;
    if (statusCode === 401 || statusCode === 503)
      return navigateTo(
        { path: "/access", query: { redirect: to.fullPath } },
        { replace: true },
      );
  }
});
