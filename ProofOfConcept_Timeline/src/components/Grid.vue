<script lang="ts">
import {defineComponent, onUnmounted, watch} from 'vue'
import * as Pixi from "pixi.js";
import pixiApp, {dynamicContainer, staticContainer} from "@/pixi/pixiApp";
import {useStore} from "vuex";
import config from "@/config";
export default defineComponent({
  name: "Grid",
  props: {
    trackCount: {
      type: Number,
      required: true
    }
  },
  setup(props: any) {
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
    watch(() => store.state.sliderOffset, () => {
      rerenderLabels = true;
      rerenderGrid();
    });
    watch(() => props.trackCount, () => {
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
      gridContainer = new Pixi.Container();
      gridGraphics = new Pixi.Graphics();
      
      if (rerenderLabels && labelContainer == null) {
        labelContainer = new Pixi.Container();
      }
      
      const adjustedPixelsPerSecond = config.pixelsPerSecond * store.state.zoomLevel;
      const totalWidth = pixiApp.canvas.width + Math.abs(store.state.horizontalViewportOffset + store.state.sliderOffset) - config.leftPadding;
      const steps = (totalWidth / adjustedPixelsPerSecond);
      const gridOffset = config.leftPadding - store.state.horizontalViewportOffset - store.state.sliderOffset;
      const gridLines: number[] = [];
      getIntervals().forEach((interval) => {
        const isMajor = interval == 1;
        const lineWidth = isMajor ? 2 : 1;
        
        for (let step = 0; step < steps/interval; step++) {
          const y = props.trackCount * config.trackHeight + config.componentPadding + config.sliderHeight;
          const x = step * adjustedPixelsPerSecond * interval;

          // TODO when shifting viewport, gridlines that are pushed out of the viewport (left) are still rendered
          // this fixes the issue, but i think this could be implemented better, by calculating step = ? at for loop to fit this condition
          if (x + gridOffset > 0) {
            gridLines.push(x + gridOffset);
            gridGraphics!.moveTo(x, config.sliderHeight + config.componentPadding);
            gridGraphics!.lineTo(x, y);
            gridGraphics!.stroke({width: lineWidth, color: config.colors.gridColor})

            if (isMajor && rerenderLabels) {
              const label = new Pixi.Text();
              label.text = step;
              label.style.fontSize = 12;
              label.x = x - (label.width / 2);
              label.y = config.sliderHeight + ((config.componentPadding / 2) - (label.height / 2));
              labelContainer!.addChild(label);
              labelContainer!.x = gridOffset;
              staticContainer.addChild(labelContainer!);
            }
          }
        }
      }); 
      
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
    function getIntervals(): number[] {
      let intervals = [1]; // standard: 1-second-spacing
      if (store.state.zoomLevel >= config.maxZoom * 0.25) intervals.push(1/2); // half
      if (store.state.zoomLevel >= config.maxZoom * 0.5) intervals.push(1/4); // quarter
      if (store.state.zoomLevel >= config.maxZoom * 0.75) intervals.push(1/8); // eighth
      if (store.state.zoomLevel >= config.maxZoom * 0.95) intervals.push(1/16); // sixteenth      
      return intervals;
    }
  }
})
</script>

<template>
</template>

<style scoped>

</style>