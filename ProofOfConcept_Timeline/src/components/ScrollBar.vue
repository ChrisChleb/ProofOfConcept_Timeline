<script lang="ts">
import {defineComponent, onMounted, ref, watch} from 'vue'
import * as Pixi from "pixi.js";
import config from "@/config";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import {useStore} from "vuex";

export default defineComponent({
  name: "ScrollBar",
  setup() {
    let changeScrollImplementation = ref(false);
    const scrollBar = new Pixi.Graphics();
    scrollBar.rect(
        pixiApp.canvas.width - config.scrollBarWidth,
        config.sliderHeight,
        config.scrollBarWidth,
        config.scrollBarHeight);
    scrollBar.fill(config.colors.tactonColor);
    scrollBar.interactive = true;
    scrollBar.cursor = 'pointer';
    scrollBar.alpha = config.scrollBarPassiveAlpha;
    scrollBar.visible = false;
    
    pixiApp.stage.addChild(scrollBar);
    
    const store = useStore();

    let isDragging = false;
    let isScrollable = false;
    let startY = 0;
    let initialScrollY = 0;
    let scrollOffset = 0;
    let maxY = 0;
    let canvasOffset = 0;
    
    watch(() => store.state.trackCount, () => {
      checkForScrollable();
      updateScrollbar();
    });
    
    onMounted(() => {
      canvasOffset = pixiApp.canvas.getBoundingClientRect().top;
      maxY = window.innerHeight - canvasOffset - config.scrollBarHeight - config.sliderHeight;
      checkForScrollable();
    });    
    
    scrollBar.on('pointerdown', (event) => {
      store.dispatch('setInteractionState', true);
      isDragging = true;
      startY = event.data.global.y;
      initialScrollY = scrollBar.y;
      scrollBar.alpha = 1;
    });
    
    window.addEventListener('pointermove', (event) => {
      if (isDragging) {        
        const deltaY = (event.clientY - startY) - canvasOffset;
        const newY = initialScrollY + deltaY;
        scrollBar.y = Math.min(Math.max(newY, 0), maxY);
        const scrollRatio = scrollBar.y / maxY;
        scrollOffset = scrollRatio * store.state.scrollableHeight;
        dynamicContainer.y = -scrollOffset;
      }
    });

    window.addEventListener('pointerup', () => {
      store.dispatch('setInteractionState', false);
      isDragging = false;
      scrollBar.alpha = config.scrollBarPassiveAlpha;
      initialScrollY = scrollBar.y;
    });
    
    pixiApp.canvas.addEventListener('wheel', (event: WheelEvent) => {
      if (!isScrollable) return;
      if (isNaN(initialScrollY)) initialScrollY = 0;
      console.log(changeScrollImplementation.value);
      if (changeScrollImplementation.value) {
        scrollBar.y = Math.min(Math.max(initialScrollY + event.deltaY , 0), maxY);
        initialScrollY = scrollBar.y;
        const scrollRatio = scrollBar.y / maxY;
        scrollOffset = scrollRatio * store.state.scrollableHeight;
        dynamicContainer.y = -scrollOffset;
      } else {
        const scrollAmount = event.deltaY > 0 ? config.scrollBarStepSize : -config.scrollBarStepSize;
        scrollBar.y = Math.min(Math.max(initialScrollY + scrollAmount, 0), maxY);
        initialScrollY = scrollBar.y;
        const scrollRatio = scrollBar.y / maxY;
        scrollOffset = scrollRatio * store.state.scrollableHeight;
        dynamicContainer.y = -scrollOffset;
      }
    });
    function checkForScrollable() {
      if (store.state.scrollableHeight > 0 && !isScrollable) {
        isScrollable = true;
        scrollBar.y = 0;
        scrollBar.visible = true;
      } else if (store.state.scrollableHeight <= 0 && isScrollable){
        isScrollable = false;
        scrollBar.visible = false;
        dynamicContainer.y = 0;
      }
    }
    function updateScrollbar() {
      scrollOffset = Math.min(scrollOffset, store.state.scrollableHeight);
      scrollBar.y = (scrollOffset / store.state.scrollableHeight) * ((store.state.visibleHeight - scrollBar.height) + config.componentPadding);
      dynamicContainer.y = -scrollOffset;
    }
    
    watch(() => store.state.verticalViewportOffset, (newOffset) => {
      scrollOffset = -newOffset;
      updateScrollbar();
    });

    const toggleScrollImplementation = () => {
      changeScrollImplementation.value = !changeScrollImplementation.value;
    };
    
    return {
      toggleScrollImplementation,
      changeScrollImplementation
    }
  }
})
</script>

<template>
  <button @click="toggleScrollImplementation">
    Wechsel zu {{changeScrollImplementation ? 'abstrahiertem DeltaY' : 'direktem DeltaY'}}
  </button>
</template>

<style scoped>

</style>