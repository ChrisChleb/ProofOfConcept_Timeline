<script lang="ts">
import {defineComponent, watch} from 'vue'
import * as Pixi from "pixi.js";
import pixiApp from "@/pixi/pixiApp";
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
    
    window.addEventListener('resize', () => {
      rerenderGrid();
    });
    function renderGrid() {
      gridContainer = new Pixi.Container();
      gridGraphics = new Pixi.Graphics();
      
      const pixelPerSeconds = config.pixelsPerSecond * store.state.zoomLevel;
      const steps = (pixiApp.canvas.width / pixelPerSeconds);
      const gridLines: number[] = [];
      
      let intervals = [1]; // standard: 1-second-spacing
      if (store.state.zoomLevel >= config.maxZoom / 3) intervals.push(0.5); // half
      if (store.state.zoomLevel >= config.maxZoom / 2) intervals.push(0.25); // quarter
      
      intervals.forEach((interval) => {
        const isMajor = interval == 1;
        const lineWidth = isMajor ? 2 : 1;
        
        for (let step = 0; step < steps/interval; step++) {
          const y = props.trackCount * config.trackHeight + config.componentPadding + config.sliderHeight;
          const x = step * pixelPerSeconds * interval;
          
          gridLines.push(x);          
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
      pixiApp.stage.addChild(gridContainer);
      gridContainer.x = 48 - store.state.viewportOffset;
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
        pixiApp.stage.removeChild(child);
        child.removeAllListeners();
        child.destroy({children: true});
      });

      pixiApp.stage.removeChild(gridContainer);
      gridContainer.destroy();
      gridContainer = null;
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