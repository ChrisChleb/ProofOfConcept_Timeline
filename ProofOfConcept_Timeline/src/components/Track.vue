<script lang="ts">
import {defineComponent, onMounted, type PropType, watch} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import type {Graphics} from "pixi.js";
import pixiApp from "@/pixi/pixiApp";
import config from "@/config";
import type {TactonRectangle} from "@/parser/instructionParser";
enum Direction {
  LEFT = 'left',
  RIGHT = 'right',
}
class TactonDTO {
  rect: Graphics;
  leftHandle: Graphics;
  rightHandle: Graphics;  
  constructor(rect: Graphics, leftHandle: Graphics, rightHandle: Graphics) {    
    this.rect = rect;
    this.leftHandle = leftHandle;
    this.rightHandle = rightHandle;
  }
}
export default defineComponent({
  name: "Track",
  props: {
    trackId: {
      type: Number,
      required: true
    },
    tactons: {
      type: Array as PropType<TactonRectangle[]>,
      required: true
    }
  },
  setup(props) {
    console.log("Track ", props.trackId, " received: ", props.tactons);    
  
    const store: any = useStore();     
   
    let resizeDirection: Direction | null = null;   
    let initalX: number = 0;
    let initialTactonWidth: number = 0;
    let initialTactonX: number = 0;
    let initialRightHandleX: number = 0;
    let initialLeftHandleX: number = 0;    
        
    let pointerMoveHandler: any = null;
    let pointerUpHandler: any = null;
    
    onMounted(async () => {
      const trackContainer = new Pixi.Container();
      trackContainer.height = config.trackHeight;
      trackContainer.width = pixiApp.canvas.width;      
      
      // todo get slider height --> 40px
      // add 12px of padding to slider
      trackContainer.y = 40 + 12 + props.trackId * config.trackHeight;    
      
      const trackLine = new Pixi.Graphics();
      trackLine.rect(0, config.trackHeight / 2, pixiApp.canvas.width, 2);
      trackLine.fill(config.colors.trackLineColor);
      trackContainer.addChild(trackLine);
      
      drawTrack();
      pixiApp.stage.addChild(trackContainer);
      
      // padding left
      trackContainer.x = 48;
      function drawTrack() {
        const tactonContainer = new Pixi.Container();        
        props.tactons.forEach((tacton: TactonRectangle) => {
          const rect = new Pixi.Graphics();
          rect.rect(0, 0, 1, 1);
          rect.fill(config.colors.tactonColor);
          
          const position = calculatePosition(tacton);
          rect.x = position.x;
          rect.width = position.width;
          rect.height = tacton.intensity * 100;
          rect.y = (config.trackHeight / 2) - (rect.height / 2); 
          
          const leftHandle = new Pixi.Graphics();
          const rightHandle = new Pixi.Graphics();
          // left handle
          leftHandle.rect(
              rect.x - config.resizingHandleWidth,
              rect.y,
              config.resizingHandleWidth,
              rect.height
          );

          leftHandle.fill(config.colors.handleColor);
          leftHandle.interactive = true;
          leftHandle.cursor = 'ew-resize';       
          
          // right handle
          rightHandle.rect(
              rect.x + rect.width,
              rect.y,
              config.resizingHandleWidth,
              rect.height
          );

          rightHandle.fill(config.colors.handleColor);
          rightHandle.interactive = true;
          rightHandle.cursor = 'ew-resize';
          
          // assign methods
          const dto = new TactonDTO(rect, leftHandle, rightHandle);          
                  
          leftHandle.on('pointerdown', (event) =>  onResizingStartLeft(event, dto));
          rightHandle.on('pointerdown', (event) =>  onResizingStartRight(event, dto));
          
          tactonContainer.addChild(rect);
          tactonContainer.addChild(leftHandle);
          tactonContainer.addChild(rightHandle);
          
          trackContainer.addChild(tactonContainer);
        })
      }      
      function calculatePosition(tacton: TactonRectangle) {
        const timelineWidth = pixiApp.canvas.width;
        const totalDuration = (timelineWidth / config.pixelsPerSecond) * 1000;              
        return {
          x: (tacton.startTime / totalDuration) * timelineWidth,
          width: ((tacton.endTime - tacton.startTime) / totalDuration) * timelineWidth
        };
      }
      const updateTactons = () => {
        trackContainer.scale.set(store.state.zoomLevel, 1);
      }     
      
      watch(() => store.state.zoomLevel, updateTactons);
      watch(() => store.state.zoomLevel, updateTactons);      
      
      window.addEventListener('resize', () => {
        trackLine.width = pixiApp.canvas.width;
      });
      
      // could use trackContainer.scale._x, if implementation uses scaling of container
      
      function onResizingStartLeft(event: any, tactonDTO: TactonDTO) {                      
        resizeDirection = Direction.LEFT;        
        initalX = event.data.global.x / window.devicePixelRatio;
        initialTactonWidth = tactonDTO.rect.width;
        initialTactonX = tactonDTO.rect.x;
        initialLeftHandleX = tactonDTO.leftHandle.x;
        
        pointerMoveHandler = (event: any) => onResize(event, tactonDTO);
        pointerUpHandler = () => onResizeEnd();
        
        window.addEventListener('pointermove', pointerMoveHandler);
        window.addEventListener('pointerup', pointerUpHandler);
      }
      function onResizingStartRight(event: any, tactonDTO: TactonDTO) {
        resizeDirection = Direction.RIGHT;
        initalX = event.data.global.x / window.devicePixelRatio;       
        initialTactonWidth = tactonDTO.rect.width;
        initialTactonX = tactonDTO.rect.x;
        initialRightHandleX = tactonDTO.rightHandle.x;

        pointerMoveHandler = (event: any) => onResize(event, tactonDTO);
        pointerUpHandler = () => onResizeEnd();

        window.addEventListener('pointermove', pointerMoveHandler);
        window.addEventListener('pointerup', pointerUpHandler);
      }
      function onResize(event: any, tactonDTO: TactonDTO) {        
        const deltaX = (event.screenX / window.devicePixelRatio) - initalX;
        
        if (resizeDirection == Direction.RIGHT) {
          tactonDTO.rect.width = (initialTactonWidth + deltaX);
          tactonDTO.rightHandle.x = tactonDTO.rect.width - initialTactonWidth + initialRightHandleX;
          
        } else {
          tactonDTO.rect.width = initialTactonWidth + (-deltaX);
          tactonDTO.rect.x = initialTactonX + deltaX;
          tactonDTO.leftHandle.x = initialTactonWidth - tactonDTO.rect.width + initialLeftHandleX;
        }
      }
      function onResizeEnd() {
        resizeDirection = null;
        window.removeEventListener('pointermove', pointerMoveHandler);
        window.removeEventListener('pointerup', pointerUpHandler);
        
        pointerMoveHandler = null;
        pointerUpHandler = null;
      }
    });
  }
})
</script>

<template>
</template>

<style scoped>

</style>