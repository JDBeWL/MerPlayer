import { vi } from 'vitest'

// Mock Tauri core API
export const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

// Mock Tauri dialog plugin
export const mockOpen = vi.fn()

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mockOpen,
}))
