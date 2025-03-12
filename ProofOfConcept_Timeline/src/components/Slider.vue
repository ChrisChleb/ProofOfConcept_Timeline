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

    // slider      
    const sliderRect = new Pixi.Graphics();
    sliderRect.rect((windowWidth - sliderWidth)/2, 0, sliderWidth, config.sliderHeight);
    sliderRect.fill('rgba(18,21,24,0.46)');
    sliderRect.interactive = true;
    sliderRect.cursor = 'pointer';

    sliderRect.on('pointerdown', (event) => {
      isDraggingSlider = true;
      initialMouseX = event.data.global.x;
      initialSliderX = sliderX;
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });

    // left handle
    const leftSliderHandle = new Pixi.Graphics();
    leftSliderHandle.rect(0, 0, config.sliderHandleWidth, config.sliderHeight);
    leftSliderHandle.fill(config.colors.sliderHandleColor);
    leftSliderHandle.interactive = true;
    leftSliderHandle.cursor = 'ew-resize';

    leftSliderHandle.on('pointerdown', (event) => {
      isResizingLeft = true;
      initialMouseX = event.data.global.x;
      initialSliderWidth = sliderWidth;
      initialSliderX = sliderX;
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });

    // right handle
    const rightSliderHandle = new Pixi.Graphics();
    rightSliderHandle.rect(sliderRect.width + config.sliderHandleWidth, 0, config.sliderHandleWidth, config.sliderHeight);
    rightSliderHandle.fill(config.colors.sliderHandleColor);
    rightSliderHandle.interactive = true;
    rightSliderHandle.cursor = 'ew-resize';

    rightSliderHandle.on('pointerdown', (event) => {
      isResizingRight = true;
      initialMouseX = event.data.global.x;
      initialSliderWidth = sliderWidth;
      store.dispatch('setInteractionState', true);
      window.addEventListener('pointermove', onScale);
      window.addEventListener('pointerup', onScaleEnd);
    });

    sliderContainer.addChild(leftSliderHandle);
    sliderContainer.addChild(sliderRect);
    sliderContainer.addChild(rightSliderHandle);
    staticContainer.addChild(sliderContainer);

    window.addEventListener('resize', () => {
      // TODO
    });
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
        sliderX = Math.max(config.sliderHandleWidth, Math.min((initialSliderX + deltaX), (windowWidth - config.sliderMinWidth - config.sliderHandleWidth)));
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

      if (isResizingRight || isResizingLeft) {
        store.dispatch('updateZoomLevel', calculateZoom());
      }
      if (isDraggingSlider || isResizingLeft) {
        store.dispatch('updateSliderOffset', calculateViewport());
      }
    }

    watch(() => store.state.horizontalViewportOffset, (newOffset) => {
      const initialLength = store.state.initialVirtualViewportWidth * store.state.zoomLevel;
      const currentLength = initialLength + newOffset;
      const isSliderRight = Math.round((sliderX + sliderWidth + config.sliderHandleWidth)) === windowWidth;

      if (isSliderRight) {
        const lengthRatio = currentLength / initialLength;

        let newSliderWidth = sliderMaxWidth / lengthRatio;
        newSliderWidth = Math.max(newSliderWidth, config.sliderMinWidth);

        const deltaWidth = sliderWidth - newSliderWidth;
        let newSliderX = sliderX + deltaWidth;

        newSliderX = Math.max(newSliderX, config.sliderHandleWidth);
        newSliderX = Math.min(newSliderX, windowWidth - newSliderWidth - config.sliderHandleWidth);

        sliderX = newSliderX;
        sliderWidth = newSliderWidth;
      }

      updateSlider();
    });
    function onScaleEnd() {
      isResizingRight = false;
      isResizingLeft = false;
      isDraggingSlider = false;
      store.dispatch('setInteractionState', false);
      window.removeEventListener('pointermove', onScale);
      window.removeEventListener('pointerup', onScaleEnd);
      store.state.blockManager?.onSliderScaleEnd();
    }

    // TODO dynamicaly calculate max zoom, depending on last tacton
    function calculateZoom(): number {
      const sliderRatio = sliderWidth / sliderMaxWidth;
      const visibleLength = store.state.currentVirtualViewportWidth * sliderRatio;

      const zoomLevel = viewportWidth / (visibleLength);
      return Math.min(Math.max(zoomLevel, config.minZoom), config.maxZoom);
    }

    let zoomOffset = 0;
    let dragOffset = 0;
    function calculateViewport(): number {
      const zoom = store.state.zoomLevel;
      const visibleArea = viewportWidth/zoom;
      const maxOffset = (store.state.currentVirtualViewportWidth - visibleArea) * zoom;

      if (isResizingLeft) {
        zoomOffset = (visibleArea - store.state.currentVirtualViewportWidth) * zoom;
      }

      // this works, until virtual viewport is changed
      let sliderPositionRatio;
      if (zoomOffset == 0) {
        sliderPositionRatio =  - ((sliderX - config.sliderHandleWidth) / (windowWidth - sliderWidth - (2 * config.sliderHandleWidth)));
      } else {
        sliderPositionRatio = 1 - ((sliderX - config.sliderHandleWidth) / (windowWidth - sliderWidth - (2 * config.sliderHandleWidth)));
      }

      if (store.state.currentVirtualViewportWidth > store.state.initialVirtualViewportWidth) {
        sliderPositionRatio = 1 - ((sliderX - config.sliderHandleWidth) / (windowWidth - sliderWidth - (2 * config.sliderHandleWidth)));
      }

      if (isNaN(sliderPositionRatio)) sliderPositionRatio = 0;
      dragOffset = sliderPositionRatio * maxOffset;

      return -(dragOffset + zoomOffset);
    }
  }
})
</script>

<template>
</template>

<style scoped>

</style>