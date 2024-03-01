chrome.runtime.onMessage.addListener(function(request, sender, callback) {
  if (request.action == 'endic') {
    fetch(request.url, {
      method: request.method
    })
    .then(response => response.json())
    .then(data => callback(data))
    return true
  }
  else if (request.action == 'translation') {
    fetch(request.url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "DeepL-Auth-Key " + request.key
      },
      body: JSON.stringify(request.data)
    })
    .then(response => response.json())
    .then(data => callback(data))
    return true
  }
})
