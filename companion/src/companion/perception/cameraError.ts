const asText = (error: unknown) => {
  if (error instanceof Error) return `${error.name} ${error.message}`
  return String(error)
}

export const describeCameraError = (error: unknown): string => {
  const text = asText(error).toLowerCase()
  if (
    text.includes('notreadable') ||
    text.includes('trackstart') ||
    text.includes('device in use') ||
    text.includes('already in use') ||
    text.includes('in use') ||
    text.includes('busy')
  ) {
    return 'Caméra déjà utilisée. Fermez l’autre onglet ou l’application Desktop Companion, puis réessayez.'
  }
  if (text.includes('allocate') || text.includes('videosource') || text.includes('video source')) {
    return 'Caméra déjà utilisée, ou source vidéo indisponible. Fermez l’autre onglet, rechargez la page, puis réessayez.'
  }
  if (text.includes('notallowed') || text.includes('permission') || text.includes('denied')) {
    return 'Accès à la caméra refusé. Autorisez la webcam pour cette page, puis réessayez.'
  }
  if (
    text.includes('notfound') ||
    text.includes('overconstrained') ||
    text.includes('devicesnotfound')
  ) {
    return 'Aucune webcam utilisable n’a été trouvée.'
  }
  if (text.includes('notsupported') || text.includes('securityerror')) {
    return 'Cette page n’a pas le droit d’utiliser la webcam.'
  }
  return 'Impossible d’accéder à la webcam locale.'
}

export const isVideoSourceError = (error: unknown) => {
  const text = asText(error).toLowerCase()
  return text.includes('allocate') || text.includes('videosource') || text.includes('video source')
}
