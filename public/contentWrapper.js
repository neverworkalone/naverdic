(async () => {
  const src = chrome.runtime.getURL('./content.js');
  const contentScript = await import(src);
  contentScript.main();
})();
