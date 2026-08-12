import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'

describe('App', () => {
  it('mounts and renders device modal on first visit', async () => {
    localStorage.removeItem('pindou-device')
    const wrapper = mount(App)
    await nextTick()
    expect(wrapper.text()).toContain('欢迎使用拼豆绘制')
  })
})
