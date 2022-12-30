function mockPromise(url) {
  return fetch(url)
    .then(response => response.text())
    .catch(function(error) {
      console.log(error)
    })
}

async function mock(url, promise=true) {
  if (promise) {
    return mockPromise(url)
  }
  else {
    const response = await fetch(url)
    return response.text()
  }
}

export function mockEndic(promise=true) {
  return mock('./mock/endic.html', promise)
}
