import { elements } from './elements.js';
import { state } from './state.js';
import { renderFullscreenPalette, updateFullscreenPaletteSelection } from './palette.js';

// 修复：添加可靠的全屏状态检查函数
function getFullscreenState() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

export function toggleFullscreen() {
  const isCurrentlyFullscreen = getFullscreenState();

  if (!isCurrentlyFullscreen) {
    // 进入全屏
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(err => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  } else {
    // 退出全屏
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

export function updateFullscreenState() {
  const isNowFullscreen = getFullscreenState();

  // 修复：只有当状态确实改变时才更新
  if (state.isFullscreen !== isNowFullscreen) {
    state.isFullscreen = isNowFullscreen;

    document.body.classList.toggle('canvas-fullscreen', state.isFullscreen);

    if (elements.toggleFullscreenBtn) {
      elements.toggleFullscreenBtn.textContent = state.isFullscreen ? '退出全屏' : '全屏显示';
    }

    if (elements.fullscreenPalette) {
      elements.fullscreenPalette.setAttribute('aria-hidden', state.isFullscreen ? 'false' : 'true');
      if (state.isFullscreen) {
        renderFullscreenPalette();
        updateFullscreenPaletteSelection();
      }
    }

    // 修复：触发全屏覆盖层状态更新
    setTimeout(() => {
      if (typeof updateFullscreenOverlayState === 'function') {
        updateFullscreenOverlayState();
      } else {
        document.dispatchEvent(new CustomEvent('updateFullscreenOverlay'));
      }
    }, 50); // 稍微延迟确保DOM已更新
  }
}

// 修复：添加跨浏览器全屏事件监听
function initializeFullscreenListeners() {
  document.addEventListener('fullscreenchange', updateFullscreenState);
  document.addEventListener('webkitfullscreenchange', updateFullscreenState);
  document.addEventListener('mozfullscreenchange', updateFullscreenState);
  document.addEventListener('MSFullscreenChange', updateFullscreenState);

  // 初始状态检查
  setTimeout(updateFullscreenState, 100);
}

// 在模块加载时初始化监听器
initializeFullscreenListeners();