<script lang="ts">
import {defineComponent, onBeforeUnmount, onMounted, type PropType, watch} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import type {Graphics} from "pixi.js";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import config from "@/config";
import type {TactonRectangle} from "@/parser/instructionParser";
import {BlockChanges, type BlockSelection} from "@/store";

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
    
    // collision-detection vars
    let bordersToCheck = {} as Record<number, number[]>;
    let lastStickPosition = 0;
    let lastViewportOffset = 0;
    
    let pointerMoveHandler: any = null;
    let pointerUpHandler: any = null;
    
    // viewport-scrolling
    let isScrolling = false;
    let currentDirection: Direction | null = null;
    let currentFactor = 0;
    let currentTacton: BlockDTO | null = null;
    
    // thresholds for viewport-scrolling --> TODO update on resize
    const rightThreshold = pixiApp.canvas.width - config.horizontalScrollThreshold;
    const leftThreshold = config.horizontalScrollThreshold;
    const topThreshold  = (pixiApp.canvas.getBoundingClientRect().top + config.sliderHeight) + config.verticalScrollThreshold;
    const bottomThreshold = window.innerHeight - config.verticalScrollThreshold;
    
    let canvasOffset = 0;
    
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
    watch(() => store.state.horizontalViewportOffset, updateTactons);
    watch(() => store.state.sliderOffset, updateTactons);
    watch(() => props.blocks, (newValue, oldValue) => {
      if (newValue.length !== 0 || oldValue.length !== 0) {
        renderTrack();
      }
    });

    window.addEventListener('resize', () => {
      trackLine.width = pixiApp.canvas.width;
    });
    
    onMounted(() => {
      canvasOffset = pixiApp.canvas.getBoundingClientRect().top;
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
      // TODO this does not work with multiple blocks or if a block ist moved to another track
      store.state.blocks[props.trackId]?.forEach((block: BlockDTO) => {
        // when moving tacton, dont update --> is updated onMouseUp
        if (currentTacton?.rect.uid != block.rect.uid) {
          block.rect.width = block.initWidth * store.state.zoomLevel;
          block.rect.x = config.leftPadding + (block.initX * store.state.zoomLevel) - store.state.horizontalViewportOffset - store.state.sliderOffset;
          // this is currently the biggest performance issue
          // TODO only update handles after last change --> better performance
          updateHandles(block);
          // TODO - smart update --> only actively update selected Strokes, update the rest after last change --> better performance
          updateStrokedRect(block);
        }
      });
    }
    function startAutoScroll(direction: Direction) {
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

    let currentYAdjustment = 0;
    let lastVerticalOffset = 0;
    function autoScroll() {
      if (!isScrolling || !currentDirection || currentTacton == null) return;
    
      const horizontalScrollSpeed = currentFactor * config.horizontalScrollSpeed;
      const verticalScrollSpeed = currentFactor * config.verticalScrollSpeed;
      
      switch (currentDirection) {
        case Direction.TOP: {
          const newOffset = Math.min(dynamicContainer.y + verticalScrollSpeed, 0);
          currentYAdjustment = newOffset - lastVerticalOffset;
          store.dispatch('updateVerticalViewportOffset', newOffset);
          break;
        }

        case Direction.BOTTOM: {
          const newOffset = Math.max(dynamicContainer.y - verticalScrollSpeed, -store.state.scrollableHeight);
          currentYAdjustment = newOffset - lastVerticalOffset;          
          store.dispatch('updateVerticalViewportOffset', newOffset);
          break;
        }

        case Direction.LEFT: {
          const newOffset = Math.max(store.state.horizontalViewportOffset - horizontalScrollSpeed, 0);
          store.dispatch('updateHorizontalViewportOffset', newOffset);
          break;
        }

        case Direction.RIGHT: {
          const newOffset = store.state.horizontalViewportOffset + horizontalScrollSpeed;
          store.dispatch('updateHorizontalViewportOffset', newOffset);
        }
      }
      
      requestAnimationFrame(() => autoScroll());
    }
    function scrollViewportHorizontal(cursorX: number) {
      if (cursorX >= rightThreshold) {
        currentFactor = Math.min((cursorX - rightThreshold) / config.horizontalScrollThreshold, 1);
        startAutoScroll(Direction.RIGHT);
      } else if (cursorX <= leftThreshold) {
        currentFactor= Math.min((leftThreshold - cursorX) / config.horizontalScrollThreshold, 1);
        startAutoScroll(Direction.LEFT);
      } else if (isScrolling){
        stopAutoScroll();
      }
    }
    
    function scrollViewportVertical(cursorY: number) {
      if (cursorY <= topThreshold) {
        currentFactor = Math.min((topThreshold - cursorY) / config.verticalScrollThreshold, 1);
        startAutoScroll(Direction.TOP);
      } else if (cursorY >= bottomThreshold) {
        currentFactor= Math.min((cursorY - bottomThreshold) / config.verticalScrollThreshold, 1);
        startAutoScroll(Direction.BOTTOM);
      }
    }
    function calculateVirtualViewportLength() {
      store.dispatch('getLastBlockPosition').then((lastBlockPosition: number) => {        
        lastBlockPosition -= config.leftPadding;
        lastBlockPosition += store.state.horizontalViewportOffset;
        lastBlockPosition += store.state.sliderOffset;
        lastBlockPosition /= store.state.zoomLevel;
        // need a better solution, because this leads to weird behavior of offset
        // --> when tacton is not exactly at border of window, as the sequenceLength is then less then what is currently shown on screen
        //store.dispatch('updateCurrentVirtualViewportWidth', lastBlockPosition);
        console.log("virtualViewportWidth: ", lastBlockPosition);
        console.log("SequenceLength: ", (lastBlockPosition / config.pixelsPerSecond).toFixed(2), "sec");
      });
    }
    function onMoveBlock(event: any, block: BlockDTO) {
      store.dispatch('selectBlock', block);
      initialX = event.data.global.x;
      initialY = event.data.global.y;
      initialBlockX = block.rect.x;
      currentTacton = block;
      currentYAdjustment = 0;
           
      // calculate border to check      
      bordersToCheck = {};
      Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number) => {
        bordersToCheck[trackId] = [];
        store.state.blocks[trackId].forEach((block: BlockDTO, index: number) => {
          if (!store.state.selectedBlocks.some((selection: BlockSelection) => selection.uid == block.rect.uid)) {
            bordersToCheck[block.trackId].push(block.rect.x);
            bordersToCheck[block.trackId].push(block.rect.x + block.rect.width);
          }
        });
      });
      lastViewportOffset = store.state.horizontalViewportOffset;
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
      currentYTrackId = currentTacton.trackId + Math.floor((deltaY - currentYAdjustment) / config.trackHeight);
      currentYTrackId = Math.max(0, Math.min(currentYTrackId, store.state.trackCount));
      changes.track = currentYTrackId - currentTacton.trackId;
      
      // calculate x coordinates of left and right border
      const newLeftX = initialBlockX + deltaX;
      const newRightX = initialBlockX + currentTacton.rect.width + deltaX;
      
      scrollViewportHorizontal(event.clientX);
      scrollViewportVertical(event.clientY);
      
      // init vars
      const snappingRadius = config.moveSnappingRadius;
      const prevX = currentTacton.rect.x;
      let newX = newLeftX;
      
      let isColliding = false;
      let isOverflowing = false;
      
      // collision-detection
      if (bordersToCheck[currentYTrackId].length > 0) {      
        for (let i = 0; i < bordersToCheck[currentYTrackId].length - 1; i += 2) {
          // get borders
          let leftBorder = bordersToCheck[currentYTrackId][i];
          let rightBorder = bordersToCheck[currentYTrackId][i + 1];
          
          // if horizontal scrolling while moving, offset must be added
          const offsetDifference = store.state.horizontalViewportOffset - lastViewportOffset;
          if (offsetDifference != 0) {
            // TODO causes sometimes issues ?
            console.log("applied diff: ", offsetDifference);
            leftBorder -= offsetDifference;
            rightBorder -= offsetDifference;
          }
          
          // check if colliding
          if (newLeftX <= rightBorder && newRightX >= leftBorder) {
            // get distance
            const distanceLeft = Math.abs(newLeftX - rightBorder);
            const distanceRight = Math.abs(leftBorder - newRightX);
            isColliding = true;
            // check which border is colliding
            if (distanceRight > distanceLeft) {
              // snap right                     
              newX = leftBorder - currentTacton.rect.width;
              let gapSize = bordersToCheck[currentYTrackId][i + 2] - rightBorder;
              if (gapSize >= currentTacton.rect.width || isNaN(gapSize)) {
                newX = rightBorder;
                lastStickPosition = newX;
              } else {
                newX = lastStickPosition;
              }
            } else {
              // snap left
              let gapSize = leftBorder - bordersToCheck[currentYTrackId][i - 1];
              
              // no more borders left, check for start of timeline
              if (isNaN(gapSize)) {
                gapSize = leftBorder - config.leftPadding;
              }

              if (gapSize >= currentTacton.rect.width || isNaN(gapSize)) {
                newX = leftBorder - currentTacton.rect.width;
                lastStickPosition = newX;
              } else {
                newX = lastStickPosition;
              }
            }
          }
        }
      }
      
      if (!isColliding) {
        // check for overflow
        const overflowRight = Math.min(((pixiApp.canvas.width) - (newX + currentTacton.rect.width)), 0);

        if (overflowRight < 0) {
          newX += overflowRight;
          isOverflowing = true;
        }

        if (newX < config.leftPadding) {
          newX = prevX;
          isOverflowing = true;
        }
      }
      
      // check for snapping
      if (!isColliding && !isOverflowing) {        
        for (const lineX of store.state.gridLines) {
          // left
          if (Math.abs(newLeftX - lineX) < snappingRadius) {
            newX = lineX;
            break;
          }
          // right
          if (Math.abs(newRightX - lineX) < snappingRadius) {
            newX = lineX - currentTacton.rect.width;
            break;
          }
        }
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
      lastVerticalOffset = store.state.verticalViewportOffset;
      
      if (currentTacton == null) return;         
      store.dispatch('changeBlockTrack', (currentYTrackId - currentTacton.trackId));
      store.dispatch('sortTactons');
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
      store.dispatch('selectBlock', block);
      
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
      store.dispatch('selectBlock', block);
      
      pointerMoveHandler = (event: any) => onResize(event, block);
      pointerUpHandler = () => onResizeEnd();
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function onResize(event: any, block: BlockDTO) {
      const deltaX = event.clientX - initialX;
      const prevX = block.rect.x;
      const prevWidth = block.rect.width;
      let newWidth;
      let newX;

      let collided = false;
      
      if (resizeDirection === Direction.RIGHT) {
        // calculate new tacton width
        newWidth = Math.max((initialBlockWidth + deltaX), config.minTactonWidth);    
        
        // check for minTactonWidth
        if (newWidth == config.minTactonWidth) return;
        
        // calculate x coordinate of right border
        const newRightX = initialBlockX + newWidth;
        
        // check for collision
        if (store.state.blocks[block.trackId].length > 1) {
          store.state.blocks[block.trackId].forEach((other: BlockDTO) => {
            if (other.rect.uid != block.rect.uid) {
              const otherRightX = other.rect.x + other.rect.width;
              if (newRightX > other.rect.x && prevX < otherRightX) {
                newWidth = other.rect.x - prevX;
                collided = true;
              }
            }
          });
        }
        
        if (!collided) {
          // test for snapping
          const snappedRightX = snapToGrid(newRightX);
          newWidth = snappedRightX - initialBlockX;
        }
      } else {
        // calculate new tacton width
        newWidth = Math.max((initialBlockWidth - deltaX), config.minTactonWidth);
        
        // check for minTactonWidth
        if (newWidth == config.minTactonWidth) return;
        
        // calculate new x coordinates of tacton
        newX = initialBlockX + deltaX;
        const newRightX = newX + newWidth;
        
        // check for collision
        if (store.state.blocks[block.trackId].length > 1) {
          store.state.blocks[block.trackId].forEach((other: BlockDTO) => {
            if (other.rect.uid != block.rect.uid) {
              const otherRightX = other.rect.x + other.rect.width;
              if (newX < otherRightX && newRightX > other.rect.x) {
                newX = otherRightX;
                newWidth = newRightX - otherRightX;
                collided = true;
              }
            }
          });
        }
        
        if (!collided) {
          // test for snapping
          const snappedLeftX = snapToGrid(newX);
          newX = snappedLeftX;
          newWidth = initialBlockWidth + (initialBlockX - snappedLeftX);
        }
      }

      // early exit -> x is past start of sequence
      if (newX < config.leftPadding) return;
      
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
    
    // TODO maybe boost performance by passing an array of numbers, to check multiple positions in one iteration
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
      store.dispatch('selectBlock', block);
      
      pointerMoveHandler = (event: any) => changeAmplitude(event, block, direction);
      pointerUpHandler = () => onChangeAmplitudeEnd();
      window.addEventListener('pointermove', pointerMoveHandler);
      window.addEventListener('pointerup', pointerUpHandler);
    }
    function changeAmplitude(event: any, block: BlockDTO, direction: Direction) {
      let deltaY = 0;
      if (direction == Direction.TOP) {
        deltaY = (initialY - event.clientY);
        deltaY += canvasOffset;
      } else if (direction == Direction.BOTTOM) {
        deltaY = event.clientY - initialY;
        deltaY -= canvasOffset;
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