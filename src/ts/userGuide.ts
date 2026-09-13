import type { DeviceType } from '@/composables/useDevice'

const images = import.meta.glob<string>('@/assets/edu/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

export function getUserGuide(device: DeviceType) {
  const phone = device === 'ph'
  const tablet = device === 'tb'
  const sections = [
    {
      id: '1_base',
      title: '基本绘画',
      lines: phone
        ? ['单指绘制，双指拖动或缩放。', '右上方可以设置其他内容。']
        : [
            '使用工具在画布上绘制。',
            '侧边功能栏可以配置画布、颜色等内容。',
            tablet
              ? '单指绘制，双指拖动或缩放。'
              : '左键使用工具绘制，摁住中键拖动画布，Ctrl+滚轮缩放画布。',
            '右上角可以导入导出。',
          ],
    },
    {
      id: '2_export',
      title: '导出草图',
      lines: phone
        ? ['配置内容并导出。']
        : [
            tablet
              ? '在右侧进行草图导出详情配置。左边可预览导出，双指拖动或缩放预览图。'
              : '在右侧进行草图导出详情配置。左边可预览导出，鼠标手势与画布一致。',
            '预览部分仅做参考，实际导出图分辨率很清晰。',
          ],
      warning: phone
        ? undefined
        : '商业使用的草图请一定不要使用非商业字体！本网站不承担任何侵权责任！',
    },
    {
      id: '3_image2image',
      title: '以图生图',
      lines: [
        '以图生图可以将图片转换为像素图。',
        '该生成使用抖动仿色纯后端算法，没有 AI 参与。',
        '纯代码实现的转换不达预期属于正常情况。',
      ],
    },
    ...(!phone
      ? [
          {
            id: '4_canvas_group',
            title: '画布组',
            lines: [
              '画布组专门用于绘制大型图。',
              tablet
                ? '点击列头或行头可以配置列和行，点击其他位置关闭操作栏。'
                : '右键列头或行头可以配置列和行。',
              '点击画布可以进入单独绘制。',
              '长按拖动画布可以和指定位置画布交换位置。',
            ],
          },
        ]
      : []),
  ]
  return sections.map((section) => ({
    warning: undefined as string | undefined,
    ...section,
    image: images[`/src/assets/edu/${device}/${section.id}.png`],
  }))
}
