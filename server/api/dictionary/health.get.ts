export default defineEventHandler(async (event) => {
  return { data: await useDictionaryService(event).health() };
});
