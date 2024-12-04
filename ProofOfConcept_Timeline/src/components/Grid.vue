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
    const gridGraphics = new Pixi.Graphics();    
    
    renderGrid();

    watch(() => store.state.zoomLevel, updateGridScale);

    window.addEventListener('resize', () => {
      updateGridScale();
    });
    function renderGrid() {
      gridContainer = new Pixi.Container();
      for (let second = 0; second < pixiApp.canvas.width / (config.pixelsPerSecond * store.state.zoomLevel); second++) {
        const y = props.trackCount * config.trackHeight + config.componentPadding + config.sliderHeight;
        const x = second * config.pixelsPerSecond * store.state.zoomLevel;
        
        gridGraphics.moveTo(x, config.sliderHeight + config.componentPadding);
        gridGraphics.lineTo(x, y);
        gridGraphics.stroke({width: 1, color: config.colors.gridColor})

        const label = new Pixi.Text();
        label.text = second;
        label.style.fontSize = 12;
        label.x = x - (label.width / 2);  
        label.y = y;
        
        gridContainer.addChild(label);     
      }

      gridContainer.addChild(gridGraphics);
      pixiApp.stage.addChild(gridContainer);
      gridContainer.x = 48;
    }
    function updateGridScale() {
      if (gridContainer == null) return;      
          
      pixiApp.stage.removeChild(gridContainer);           
      gridContainer.destroy();      
      gridContainer = null;
      gridGraphics.clear();

      renderGrid();
    }    
    function rerenderGrid() {
      if (gridContainer == null) return;
      
      gridGraphics.clear();
      gridContainer.children.forEach(child => {        
        pixiApp.stage.removeChild(child);        
        child.removeAllListeners();
        child.destroy({children: true});
      });     
      
      pixiApp.stage.removeChild(gridContainer);
      gridContainer.destroy();
      gridContainer = null;
      
      renderGrid();
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