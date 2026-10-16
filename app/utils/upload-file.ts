export function uploadFile(
  url: string,
  body: Blob | FormData,
  options: {
    method: 'POST' | 'PUT'
    headers?: Record<string, string>
    onProgress: (percent: number) => void
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(options.method, url)
    request.timeout = 5 * 60 * 1000
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      request.setRequestHeader(name, value)
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress(Math.min(99, Math.floor((event.loaded / event.total) * 100)))
      }
    }
    const fail = () => reject(new Error('Koneksi unggahan gagal. Periksa koneksi dan coba lagi.'))
    request.onerror = fail
    request.ontimeout = fail
    request.onabort = fail
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve()
        return
      }
      let detail = 'Berkas gagal diunggah. Silakan coba lagi.'
      try {
        const response = JSON.parse(request.responseText)
        detail = response.statusMessage ?? response.message ?? detail
      } catch {
        // A proxy can return a non-JSON error response.
      }
      reject(new Error(detail))
    }
    request.send(body)
  })
}
