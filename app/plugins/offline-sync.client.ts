export default defineNuxtPlugin(async () => {
  const { online, initialize, flush } = useOfflineQueue();
  await initialize();

  const onOnline = () => {
    online.value = true;
    void flush();
  };
  const onOffline = () => {
    online.value = false;
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  void flush();
});
