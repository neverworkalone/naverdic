function getSecretValue(provider, secrets = {}) {
  const secretRef = provider?.auth?.secretRef
  if (!secretRef) {
    return ''
  }

  const value = secretRef
    .split('.')
    .reduce((current, segment) => current?.[segment], secrets)

  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Return the credential referenced by a built-in provider without exposing
 * the rest of the settings envelope to callers.
 */
export function getProviderCredential(provider, secrets = {}) {
  return getSecretValue(provider, secrets)
}
