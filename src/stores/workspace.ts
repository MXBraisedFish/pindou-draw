import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ReferenceImageState {
  src: string
  name: string
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const referenceImage = ref<ReferenceImageState | null>(null)
  const referenceWindowOpen = ref(false)
  const groupPreviewWindowOpen = ref(false)

  function setReferenceImage(image: ReferenceImageState) {
    referenceImage.value = { ...image }
    referenceWindowOpen.value = true
  }

  function removeReferenceImage() {
    referenceImage.value = null
    referenceWindowOpen.value = false
  }

  function resetWorkspace() {
    referenceImage.value = null
    referenceWindowOpen.value = false
    groupPreviewWindowOpen.value = false
  }

  return {
    referenceImage,
    referenceWindowOpen,
    groupPreviewWindowOpen,
    setReferenceImage,
    removeReferenceImage,
    resetWorkspace,
  }
})
