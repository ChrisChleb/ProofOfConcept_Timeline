<script lang="ts">
import {defineComponent, onBeforeUnmount, type PropType, watch} from 'vue'
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
  initX: number;
  initWidth: number
  leftHandle: Graphics;
  rightHandle: Graphics;
  container: Pixi.Container;
  
  constructor(rect: Graphics, leftHandle: Graphics, rightHandle: Graphics, container: Pixi.Container) {    
    this.rect = rect;
    this.initWidth = rect.width;
    this.initX = rect.x;    
    this.leftHandle = leftHandle;
    this.rightHandle = rightHandle;
    this.container = container;
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
  setup(props: any) {
    const store: any = useStore();     
    let resizeDirection: Direction | null = null;   
    let initalX: number = 0;
    let initialTactonWidth: number = 0;
    let initialTactonX: number = 0;
        
    let pointerMoveHandler: any = null;
    let pointerUpHandler: any = null;
    
    let trackContainer: Pixi.Container = new Pixi.Container();
    trackContainer.height = config.trackHeight;
    trackContainer.width = pixiApp.canvas.width;

    let tactonContainerList: TactonDTO[] = [];
    
    // add 12px of padding to slider
    trackContainer.y = config.sliderHeight + config.componentPadding + props.trackId * config.trackHeight;

    const trackLine = new Pixi.Graphics();
    trackLine.rect(0, config.trackHeight / 2, pixiApp.canvas.width, 2);
    trackLine.fill(config.colors.trackLineColor);
    
    trackContainer.addChild(trackLine);
    
    renderTrack();
    pixiApp.stage.addChild(trackContainer);

    // padding left
    trackContainer.x = 48;
    function renderTrack() {
      deleteRenderdTactons();
      console.log("Track ", props.trackId, " received: ", props.tactons);
      
      const tactonContainer = new Pixi.Container();
      props.tactons.forEach((tacton: TactonRectangle) => {
        const rect = new Pixi.Graphics();
        rect.rect(0, 0, 1, 1);
        rect.fill(config.colors.tactonColor);
        rect.interactive = true;
        rect.cursor = 'pointer';

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
        
        tactonContainer.addChild(rect);
        tactonContainer.addChild(leftHandle);
        tactonContainer.addChild(rightHandle);

        // assign methods
        const dto = new TactonDTO(rect, leftHandle, rightHandle, tactonContainer);
        leftHandle.on('pointerdown', (event) =>  onResizingStartLeft(event, dto));
        rightHandle.on('pointerdown', (event) =>  onResizingStartRight(event, dto));
        rect.on('pointerdown', (event) => onMoveTacton(event, dto));
        
        tactonContainerList.push(dto);
        trackContainer.addChild(tactonContainer);   
      });
    }
    function calculatePosition(tacton: TactonRectangle) {
      const timelineWidth = pixiApp.canvas.width;
      const totalDuration = (timelineWidth / config.pixelsPerSecond) * 1000;
      return {
        x: (tacton.startTime / totalDuration) * timelineWidth,
        width: ((tacton.endTime - tacton.startTime) / totalDuration) * timelineWidth
      };
    }
    function updateTactons() {
      // rerender handles
      tactonContainerList.forEach((dto: TactonDTO) => {        
        dto.rect.width = dto.initWidth * store.state.zoomLevel;
        dto.rect.x = (dto.initX * store.state.zoomLevel) - store.state.viewportOffset;
        updateHandles(dto);
      });
    }
    function deleteRenderdTactons() {
      tactonContainerList.forEach((dto: TactonDTO) => {
        pixiApp.stage.removeChild(dto.container);
        trackContainer.removeChild(dto.container);
        dto.container.children.forEach(child => {
          child.removeAllListeners();
        });
        dto.container.removeAllListeners();
        dto.container.destroy({children: true});
      });

      tactonContainerList = [];
    }
    
    watch(() => store.state.zoomLevel, updateTactons);
    watch(() => store.state.viewportOffset, updateTactons);
    window.addEventListener('resize', () => {
      trackLine.width = pixiApp.canvas.width;
    });

    onBeforeUnmount(() => {
      deleteRenderdTactons();
      trackContainer.destroy({children: true});
    });
    function onMoveTacton(event: any, tactonDTO: TactonDTO) {
      initalX = event.data.global.x / window.devicePixelRatio;
      initialTactonX = tactonDTO.rect.x;
      
      pointerMoveHandler = (event: any) => moveTacton(event, tactonDTO);
      pointerUpHandler = () => onMoveTactonEnd();
      
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function moveTacton(event: any, tactonDTO: TactonDTO) {
      const deltaX = (event.clientX / window.devicePixelRatio) - initalX;
      
      // calculate x coordinates of left and right border
      const newLeftX = initialTactonX + deltaX;
      const newRightX = initialTactonX + tactonDTO.rect.width + deltaX;
      
      // init vars
      const snappingRadius = config.moveSnappingRadius;
      let snappedLeftX = newLeftX;
      let snappedRightX = newRightX;
      let snappedLeft = false;
      let snappedRight = false;
      
      // check for snapping
      for (const lineX of store.state.gridLines) {
        // left
        if (Math.abs(snappedLeftX - lineX) < snappingRadius) {
          snappedLeftX = lineX;
          snappedLeft = true;
          break;
        }   
        // right
        if (Math.abs(snappedRightX - lineX) < snappingRadius) {
          snappedRightX = lineX - tactonDTO.rect.width;
          snappedRight = true;
          break;
        }
      }
      
      // apply transformation
      if (snappedLeft) {
        tactonDTO.rect.x = snappedLeftX;
      } else if (snappedRight) {
        tactonDTO.rect.x = snappedRightX;
      } else {
        tactonDTO.rect.x = newLeftX;
      }      
      
      // update dto
      tactonDTO.initX = tactonDTO.rect.x / store.state.zoomLevel;
      
      updateHandles(tactonDTO);
    }
    function onMoveTactonEnd() {
      window.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerUpHandler);

      pointerMoveHandler = null;
      pointerUpHandler = null;
    }
    function onResizingStartLeft(event: any, tactonDTO: TactonDTO) {
      resizeDirection = Direction.LEFT;
      initalX = event.data.global.x / window.devicePixelRatio;
      initialTactonWidth = tactonDTO.rect.width;
      initialTactonX = tactonDTO.rect.x;

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

      pointerMoveHandler = (event: any) => onResize(event, tactonDTO);
      pointerUpHandler = () => onResizeEnd();

      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function onResize(event: any, tactonDTO: TactonDTO) {
      const deltaX = (event.clientX / window.devicePixelRatio) - initalX;      
      let newWidth;
      let newX;

      if (resizeDirection === Direction.RIGHT) {
        // calculate new tacton width
        newWidth = initialTactonWidth + deltaX;    
        
        // check for minTactonWidth
        if (newWidth <= config.minTactonWidth) return;
        
        // calculate x coordinate of right border
        const newRightX = initialTactonX + newWidth;
        
        // test for snapping
        const snappedRightX = snapToGrid(newRightX);  
        newWidth = snappedRightX - initialTactonX;
      } else {
        // calculate new tacton width
        newWidth = initialTactonWidth - deltaX;
        
        // check for minTactonWidth
        if (newWidth <= config.minTactonWidth) return;
        
        // calculate new x coordinate of tacton
        newX = initialTactonX + deltaX;
        
        // test for snapping
        const snappedLeftX = snapToGrid(newX);       
        newX = snappedLeftX;
        newWidth = initialTactonWidth + (initialTactonX - snappedLeftX);
      }
      
      // apply resizing
      tactonDTO.rect.width = newWidth;
      tactonDTO.rect.x = newX || initialTactonX;
      
      // update dto values
      tactonDTO.initWidth = tactonDTO.rect.width / store.state.zoomLevel;
      tactonDTO.initX = tactonDTO.rect.x / store.state.zoomLevel;

      updateHandles(tactonDTO);
    }
    function snapToGrid(positionToCheck: number) {
      const snapRadius = config.resizingSnappingRadius;
      const gridLines = store.state.gridLines;

      for (const gridX of gridLines) {
        if (Math.abs(positionToCheck - gridX) <= snapRadius) {
          return gridX;
        }
      }

      return positionToCheck;
    }
    function onResizeEnd() {
      resizeDirection = null;
      window.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerUpHandler);

      pointerMoveHandler = null;
      pointerUpHandler = null;
    }
    
    function updateHandles(dto: TactonDTO) {
      // update left handle
      dto.leftHandle.clear();
      dto.leftHandle.rect(
          dto.rect.x - config.resizingHandleWidth,
          dto.rect.y,
          config.resizingHandleWidth,
          dto.rect.height
      );
      dto.leftHandle.fill(config.colors.handleColor);

      // update right handle
      dto.rightHandle.clear();
      dto.rightHandle.rect(
          dto.rect.x + dto.rect.width,
          dto.rect.y,
          config.resizingHandleWidth,
          dto.rect.height
      );
      dto.rightHandle.fill(config.colors.handleColor);
    }
    
    return {
      renderTrack
    }
  },
  watch: {
    tactons: 'renderTrack'
  }
})
</script>

<template>
</template>

<style scoped>

</style>