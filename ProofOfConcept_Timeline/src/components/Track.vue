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
  TOP = 'top',
  BOTTOM = 'bottom'
}
export class TactonDTO {
  rect: Graphics;
  strokedRect: Graphics;
  initX: number;
  initY: number;
  initWidth: number;
  leftHandle: Graphics;
  rightHandle: Graphics;
  topHandle: Graphics;
  bottomHandle: Graphics;
  container: Pixi.Container;
  trackId: number;
  constructor(rect: Graphics, strokedRect: Graphics, leftHandle: Graphics, rightHandle: Graphics, topHandle: Graphics, bottomHandle: Graphics, container: Pixi.Container, trackId: number) {       
    this.rect = rect;
    this.strokedRect = strokedRect;
    this.initWidth = rect.width;
    this.initX = rect.x;
    this.initY = rect.y;
    this.leftHandle = leftHandle;
    this.rightHandle = rightHandle;
    this.topHandle = topHandle;
    this.bottomHandle = bottomHandle;
    this.container = container;
    this.trackId = trackId;
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
    },
    trackCount: {
      type: Number,
      required: true
    }
  },
  setup(props: any) {
    const store: any = useStore();     
    let resizeDirection: Direction | null = null;   
    let initialX: number = 0;
    let initialY: number = 0;
    let initialTactonWidth: number = 0;
    let initialBlockHeight: number = 0;
    let initialTactonX: number = 0;
    let currentYTrackId: number = props.trackId;
        
    let pointerMoveHandler: any = null;
    let pointerUpHandler: any = null;
    
    let trackContainer: Pixi.Container = new Pixi.Container();
    trackContainer.height = config.trackHeight;
    trackContainer.width = pixiApp.canvas.width;

    // viewport-scrolling
    let isScrolling = false;
    let currentDirection: 'left' | 'right' | null = null;
    let currentFactor = 0;
    let currentTacton: TactonDTO | null = null;
    
    // thresholds for viewport-scrolling --> TODO update on resize
    const rightThreshold = pixiApp.canvas.width - config.scrollThreshold;
    const leftThreshold = config.scrollThreshold;
    
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

    watch(() => store.state.zoomLevel, updateTactons);
    watch(() => store.state.viewportOffset, updateTactons);
    watch(() => store.state.sliderOffset, updateTactons);
    watch( () => store.state.selectedBlocks, renderSelectionBorder);
    window.addEventListener('resize', () => {
      trackLine.width = pixiApp.canvas.width;
    });

    onBeforeUnmount(() => {
      store.dispatch('deleteTactons', props.trackId);
      trackContainer.destroy({children: true});
    });
    function renderTrack() {
      store.dispatch('deleteTactons', props.trackId);
      console.debug("Track ", props.trackId, " received: ", props.tactons);
      
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
        
        const strokedRect = new Pixi.Graphics();
        strokedRect.rect(0, 0, 1, 1);
        strokedRect.fill(config.colors.selectedBlockColor);

        strokedRect.x = position.x;
        strokedRect.width = position.width;
        strokedRect.height = tacton.intensity * 100;
        strokedRect.y = (config.trackHeight / 2) - (rect.height / 2);
        strokedRect.visible = false;
        
        const leftHandle = new Pixi.Graphics();
        const rightHandle = new Pixi.Graphics();
        const topHandle = new Pixi.Graphics();
        const bottomHandle = new Pixi.Graphics();
        
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
        
        // top handle
        topHandle.rect(
            rect.x,
            rect.y - config.resizingHandleWidth,
            rect.width,
            config.resizingHandleWidth            
        );

        topHandle.fill(config.colors.handleColor);
        topHandle.interactive = true;
        topHandle.cursor = 'ns-resize';
        
        // bottom handle
        bottomHandle.rect(
            rect.x,
            rect.y + rect.height,
            rect.width,
            config.resizingHandleWidth
        );

        bottomHandle.fill(config.colors.handleColor);
        bottomHandle.interactive = true;
        bottomHandle.cursor = 'ns-resize';
        
        tactonContainer.addChild(rect);
        tactonContainer.addChild(strokedRect);
        tactonContainer.addChild(leftHandle);
        tactonContainer.addChild(rightHandle);
        tactonContainer.addChild(topHandle);
        tactonContainer.addChild(bottomHandle);

        // assign methods
        const dto = new TactonDTO(
            rect,
            strokedRect,
            leftHandle,
            rightHandle,
            topHandle,
            bottomHandle,
            tactonContainer,
            props.trackId
        );
        
        leftHandle.on('pointerdown', (event) =>  onResizingStartLeft(event, dto));
        rightHandle.on('pointerdown', (event) =>  onResizingStartRight(event, dto));
        topHandle.on('pointerdown', (event) => onChangeAmplitude(event, dto, Direction.TOP));
        bottomHandle.on('pointerdown', (event) => onChangeAmplitude(event, dto, Direction.BOTTOM));
        rect.on('pointerdown', (event) => onMoveTacton(event, dto));
        
        store.dispatch('addTacton', {trackId: props.trackId, newTacton: dto});
        trackContainer.addChild(tactonContainer); 
      });      
      updateTactons();
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
      store.state.tactons[props.trackId]?.forEach((dto: TactonDTO) => {
        // when moving tacton, dont update --> is updated onMouseUp
        if (currentTacton?.rect.uid != dto.rect.uid) {          
          dto.rect.width = dto.initWidth * store.state.zoomLevel;
          dto.rect.x = (dto.initX * store.state.zoomLevel) - store.state.viewportOffset - store.state.sliderOffset;
          updateHandles(dto);
        }
        updateStrokedRect(dto);
      });
    }
    function renderSelectionBorder() {
      store.state.tactons[props.trackId]?.forEach((dto: TactonDTO, index: number) => {
        let selected = false;
        
        store.state.selectedBlocks.forEach((block: {trackNum: number, index: number}) => {
          if (block.trackNum == dto.trackId && block.index == index) {
            selected = true;
          }
        });
        
        dto.strokedRect.visible = selected;
      });
    }
    function onMoveTacton(event: any, tactonDTO: TactonDTO) {
      // TODO multi selection via shift + click
      //store.dispatch('onSelectBlocks', {trackNum: tactonDTO.trackId, });
      
      initialX = event.data.global.x;
      initialY = event.data.global.y;
      initialTactonX = tactonDTO.rect.x;
      currentTacton = tactonDTO;
      store.dispatch('setInteractionState', true);
      pointerMoveHandler = (event: any) => moveTacton(event);
      pointerUpHandler = () => onMoveTactonEnd();
      
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function startAutoScroll(direction: 'left' | 'right') {
      if (!isScrolling) {
        isScrolling = true;
        currentDirection = direction;
        autoScroll();
      }
    }
    function stopAutoScroll() {
      isScrolling = false;
      currentDirection = null;
      currentFactor = 0;
    }
    function autoScroll() {
      if (!isScrolling || !currentDirection || currentTacton == null) return;
    
      const scrollSpeed = currentFactor * config.scrollSpeed;
      
      if (currentDirection === 'right') {
        const newOffset = store.state.viewportOffset + scrollSpeed;
        store.dispatch('updateViewportOffset', newOffset);        
      } else if (currentDirection === 'left') {
        const newOffset = Math.max(store.state.viewportOffset - scrollSpeed, 0);
        store.dispatch('updateViewportOffset', newOffset);
      }
      
      requestAnimationFrame(() => autoScroll());
    }
    
    function calculateVirtualViewportLength() {
      store.dispatch('sortTactons');
      
      let maxPosition = 0;
      
      Object.values(store.state.tactons).forEach((channelData: any) => {
        if (channelData.length > 0) {
          const trackLastTacton = channelData[channelData.length - 1];
          const trackLastPosition = trackLastTacton.rect.x + trackLastTacton.rect.width;

          if (trackLastPosition > maxPosition) {
            maxPosition = trackLastPosition;
          }
        }
      });
  
      if (maxPosition > 0) {
        maxPosition += store.state.viewportOffset;
        maxPosition /= store.state.zoomLevel;
        // need a better solution, because this leads to weird behavior of offset
        // --> when tacton is not exactly at border of window, as the sequencelenght is then less then what is currently shown on screen
        //maxPosition += config.pixelsPerSecond
        store.dispatch('updateCurrentVirtualViewportWidth', maxPosition);
        console.log("virtualViewportWidth: ", maxPosition);
        console.log("SequenzLength: ", (maxPosition / config.pixelsPerSecond).toFixed(2), "sec");
      }
    }
    function moveTacton(event: any) {
      if (currentTacton == null) return;
      
      const deltaX = event.clientX - initialX;
      const deltaY = event.clientY - initialY;
      
      // detect switching tracks
      currentYTrackId = currentTacton.trackId + Math.floor(deltaY / config.trackHeight);
      currentYTrackId = Math.max(0, Math.min(currentYTrackId, props.trackCount ));
      const trackContainerY = config.sliderHeight + config.componentPadding + (currentYTrackId * config.trackHeight);
      currentTacton.rect.y = trackContainerY - trackContainer.y + currentTacton.initY;
      
      // calculate x coordinates of left and right border
      const newLeftX = initialTactonX + deltaX;
      const newRightX = initialTactonX + currentTacton.rect.width + deltaX;

      scrollViewport(event.clientX);
            
      // early exit -> x is past start of sequence
      if (newLeftX < 0 && store.state.viewportOffset == 0) {
        currentTacton.rect.x = 0;
        return;
      }
            
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
          snappedRightX = lineX - currentTacton.rect.width;
          snappedRight = true;
          break;
        }
      }
      
      // apply transformation
      if (snappedLeft) {
        currentTacton.rect.x = snappedLeftX;
      } else if (snappedRight) {
        currentTacton.rect.x = snappedRightX;
      } else {
        currentTacton.rect.x = newLeftX;
      }
      
      // check for overflow
      const overflowRight = Math.min(((pixiApp.canvas.width - 48) - (currentTacton.rect.x + currentTacton.rect.width)), 0);
      const overflowLeft = - currentTacton.rect.x;
            
      if (overflowRight < 0) {
        currentTacton.rect.x += overflowRight;
      }
      
      if (overflowLeft > 0) {
        currentTacton.rect.x += overflowLeft;
      }

      updateStrokedRect(currentTacton);
    }
    function scrollViewport(cursorX: number) {
      if (cursorX >= rightThreshold) {
        currentFactor = Math.min((cursorX - rightThreshold) / config.scrollThreshold, 1);
        startAutoScroll('right');
      } else if (cursorX <= leftThreshold) {
        currentFactor= Math.min((leftThreshold - cursorX) / config.scrollThreshold, 1);        
        startAutoScroll('left');
      } else if (isScrolling){
        stopAutoScroll();
      }
    } 
    function onMoveTactonEnd() {
      stopAutoScroll();
      window.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerUpHandler);
      store.dispatch('setInteractionState', false);
      pointerMoveHandler = null;
      pointerUpHandler = null;
      
      if (currentTacton == null) return;
      // change trackId
      currentTacton.trackId = currentYTrackId;
      // update dto
      currentTacton.initX = (currentTacton.rect.x + store.state.viewportOffset + store.state.sliderOffset) / store.state.zoomLevel;
      updateHandles(currentTacton);
      
      // mark track(s) as unsorted
      store.state.sorted[currentTacton.trackId] = false;
      store.state.sorted[props.trackId] = false;
      
      calculateVirtualViewportLength();
      
      currentTacton = null;
    }
    function onResizingStartLeft(event: any, tactonDTO: TactonDTO) {
      resizeDirection = Direction.LEFT;
      initialX = event.data.global.x;
      initialTactonWidth = tactonDTO.rect.width;
      initialTactonX = tactonDTO.rect.x;
      store.dispatch('setInteractionState', true);
      pointerMoveHandler = (event: any) => onResize(event, tactonDTO);
      pointerUpHandler = () => onResizeEnd();
      
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function onResizingStartRight(event: any, tactonDTO: TactonDTO) {
      resizeDirection = Direction.RIGHT;
      initialX = event.data.global.x;
      initialTactonWidth = tactonDTO.rect.width;
      initialTactonX = tactonDTO.rect.x;
      store.dispatch('setInteractionState', true);
      pointerMoveHandler = (event: any) => onResize(event, tactonDTO);
      pointerUpHandler = () => onResizeEnd();

      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function onResize(event: any, tactonDTO: TactonDTO) {
      const deltaX = event.clientX - initialX; 
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

      // early exit -> x is past start of sequence
      if (newX < 0) return;
      
      // apply resizing
      if (newX != undefined) {
        tactonDTO.rect.x = newX;
      } else {
        tactonDTO.rect.x = initialTactonX;
      }
      tactonDTO.rect.width = newWidth;
            
      // update dto values
      tactonDTO.initWidth = tactonDTO.rect.width / store.state.zoomLevel;
      tactonDTO.initX = (tactonDTO.rect.x + store.state.viewportOffset + store.state.sliderOffset) / store.state.zoomLevel;

      updateHandles(tactonDTO);
      updateStrokedRect(tactonDTO);
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
      store.dispatch('setInteractionState', false);
      pointerMoveHandler = null;
      pointerUpHandler = null;
    }
    function onChangeAmplitude(event: any, dto: TactonDTO, direction: Direction) {
      console.debug("initialY: ", event);
      initialY = event.data.global.y;
      initialBlockHeight = dto.rect.height;
      currentTacton = dto;
      store.dispatch('setInteractionState', true);
      pointerMoveHandler = (event: any) => changeAmplitude(event, dto, direction);
      pointerUpHandler = () => onChangeAmplitudeEnd();

      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function changeAmplitude(event: any, dto: TactonDTO, direction: Direction) {
      let deltaY = 0;
      console.debug("whileMovingY: ", event);
      // there is a difference of appr. 106 between event.clientY and initialY?
      if (direction == Direction.TOP) {
        deltaY = (initialY - event.clientY);
        deltaY += 106;
      } else if (direction == Direction.BOTTOM) {
        deltaY = event.clientY - initialY;
        deltaY -= 106;
      }      
      
      // TODO add vars for config
      const newHeight = Math.min(Math.max((initialBlockHeight + deltaY), 10), 150);
      dto.rect.height = newHeight;
      dto.rect.y = (config.trackHeight / 2) - (newHeight / 2);

      updateStrokedRect(dto);
    }
    
    function onChangeAmplitudeEnd() {
      window.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerUpHandler);
      store.dispatch('setInteractionState', false);
      pointerMoveHandler = null;
      pointerUpHandler = null;
      
      if (currentTacton == null) return;
      currentTacton.initY = currentTacton.rect.y;
      updateHandles(currentTacton);
      currentTacton = null;
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
      
      // update top handle
      dto.topHandle.clear();
      dto.topHandle.rect(
          dto.rect.x,
          dto.rect.y - config.resizingHandleWidth,
          dto.rect.width,
          config.resizingHandleWidth
      );

      dto.topHandle.fill(config.colors.handleColor);      
      
      // update bottom handle
      dto.bottomHandle.clear();
      dto.bottomHandle.rect(
          dto.rect.x,
          dto.rect.y + dto.rect.height,
          dto.rect.width,
          config.resizingHandleWidth
      );

      dto.bottomHandle.fill(config.colors.handleColor);
    }    
    function updateStrokedRect(dto: TactonDTO) {
      dto.strokedRect.x = dto.rect.x;
      dto.strokedRect.width = dto.rect.width;
      dto.strokedRect.y = dto.rect.y;
      dto.strokedRect.height = dto.rect.height;
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