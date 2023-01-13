chrome.runtime.onMessage.addListener(function(request, sender, callback) {
  if (request.action == 'endic') {
    fetch(request.url, {
      method: request.method
    })
    .then(response => response.json())
    .then(data => callback(data))
    return true
  }
  else if (request.action == 'papago') {
    let formdata = new FormData()
    formdata.append('source', request.data['source'])
    formdata.append('target', request.data['target'])
    formdata.append('client_id', request.data['client_id'])
    formdata.append('client_secret', request.data['client_secret'])
    formdata.append('text', request.data['text'])

    fetch(request.url, {
      method: request.method,
      body: formdata
    })
    .then(response => response.text())
    .then(data => callback(data))
    return true
  }
})
