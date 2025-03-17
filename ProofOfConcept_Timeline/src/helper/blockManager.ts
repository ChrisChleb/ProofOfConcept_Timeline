import type {BlockData} from "@/parser/instructionParser";
import * as Pixi from "pixi.js";
import config from "@/config";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import store, {BlockChanges, type BlockSelection} from "@/store";
import {onMounted, watch} from "vue";
import type {Graphics} from "pixi.js";
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
export class BlockManager {
    private resizeDirection: Direction | null = null;
    private initialX: number = 0;
    private initialY: number = 0;
    private initialBlockWidth: number = 0;
    private initialBlockHeight: number = 0;
    private initialBlockX: number = 0;
    private currentYTrackId: number = 0;
    private pointerMoveHandler: any = null;
    private pointerUpHandler: any = null;
    
    // collision-detection vars
    private bordersToCheck: Record<number, number[]> = {} as Record<number, number[]>;
    private lastStickPosition: {position: number, trackId: number} = {position: 0, trackId: 0};
    private lastViewportOffset: number = 0;

    // horizontal viewport-scrolling
    private isScrolling: boolean = false;
    private currentDirection: Direction | null = null;
    private currentFactor: number = 0;
    private currentTacton: BlockDTO | null = null;

    // thresholds for viewport-scrolling --> TODO update on resize
    private rightThreshold: number = pixiApp.canvas.width - config.horizontalScrollThreshold;
    private leftThreshold: number = config.horizontalScrollThreshold;
    private topThreshold: number  = (pixiApp.canvas.getBoundingClientRect().top + config.sliderHeight) + config.verticalScrollThreshold;
    private bottomThreshold: number = window.innerHeight - config.verticalScrollThreshold;

    // vertical viewport-scrolling
    private currentYAdjustment: number = 0;
    private lastVerticalOffset: number = 0;

    private canvasOffset: number = 0;
    constructor() {
        watch(() => store.state.zoomLevel, this.onZoomLevelChange.bind(this));
        watch(() => store.state.horizontalViewportOffset, this.onHorizontalViewportChange.bind(this));
        watch(() => store.state.sliderOffset, this.onSliderOffsetChange.bind(this));

        onMounted((): void => {
            this.canvasOffset = pixiApp.canvas.getBoundingClientRect().top;
        });
    }    
    createBlocksFromData(blockData: BlockData[]): void {
        // clear stored blocks
        store.dispatch('deleteAllBlocks');
        
        // init tracks
        store.dispatch('initTracks');

        // create, render and save block in store
        blockData.forEach((block: BlockData): void => {
            this.createBlock(block);
        });
        
        // update blocks, handles and strokes
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            store.state.blocks[trackId].forEach((block: BlockDTO): void => {
                this.updateBlock(block);
                this.updateHandles(block);
                this.updateStroke(block);
            });
        });
    }
    private createBlock(block: BlockData): void {
        const rect: Pixi.Graphics = new Pixi.Graphics();
        rect.rect(0, 0, 1, 1);
        rect.fill(config.colors.tactonColor);
        rect.interactive = true;
        rect.cursor = 'pointer';

        const position: {x: number, width: number} = this.calculatePosition(block);
        rect.x = position.x;
        rect.width = position.width;
        rect.height = block.intensity * config.blockHeightScaleFactor;
        rect.y = config.sliderHeight + config.componentPadding + (block.trackId * config.trackHeight) + ((config.trackHeight / 2) - (rect.height / 2));

        const strokedRect = new Pixi.Graphics();
        strokedRect.rect(0, 0, 1, 1);
        strokedRect.fill(config.colors.selectedBlockColor);

        strokedRect.x = position.x;
        strokedRect.width = position.width;
        strokedRect.height = block.intensity * config.blockHeightScaleFactor;
        strokedRect.y = (config.trackHeight / 2) - (rect.height / 2);
        strokedRect.visible = false;

        const leftHandle: Pixi.Graphics = new Pixi.Graphics();
        const rightHandle: Pixi.Graphics = new Pixi.Graphics();
        const topHandle: Pixi.Graphics = new Pixi.Graphics();
        const bottomHandle: Pixi.Graphics = new Pixi.Graphics();

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
        const dto: BlockDTO = new BlockDTO(
            rect,
            strokedRect,
            leftHandle,
            rightHandle,
            topHandle,
            bottomHandle,
            tactonContainer,
            block.trackId
        );

        leftHandle.on('pointerdown', (event) =>  this.onResizingStartLeft(event, dto));
        rightHandle.on('pointerdown', (event) =>  this.onResizingStartRight(event, dto));
        topHandle.on('pointerdown', (event) => this.onChangeAmplitude(event, dto, Direction.TOP));
        bottomHandle.on('pointerdown', (event) => this.onChangeAmplitude(event, dto, Direction.BOTTOM));        
        rect.on('pointerdown', (event) => this.onMoveBlock(event, dto));
        
        store.dispatch('addBlock', {trackId: block.trackId, block: dto});
        dynamicContainer.addChild(tactonContainer);
    }
    private calculatePosition(tacton: BlockData): {x: number, width: number} {
        const timelineWidth: number = pixiApp.canvas.width;
        const totalDuration: number = (timelineWidth / config.pixelsPerSecond) * 1000;
        return {
            x: (tacton.startTime / totalDuration) * timelineWidth,
            width: ((tacton.endTime - tacton.startTime) / totalDuration) * timelineWidth
        };
    }
    private updateBlock(block: BlockDTO): void {
        block.rect.width = block.initWidth * store.state.zoomLevel;
        block.rect.x = config.leftPadding + (block.initX * store.state.zoomLevel) - store.state.horizontalViewportOffset - store.state.sliderOffset;
    }
    private updateHandles(block: BlockDTO): void {
        // update data
        block.initY = block.rect.y;
        block.initX = (block.rect.x + store.state.horizontalViewportOffset + store.state.sliderOffset - config.leftPadding) / store.state.zoomLevel;
        
        // update left handle
        block.leftHandle.clear();
        block.leftHandle.rect(
            block.rect.x - config.resizingHandleWidth,
            block.rect.y,
            config.resizingHandleWidth,
            block.rect.height
        );
        block.leftHandle.fill(config.colors.handleColor);

        // update right handle
        block.rightHandle.clear();
        block.rightHandle.rect(
            block.rect.x + block.rect.width,
            block.rect.y,
            config.resizingHandleWidth,
            block.rect.height
        );
        block.rightHandle.fill(config.colors.handleColor);

        // update top handle
        block.topHandle.clear();
        block.topHandle.rect(
            block.rect.x,
            block.rect.y - config.resizingHandleWidth,
            block.rect.width,
            config.resizingHandleWidth
        );

        block.topHandle.fill(config.colors.handleColor);

        // update bottom handle
        block.bottomHandle.clear();
        block.bottomHandle.rect(
            block.rect.x,
            block.rect.y + block.rect.height,
            block.rect.width,
            config.resizingHandleWidth
        );

        block.bottomHandle.fill(config.colors.handleColor);
    }
    private updateStroke(block: BlockDTO): void {
        block.strokedRect.x = block.rect.x;
        block.strokedRect.width = block.rect.width;
        block.strokedRect.y = block.rect.y;
        block.strokedRect.height = block.rect.height;
    }

    // Updates all blocks, updates strokes of selected blocks (these are visible)
    private onZoomLevelChange(): void {
        this.forEachBlock((block: BlockDTO): void => {
            this.updateBlock(block);
            const isSelected = store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
            if (isSelected) {
                this.updateStroke(block);
            }
        });
    }
    
    // Updates all unselected blocks
    private onHorizontalViewportChange(): void {
        this.forEachBlock((block: BlockDTO): void => {
            const isSelected = store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
            if (!isSelected) {
                this.updateBlock(block);
            }
        });
    }

    // Updates all blocks, updates strokes of selected blocks (these are visible)
    private onSliderOffsetChange(): void {
        this.forEachBlock((block: BlockDTO): void => {
            this.updateBlock(block);
            const isSelected = store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
            if (isSelected) {
                this.updateStroke(block)
            }
        });
    }
    
    private forEachSelectedBlock(callback: (block: BlockDTO) => void): void {
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            store.state.blocks[trackId].forEach((block: BlockDTO): void => {
                const isSelected = store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
                if (isSelected) {
                    callback(block);
                }                
            });
        });
    }
    
    // executes callback function on each block
    private forEachBlock(callback: (block: BlockDTO) => void): void {
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number) => {
            store.state.blocks[trackId].forEach((block: BlockDTO) => {
                callback(block);
            });
        });
    }
    onSliderScaleEnd(): void {
        this.forEachBlock((block: BlockDTO): void => {
            this.updateBlock(block);
            this.updateHandles(block);
            const isSelected = store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
            if (!isSelected) {
                this.updateStroke(block);
            }
        });
    }
    
    //*************** Interactions ***************
    private startAutoScroll(direction: Direction): void {
        if (!this.isScrolling) {
            this.isScrolling = true;
            this.currentDirection = direction;
            this.autoScroll();
        }
    }
    private stopAutoScroll(): void {
        this.isScrolling = false;
        this.currentDirection = null;
        this.currentFactor = 0;
    }
    private autoScroll(): void {
        if (!this.isScrolling || !this.currentDirection || this.currentTacton == null) return;

        const horizontalScrollSpeed: number = this.currentFactor * config.horizontalScrollSpeed;
        const verticalScrollSpeed : number = this.currentFactor * config.verticalScrollSpeed;

        switch (this.currentDirection) {
            case Direction.TOP: {
                const newOffset: number = Math.min(dynamicContainer.y + verticalScrollSpeed, 0);
                this.currentYAdjustment = newOffset - this.lastVerticalOffset;
                store.dispatch('updateVerticalViewportOffset', newOffset);
                break;
            }

            case Direction.BOTTOM: {
                const newOffset: number = Math.max(dynamicContainer.y - verticalScrollSpeed, -store.state.scrollableHeight);
                this.currentYAdjustment = newOffset - this.lastVerticalOffset;
                store.dispatch('updateVerticalViewportOffset', newOffset);
                break;
            }

            case Direction.LEFT: {
                const newOffset: number = Math.max(store.state.horizontalViewportOffset - horizontalScrollSpeed, 0);
                store.dispatch('updateHorizontalViewportOffset', newOffset);
                break;
            }

            case Direction.RIGHT: {
                const newOffset = store.state.horizontalViewportOffset + horizontalScrollSpeed;
                store.dispatch('updateHorizontalViewportOffset', newOffset);
            }
        }

        requestAnimationFrame(() => this.autoScroll());
    }
    private scrollViewportHorizontal(cursorX: number): void {
        if (cursorX >= this.rightThreshold) {
            this.currentFactor = Math.min((cursorX - this.rightThreshold) / config.horizontalScrollThreshold, 1);
            this.startAutoScroll(Direction.RIGHT);
        } else if (cursorX <= this.leftThreshold) {
            this.currentFactor= Math.min((this.leftThreshold - cursorX) / config.horizontalScrollThreshold, 1);
            this.startAutoScroll(Direction.LEFT);
        } else if (this.isScrolling){
            this.stopAutoScroll();
        }
    }
    private scrollViewportVertical(cursorY: number): void {
        if (cursorY <= this.topThreshold) {
            this.currentFactor = Math.min((this.topThreshold - cursorY) / config.verticalScrollThreshold, 1);
            this.startAutoScroll(Direction.TOP);
        } else if (cursorY >= this.bottomThreshold) {
            this.currentFactor= Math.min((cursorY - this.bottomThreshold) / config.verticalScrollThreshold, 1);
            this.startAutoScroll(Direction.BOTTOM);
        }
    }
    private calculateVirtualViewportLength(): void {
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
    
    private selectionBorders: Record<number, number[]> = {} as Record<number, number[]>;
    private onMoveBlock(event: any, block: BlockDTO): void {
        store.dispatch('selectBlock', block);
        
        // init vars
        this.initialX = event.data.global.x;
        this.initialY = event.data.global.y;
        this.initialBlockX = block.rect.x;
        this.currentTacton = block;
        this.currentYAdjustment = 0;

        // calculate border to check
        this.bordersToCheck = {};
        this.selectionBorders = {};
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            this.bordersToCheck[trackId] = [];
            this.selectionBorders[trackId] = [];
            store.state.blocks[trackId].forEach((block: BlockDTO, index: number): void => {
                if (!store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid)) {
                    // block is not selected
                    this.bordersToCheck[block.trackId].push(block.rect.x);
                    this.bordersToCheck[block.trackId].push(block.rect.x + block.rect.width);
                } else {
                    // block is selected
                    this.selectionBorders[block.trackId].push(block.rect.x);
                    this.selectionBorders[block.trackId].push(block.rect.x + block.rect.width);
                }
            });
        });
        this.lastViewportOffset = store.state.horizontalViewportOffset;
        store.dispatch('setInteractionState', true);
        this.pointerMoveHandler = (event: any) => this.moveBlock(event);
        this.pointerUpHandler = () => this.onMoveBlockEnd();

        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    
    // TODO view all selected blocks as one block
    private moveBlock(event: any): void {
        if (this.currentTacton == null) return;
        const changes: BlockChanges = new BlockChanges();
        const deltaX: number = event.clientX - this.initialX;
        const deltaY: number = event.clientY - this.initialY;

        // detect switching tracks
        this.currentYTrackId = this.currentTacton.trackId + Math.floor((deltaY - this.currentYAdjustment) / config.trackHeight);
        this.currentYTrackId = Math.max(0, Math.min(this.currentYTrackId, store.state.trackCount));
        changes.track = this.currentYTrackId - this.currentTacton.trackId;

        // calculate x coordinates of left and right border
        const newLeftX: number = this.initialBlockX + deltaX;
        const newRightX: number = this.initialBlockX + this.currentTacton.rect.width + deltaX;

        this.scrollViewportHorizontal(event.clientX);
        this.scrollViewportVertical(event.clientY);

        // init vars
        const snappingRadius: number = config.moveSnappingRadius;
        const prevX: number = this.currentTacton.rect.x;
        let newX: number = newLeftX;

        let isColliding: boolean = false;
        let isOverflowing: boolean = false;
        
        // TODO advanced collision detection
        
        // collision-detection
        if (this.bordersToCheck[this.currentYTrackId].length > 0) {
            for (let i: number = 0; i < this.bordersToCheck[this.currentYTrackId].length - 1; i += 2) {
                // get borders
                let leftBorder: number = this.bordersToCheck[this.currentYTrackId][i];
                let rightBorder: number = this.bordersToCheck[this.currentYTrackId][i + 1];

                // if horizontal scrolling while moving, offset must be added
                const offsetDifference: number = store.state.horizontalViewportOffset - this.lastViewportOffset;
                if (offsetDifference != 0) {
                    leftBorder -= offsetDifference;
                    rightBorder -= offsetDifference;
                }

                // check if colliding
                if (newLeftX <= rightBorder && newRightX >= leftBorder) {
                    // get distance
                    const distanceLeft: number = Math.abs(newLeftX - rightBorder);
                    const distanceRight: number = Math.abs(leftBorder - newRightX);
                    isColliding = true;
                    // check which border is colliding
                    if (distanceRight > distanceLeft) {
                        // snap right                     
                        newX = leftBorder - this.currentTacton.rect.width;
                        let gapSize: number = this.bordersToCheck[this.currentYTrackId][i + 2] - rightBorder;
                        if (gapSize >= this.currentTacton.rect.width || isNaN(gapSize)) {
                            newX = rightBorder;
                            this.lastStickPosition = {position: newX, trackId: this.currentYTrackId};
                        } else {
                            if (this.lastStickPosition.trackId == this.currentYTrackId) {
                                newX = this.lastStickPosition.position;
                            }                         
                        }
                    } else {
                        // snap left
                        let gapSize: number = leftBorder - this.bordersToCheck[this.currentYTrackId][i - 1];

                        // no more borders left, check for start of timeline
                        if (isNaN(gapSize)) {
                            gapSize = leftBorder - config.leftPadding;
                        }

                        if (gapSize >= this.currentTacton.rect.width || isNaN(gapSize)) {
                            newX = leftBorder - this.currentTacton.rect.width;
                            this.lastStickPosition = {position: newX, trackId: this.currentYTrackId};
                        } else {
                            if (this.lastStickPosition.trackId == this.currentYTrackId) {
                                newX = this.lastStickPosition.position;
                            } else {
                                newX = rightBorder;
                            }
                        }
                    }
                }
            }
        }

        if (!isColliding) {
            // check for overflow
            const overflowRight: number = Math.min(((pixiApp.canvas.width) - (newX + this.currentTacton.rect.width)), 0);

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
                    newX = lineX - this.currentTacton.rect.width;
                    break;
                }
            }
        }

        changes.x = newX - prevX;
        store.dispatch('applyChangesToSelectedBlocks', changes);
    }
    private onMoveBlockEnd(): void {
        this.stopAutoScroll();
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);
        store.dispatch('setInteractionState', false);
        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
        this.lastVerticalOffset = store.state.verticalViewportOffset;

        if (this.currentTacton == null) return;
        store.dispatch('changeBlockTrack', (this.currentYTrackId - this.currentTacton.trackId));
        store.dispatch('sortTactons');
        
        this.forEachSelectedBlock((block: BlockDTO): void => {
           this.updateHandles(block);
        });
        
        this.calculateVirtualViewportLength();
        this.currentTacton = null;
    }
    private onResizingStartLeft(event: any, block: BlockDTO): void {
        this.resizeDirection = Direction.LEFT;
        this.initialX = event.data.global.x;
        this.initialBlockWidth = block.rect.width;
        this.initialBlockX = block.rect.x;
        store.dispatch('setInteractionState', true);
        store.dispatch('selectBlock', block);

        this.pointerMoveHandler = (event: any) => this.onResize(event, block);
        this.pointerUpHandler = () => this.onResizeEnd();
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    private onResizingStartRight(event: any, block: BlockDTO): void {
        this.resizeDirection = Direction.RIGHT;
        this.initialX = event.data.global.x;
        this.initialBlockWidth = block.rect.width;
        this.initialBlockX = block.rect.x;
        store.dispatch('setInteractionState', true);
        store.dispatch('selectBlock', block);

        this.pointerMoveHandler = (event: any) => this.onResize(event, block);
        this.pointerUpHandler = () => this.onResizeEnd();
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    private onResize(event: any, block: BlockDTO): void {
        const deltaX: number = event.clientX - this.initialX;
        const prevX: number = block.rect.x;
        const prevWidth: number = block.rect.width;
        let newWidth;
        let newX: number;

        let collided: boolean = false;

        if (this.resizeDirection === Direction.RIGHT) {
            // calculate new tacton width
            newWidth = Math.max((this.initialBlockWidth + deltaX), config.minTactonWidth);

            // check for minTactonWidth
            if (newWidth == config.minTactonWidth) return;

            // calculate x coordinate of right border
            const newRightX: number = this.initialBlockX + newWidth;

            // check for collision
            if (store.state.blocks[block.trackId].length > 1) {
                store.state.blocks[block.trackId].forEach((other: BlockDTO) => {
                    if (other.rect.uid != block.rect.uid) {
                        const otherRightX: number = other.rect.x + other.rect.width;
                        if (newRightX > other.rect.x && prevX < otherRightX) {
                            newWidth = other.rect.x - prevX;
                            collided = true;
                        }
                    }
                });
            }

            if (!collided) {
                // test for snapping
                const snappedRightX = this.snapToGrid(newRightX);
                newWidth = snappedRightX - this.initialBlockX;
            }
        } else {
            // calculate new tacton width
            newWidth = Math.max((this.initialBlockWidth - deltaX), config.minTactonWidth);

            // check for minTactonWidth
            if (newWidth == config.minTactonWidth) return;

            // calculate new x coordinates of tacton
            newX = this.initialBlockX + deltaX;
            const newRightX: number = newX + newWidth;

            // check for collision
            if (store.state.blocks[block.trackId].length > 1) {
                store.state.blocks[block.trackId].forEach((other: BlockDTO): void => {
                    if (other.rect.uid != block.rect.uid) {
                        const otherRightX: number = other.rect.x + other.rect.width;
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
                const snappedLeftX = this.snapToGrid(newX);
                newX = snappedLeftX;
                newWidth = this.initialBlockWidth + (this.initialBlockX - snappedLeftX);
            }
        }

        // early exit -> x is past start of sequence
        if (newX < config.leftPadding) return;

        const changes: BlockChanges = new BlockChanges();

        if (newX != undefined) {
            changes.x = newX - prevX;
        }
        changes.width = newWidth - prevWidth;

        store.dispatch("applyChangesToSelectedBlocks", changes);
    }
    private onResizeEnd(): void {
        this.resizeDirection = null;
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);
        store.dispatch('setInteractionState', false);

        this.forEachSelectedBlock((block: BlockDTO): void => {
            this.updateHandles(block);
        });
        
        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
    }

    // TODO maybe boost performance by passing an array of numbers, to check multiple positions in one iteration
    private snapToGrid(positionToCheck: number) {
        const snapRadius: number = config.resizingSnappingRadius;
        const gridLines = store.state.gridLines;
        for (const gridX of gridLines) {
            if (Math.abs(positionToCheck - gridX) <= snapRadius) {
                return gridX;
            }
        }
        return positionToCheck;
    }
    private onChangeAmplitude(event: any, block: BlockDTO, direction: Direction): void {
        this.initialY = event.data.global.y;
        this.initialBlockHeight = block.rect.height;
        this.currentTacton = block;
        store.dispatch('setInteractionState', true);
        store.dispatch('selectBlock', block);

        this.pointerMoveHandler = (event: any) => this.changeAmplitude(event, block, direction);
        this.pointerUpHandler = () => this.onChangeAmplitudeEnd();
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    private changeAmplitude(event: any, block: BlockDTO, direction: Direction): void {
        let deltaY: number = 0;
        if (direction == Direction.TOP) {
            deltaY = (this.initialY - event.clientY);
            deltaY += this.canvasOffset;
        } else if (direction == Direction.BOTTOM) {
            deltaY = event.clientY - this.initialY;
            deltaY -= this.canvasOffset;
        }

        // TODO add vars for min and maxHeight for config

        const prevHeight: number = block.rect.height;
        const newHeight: number = Math.min(Math.max((this.initialBlockHeight + deltaY), 10), 150);
        const heightChange: number = newHeight - prevHeight;
        const changes: BlockChanges = new BlockChanges();
        changes.height = heightChange;
        store.dispatch('applyChangesToSelectedBlocks', changes);
    }
    private onChangeAmplitudeEnd(): void {
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);
        store.dispatch('setInteractionState', false);

        this.forEachSelectedBlock((block: BlockDTO): void => {
            this.updateHandles(block);
        });
        
        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
        this.currentTacton = null;
    }
}