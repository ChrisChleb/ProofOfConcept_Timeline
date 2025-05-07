<script lang="ts">
import {defineComponent, onUnmounted, watch} from 'vue'
import * as Pixi from "pixi.js";
import pixiApp, {dynamicContainer, staticContainer} from "@/pixi/pixiApp";
import {useStore} from "vuex";
import config from "@/config";
export default defineComponent({
  name: "Grid",
  setup() {
    const store: any = useStore();    
    let gridContainer: Pixi.Container | null;
    let labelContainer: Pixi.Container | null;
    let gridGraphics: Pixi.Graphics | null;
    let rerenderLabels: boolean = true;
    
    renderGrid();

    watch(() => store.state.zoomLevel, () => {
      rerenderLabels = true;
      rerenderGrid();
    });
    watch(() => store.state.horizontalViewportOffset, () => {
      rerenderLabels = true;
      rerenderGrid();
    });
    watch(() => store.state.trackCount, () => {
      rerenderLabels = false;
      rerenderGrid();
    });
    
    window.addEventListener('resize', () => {
      rerenderLabels = true;
      rerenderGrid();
    });
    
    onUnmounted(() => {
      rerenderLabels = true;
      clearGrid();
    });
    function renderGrid() {
      // +1 as first trackId is 0
      const trackCount = store.state.trackCount + 1;
      gridContainer = new Pixi.Container();
      gridGraphics = new Pixi.Graphics();
      
      if (rerenderLabels && labelContainer == null) {
        labelContainer = new Pixi.Container();
      }
      
      const adjustedPixelsPerSecond = config.pixelsPerSecond * store.state.zoomLevel;
      const totalWidth = pixiApp.canvas.width + Math.abs(store.state.horizontalViewportOffset) - config.leftPadding;
      const gridOffset = config.leftPadding - store.state.horizontalViewportOffset;
      const gridLines: number[] = [];
      const y = trackCount * config.trackHeight + config.componentPadding + config.sliderHeight;
      
      const interval = getOptimalInterval();
      for (let step = 0; step * interval * adjustedPixelsPerSecond < totalWidth; step++) {
        const time = step * interval;
        const x = time * adjustedPixelsPerSecond;

        if (x + gridOffset > 0) {
          gridLines.push(x + gridOffset);
          gridGraphics.moveTo(x, config.sliderHeight + config.componentPadding);
          gridGraphics.lineTo(x, y);
          gridGraphics.stroke({ width: 1, color: config.colors.gridColor });

          if (rerenderLabels) {
            const label = new Pixi.Text();
            label.text = parseFloat(time.toFixed(3));
            label.style.fontSize = 12;
            label.x = x - (label.width / 2);
            label.y = config.sliderHeight + ((config.componentPadding / 2) - (label.height / 2));
            labelContainer!.addChild(label);
            labelContainer!.x = gridOffset;
            staticContainer.addChild(labelContainer!);
          }
        }
      }
      
      gridContainer.addChild(gridGraphics);     
      gridContainer.x = gridOffset;
      gridContainer.zIndex = -1;
      dynamicContainer.addChild(gridContainer);
      store.commit('setGridLines', gridLines);
    }
    function rerenderGrid() {
      clearGrid();
      renderGrid();
    }
    function clearGrid() {
      if (gridContainer == null || gridGraphics == null || labelContainer == null) return;
      
      dynamicContainer.removeChild(gridContainer);
      gridContainer.destroy({children: true});
      gridContainer = null;
      
      if (rerenderLabels) {
        staticContainer.removeChild(labelContainer);
        labelContainer.destroy({children: true});
        labelContainer = null;
      }
    }
    function getOptimalInterval(): number {
      const adjustedPixelsPerSecond = config.pixelsPerSecond * store.state.zoomLevel;      
      const idealPixelDistance = (config.minLineDistance + config.maxLineDistance) / 2;      
      const idealInterval = idealPixelDistance / adjustedPixelsPerSecond;
      return Math.pow(2, Math.round(Math.log2(idealInterval)));
    }
  }
})
</script>

<template>
</template>

<style scoped>

</style>