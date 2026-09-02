export default defineEventHandler(async () => {
  return { data: await useDictionaryService().health() };
});
