import { setHeader } from "h3";
import { clearAccessSession } from "../../utils/access";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store, max-age=0");
  clearAccessSession(event);
  return { data: { authenticated: false } };
});
