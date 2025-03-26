<script lang="ts">
import {defineComponent, watch} from 'vue'
import pixiApp, {staticContainer} from "@/pixi/pixiApp";
import config from "@/config";
import * as Pixi from "pixi.js";
import store from "@/store";
export default defineComponent({
  name: "Slider",
  setup() {
    let windowWidth = pixiApp.canvas.width
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
    const sliderContainer = new Pixi.Container();
    let lastZoomLevel = store.state.zoomLevel;

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

      updateLastZoomLevel(store.state.zoomLevel);
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

      updateLastZoomLevel(store.state.zoomLevel);
      store.dispatch('clearSelection');
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });
    
    rightSliderHandle.on('pointerdown', (event) => {
      isResizingRight = true;
      initialMouseX = event.data.global.x;
      initialSliderWidth = sliderWidth;

      updateLastZoomLevel(store.state.zoomLevel);
      store.dispatch('clearSelection');
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });
    
    window.addEventListener('resize', () => {
      // TODO
    });
    
    watch(() => store.state.horizontalViewportOffset, (newOffset) => {
      if (isDraggingSlider || isResizingLeft || isResizingRight) return;
      const leftOverflow = getLeftOverflow(newOffset);
      const rightOverflow = getRightOverflow(leftOverflow);
      updateSliderToViewport(leftOverflow, rightOverflow);
    });

    watch(() => store.state.currentVirtualViewportWidth, (newVirtualViewportWidth) => {
      let leftOverflow = getLeftOverflow();
      let rightOverflow = getRightOverflow(leftOverflow, newVirtualViewportWidth);
      updateSliderToViewport(leftOverflow, rightOverflow);
    });

    //*************** functions ***************
    
    function updateLastZoomLevel(newZoomLevel: number) {
      const lo = getLeftOverflow();
      const ro = getRightOverflow(lo);
      if (ro == 0 && lo == 0) {
        if (newZoomLevel > lastZoomLevel) {
          lastZoomLevel = newZoomLevel;
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
      const deltaX = event.clientX - initialMouseX;

      if (isResizingLeft) {
        sliderWidth = Math.max(config.sliderMinWidth, Math.min(initialSliderWidth - deltaX, sliderMaxWidth));
        sliderX = Math.max(config.sliderHandleWidth, Math.min((initialSliderX + deltaX), (windowWidth - sliderWidth- config.sliderHandleWidth)));
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
      window.removeEventListener('pointermove', onScale);
      window.removeEventListener('pointerup', onScaleEnd);
      store.state.blockManager?.onSliderScaleEnd();
    }
    function getLeftOverflow(newOffset?: number): number {
      let offset;
      if (newOffset) {
        offset = newOffset;
      } else {
        offset = store.state.horizontalViewportOffset;
      }
      return Math.max(0, (offset) / store.state.zoomLevel);
    }
    function getRightOverflow(leftOverflow?: number, newVirtualViewportWidth?: number): number {
      let lo;
      if (leftOverflow) {
        lo = leftOverflow
      } else {
        lo = getLeftOverflow();
      }
      let virtualViewportWidth;
      if (newVirtualViewportWidth) {
        virtualViewportWidth = newVirtualViewportWidth;
      } else {
        virtualViewportWidth = store.state.currentVirtualViewportWidth;
      }
      return Math.max(0, (virtualViewportWidth - ((viewportWidth)/store.state.zoomLevel) - lo));
    }
    function updateSliderToViewport(lo: number, ro: number) {
      const initialLength = store.state.initialVirtualViewportWidth;
      const currentLength = initialLength + lo + ro;
      const currentViewportRatio = initialLength / currentLength;
      sliderWidth = sliderMaxWidth * currentViewportRatio;
      sliderX = ((lo / currentLength) * sliderMaxWidth) + config.sliderHandleWidth;
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
      return newOffset * lastZoomLevel;
    }
  }
})
</script>

<template>
</template>

<style scoped>

</style>