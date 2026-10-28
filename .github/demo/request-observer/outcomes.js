chrome.storage.local.get('outcomes').then(({ outcomes = {} }) => {
  document.getElementById('outcomes').textContent = JSON.stringify(outcomes);
});
