import { ref, watch } from 'vue'

export type DeviceType = 'pc' | 'tb' | 'ph'

const STORAGE_KEY = 'pindou-device'

const device = ref<DeviceType | null>(null)
const isFirstVisit = ref(false)

function getStoredDevice(): DeviceType | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'pc' || stored === 'tb' || stored === 'ph') {
    return stored
  }
  return null
}

function saveDevice(type: DeviceType) {
  localStorage.setItem(STORAGE_KEY, type)
}

function applyBodyId(type: DeviceType) {
  document.body.id = type
}

export function useDevice() {
  function init() {
    const stored = getStoredDevice()
    if (stored) {
      device.value = stored
      applyBodyId(stored)
      isFirstVisit.value = false
    } else {
      device.value = null
      isFirstVisit.value = true
    }
  }

  function selectDevice(type: DeviceType) {
    saveDevice(type)
    device.value = type
    applyBodyId(type)
    isFirstVisit.value = false
  }

  function changeDevice(type: DeviceType) {
    selectDevice(type)
  }

  function resetDevice() {
    localStorage.removeItem(STORAGE_KEY)
    device.value = null
    document.body.removeAttribute('id')
    isFirstVisit.value = true
  }

  return {
    device,
    isFirstVisit,
    init,
    selectDevice,
    changeDevice,
    resetDevice,
  }
}
