import type { UserRole } from '../context/AuthContext'

export type PortalMode = 'public' | 'admin'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolvePortalMode(hostname = window.location.hostname): PortalMode {
  return hostname.toLowerCase().startsWith('admin.') ? 'admin' : 'public'
}

export function portalAllowsRole(portal: PortalMode, role: UserRole): boolean {
  if (portal === 'public') return role === 'student' || role === 'school'
  return role === 'admin' || role === 'moderator'
}

export function portalForRole(role: UserRole): PortalMode {
  return role === 'student' || role === 'school' ? 'public' : 'admin'
}

function resolveDefaultOrigin(portal: PortalMode): string {
  const { protocol, hostname, port } = window.location
  const normalizedHostname = hostname.toLowerCase()

  let publicHost = normalizedHostname
  let adminHost = normalizedHostname

  if (normalizedHostname === 'localhost') {
    adminHost = 'admin.localhost'
  } else if (normalizedHostname === 'admin.localhost') {
    publicHost = 'localhost'
  } else if (normalizedHostname.startsWith('admin.')) {
    publicHost = normalizedHostname.slice('admin.'.length)
  } else {
    adminHost = `admin.${normalizedHostname}`
  }

  const targetHost = portal === 'public' ? publicHost : adminHost
  const portSuffix = port ? `:${port}` : ''
  return `${protocol}//${targetHost}${portSuffix}`
}

export function getPortalOrigin(portal: PortalMode): string {
  const configured =
    portal === 'public'
      ? (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined)
      : (import.meta.env.VITE_ADMIN_APP_ORIGIN as string | undefined)

  if (configured && configured.trim()) {
    return trimTrailingSlash(configured.trim())
  }

  return resolveDefaultOrigin(portal)
}

export function getPortalUrl(portal: PortalMode, path = '/'): string {
  return new URL(path, `${getPortalOrigin(portal)}/`).toString()
}