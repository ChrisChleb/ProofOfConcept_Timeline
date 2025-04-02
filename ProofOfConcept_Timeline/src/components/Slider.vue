<script lang="ts">
import {defineComponent, watch} from 'vue'
import pixiApp, {staticContainer} from "@/pixi/pixiApp";
import config from "@/config";
import * as Pixi from "pixi.js";
import store from "@/store";
export default defineComponent({
  name: "Slider",
  setup() {
    let windowWidth = pixiApp.canvas.width;
    let viewportWidth = windowWidth - config.leftPadding;
    let sliderMaxWidth = windowWidth - (2 * config.sliderHandleWidth);

    let sliderWidth = sliderMaxWidth;
    let initialSliderWidth = sliderWidth;
    let isResizingLeft = false;
    let isResizingRight = false;
    let isDraggingSlider = false;
    let initialMouseX = 0;
    let initialSliderX = config.sliderHandleWidth;
    let sliderX = initialSliderX;
    let initialZoomLevel = store.state.initialZoomLevel;
    const sliderContainer = new Pixi.Container();

    //*************** init slider ***************
    
    // slider      
    const sliderRect = new Pixi.Graphics();
    sliderRect.rect((windowWidth - sliderWidth)/2, 0, sliderWidth, config.sliderHeight);
    sliderRect.fill('rgba(18,21,24,0.46)');
    sliderRect.interactive = true;
    sliderRect.cursor = 'pointer';

    // left handle
    const leftSliderHandle = new Pixi.Graphics();
    leftSliderHandle.rect(0, 0, config.sliderHandleWidth, config.sliderHeight);
    leftSliderHandle.fill(config.colors.sliderHandleColor);
    leftSliderHandle.interactive = true;
    leftSliderHandle.cursor = 'ew-resize';    

    // right handle
    const rightSliderHandle = new Pixi.Graphics();
    rightSliderHandle.rect(sliderRect.width + config.sliderHandleWidth, 0, config.sliderHandleWidth, config.sliderHeight);
    rightSliderHandle.fill(config.colors.sliderHandleColor);
    rightSliderHandle.interactive = true;
    rightSliderHandle.cursor = 'ew-resize';    

    sliderContainer.addChild(leftSliderHandle);
    sliderContainer.addChild(sliderRect);
    sliderContainer.addChild(rightSliderHandle);
    staticContainer.addChild(sliderContainer);

    //*************** EventListeners / Watcher ***************
    
    sliderRect.on('pointerdown', (event) => {
      isDraggingSlider = true;
      initialMouseX = event.data.global.x;
      initialSliderX = sliderX;

      store.dispatch('clearSelection');
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });
    
    leftSliderHandle.on('pointerdown', (event) => {
      isResizingLeft = true;
      initialMouseX = event.data.global.x;
      initialSliderWidth = sliderWidth;
      initialSliderX = sliderX;

      store.dispatch('clearSelection');
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });
    
    rightSliderHandle.on('pointerdown', (event) => {
      isResizingRight = true;
      initialMouseX = event.data.global.x;
      initialSliderWidth = sliderWidth;

      store.dispatch('clearSelection');
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });
    
    window.addEventListener('resize', () => {
      windowWidth = pixiApp.canvas.width;
      sliderMaxWidth = windowWidth - (2 * config.sliderHandleWidth);
      viewportWidth = windowWidth - config.leftPadding;
      updateLastZoomLevel();
      updateSliderToViewport();
    });
    
    watch(() => store.state.horizontalViewportOffset, (newOffset) => {
      if (isDraggingSlider || isResizingLeft || isResizingRight) return;
      updateSliderToViewport();
    });

    watch(() => store.state.currentVirtualViewportWidth, () => {
      updateSliderToViewport();
    });
    
    watch(() => store.state.initialZoomLevel, () => {
      initialZoomLevel = store.state.initialZoomLevel;
    });

    //*************** functions ***************
    async function updateLastZoomLevel(newZoomLevel?: number) {
      const lo = store.state.horizontalViewportOffset; 
      const ro = getRightOverflow();
      
      if (!newZoomLevel) {
        // calculate zoom that can display sequence without overflow
        newZoomLevel = viewportWidth / store.state.initialVirtualViewportWidth;
        initialZoomLevel = newZoomLevel;
        store.dispatch('updateInitialZoomLevel', newZoomLevel);
        return;
      }
      
      if (ro == 0 && lo == 0) {
        if (newZoomLevel > initialZoomLevel) {
          initialZoomLevel = newZoomLevel;
          store.dispatch('updateInitialZoomLevel', initialZoomLevel);
        }
      }
    }
    function updateSlider() {
      sliderRect.clear();
      sliderRect.rect(sliderX, 0, sliderWidth  , config.sliderHeight);
      sliderRect.fill('rgba(18,21,24,0.46)');

      leftSliderHandle.clear();
      leftSliderHandle.rect(sliderX - config.sliderHandleWidth, 0, config.sliderHandleWidth, config.sliderHeight);
      leftSliderHandle.fill(config.colors.sliderHandleColor);

      rightSliderHandle.clear();
      rightSliderHandle.rect(sliderX + sliderWidth, 0, config.sliderHandleWidth, config.sliderHeight);
      rightSliderHandle.fill(config.colors.sliderHandleColor);
    }
    function onScale(event: any) {
      let deltaX = event.clientX - initialMouseX;
      
      if (isResizingLeft) {
        if (initialSliderX + deltaX >= config.sliderHandleWidth) {
          sliderWidth = Math.max(config.sliderMinWidth, Math.min(initialSliderWidth - deltaX, sliderMaxWidth));
          sliderX = Math.max(config.sliderHandleWidth, Math.min((initialSliderX + deltaX), (windowWidth - sliderWidth - config.sliderHandleWidth)));
        } 
      }

      if (isResizingRight) {
        sliderWidth = Math.min(
            Math.max(initialSliderWidth + deltaX, config.sliderMinWidth),
            Math.min(sliderMaxWidth, windowWidth - sliderX - config.sliderHandleWidth)
        );
      }

      if (isDraggingSlider) {
        sliderX = Math.max(
            config.sliderHandleWidth,
            Math.min(initialSliderX + deltaX, windowWidth - sliderWidth - config.sliderHandleWidth)
        );
      }

      updateSlider();

      store.dispatch('updateZoomLevel', calculateZoom());
      store.dispatch('updateHorizontalViewportOffset', calculateViewport());
    }
    function onScaleEnd() {
      isResizingRight = false;
      isResizingLeft = false;
      isDraggingSlider = false;
      store.dispatch('setInteractionState', false);
      store.dispatch('getLastBlockPosition');
      window.removeEventListener('pointermove', onScale);
      window.removeEventListener('pointerup', onScaleEnd);
      store.state.blockManager?.onSliderScaleEnd();
    }
    function getRightOverflow(): number {
      const lo = store.state.horizontalViewportOffset;
      const virtualViewportWidth = store.state.currentVirtualViewportWidth - config.pixelsPerSecond;
      const currentViewportSize = ((pixiApp.canvas.width - config.leftPadding) / store.state.zoomLevel);
      let ro = (virtualViewportWidth - currentViewportSize - (lo / store.state.zoomLevel)) * store.state.zoomLevel;
      const scaledPadding = config.pixelsPerSecond * store.state.zoomLevel;
      if (ro > -scaledPadding) {
        ro += scaledPadding;
      }
      return Math.max(0, ro);
    }
    function updateSliderToViewport() {
      const lo = store.state.horizontalViewportOffset;
      const ro = getRightOverflow();
      
      const currentViewportWidth = (pixiApp.canvas.width + lo + ro);
      const currentViewportRatio = pixiApp.canvas.width / currentViewportWidth;
      
      sliderWidth = sliderMaxWidth * currentViewportRatio;
      sliderX = ((lo / currentViewportWidth) * sliderMaxWidth) + config.sliderHandleWidth;
      updateSlider();
    }
    function calculateZoom(): number {
      const sliderRatio = sliderWidth / sliderMaxWidth;
      const visibleLength = store.state.currentVirtualViewportWidth * sliderRatio;
      return viewportWidth / visibleLength;
    }
    function calculateViewport(): number {
      const leftHandleSpace = sliderX - config.sliderHandleWidth;
      const newOffset = leftHandleSpace * (store.state.initialVirtualViewportWidth / sliderWidth);
      return newOffset * initialZoomLevel;
    }
  }
})
</script>

<template>
</template>

<style scoped>

</style>