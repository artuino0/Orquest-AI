import type { OrquestApi } from '../shared/ipc'

declare global {
  interface Window {
    orquest: OrquestApi
  }
}
