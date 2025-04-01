import type {BlockData} from "@/parser/instructionParser";
import type {Graphics} from "pixi.js";
import * as Pixi from "pixi.js";
import config from "@/config";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import store, {BlockChanges, type BlockSelection} from "@/store";
import {onMounted, watch} from "vue";
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
    private pointerMoveHandler: any = null;
    private pointerUpHandler: any = null;
    
    // collision-detection vars
    private unselectedBorders: number[][] = [];
    private selectedBorders: number[][] = [];
    private selectedTracks: number[] = [];
    private lastValidOffset: number = 0;
    private lastTrackOffset: number = 0;
    private lastViewportOffset: number = 0;
    private stickyOffsetsPerTrackOffset: Map<number, number[]> = new Map();
    
    // validation data
    private validTrackOffsets: number[] = [];
    private minTrackChange: number = 0;
    private maxTrackChange: number = 0;

    // horizontal viewport-scrolling
    private isScrolling: boolean = false;
    private currentDirection: Direction | null = null;
    private currentFactor: number = 0;
    private currentTacton: BlockDTO | null = null;

    // thresholds for viewport-scrolling --> TODO update on resize and on zoom
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

        onMounted((): void => {
            this.canvasOffset = pixiApp.canvas.getBoundingClientRect().top;
        });

        window.addEventListener('resize', (): void => {
            this.calculateVirtualViewportLength();
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
        
        store.dispatch('getLastBlockPosition');
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

        const tactonContainer: Pixi.Container = new Pixi.Container();
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
        block.rect.x = config.leftPadding + (block.initX * store.state.zoomLevel) - store.state.horizontalViewportOffset;
    }
    private updateHandles(block: BlockDTO): void {
        // update data
        block.initY = block.rect.y;
        block.initX = (block.rect.x + store.state.horizontalViewportOffset - config.leftPadding) / store.state.zoomLevel;
        
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
            if (store.state.horizontalViewportOffset == 0) return;
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
        store.dispatch('sortTactons');
        store.dispatch('getLastBlockPosition');
        
        let lastBlockPosition = store.state.lastBlockPositionX;
        lastBlockPosition -= config.leftPadding;
        lastBlockPosition += store.state.horizontalViewportOffset;
        lastBlockPosition /= store.state.zoomLevel;
        
        // calculate rightOverflow
        const viewport: number = ((pixiApp.canvas.width - config.leftPadding) + store.state.horizontalViewportOffset) / store.state.zoomLevel;
        const ro: number = Math.max(0, lastBlockPosition - viewport);
        if (ro == 0) {
            const whitespace: number = viewport - lastBlockPosition;
            store.dispatch('updateCurrentVirtualViewportWidth', lastBlockPosition + whitespace);
        } else {
            store.dispatch('updateCurrentVirtualViewportWidth', lastBlockPosition + config.pixelsPerSecond);
        }   
    }
    private createBorders(): void {
        this.selectedTracks = [];
        // calculate border to check
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            this.unselectedBorders[trackId] = [];
            this.selectedBorders[trackId] = [];
            store.state.blocks[trackId].forEach((block: BlockDTO, index: number): void => {
                if (!store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid)) {
                    // block is unselected
                    this.unselectedBorders[block.trackId].push(block.rect.x);
                    this.unselectedBorders[block.trackId].push(block.rect.x + block.rect.width);
                } else {
                    // block is selected
                    this.selectedBorders[block.trackId].push(block.rect.x);
                    this.selectedBorders[block.trackId].push(block.rect.x + block.rect.width);
                    
                    const isAdded: boolean = this.selectedTracks.some((track: number): boolean => {
                        return track == block.trackId;
                    });
                    
                    if (!isAdded) this.selectedTracks.push(block.trackId);
                }
            });
        });
        
        this.calculateStickyOffsets();
    }
    private getValidTrackOffsets(): number[] {
        const minTrack: number = Math.min(...this.selectedTracks);
        const maxTrack: number = Math.max(...this.selectedTracks);
        
        const possibleTrackOffsets: number[] = [0];
        
        const maxTrackToTop: number = minTrack;
        if (maxTrackToTop > 0) {
            for (let i = 1; i <= maxTrackToTop; i++) {
                possibleTrackOffsets.push(-i);
            }
        }
        
        const maxTrackToBottom: number = store.state.trackCount - maxTrack;
        if (maxTrackToBottom > 0) {
            for (let i = 1; i <= maxTrackToBottom; i++) {
                possibleTrackOffsets.push(i);
            }
        }
        return possibleTrackOffsets;
    }
    private checkPossibleOffsets(possibleOffsets: number[]): void {
        this.stickyOffsetsPerTrackOffset.clear();
        this.validTrackOffsets = this.getValidTrackOffsets();
        // iterate over possible trackOffsets e.g. [-1, 0, 1, 2]
        this.validTrackOffsets.forEach((trackOffset: number): void => {
            let validOffsetsPerTrackOffset: number[] = [];
            // iterate over possible offsets 
            possibleOffsets.forEach((offset: number): void => {
                let isValid: boolean = true;
                // add offset to border
                // check if any of unselectedBorders[current track + trackOffset] is overlapping with adjusted border
                Object.keys(this.selectedBorders).forEach((trackAsString: string, trackId: number): void => {
                    for (let i = 0; i < this.selectedBorders[trackId].length; i += 2) {
                        let start2: number = this.selectedBorders[trackId][i] + offset;
                        let end2: number = this.selectedBorders[trackId][i + 1] + offset;

                        if (start2 < config.leftPadding) {
                            isValid = false;
                            break;
                        }
                        
                        for (let j = 0; j < this.unselectedBorders[trackId + trackOffset].length; j += 2) {
                            let start1: number = this.unselectedBorders[trackId + trackOffset][j];
                            let end1: number = this.unselectedBorders[trackId + trackOffset][j + 1];
                            if ((end2 > start1 && start2 < end1)) {
                                isValid = false;
                                break;
                            }
                        }
                    }
                });

                if (isValid) {
                    validOffsetsPerTrackOffset.push(offset);
                }
            });
            
            this.stickyOffsetsPerTrackOffset.set(trackOffset, validOffsetsPerTrackOffset);            
        });
    }
    private calculateStickyOffsets(): void {
        const possibleOffset: number[] = [];
        for (let trackId = 0; trackId < Math.min(this.unselectedBorders.length, this.selectedBorders.length); trackId++) {
            // loop over selectedBorders
            for (let i = 0; i < this.selectedBorders[trackId].length; i += 2) {
                // loop over unselected border tracks
                for (let j = 0; j < this.unselectedBorders.length; j ++) {
                    // loop over every unselected border block in this track
                    for (let k = 0; k < this.unselectedBorders[j].length; k += 2 ) {
                        let start2: number = this.unselectedBorders[j][k];
                        let end2: number = this.unselectedBorders[j][k + 1];

                        // calculate possible offsets         
                        let offsetToStart: number = end2 - this.selectedBorders[trackId][i];
                        let offsetToEnd: number = start2 - this.selectedBorders[trackId][i + 1];
                        possibleOffset.push(offsetToStart);
                        possibleOffset.push(offsetToEnd);
                    }
                }        
            }            
        }
        this.checkPossibleOffsets(possibleOffset);
    }
    private getValidStickyOffset(offset: number, trackOffset: number, horizontalOffsetDifference: number): number {
        const possibleOffsets: number[] = this.stickyOffsetsPerTrackOffset.get(trackOffset) || [];
        let bestOffset: number = offset;
        let minDistance: number = Infinity;
        
        for (const fallbackOffset of possibleOffsets) {
            const adjustedFallbackOffset: number = fallbackOffset - horizontalOffsetDifference;
            let distance: number = Math.abs(adjustedFallbackOffset - offset);
            if (distance < minDistance) {
                minDistance = distance;
                bestOffset = adjustedFallbackOffset;
            }
        }        
        return bestOffset;
    }    
    
    // TODO snapping is wonky sometimes when using multi-selection --> chooses only the last possible snap
    private adjustOffset(offset: number, trackOffset: number): number {
        const maxAttempts: number = 10;
        let attemptCount: number = 0;
        let validOffset: number = offset;
        let hasCollision: boolean = true;
        let isSticking: boolean = false;

        // skip validation while scrolling
        if (this.isScrolling) return this.lastValidOffset;
        
        // calculate offsetDifference to adjust borders
        const horizontalOffsetDifference: number = store.state.horizontalViewportOffset - this.lastViewportOffset;
        
        // if track was changes lastValidOffset is invalid -> needs to be updated
        if (this.lastTrackOffset != trackOffset) {
            this.lastValidOffset = this.getValidStickyOffset(offset, trackOffset, horizontalOffsetDifference);
        }
        
        while (hasCollision && attemptCount < maxAttempts) {
            hasCollision = false;
            attemptCount++;
            
            for (let trackId = 0; trackId < Math.min(this.unselectedBorders.length, this.selectedBorders.length); trackId++) {
                // calculate correct trackId
                let adjustedTrack: number = trackId + trackOffset;
                
                if (adjustedTrack < 0 || adjustedTrack >= this.unselectedBorders.length) {
                    // skip invalid trackId
                    continue;
                }                
                
                // collision-detection
                for (let i = 0; i < this.selectedBorders[trackId].length; i += 2) {
                    let start2: number = this.selectedBorders[trackId][i] + validOffset;
                    let end2: number = this.selectedBorders[trackId][i + 1] + validOffset;
                    if (start2 < config.leftPadding) {                        
                        validOffset = this.lastValidOffset;
                        isSticking = true;
                        break;
                    }
                    
                    for (let j = 0; j < this.unselectedBorders[adjustedTrack].length; j += 2) {
                        let start1: number = this.unselectedBorders[adjustedTrack][j] - horizontalOffsetDifference;
                        let end1: number = this.unselectedBorders[adjustedTrack][j + 1] - horizontalOffsetDifference;

                        if ((end2 > start1 && start2 < end1)) {
                            // collision detected
                            hasCollision = true;

                            // calculate distance of mouse to start and end of colliding block
                            const currsorX: number = this.initialX + offset;
                            let distToStart2: number = Math.abs(currsorX - start1);
                            let distToEnd2: number = Math.abs(currsorX - end1);
                            
                            // choose side to stick to
                            if (distToStart2 > distToEnd2) {
                                validOffset = end1 - this.selectedBorders[trackId][i];
                            } else {
                                // if block is at start of timeline, use lastValidOffset
                                if (start1 == config.leftPadding) {
                                    validOffset = this.lastValidOffset;
                                } else {
                                    validOffset = start1 - this.selectedBorders[trackId][i + 1];
                                }                           
                            }
                            
                            isSticking = true;
                            break;
                        }
                    }

                    // snapping if no collision was detected
                    if (!isSticking) {
                        for (const lineX of store.state.gridLines) {
                            // left
                            if (Math.abs(start2 - lineX) < config.moveSnappingRadius) {
                                validOffset = lineX - this.selectedBorders[trackId][i];
                                break;
                            }
                            // right
                            if (Math.abs(end2 - lineX) < config.moveSnappingRadius) {
                                validOffset = lineX - this.selectedBorders[trackId][i + 1];
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (attemptCount >= maxAttempts) {
            validOffset = this.lastValidOffset;
        }
        
        this.lastValidOffset = validOffset;
        this.lastTrackOffset = trackOffset;
        return validOffset;
    }        
    private onMoveBlock(event: any, block: BlockDTO): void {
        // select block
        store.dispatch('selectBlock', block);
        
        // init vars
        this.initialX = event.data.global.x;
        this.initialY = event.data.global.y;
        this.initialBlockX = block.rect.x;
        this.currentTacton = block;
        this.currentYAdjustment = 0;
        this.lastViewportOffset = store.state.horizontalViewportOffset;
        this.lastTrackOffset = 0;
        
        // calculate and init borders for collision detection
        this.createBorders();

        // create validTrackOffsets for collisionDetection and change validation
        this.minTrackChange = Math.min(...this.validTrackOffsets);
        this.maxTrackChange = Math.max(...this.validTrackOffsets);
        
        // set interactionState to block multiSelection
        store.dispatch('setInteractionState', true);
        
        // init handlers
        this.pointerMoveHandler = (event: any) => this.moveBlock(event);
        this.pointerUpHandler = () => this.onMoveBlockEnd();
        
        // add EventListeners
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    private moveBlock(event: any): void {
        if (this.currentTacton == null) return;
        const changes: BlockChanges = new BlockChanges();
        changes.track = 0;
        const deltaX: number = event.clientX - this.initialX;
        const deltaY: number = event.clientY - this.initialY;
        
        // detect switching tracks        
        let currentYTrackId: number = this.currentTacton.trackId + Math.floor((deltaY - this.currentYAdjustment) / config.trackHeight);
        currentYTrackId = Math.max(0, Math.min(currentYTrackId, store.state.trackCount));
        changes.track = Math.max(this.minTrackChange, Math.min((currentYTrackId - this.currentTacton.trackId), this.maxTrackChange));
                
        // scroll viewport if needed 
        // TODO maybe improve this by using lowest start and highest end position of the whole selection
        this.scrollViewportHorizontal(event.clientX);
        this.scrollViewportVertical(event.clientY);
        
        const adjustedDeltaX: number = this.adjustOffset(deltaX, changes.track);       
        changes.x = (this.initialBlockX + adjustedDeltaX) - this.currentTacton.rect.x;
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
        store.dispatch('changeBlockTrack', this.lastTrackOffset);
        
        this.forEachBlock((block: BlockDTO): void => {
           this.updateHandles(block);
           this.updateStroke(block);
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
        this.calculateVirtualViewportLength();
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