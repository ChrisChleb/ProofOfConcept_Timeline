<script lang="ts">
import {defineComponent, watch} from 'vue'
import * as Pixi from "pixi.js";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
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
    let gridGraphics: Pixi.Graphics | null;
    
    renderGrid();

    watch(() => store.state.zoomLevel, rerenderGrid);
    watch(() => store.state.viewportOffset, rerenderGrid);
    watch(() => store.state.sliderOffset, rerenderGrid);
    
    window.addEventListener('resize', () => {
      rerenderGrid();
    });
    function renderGrid() {
      gridContainer = new Pixi.Container();
      gridGraphics = new Pixi.Graphics();
      
      const pixelPerSeconds = config.pixelsPerSecond * store.state.zoomLevel;
      const totalWidth = pixiApp.canvas.width + Math.abs(store.state.viewportOffset + store.state.sliderOffset);  
      const steps = (totalWidth / config.pixelsPerSecond);
      const gridOffset = config.leftPadding - store.state.viewportOffset - store.state.sliderOffset;
      const gridLines: number[] = [];

      getIntervals().forEach((interval) => {
        const isMajor = interval == 1;
        const lineWidth = isMajor ? 2 : 1;
        
        for (let step = 0; step < steps/interval; step++) {
          const y = props.trackCount * config.trackHeight + config.componentPadding + config.sliderHeight;
          const x = step * pixelPerSeconds * interval;
          
          gridLines.push(x + gridOffset);          
          gridGraphics!.moveTo(x, config.sliderHeight + config.componentPadding);
          gridGraphics!.lineTo(x, y);
          gridGraphics!.stroke({width: lineWidth, color: config.colors.gridColor})
    
          if (isMajor) {
            const label = new Pixi.Text();
            label.text = step;
            label.style.fontSize = 12;
            label.x = x - (label.width / 2);
            label.y = y;
            
            gridContainer!.addChild(label);
          }
        }
      }); 
      
      gridContainer.addChild(gridGraphics);
      dynamicContainer.addChild(gridContainer);
      gridContainer.x = gridOffset;
      gridContainer.zIndex = -1;
      store.commit('setGridLines', gridLines);
    }
    function rerenderGrid() {
      clearGrid();
      renderGrid();
    }
    function clearGrid() {
      if (gridContainer == null || gridGraphics == null) return;

      gridGraphics.clear();
      gridContainer.children.forEach(child => {
        dynamicContainer.removeChild(child);
        child.removeAllListeners();
        child.destroy({children: true});
      });

      dynamicContainer.removeChild(gridContainer);
      gridContainer.destroy();
      gridContainer = null;
    }
    function getIntervals(): number[] {
      let intervals = [1]; // standard: 1-second-spacing
      if (store.state.zoomLevel >= config.maxZoom * 0.25) intervals.push(1/2); // half
      if (store.state.zoomLevel >= config.maxZoom * 0.5) intervals.push(1/4); // quarter
      if (store.state.zoomLevel >= config.maxZoom * 0.75) intervals.push(1/8); // eighth
      if (store.state.zoomLevel >= config.maxZoom * 0.95) intervals.push(1/16); // sixteenth      
      return intervals;
    }
    
    return {
      rerenderGrid
    }
  },
  watch: {
    trackCount: 'rerenderGrid'
  }
})
</script>

<template>
</template>

<style scoped>

</style>