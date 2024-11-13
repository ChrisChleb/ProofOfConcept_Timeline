<script lang="ts">
import {defineComponent, onMounted, watch} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import type {ContainerChild, Graphics} from "pixi.js";
enum Direction {
  LEFT = 'left',
  RIGHT = 'right',
}

class Tacton {
  block: Graphics;
  leftHandle: Graphics;
  rightHandle: Graphics;
  initialX: number;
  
  constructor(block: Graphics, leftHandle: Graphics, rightHandle: Graphics) {
    this.block = block;
    this.leftHandle = leftHandle;
    this.rightHandle = rightHandle;
    this.initialX = block.x;
  }
}
export default defineComponent({
  name: "Track",
  setup() {
    const store: any = useStore();
    const tactonSpacing: number = 128;       
    const resizingHandleWidth: number = 20;
    const handleColor: string = 'rgba(236,102,12,0.12)';
    
    let resizeDirection: Direction | null = null;   
    let resizedTacton: Graphics | null = null;
    let initalX: number = 0;
    let initialTactonWidth: number = 0;
    let initialTactonX: number = 0;
    
    let tactons: Tacton[] = [];
    onMounted(async () => {
      // Create app
      const pixiApp = new Pixi.Application();

      const trackHeight = 150;

      // Init app
      await pixiApp.init({
        background: '#fffdfd',
        height: trackHeight,
        width: window.innerWidth
      });

      // Append to body
      document.getElementById("trackContainer")?.appendChild(pixiApp.canvas);

      const trackLine = new Pixi.Graphics();
      trackLine.rect(0, 0, window.innerWidth, 2);
      trackLine.fill('#777777');
      
      trackLine.y = trackHeight / 2;
      
      const numTactons: number = 3;      
      for (let i = 0; i < numTactons; i++) {
        // rdm height between 10 and 100
        const randomTactonHeight = Math.floor(Math.random() * (100 - 10 + 1) + 10);
        const tactonContainer = new Pixi.Container();
        const tacton = new Pixi.Graphics();
        tacton.rect(0, 0, 70, randomTactonHeight);
        tacton.fill('#848484');        
        tacton.x = 50 + i * tactonSpacing;
        tacton.y = - (randomTactonHeight / 2);
        
        // left handle
        const leftHandle = new Pixi.Graphics();
        
        leftHandle.rect(
            tacton.x - resizingHandleWidth,
            tacton.y,
            resizingHandleWidth,
            randomTactonHeight
        );
        
        leftHandle.fill(handleColor);
        leftHandle.interactive = true;
        leftHandle.cursor = 'ew-resize';
        leftHandle.on('pointerdown', onResizingStartLeft);
        
        // right handle
        const rightHandle =  new Pixi.Graphics();
        
        rightHandle.rect(
            tacton.x + tacton.width,
            tacton.y,
            resizingHandleWidth,
            randomTactonHeight
        );
        
        rightHandle.fill(handleColor);
        rightHandle.interactive = true;
        rightHandle.cursor = 'ew-resize';
        rightHandle.on('pointerdown', onResizingStartRight);
        
        tactons.push(new Tacton(tacton, leftHandle, rightHandle));
        
        tactonContainer.addChild(tacton);
        tactonContainer.addChild(leftHandle);
        tactonContainer.addChild(rightHandle);
        
        trackLine.addChild(tactonContainer);
      }
      
      const updateTactons = () => {        
        pixiApp.stage.scale.set(store.state.zoomLevel, 1);        
        pixiApp.renderer.render(pixiApp.stage);
        
        tactons.forEach((tacton: Tacton) => {
          // TODO update Position
        });
      }     
      
      watch(() => store.state.zoomLevel, updateTactons);
      watch(() => store.state.zoomLevel, updateTactons);
      
      updateTactons();
      
      pixiApp.stage.addChild(trackLine);
      
      window.addEventListener('resize', () => {
        pixiApp.renderer.resize(window.innerWidth, pixiApp.renderer.height);
        trackLine.width = window.innerWidth;
      });
      
      function onResizingStartLeft(event: any) {
        resizedTacton = event.target.parent.children[0];        
        if (resizedTacton == null) return;
        
        resizeDirection = Direction.LEFT;
        initalX = event.data.global.x;
        initialTactonWidth = resizedTacton.width;
        initialTactonX = resizedTacton.x;
        
        window.addEventListener('pointermove', onResize);
        window.addEventListener('pointerup', onResizeEnd);
      }
      
      function onResizingStartRight(event: any) {
        resizedTacton = event.target.parent.children[0];
        if (resizedTacton == null) return;
        
        resizeDirection = Direction.RIGHT;
        initalX = event.data.global.x;
        initialTactonWidth = resizedTacton.width;
        
        window.addEventListener('pointermove', onResize);
        window.addEventListener('pointerup', onResizeEnd);
      }
      
      function onResize(event: any) {
        if (resizeDirection == null || resizedTacton == null) return;
        
        const deltaX = event.screenX - initalX;
        
        if (resizeDirection == Direction.RIGHT) {          
          resizedTacton.width = initialTactonWidth + deltaX;
          resizedTacton.parent.children[2].x = resizedTacton.width - initialTactonWidth;
        } else {
          resizedTacton.width = initialTactonWidth + (-deltaX);
          resizedTacton.x = initialTactonX + deltaX;
          resizedTacton.parent.children[1].x = initialTactonWidth - resizedTacton.width;
        } 
      }
      
      function onResizeEnd(event: any) {
        console.log('finished resizing');
        resizeDirection = null;        
        resizedTacton = null;
        initalX = 0;
        initialTactonWidth = 0;
        window.removeEventListener('pointermove', () => {});
      }
    });
  }
})
</script>

<template>
  <div id="trackContainer"></div>
</template>

<style scoped>

</style>