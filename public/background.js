chrome.runtime.onMessage.addListener(function(request, sender, callback) {
  if (request.action == "endic") {
    fetch(request.url, {
      method: request.method
    })
    .then(response => response.text())
    .then(data => callback(data))
    return true
  }
})
