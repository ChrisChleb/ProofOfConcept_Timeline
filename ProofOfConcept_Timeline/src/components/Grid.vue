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
  setup(props) {
    const store: any = useStore();    
    const gridContainer: Pixi.Container = new Pixi.Container();
    gridContainer.height = props.trackCount * 150;    
    const gridGraphics = new Pixi.Graphics();  
    
    for (let second = 0; second < pixiApp.canvas.width / config.pixelsPerSecond; second++) {
      const x = second * config.pixelsPerSecond;
      // todo get slider height --> 40px
      // add 12px padding to slider
      gridGraphics.moveTo(x, 52);
      gridGraphics.lineTo(x, props.trackCount * config.trackHeight);
      gridGraphics.stroke({width: 1, color: config.colors.gridColor})      
      
      const label = new Pixi.Text();
      label.text = second;
      label.style.fontSize = 12;
      label.x = x - (label.width / 2);
      label.y = props.trackCount * config.trackHeight + 12;        
      gridContainer.addChild(label);      
    }
    
    const sliderRect = new Pixi.Graphics();
    sliderRect.rect(50, 500, 540, 28);
    sliderRect.fill('#0073e3');
    
    gridContainer.addChild(gridGraphics);
    pixiApp.stage.addChild(gridContainer);
    
    gridContainer.x = 48;

    function updateGrid() {
      gridContainer.scale.set(store.state.zoomLevel, 1);
    }
    
    watch(() => store.state.zoomLevel, updateGrid);
  }
})
</script>

<template>
</template>

<style scoped>

</style>