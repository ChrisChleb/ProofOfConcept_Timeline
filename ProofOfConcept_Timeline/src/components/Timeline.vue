<script lang="ts">
import {defineComponent, onMounted} from 'vue'
import * as Pixi from "pixi.js";
import Track from "@/components/Track.vue";
import {useStore} from "vuex";
import Grid from "@/components/Grid.vue";
import pixiApp from "@/pixi/pixiApp";

import {InstructionParser, type TactonRectangle} from "@/parser/instructionParser";
import config from "@/config";

import JsonData from '../json/2024-06-20_Team1_session1.json';

export default defineComponent({
  name: "Timeline",
  data() {
    return {
      tactons: {} as { [trackId: number]: TactonRectangle[] },
      maxTrackId: 0
    };
  },
  setup() {
    const store: any = useStore();
    
    const handleWidth: number = 32;    
    const sliderHeight = 28;
    const sliderMinWidth = 500;
    
    const sliderMaxWidth = pixiApp.canvas.width;
    const viewportWidth = pixiApp.canvas.width;
    
    const maxZoom: number = 10;
    const minZoom: number = 1;
        
    onMounted(async () => {
      const width = pixiApp.canvas.width;
      const sliderWidth = width;      
      const sliderContainer = new Pixi.Container();     
      
      // slider      
      const sliderRect = new Pixi.Graphics();
      sliderRect.rect((width - sliderWidth)/2, 12, sliderWidth, sliderHeight);
      sliderRect.fill('#121518');
      sliderRect.interactive = true;
      sliderRect.cursor = 'pointer';
      
      // left handle
      const leftSliderHandle = new Pixi.Graphics();
      leftSliderHandle.rect(0, 12, handleWidth, sliderHeight);
      leftSliderHandle.fill(config.colors.sliderHandleColor);
      leftSliderHandle.interactive = true;
      leftSliderHandle.cursor = 'ew-resize';
      
      // right handle
      const rightSliderHandle = new Pixi.Graphics();
      rightSliderHandle.rect(sliderRect.width - handleWidth, 12, handleWidth, sliderHeight);
      rightSliderHandle.fill(config.colors.sliderHandleColor);
      rightSliderHandle.interactive = true;
      rightSliderHandle.cursor = 'ew-resize';
      
      let isResizingLeft = false;
      let isResizingRight = false;
      let isDraggingSlider = false;
      let initialMouseX = 0;
      let initialSliderWidth = sliderRect.width;
      let initialSliderX = sliderRect.x;

      leftSliderHandle.on('pointerdown', (event) => {
        isResizingLeft = true;
        initialMouseX = event.data.global.x;
        initialSliderWidth = sliderRect.width;
        initialSliderX = sliderRect.x;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });

      rightSliderHandle.on('pointerdown', (event) => {
        isResizingRight = true;
        initialMouseX = event.data.global.x;
        initialSliderWidth = sliderRect.width;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });
      
      sliderRect.on('pointerdown', (event) => {
        isDraggingSlider = true;
        initialMouseX = event.data.global.x;
        initialSliderX = sliderRect.x;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });            
      function onScale(event: any) {
        const deltaX = event.screenX - initialMouseX;
        if (isResizingLeft) {
          const newWidth = initialSliderWidth - deltaX;
          
          if (newWidth >= sliderMinWidth && newWidth <= sliderMaxWidth) {
            sliderRect.width = newWidth;
            sliderRect.x = initialSliderX + deltaX;
            leftSliderHandle.x = sliderRect.x - leftSliderHandle.width;
          }
        }
        
        if (isResizingRight) {
          const newWidth = initialSliderWidth + deltaX;
          if (newWidth >= sliderMinWidth && newWidth <= sliderMaxWidth) {
            sliderRect.width = newWidth;
            rightSliderHandle.x = sliderRect.width - pixiApp.canvas.width + sliderRect.x;
          }
        }
        
        const currentZoomLevel = calculateZoom(sliderRect.width);
        store.dispatch('updateZoomLevel', currentZoomLevel);
        
        if (isDraggingSlider) {
          const newSliderX = initialSliderX + deltaX;
          if (newSliderX < handleWidth || newSliderX > window.innerWidth - handleWidth) return;
          
          if (newSliderX >= 0 && newSliderX + sliderRect.width <= viewportWidth) {
            sliderRect.x = newSliderX;
            leftSliderHandle.x = sliderRect.x - leftSliderHandle.width;
            rightSliderHandle.x = sliderRect.width - window.innerWidth + sliderRect.x;  
            calculateViewport(sliderRect.x);
          }
        }
      }      
      function onScaleEnd() {
        isResizingRight = false;
        isResizingLeft = false;
        isDraggingSlider = false;
        window.removeEventListener('pointermove', onScale);
        window.removeEventListener('pointerup', onScaleEnd);
      }
            
      function calculateZoom(sliderWidth: number): number {
        const zoomLevel = minZoom + ((sliderMaxWidth - sliderWidth) / (sliderMaxWidth - sliderMinWidth)) * (maxZoom - minZoom);
        return Math.min(Math.max(zoomLevel, minZoom), maxZoom);
      }
      
      function calculateViewport(sliderX: number) {        
        // TODO calculate Offset
        
/*        const visibleWidth = window.innerWidth / store.state.zoomLevel;
        const maxOffset = window.innerWidth - visibleWidth;
        
        store.dispatch('updateViewportOffset', );*/ 
      }
      
      window.addEventListener('resize', () => {
        // TODO stop resizing of handles
        sliderContainer.width = pixiApp.canvas.width;
      });
      
      sliderContainer.addChild(sliderRect);
      sliderContainer.addChild(leftSliderHandle);
      sliderContainer.addChild(rightSliderHandle);
      pixiApp.stage.addChild(sliderContainer); 
    });
  },
  created() {
    // TODO select file in ui
    const parser = new InstructionParser(JsonData[0]);
    this.tactons = parser.parseInstructionsToRectangles();
    this.maxTrackId  = Object.keys(this.tactons).reduce((a, b) => Math.max(Number(a), Number(b)), -Infinity) + 1;
  },
  components: {Grid, Track}
})
</script>

<template>
  <Grid :track-count="maxTrackId"></Grid> 
  <div v-for="trackId in Array.from({ length: maxTrackId }, (_, i) => i)" :key="trackId">
    <Track :track-id="trackId" :tactons="tactons[trackId] || []"/>
  </div> 
</template>

<style scoped>

</style>