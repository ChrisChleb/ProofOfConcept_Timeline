<script lang="ts">
import {defineComponent, watch} from 'vue'
import {useStore} from "vuex";
import * as Pixi from "pixi.js";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import config from "@/config";

export default defineComponent({
  name: "PositionIndicator",
  props: {
    isPlaybackActive: {
      type: Boolean,
      required: true
    }
  },
  setup(props: any) {
    const store = useStore();
    const positionIndicator = new Pixi.Graphics();
    let showIndicator: boolean = true;
    let lastX: number = 0;
    let lastY: number = 0;
    dynamicContainer.addChild(positionIndicator);
    renderIndicator();

    watch(() => store.state.trackCount, () => {
      renderIndicator();
    });

    pixiApp.canvas.addEventListener('pointermove', (event: PointerEvent) => {
      renderIndicator(event.clientX, event.clientY);
    });
    
    function renderIndicator(newX?: number, newY?: number) {
      if (!newX) {
        newX = lastX;
      } else {
        lastX = newX;
      }
      
      if (!newY) {
        newY = lastY;
      } else {
        lastY = newY;
      }
      
      store.dispatch('updateCurrentCursorPosition', {x: newX, y: newY});
      
      positionIndicator.clear();
      if (showIndicator) {
        positionIndicator.moveTo(newX, config.sliderHeight + config.componentPadding);
        positionIndicator.lineTo(newX, config.trackHeight * (store.state.trackCount + 1) + config.sliderHeight + config.componentPadding);
        positionIndicator.stroke({width: 4, color: 'rgba(0,0,0,0.1)'})
        positionIndicator._zIndex = -1;
      }
    }

    return {
      renderIndicator
    }
  },
  watch: {
    trackCount: 'renderIndicator'
  }
})
</script>

<template>

</template>

<style scoped>

</style>