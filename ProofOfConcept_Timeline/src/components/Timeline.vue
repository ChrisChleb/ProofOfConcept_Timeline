<script lang="ts">
import {defineComponent, onMounted, ref} from 'vue'
import * as Pixi from "pixi.js";
import {Graphics} from "pixi.js";
import Track from "@/components/Track.vue";
import {useStore} from "vuex";

export default defineComponent({
  name: "Timeline",
  setup() {
    const store: any = useStore();
    const handleColor: string = 'rgb(236,102,12)';
    const handleWidth: number = 32;
    
    const sliderMinWidth = 50;
    const sliderMaxWidth = window.innerWidth;
    const viewportWidth = window.innerWidth;
    
    const maxZoom: number = 10;
    const minZoom: number = 1;
    
    onMounted(async () => {
      // Create app
      const pixiApp = new Pixi.Application();

      // Init app
      await pixiApp.init({
        background: '#ffffff',
        height: 80,
        width: window.innerWidth
      });

      // Append to body
      document.getElementById("timelineContainer")?.appendChild(pixiApp.canvas);

      const height = pixiApp.screen.height;
      const width = pixiApp.screen.width;
      const sliderWidth = width ;
      
      const sliderContainer = new Pixi.Container();
      
      // slider      
      const sliderRect = new Pixi.Graphics();
      sliderRect.rect((width - sliderWidth)/2, 12, sliderWidth, 28);
      sliderRect.fill('#121518');
      sliderRect.interactive = true;
      sliderRect.cursor = 'pointer';
      
      // left handle
      const leftSliderHandle = new Pixi.Graphics();
      leftSliderHandle.rect(0, 12, handleWidth, 28);
      leftSliderHandle.fill(handleColor);
      leftSliderHandle.interactive = true;
      leftSliderHandle.cursor = 'ew-resize';
      
      
      // right handle
      const rightSliderHandle = new Pixi.Graphics();
      rightSliderHandle.rect(sliderRect.width - handleWidth, 12, handleWidth, 28);
      rightSliderHandle.fill(handleColor);
      rightSliderHandle.interactive = true;
      rightSliderHandle.cursor = 'ew-resize';
      
      let isResizingLeft = false;
      let isResizingRight = false;
      let isDraggingSlider = false;
      let initialMouseX = 0;
      let initialSliderWidth = sliderRect.width;
      let initialSliderX = sliderRect.x;

      // Linken Griff starten
      leftSliderHandle.on('pointerdown', (event) => {
        isResizingLeft = true;
        initialMouseX = event.data.global.x;
        initialSliderWidth = sliderRect.width;
        initialSliderX = sliderRect.x;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });

      // Rechten Griff starten
      rightSliderHandle.on('pointerdown', (event) => {
        isResizingRight = true;
        initialMouseX = event.data.global.x;
        initialSliderWidth = sliderRect.width;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });

      // Verschieben starten
      sliderRect.on('pointerdown', (event) => {
        isDraggingSlider = true;
        initialMouseX = event.data.global.x;
        initialSliderX = sliderRect.x;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });
            
      function onScale(event: any) {
        const deltaX = event.screenX - initialMouseX;
        // Linkes Resizing
        if (isResizingLeft) {
          const newWidth = initialSliderWidth - deltaX;
          if (newWidth >= sliderMinWidth && newWidth <= sliderMaxWidth) {
            sliderRect.width = newWidth;
            sliderRect.x = initialSliderX + deltaX;
            leftSliderHandle.x = sliderRect.x - leftSliderHandle.width;
          }
        }

        // Rechtes Resizing
        if (isResizingRight) {
          const newWidth = initialSliderWidth + deltaX;
          if (newWidth >= sliderMinWidth && newWidth <= sliderMaxWidth) {
            sliderRect.width = newWidth;
            rightSliderHandle.x = sliderRect.width - window.innerWidth;
          }
        }

        // Aktuelle Breite des Sliders verwenden
        const currentZoomLevel = calculateZoom(sliderRect.width);

        // Optional: Setze das Zoomlevel in deinem Store, um es in anderen Komponenten zu verwenden
        store.dispatch('updateZoomLevel', currentZoomLevel);

        // Verschieben des gesamten Sliders
        if (isDraggingSlider) {
          const newSliderX = initialSliderX + deltaX;
          if (newSliderX >= 0 && newSliderX + sliderRect.width <= viewportWidth) {
            sliderRect.x = newSliderX;
            leftSliderHandle.x = sliderRect.x - leftSliderHandle.width;
            rightSliderHandle.x = sliderRect.x + sliderRect.width;
            calculateViewport(sliderRect.x);
          }
        }
      }
      
      function onScaleEnd() {        
        window.removeEventListener('pointermove', onScale);
        window.removeEventListener('pointerup', onScaleEnd);
      }
             
      sliderContainer.addChild(sliderRect);
      sliderContainer.addChild(leftSliderHandle);
      sliderContainer.addChild(rightSliderHandle);
      pixiApp.stage.addChild(sliderContainer);      
            
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
        pixiApp.renderer.resize(window.innerWidth, pixiApp.renderer.height);
        // TODO stop resizing of handles
        sliderContainer.width = window.innerWidth;
      });
    });
  },
  components: {Track}
})
</script>

<template>
  <div id="timelineContainer"></div>
  <Track></Track>
  <Track></Track>
  <Track></Track>
</template>

<style scoped>

</style>