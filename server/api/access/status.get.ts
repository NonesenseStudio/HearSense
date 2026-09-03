import { setHeader } from "h3";
import { getAccessConfig, getAccessSession } from "../../utils/access";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store, max-age=0");
  const config = getAccessConfig(event);
  const session = await getAccessSession(event, config);
  return {
    data: {
      configured: config.configured,
      authenticated: Boolean(session),
      sessionExpiresAt: session
        ? new Date(session.expiresAt * 1000).toISOString()
        : null,
    },
  };
});
