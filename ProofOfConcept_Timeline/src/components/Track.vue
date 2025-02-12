<script lang="ts">
import { defineComponent, onBeforeUnmount, type PropType, watch} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import type {Graphics} from "pixi.js";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import config from "@/config";
import type {TactonRectangle} from "@/parser/instructionParser";
import {BlockChanges} from "@/store";

enum Direction {
  LEFT = 'left',
  RIGHT = 'right',
  TOP = 'top',
  BOTTOM = 'bottom'
}
export class BlockDTO {
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
  initTrackId: number;
  constructor(
      rect: Graphics,
      strokedRect: Graphics,
      leftHandle: Graphics,
      rightHandle: Graphics,
      topHandle: Graphics,
      bottomHandle: Graphics,
      container: Pixi.Container,
      trackId: number
  ) {       
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
    this.initTrackId = trackId;
  }
}

export default defineComponent({
  name: "Track",
  props: {
    trackId: {
      type: Number,
      required: true
    },
    blocks: {
      type: Array as PropType<TactonRectangle[]>,
      required: true
    }
  },
  setup(props: any) {
    const store: any = useStore();     
    let resizeDirection: Direction | null = null;   
    let initialX: number = 0;
    let initialY: number = 0;
    let initialBlockWidth: number = 0;
    let initialBlockHeight: number = 0;
    let initialBlockX: number = 0;
    let currentYTrackId: number = props.trackId;
        
    let pointerMoveHandler: any = null;
    let pointerUpHandler: any = null;
    
    // viewport-scrolling
    let isScrolling = false;
    let currentDirection: 'left' | 'right' | null = null;
    let currentFactor = 0;
    let currentTacton: BlockDTO | null = null;
    
    // thresholds for viewport-scrolling --> TODO update on resize
    const rightThreshold = pixiApp.canvas.width - config.horizontalScrollThreshold;
    const leftThreshold = config.horizontalScrollThreshold;
    
    let trackContainer: Pixi.Container = new Pixi.Container();
    trackContainer.height = config.trackHeight;
    trackContainer.width = pixiApp.canvas.width;
    trackContainer.y = config.sliderHeight + config.componentPadding + props.trackId * config.trackHeight;
    trackContainer.x = config.leftPadding;
    
    const trackLine = new Pixi.Graphics();
    trackLine.rect(0, config.trackHeight / 2, pixiApp.canvas.width, 2);
    trackLine.fill(config.colors.trackLineColor);
    trackContainer.addChild(trackLine);

    const trackLabel = new Pixi.Text();
    trackLabel.text = props.trackId;
    trackLabel.style.fontSize = 18;
    trackLabel.x = - (config.leftPadding / 2);
    trackLabel.y = (config.trackHeight / 2) - (trackLabel.height/2);
    trackContainer.addChild(trackLabel);

    dynamicContainer.addChild(trackContainer);    
    renderTrack();    

    // TODO move updateTactons to store
    watch(() => store.state.zoomLevel, updateTactons);
    watch(() => store.state.viewportOffset, updateTactons);
    watch(() => store.state.sliderOffset, updateTactons);
    watch(() => props.blocks, (newValue, oldValue) => {
      if (newValue.length !== 0 || oldValue.length !== 0) {
        renderTrack();
      }
    });

    window.addEventListener('resize', () => {
      trackLine.width = pixiApp.canvas.width;
    });

    onBeforeUnmount(() => {
      console.log("deleting track: ", props.trackId);
      store.dispatch('deleteTactons', props.trackId);
      trackContainer.destroy({children: true});
    });
    function renderTrack() {
      store.dispatch('deleteTactons', props.trackId);
      console.debug("Track ", props.trackId, " received: ", props.blocks);  
      
      store.dispatch('initTrack', props.trackId);
      props.blocks.forEach((block: TactonRectangle) => {
        const rect = new Pixi.Graphics();
        rect.rect(0, 0, 1, 1);
        rect.fill(config.colors.tactonColor);
        rect.interactive = true;
        rect.cursor = 'pointer';
                
        const position = calculatePosition(block);
        rect.x = position.x;
        rect.width = position.width;
        rect.height = block.intensity * 100;
        rect.y = config.sliderHeight + config.componentPadding + (props.trackId * config.trackHeight) + ((config.trackHeight / 2) - (rect.height / 2));
        
        const strokedRect = new Pixi.Graphics();
        strokedRect.rect(0, 0, 1, 1);
        strokedRect.fill(config.colors.selectedBlockColor);

        strokedRect.x = position.x;
        strokedRect.width = position.width;
        strokedRect.height = block.intensity * 100;
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
        
        const tactonContainer = new Pixi.Container();
        tactonContainer.addChild(rect);
        tactonContainer.addChild(strokedRect);
        tactonContainer.addChild(leftHandle);
        tactonContainer.addChild(rightHandle);
        tactonContainer.addChild(topHandle);
        tactonContainer.addChild(bottomHandle);

        // assign methods
        const dto = new BlockDTO(
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
        rect.on('pointerdown', (event) => onMoveBlock(event, dto));
        
        store.dispatch('addBlock', {trackId: props.trackId, block: dto});
        dynamicContainer.addChild(tactonContainer);
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
      store.state.blocks[props.trackId]?.forEach((block: BlockDTO) => {
        // when moving tacton, dont update --> is updated onMouseUp
        if (currentTacton?.rect.uid != block.rect.uid) {
          block.rect.width = block.initWidth * store.state.zoomLevel;
          block.rect.x = config.leftPadding + (block.initX * store.state.zoomLevel) - store.state.viewportOffset - store.state.sliderOffset;
          // TODO only update handles after last change --> better performance
          updateHandles(block);
          // TODO - smart update --> only activily update selected Strokes, update the rest after last change --> better performance
          updateStrokedRect(block);
        }
      });
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
    
      const scrollSpeed = currentFactor * config.horizontalScrollSpeed;
      
      if (currentDirection === 'right') {
        const newOffset = store.state.viewportOffset + scrollSpeed;
        store.dispatch('updateViewportOffset', newOffset);        
      } else if (currentDirection === 'left') {
        const newOffset = Math.max(store.state.viewportOffset - scrollSpeed, 0);
        store.dispatch('updateViewportOffset', newOffset);
      }
      
      requestAnimationFrame(() => autoScroll());
    }
    function scrollViewport(cursorX: number) {
      if (cursorX >= rightThreshold) {
        currentFactor = Math.min((cursorX - rightThreshold) / config.horizontalScrollThreshold, 1);
        startAutoScroll('right');
      } else if (cursorX <= leftThreshold) {
        currentFactor= Math.min((leftThreshold - cursorX) / config.horizontalScrollThreshold, 1);
        startAutoScroll('left');
      } else if (isScrolling){
        stopAutoScroll();
      }
    }
    function calculateVirtualViewportLength() {
      store.dispatch('getLastBlockPosition').then((lastBlockPosition: number) => {        
        lastBlockPosition -= config.leftPadding;
        lastBlockPosition += store.state.viewportOffset;
        lastBlockPosition += store.state.sliderOffset;
        lastBlockPosition /= store.state.zoomLevel;
        // need a better solution, because this leads to weird behavior of offset
        // --> when tacton is not exactly at border of window, as the sequenceLength is then less then what is currently shown on screen
        //store.dispatch('updateCurrentVirtualViewportWidth', lastBlockPosition);
        console.log("virtualViewportWidth: ", lastBlockPosition);
        console.log("SequenzLength: ", (lastBlockPosition / config.pixelsPerSecond).toFixed(2), "sec");
      });
    }
    function onMoveBlock(event: any, block: BlockDTO) {
      store.dispatch('selectBlock', {uid: block.rect.uid, trackId: block.trackId});

      initialX = event.data.global.x;
      initialY = event.data.global.y;
      initialBlockX = block.rect.x;
      currentTacton = block;
      store.dispatch('setInteractionState', true);
      pointerMoveHandler = (event: any) => moveBlock(event);
      pointerUpHandler = () => onMoveBlockEnd();

      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function moveBlock(event: any) {
      if (currentTacton == null) return;
      const changes = new BlockChanges();      
      const deltaX = event.clientX - initialX;
      const deltaY = event.clientY - initialY;
      
      // detect switching tracks
      currentYTrackId = currentTacton.trackId + Math.floor(deltaY / config.trackHeight);
      currentYTrackId = Math.max(0, Math.min(currentYTrackId, store.state.trackCount));
      changes.track = currentYTrackId - currentTacton.trackId;
      
      // calculate x coordinates of left and right border
      const newLeftX = initialBlockX + deltaX;
      const newRightX = initialBlockX + currentTacton.rect.width + deltaX;
      
      scrollViewport(event.clientX);      
      
      // init vars
      const snappingRadius = config.moveSnappingRadius;
      const prevX = currentTacton.rect.x;
      let snappedLeftX = newLeftX;
      let snappedRightX = newRightX;
      let snappedLeft = false;
      let snappedRight = false;     
      let newX;
      
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
      
      // finish calculation
      if (snappedLeft) {
        newX = snappedLeftX;
      } else if (snappedRight) {
        newX = snappedRightX;
      } else {
        newX = newLeftX;
      }      
            
      // check for overflow
      const overflowRight = Math.min(((pixiApp.canvas.width) - (newX + currentTacton.rect.width)), 0);
      
      if (overflowRight < 0) {
        newX += overflowRight;
      }
      
      if (-newX > 0) {
        newX = 0;
      }
      
      changes.x = newX - prevX;
      store.dispatch('applyChangesToSelectedBlocks', changes);
    }
    function onMoveBlockEnd() {
      stopAutoScroll();
      window.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerUpHandler);
      store.dispatch('setInteractionState', false);
      pointerMoveHandler = null;
      pointerUpHandler = null;
      
      if (currentTacton == null) return;         
      store.dispatch('changeBlockTrack', (currentYTrackId - currentTacton.trackId));
      store.dispatch('updateSelectedBlockHandles');
      calculateVirtualViewportLength();      
      currentTacton = null;
    }
    function onResizingStartLeft(event: any, block: BlockDTO) {
      resizeDirection = Direction.LEFT;
      initialX = event.data.global.x;
      initialBlockWidth = block.rect.width;
      initialBlockX = block.rect.x;
      store.dispatch('setInteractionState', true);
      store.dispatch('selectBlock', {uid: block.rect.uid, trackId: block.trackId});
      
      pointerMoveHandler = (event: any) => onResize(event, block);
      pointerUpHandler = () => onResizeEnd();
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);      
    }
    function onResizingStartRight(event: any, block: BlockDTO) {
      resizeDirection = Direction.RIGHT;
      initialX = event.data.global.x;
      initialBlockWidth = block.rect.width;
      initialBlockX = block.rect.x;
      store.dispatch('setInteractionState', true);
      store.dispatch('selectBlock', {uid: block.rect.uid, trackId: block.trackId});
      
      pointerMoveHandler = (event: any) => onResize(event, block);
      pointerUpHandler = () => onResizeEnd();
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function onResize(event: any, block: BlockDTO) {
      const deltaX = event.clientX - initialX; 
      let newWidth;
      let newX;
      const prevX = block.rect.x;
      const prevWidth = block.rect.width;
      
      if (resizeDirection === Direction.RIGHT) {
        // calculate new tacton width
        newWidth = Math.max((initialBlockWidth + deltaX), config.minTactonWidth);    
        
        // check for minTactonWidth
        if (newWidth == config.minTactonWidth) return;
        
        // calculate x coordinate of right border
        const newRightX = initialBlockX + newWidth;
        
        // test for snapping
        const snappedRightX = snapToGrid(newRightX);  
        newWidth = snappedRightX - initialBlockX;
      } else {
        // calculate new tacton width
        newWidth = Math.max((initialBlockWidth - deltaX), config.minTactonWidth);
        
        // check for minTactonWidth
        if (newWidth == config.minTactonWidth) return;
        
        // calculate new x coordinate of tacton
        newX = initialBlockX + deltaX;
        
        // test for snapping
        const snappedLeftX = snapToGrid(newX);
        newX = snappedLeftX;
        newWidth = initialBlockWidth + (initialBlockX - snappedLeftX);
      }

      // early exit -> x is past start of sequence
      if (newX < 0) return;
      
      const changes = new BlockChanges();

      if (newX != undefined) {
        changes.x = newX - prevX;
      }
      changes.width = newWidth - prevWidth;
      
      store.dispatch("applyChangesToSelectedBlocks", changes);
    }
    function onResizeEnd() {
      resizeDirection = null;
      window.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerUpHandler);
      store.dispatch('setInteractionState', false);
      store.dispatch('updateSelectedBlockHandles');
      pointerMoveHandler = null;
      pointerUpHandler = null;
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
    function onChangeAmplitude(event: any, block: BlockDTO, direction: Direction) {
      console.debug("initialY: ", event);
      console.log("initY of block: ", block.rect.y);
      initialY = event.data.global.y;
      initialBlockHeight = block.rect.height;
      currentTacton = block;
      store.dispatch('setInteractionState', true);
      store.dispatch('selectBlock', {uid: block.rect.uid, trackId: block.trackId});
      
      pointerMoveHandler = (event: any) => changeAmplitude(event, block, direction);
      pointerUpHandler = () => onChangeAmplitudeEnd();
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function changeAmplitude(event: any, block: BlockDTO, direction: Direction) {
      let deltaY = 0;
      // there is a difference of appr. 106 between event.clientY and initialY? --> is the exact height-value of buttons and playbackVisualization
      if (direction == Direction.TOP) {
        deltaY = (initialY - event.clientY);
        deltaY += 106;
      } else if (direction == Direction.BOTTOM) {
        deltaY = event.clientY - initialY;
        deltaY -= 106;
      }

      // TODO add vars for min and maxHeight for config
      
      const prevHeight = block.rect.height;      
      const newHeight = Math.min(Math.max((initialBlockHeight + deltaY), 10), 150); 
      const heightChange = newHeight - prevHeight;      
      const changes = new BlockChanges();
      changes.height = heightChange;
      store.dispatch('applyChangesToSelectedBlocks', changes);
    }
    function onChangeAmplitudeEnd() {
      window.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerUpHandler);
      store.dispatch('setInteractionState', false);
      store.dispatch('updateSelectedBlockHandles');
      pointerMoveHandler = null;
      pointerUpHandler = null;
      currentTacton = null;
    }
    function updateHandles(dto: BlockDTO) {
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
    function updateStrokedRect(dto: BlockDTO) {
      dto.strokedRect.x = dto.rect.x;
      dto.strokedRect.width = dto.rect.width;
      dto.strokedRect.y = dto.rect.y;
      dto.strokedRect.height = dto.rect.height;
    }
  },
})
</script>

<template>
</template>

<style scoped>

</style>