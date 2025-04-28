import type {BlockData} from "@/parser/instructionParser";
import type {Graphics} from "pixi.js";
import * as Pixi from "pixi.js";
import config from "@/config";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import store, {BlockChanges, type BlockSelection} from "@/store";
import {onMounted, watch} from "vue";
interface GroupBorder {
    container: Pixi.Container;
    border: Pixi.Graphics;
    leftHandle: Pixi.Graphics;
    rightHandle: Pixi.Graphics;
    initStartX: number;
    initWidth: number;
    initY: number;
    initHeight: number;
    firstBlockOfGroup: BlockSelection;
    lastBlockOfGroup: BlockSelection;
}
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
    leftIndicator: Graphics;
    rightHandle: Graphics;
    rightIndicator: Graphics;
    topHandle: Graphics;
    topIndicator: Graphics;
    bottomHandle: Graphics;
    bottomIndicator: Graphics;
    container: Pixi.Container;
    trackId: number;
    initTrackId: number;
    constructor(
        rect: Graphics,
        strokedRect: Graphics,
        leftHandle: Graphics,
        leftIndicator: Graphics,
        rightHandle: Graphics,
        rightIndicator: Graphics,
        topHandle: Graphics,
        topIndicator: Graphics,
        bottomHandle: Graphics,
        bottomIndicator: Graphics,
        container: Pixi.Container,
        trackId: number
    ) {
        this.rect = rect;
        this.strokedRect = strokedRect;
        this.initWidth = rect.width;
        this.initX = rect.x;
        this.initY = rect.y;
        this.leftHandle = leftHandle;
        this.leftIndicator = leftIndicator;
        this.rightHandle = rightHandle;
        this.rightIndicator = rightIndicator;
        this.topHandle = topHandle;
        this.topIndicator = topIndicator;
        this.bottomHandle = bottomHandle;
        this.bottomIndicator = bottomIndicator;
        this.container = container;
        this.trackId = trackId;
        this.initTrackId = trackId;
    }
}
export class CopiedBlockDTO {
    rect: Graphics;
    initX: number;
    initY: number;
    initWidth: number;
    container: Pixi.Container;
    trackId: number;
    initTrackId: number;
    constructor(
        rect: Graphics,
        container: Pixi.Container,
        trackId: number
    ) {
        this.rect = rect;
        this.initX = rect.x;
        this.initY = rect.y;
        this.initWidth = rect.width;
        this.container = container;
        this.trackId = trackId;
        this.initTrackId = trackId;
    }
}
export class BlockManager {
    // cursor
    private initialX: number = 0;
    private initialY: number = 0;
    
    // eventHandler
    private pointerMoveHandler: any = null;
    private pointerUpHandler: any = null;
    
    // resizing
    private isCollidingOnResize: boolean = false;
    private initialBlockWidth: number = 0;
    private initialBlockHeight: number = 0;
    private initialBlockX: number = 0;
    private resizeDirection: Direction | null = null;
    private lastValidDeltaX: number = 0;
    
    // proportional resize
    private lastGroupStartX: number = 0;
    private lastGroupWidth: number = 0;
    private lastGroupY: number = 0;
    private isCollidingRight: boolean = false;
    private isCollidingLeft: boolean = false;
    
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

    // thresholds for viewport-scrolling
    private rightThreshold: number = 0;
    private leftThreshold: number = 0;
    private topThreshold: number  = 0;
    private bottomThreshold: number = 0;

    // vertical viewport-scrolling
    private currentYAdjustment: number = 0;
    private lastVerticalOffset: number = 0;
    private canvasOffset: number = 0;
    
    // copy & paste
    private isMacOS: boolean = false;
    private strgDown: boolean = false;
    private selectedBlockUids: number[] = [];
    private copiedBlocks: CopiedBlockDTO[] = [];
    private lastCursorX: number = 0;
    private initYTrackId: number = 0;
    
    private groupBorder: GroupBorder | null = null;
    
    // updateHooks
    private updated: boolean = false;
    constructor() {
        watch(() => store.state.zoomLevel, this.onZoomLevelChange.bind(this));
        watch(() => store.state.horizontalViewportOffset, this.onHorizontalViewportChange.bind(this));

        onMounted((): void => {
            this.canvasOffset = pixiApp.canvas.getBoundingClientRect().top;
        });

        window.addEventListener('resize', (): void => {
            this.calculateVirtualViewportLength();
            this.generateThresholds();
        });
        
        this.generateThresholds();
        
        // detect strg
        document.addEventListener('keydown', (event: KeyboardEvent): void => {
            if (event.code == 'ControlLeft' && !this.isMacOS) {
                if (!this.strgDown) {
                    this.drawGroupBorder();
                    this.strgDown = true;
                }
            } else if (event.code == 'MetaLeft') {
                if (!this.strgDown) {
                    this.drawGroupBorder();
                    this.strgDown = true;
                    if (!this.isMacOS) {
                        this.isMacOS = true;
                    }
                }
            }
        });
        
        document.addEventListener('keyup', (event: KeyboardEvent): void => {
            if (event.code == 'ControlLeft' && !this.isMacOS) {
                this.clearGroupBorder();
                this.strgDown = false;
            } else if (event.code == 'MetaLeft') {
                this.clearGroupBorder();
                this.strgDown = false;
            }
        });
        
        // detect keys
        document.addEventListener('keydown', (event: KeyboardEvent): void => {
            if (this.strgDown && (event.code == 'KeyC')) this.copySelection();
            if (this.strgDown && (event.code == 'KeyV')) this.pasteSelection();
            if (event.code == 'Escape') this.clearCopiedBlocks();
            if (event.code == 'Delete') this.deleteBlock();
        });
        
        // paste on click
        pixiApp.canvas.addEventListener('mousedown', () => {
            if (!store.state.isInteracting) {
                this.pasteSelection();
            }           
        })
        
        // watch currentCursorPosition        
        watch(() => store.state.currentCursorPosition, ({x, y}): void => {
           if (this.copiedBlocks.length > 0) {
               // follow cursor
               this.scrollViewportHorizontal(x);
               this.scrollViewportVertical(y);
               this.updateCopiedBlocks();
           } 
        });
        
        watch(() => store.state.trackCount, (value, oldValue): void => {
            // update maxTrackChange
            this.maxTrackChange += (oldValue + value);
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
                this.updateIndicators(block);
            });
        });
        
        store.dispatch('getLastBlockPosition');
    }
    private createBlock(block: BlockData): BlockDTO {
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

        const strokedRect: Pixi.Graphics = new Pixi.Graphics();
        strokedRect.rect(0, 0, 1, 1);
        strokedRect.fill(config.colors.selectedBlockColor);
        strokedRect.visible = false;

        const leftHandle: Pixi.Graphics = new Pixi.Graphics();
        const leftIndicator: Graphics = new Pixi.Graphics();
        const rightHandle: Pixi.Graphics = new Pixi.Graphics();
        const rightIndicator: Graphics = new Pixi.Graphics();
        const topHandle: Pixi.Graphics = new Pixi.Graphics();
        const topIndicator: Graphics = new Pixi.Graphics();
        const bottomHandle: Pixi.Graphics = new Pixi.Graphics();
        const bottomIndicator: Graphics = new Pixi.Graphics();

        // left handle
        leftHandle.rect(0, 0, 1, 1);
        leftHandle.fill(config.colors.handleColor);
        leftHandle.interactive = true;
        leftHandle.cursor = 'ew-resize';
        
        leftIndicator.circle(0, 0, config.blockHandleIndicatorRadius);
        leftIndicator.cursor = 'pointer';
        leftIndicator.visible = false;

        // right handle
        rightHandle.rect(0, 0, 1, 1);
        rightHandle.fill(config.colors.handleColor);
        rightHandle.interactive = true;
        rightHandle.cursor = 'ew-resize';

        rightIndicator.circle(0, 0, config.blockHandleIndicatorRadius);
        rightIndicator.cursor = 'pointer';
        rightIndicator.visible = false;

        // top handle
        topHandle.rect(0, 0, 1, 1);
        topHandle.fill(config.colors.handleColor);
        topHandle.interactive = true;
        topHandle.cursor = 'ns-resize';

        topIndicator.circle(0, 0, config.blockHandleIndicatorRadius);
        topIndicator.cursor = 'pointer';
        topIndicator.visible = false;

        // bottom handle
        bottomHandle.rect(0, 0, 1, 1);
        bottomHandle.fill(config.colors.handleColor);
        bottomHandle.interactive = true;
        bottomHandle.cursor = 'ns-resize';

        bottomIndicator.circle(0, 0, config.blockHandleIndicatorRadius);
        bottomIndicator.cursor = 'pointer';
        bottomIndicator.visible = false;

        const blockContainer: Pixi.Container = new Pixi.Container();
        blockContainer.addChild(rect);
        blockContainer.addChild(strokedRect);
        blockContainer.addChild(leftHandle);
        blockContainer.addChild(leftIndicator);
        blockContainer.addChild(rightHandle);
        blockContainer.addChild(rightIndicator);
        blockContainer.addChild(topHandle);
        blockContainer.addChild(topIndicator);
        blockContainer.addChild(bottomHandle);
        blockContainer.addChild(bottomIndicator);

        // assign methods
        const dto: BlockDTO = new BlockDTO(
            rect,
            strokedRect,
            leftHandle,
            leftIndicator,
            rightHandle,
            rightIndicator,
            topHandle,
            topIndicator,
            bottomHandle,
            bottomIndicator,
            blockContainer,
            block.trackId
        );

        leftHandle.on('pointerdown', (event) =>  this.onAbsoluteResizeStart(event, dto, Direction.LEFT));
        rightHandle.on('pointerdown', (event) =>  this.onAbsoluteResizeStart(event, dto, Direction.RIGHT));
        topHandle.on('pointerdown', (event) => this.onChangeAmplitude(event, dto, Direction.TOP));
        bottomHandle.on('pointerdown', (event) => this.onChangeAmplitude(event, dto, Direction.BOTTOM));        
        rect.on('pointerdown', (event) => this.onMoveBlock(event, dto));
        
        store.dispatch('addBlock', {trackId: block.trackId, block: dto});
        dynamicContainer.addChild(blockContainer);
        return dto;
    }
    private createCopiedBLock(block: BlockData): CopiedBlockDTO {
        const rect: Pixi.Graphics = new Pixi.Graphics();
        rect.rect(0, 0, 1, 1);
        rect.fill(config.colors.copyColor);

        const position: {x: number, width: number} = this.calculatePosition(block);
        rect.x = config.leftPadding + (position.x * store.state.zoomLevel);
        rect.width = position.width * store.state.zoomLevel;
        rect.height = block.intensity * config.blockHeightScaleFactor;
        rect.y = config.sliderHeight + config.componentPadding + (block.trackId * config.trackHeight) + ((config.trackHeight / 2) - (rect.height / 2));
        
        const blockContainer: Pixi.Container = new Pixi.Container();
        blockContainer.addChild(rect);
        
        return new CopiedBlockDTO(
            rect,
            blockContainer,
            block.trackId
        );
    }
    private calculatePosition(tacton: BlockData): {x: number, width: number} {
        const timelineWidth: number = pixiApp.canvas.width;
        const totalDuration: number = (timelineWidth / config.pixelsPerSecond) * 1000;
        return {
            x: (tacton.startTime / totalDuration) * timelineWidth,
            width: ((tacton.endTime - tacton.startTime) / totalDuration) * timelineWidth
        };
    }
    private createBlockDataFromBlocks(blocks: BlockDTO[] | CopiedBlockDTO[]): BlockData[] {
        const blockData: BlockData[] = [];
        const timelineWidth: number = pixiApp.canvas.width;
        const totalDuration: number = (timelineWidth / config.pixelsPerSecond) * 1000;
        
        blocks.forEach((block: BlockDTO | CopiedBlockDTO): void => {
            const convertedX: number = ((block.rect.x - config.leftPadding + store.state.horizontalViewportOffset) / store.state.zoomLevel);
            const convertedWidth: number = (block.rect.width / store.state.zoomLevel);
            const startTime: number = (convertedX / timelineWidth) * totalDuration;
            const endTime: number = startTime + ((convertedWidth / timelineWidth) * totalDuration);
            const intensity: number = block.rect.height / config.blockHeightScaleFactor;
            
            blockData.push({
                trackId: block.trackId,
                startTime: startTime,
                endTime: endTime,
                intensity: intensity
            });
        });
        
        return blockData;
    }
    private generateThresholds(): void {
        const scaleFactor: number = Math.max(0, store.state.initialZoomLevel - store.state.zoomLevel) + 1;
        this.rightThreshold = pixiApp.canvas.width - (config.horizontalScrollThreshold / scaleFactor);
        this.leftThreshold = config.horizontalScrollThreshold / scaleFactor;
        this.topThreshold  = this.canvasOffset + config.sliderHeight + config.verticalScrollThreshold;
        this.bottomThreshold = window.innerHeight - config.verticalScrollThreshold;
    }
    private applyChanges(changes: BlockChanges): void {
        this.forEachSelectedBlock((block: BlockDTO): void => {
            let isWidthClipped: boolean = false;

            // apply Changes              
            if (changes.height) {
                const newHeight: number = Math.min(Math.max((block.rect.height + changes.height), 10), 150);
                block.rect.height = newHeight;
                const trackOffset: number = config.sliderHeight + config.componentPadding + (block.trackId * config.trackHeight);
                const newY: number = (config.trackHeight / 2) - (newHeight / 2);
                block.rect.y = newY + trackOffset;
            }

            if (changes.track != null) {
                const trackContainerY: number =  (block.trackId  * config.trackHeight);
                const newTrackContainerY: number = ((block.trackId + changes.track) * config.trackHeight);
                block.rect.y = (newTrackContainerY - trackContainerY) + block.initY;
            }

            if (changes.width != null) {
                block.rect.width = Math.max((block.rect.width + changes.width), config.minTactonWidth);
                if (block.rect.width == config.minTactonWidth) {
                    isWidthClipped = true;
                }
            }

            if (changes.x !) {
                if (isWidthClipped && changes.width) return;
                block.rect.x += changes.x;

                // mark track as unsorted
                store.state.sorted[block.trackId] = false;
            }

            this.updateStroke(block);
            this.updateIndicators(block);
        });
    }

    //*************** Update-Methods ***************
    private updateBlock(block: BlockDTO): void {
        block.rect.width = block.initWidth * store.state.zoomLevel;
        block.rect.x = config.leftPadding + (block.initX * store.state.zoomLevel) - store.state.horizontalViewportOffset;
    }
    private updateCopiedBlocks(): void {
        // detect switching tracks
        const currentYTrackId: number = Math.floor(Math.max(0, (store.state.currentCursorPosition.y - dynamicContainer.y - this.canvasOffset - config.sliderHeight - config.componentPadding)) / config.trackHeight);
        const trackChange: number = Math.max(this.minTrackChange, Math.min((currentYTrackId - this.initYTrackId), this.maxTrackChange));

        let diff: number = (store.state.currentCursorPosition.x - this.lastCursorX);
        diff = this.adjustOffset(diff, trackChange);
        this.copiedBlocks.forEach((block: CopiedBlockDTO): void => {
            block.rect.x = block.initX + diff;

            const trackContainerY: number =  (block.trackId  * config.trackHeight);
            const newTrackContainerY: number = ((block.trackId + trackChange) * config.trackHeight);
            block.rect.y = (newTrackContainerY - trackContainerY) + block.initY;
            block.trackId = trackChange + block.initTrackId;
        });
    }
    private updateBlockInitData(block: BlockDTO): void {
        // update data
        block.initY = block.rect.y;
        block.initX = (block.rect.x + store.state.horizontalViewportOffset - config.leftPadding) / store.state.zoomLevel;
    }
    private updateHandles(block: BlockDTO): void {
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
    private updateIndicators(block: BlockDTO) {
        block.leftIndicator.clear();
        block.leftIndicator.circle(block.rect.x, block.rect.y + block.rect.height/2, config.blockHandleIndicatorRadius);
        block.leftIndicator.fill(config.colors.groupHandleColor);

        block.rightIndicator.clear();
        block.rightIndicator.circle(block.rect.x + block.rect.width, block.rect.y + block.rect.height/2, config.blockHandleIndicatorRadius);
        block.rightIndicator.fill(config.colors.groupHandleColor);

        block.topIndicator.clear();
        block.topIndicator.circle(block.rect.x + block.rect.width/2, block.rect.y, config.blockHandleIndicatorRadius);
        block.topIndicator.fill(config.colors.groupHandleColor);

        block.bottomIndicator.clear();
        block.bottomIndicator.circle(block.rect.x + block.rect.width/2, block.rect.y + block.rect.height, config.blockHandleIndicatorRadius);
        block.bottomIndicator.fill(config.colors.groupHandleColor);
    }
    private updateIndicatorVisibility(block: BlockDTO, isVisible: boolean): void {
        block.leftIndicator.visible = isVisible;
        block.rightIndicator.visible = isVisible;
        block.topIndicator.visible = isVisible;
        block.bottomIndicator.visible = isVisible;
    }

    //*************** Update-Hooks ***************

    // executes callback-function on every block
    private forEachBlock(callback: (block: BlockDTO) => void): void {
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number) => {
            store.state.blocks[trackId].forEach((block: BlockDTO) => {
                callback(block);
            });
        });
    }
    
    // execites callback-function on every selected block
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
    
    // execites callback-function on every selected block
    private forEachUnselectedBlock(callback: (block: BlockDTO) => void): void {
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            store.state.blocks[trackId].forEach((block: BlockDTO): void => {
                const isSelected = store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
                if (!isSelected) {
                    callback(block);
                }
            });
        });
    }
    
    // Updates all blocks, updates strokes of selected blocks (these are visible)
    private onZoomLevelChange(): void {
        this.forEachBlock((block: BlockDTO): void => {
            this.updateBlock(block);
            if (this.isBlockSelected(block)) {
                this.updateStroke(block);
                this.updateIndicators(block);
            }
        });
        this.generateThresholds();
        this.updateGroupBorder();        
        this.updated = true;
    }
    
    // Updates all unselected blocks of scrolling, update all blocks if moving slider
    private onHorizontalViewportChange(): void {
        if (!this.updated) {
            if (this.isScrolling) {
                // update only blocks that are not selected
                this.forEachUnselectedBlock((block: BlockDTO) => {
                    this.updateBlock(block);
                });
            } else {
                // update all blocks
                this.forEachBlock((block: BlockDTO): void => {
                    this.updateBlock(block);
                    if (this.isBlockSelected(block)) {
                        this.updateStroke(block);
                        this.updateIndicators(block);
                    }
                });
            }
            this.updateGroupBorder();
        }
        this.updated = false;
    }

    // Updates all handles and initData, updates strokes of not selected blocks (are not visible, so only update once after scaling)
    onSliderScaleEnd(): void {
        this.forEachBlock((block: BlockDTO): void => {
            this.updateHandles(block);
            if (!this.isBlockSelected(block)) {
                this.updateStroke(block);
                this.updateIndicators(block);
            }
            this.updateBlockInitData(block);
        });
        this.updated = false;
    }
    
    //*************** Interactions ***************
    private copySelection(): void {
        this.clearCopiedBlocks();
        const selectedBlocks: BlockDTO[] = [];
        
        store.state.selectedBlocks.forEach((selection: BlockSelection): void => {
           selectedBlocks.push(store.state.blocks[selection.trackId][selection.index]);
           this.selectedBlockUids.push(selection.uid);
        });
        
        if (selectedBlocks.length > 0) {
            let lowestXofCopies: number = Infinity;
            const copiedBlockData: BlockData[] = this.createBlockDataFromBlocks(selectedBlocks);
            copiedBlockData.forEach((blockData: BlockData): void => {
                const block: CopiedBlockDTO = this.createCopiedBLock(blockData)

                if (block.rect.x < lowestXofCopies) lowestXofCopies = block.rect.x;

                this.copiedBlocks.push(block);
                dynamicContainer.addChild(block.container);
            });

            const offset: number = store.state.currentCursorPosition.x - lowestXofCopies;

            this.initYTrackId = Math.floor(Math.max(0, (store.state.currentCursorPosition.y - dynamicContainer.y - this.canvasOffset - config.sliderHeight - config.componentPadding)) / config.trackHeight);
            this.initYTrackId = Math.max(0, Math.min(this.initYTrackId, store.state.trackCount));
            let trackChange: number = this.initYTrackId - this.copiedBlocks[0].trackId;

            // validate trackChange
            const maxTrackId: number = this.copiedBlocks.reduce((prev: CopiedBlockDTO, current: CopiedBlockDTO): CopiedBlockDTO => {
                return (prev && prev.trackId > current.trackId) ? prev : current;
            }).trackId;

            if (maxTrackId + trackChange > store.state.trackCount) {
                trackChange = store.state.trackCount - maxTrackId;
            }

            this.copiedBlocks.forEach((block: CopiedBlockDTO): void => {
                block.rect.x = block.rect.x + offset;
                block.initX = block.rect.x;

                const newTrackId: number = block.trackId + trackChange;
                block.rect.y = config.sliderHeight + config.componentPadding + (newTrackId * config.trackHeight) + ((config.trackHeight / 2) - (block.rect.height / 2));
                block.initY = block.rect.y;
                block.trackId = newTrackId;
                block.initTrackId = newTrackId;
            });

            // calculate and init borders for collision detection
            this.createBordersForCopies();

            // create validTrackOffsets for collisionDetection and change validation
            this.minTrackChange = Math.min(...this.validTrackOffsets);
            this.maxTrackChange = Math.max(...this.validTrackOffsets);

            // set vars for collisionDetection
            this.initialX = store.state.currentCursorPosition.x;
            this.initialY = store.state.currentCursorPosition.y;
            this.lastCursorX = this.initialX;

            this.updateCopiedBlocks();
            
            store.dispatch('clearSelection');
        }
    }
    private pasteSelection(): void {
        const copiedBlockData: BlockData[] = this.createBlockDataFromBlocks(this.copiedBlocks);
        const addedBlockIds: number[] = [];
        
        // todo quick and dirty fix by toggling shiftValue --> change that and use dedicated function for multiple blockSelection
        store.dispatch('toggleShiftValue');
        copiedBlockData.forEach((blockData: BlockData): void => {
            const block: BlockDTO = this.createBlock(blockData);
            addedBlockIds.push(block.rect.uid);
            store.dispatch('selectBlock', block);
        });
        store.dispatch('toggleShiftValue');
        
        // update blocks, handles and strokes
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            store.state.blocks[trackId].forEach((block: BlockDTO): void => {
                if (addedBlockIds.some((id: number): boolean => id == block.rect.uid)) {         
                    this.updateBlock(block);
                    this.updateHandles(block);
                    this.updateStroke(block);
                    this.updateIndicators(block);
                    this.updateBlockInitData(block);
                }
            });
        });
        
        this.calculateVirtualViewportLength();
        
        // remove copies and clear arrays
        this.copiedBlocks.forEach((block: CopiedBlockDTO): void => {
            block.container.destroy({children: true});
        });
        
        // enable handles of previously selected blocks
        this.forEachBlock((block: BlockDTO): void => {
            if (this.selectedBlockUids.some((uid: number): boolean => uid == block.rect.uid)) {
               // enable handles
               block.leftHandle.interactive = true;
               block.rightHandle.interactive = true;
               block.topHandle.interactive = true;
               block.bottomHandle.interactive = true;
            }
        });

        this.copiedBlocks = [];
        return;
    }
    private clearCopiedBlocks(): void {
        if (this.copiedBlocks.length > 0) {
            this.copiedBlocks.forEach((block: CopiedBlockDTO): void => {
                block.container.destroy({children: true});
            });

            this.copiedBlocks = [];
            return;
        }
    }
    private deleteBlock(): void {
        store.dispatch('deleteSelectedBlocks');
        this.calculateVirtualViewportLength();
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

        // set interactionState to block multiSelection
        store.dispatch('setInteractionState', true);
        
        // return if nothing is selected (e.g. by using multi-selection via shift
        if (store.state.selectedBlocks.length == 0) {
            return;
        }
        
        // calculate and init borders for collision detection
        this.createBorders();

        // create validTrackOffsets for collisionDetection and change validation
        this.minTrackChange = Math.min(...this.validTrackOffsets);
        this.maxTrackChange = Math.max(...this.validTrackOffsets);
        
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
        this.applyChanges(changes);
        
        if (this.groupBorder) {
            // update groupBorder when changing tracks
            this.lastGroupStartX += changes.x;
            this.groupBorder.initY = this.lastGroupY + changes.track * config.trackHeight;
            this.resizeGroupBorder();
            this.isCollidingOnResize = false;
        }
    }
    private onMoveBlockEnd(): void {
        this.stopAutoScroll();
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);
        
        // only set InteractionState if groupBorder is not active
        if (this.groupBorder == null) {
            store.dispatch('setInteractionState', false);
        } else {
            this.lastGroupY = this.groupBorder.initY;
        }

        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
        this.lastVerticalOffset = store.state.verticalViewportOffset;

        if (this.currentTacton == null) return;
        store.dispatch('changeBlockTrack', this.lastTrackOffset);
        
        this.forEachBlock((block: BlockDTO): void => {
            this.updateHandles(block);
            this.updateStroke(block);
            this.updateIndicators(block);
            this.updateBlockInitData(block);
        });
        
        this.calculateVirtualViewportLength();
        this.currentTacton = null;
    }
    private onAbsoluteResizeStart(event: any, block: BlockDTO, direction: Direction.LEFT | Direction.RIGHT): void {
        this.resizeDirection = direction;
        this.initialX = event.data.global.x;
        this.initialBlockWidth = block.rect.width;
        this.initialBlockX = block.rect.x;
        this.isCollidingOnResize = false;
        
        store.dispatch('setInteractionState', true);
        store.dispatch('selectBlock', block);

        this.pointerMoveHandler = (event: any) => this.onAbsoluteResize(event, block);
        this.pointerUpHandler = () => this.onResizeEnd();
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    private onAbsoluteResize(event: any, block: BlockDTO): void {
        const deltaX: number = event.clientX - this.initialX;
        const prevX: number = block.rect.x;
        const prevWidth: number = block.rect.width;
        let newWidth;
        let newX: number;

        if (this.resizeDirection === Direction.RIGHT) {
            // calculate new tacton width
            newWidth = Math.max((this.initialBlockWidth + deltaX), config.minTactonWidth);

            // check for minTactonWidth
            if (newWidth == config.minTactonWidth) return;

            // calculate x coordinate of right border
            const newRightX: number = this.initialBlockX + newWidth;

            this.isCollidingOnResize = false;
            if (!this.isCollidingOnResize || deltaX < this.lastValidDeltaX) {
                this.isCollidingOnResize = false;
                const selectedTracks: number[] = store.state.selectedBlocks.map((selection: BlockSelection) => selection.trackId);
                selectedTracks.forEach((trackId: number): void => {
                    const adjustedDeltaX: number = deltaX / store.state.zoomLevel;
                    if (store.state.blocks[trackId].length > 1) {
                        for (let i: number = 0; i < store.state.blocks[trackId].length; i++) {
                            if (this.isCollidingOnResize) break;
                            if (store.state.selectedBlocks.some((selection: BlockSelection) => selection.trackId == trackId && selection.index == i)) {
                                const block = store.state.blocks[trackId][i];
                                const newWidth: number = Math.max((block.initWidth + adjustedDeltaX), config.minTactonWidth);
                                const newRightX = block.initX + newWidth;

                                for (let j: number = i + 1; j < store.state.blocks[trackId].length; j++) {
                                    const other = store.state.blocks[trackId][j];
                                    const otherX = other.initX;
                                    if (newRightX > otherX && block.initX < otherX) {
                                        this.isCollidingOnResize = true;
                                        const newValidDeltaX: number = (otherX - (block.initX + block.initWidth)) * store.state.zoomLevel;
                                        this.lastValidDeltaX = Math.max(newValidDeltaX, this.lastValidDeltaX);
                                        break;
                                    }
                                    this.lastValidDeltaX = deltaX;
                                    this.isCollidingOnResize = false;
                                }
                            }
                        }
                    }
                });
            }

            // collided
            if (this.isCollidingOnResize) {
                newWidth = this.initialBlockWidth + this.lastValidDeltaX;
            } else {
                // test for snapping
                const snappedRightX: number = this.snapToGrid(newRightX);
                newWidth = snappedRightX - this.initialBlockX;
            }
        } else {
            // calculate new tacton width
            newWidth = Math.max((this.initialBlockWidth - deltaX), config.minTactonWidth);

            // check for minTactonWidth
            if (newWidth == config.minTactonWidth) return;

            // calculate new x coordinates of tacton
            newX = this.initialBlockX + deltaX;

            // check for collision
            if (!this.isCollidingOnResize || deltaX > this.lastValidDeltaX) {
                this.isCollidingOnResize = false;
                const selectedTracks: number[] = store.state.selectedBlocks.map((selection: BlockSelection) => selection.trackId);
                selectedTracks.forEach((trackId: number): void => {
                    const adjustedDeltaX: number = deltaX / store.state.zoomLevel;
                    if (store.state.blocks[trackId].length > 1) {
                        for (let i: number = 0; i < store.state.blocks[trackId].length; i++) {
                            if (this.isCollidingOnResize) break;
                            if (store.state.selectedBlocks.some((selection: BlockSelection) => selection.trackId == trackId && selection.index == i)) {
                                const currentBlock = store.state.blocks[trackId][i];
                                const newWidth: number = Math.max((currentBlock.initWidth - adjustedDeltaX), config.minTactonWidth);
                                const newX: number = currentBlock.initX + adjustedDeltaX;
                                const newRightX = currentBlock.initX + newWidth;
                                for (let j: number = i - 1; j >= 0; j--) {
                                    const other = store.state.blocks[trackId][j];
                                    const otherRightX = other.initX + other.initWidth;
                                    if (newX < otherRightX && newRightX > otherRightX) {
                                        this.isCollidingOnResize = true;
                                        this.lastValidDeltaX = Math.min((otherRightX - currentBlock.initX) * store.state.zoomLevel, this.lastValidDeltaX);
                                        break;
                                    }
                                    this.lastValidDeltaX = deltaX;
                                    this.isCollidingOnResize = false;
                                }
                            }
                        }
                    }
                });
            }

            if (this.isCollidingOnResize) {
                newX = this.initialBlockX + this.lastValidDeltaX;
                newWidth = this.initialBlockWidth - this.lastValidDeltaX;
            } else  {
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
        this.applyChanges(changes);
    }
    private onProportionalResizeStart(event: any, direction: Direction.LEFT | Direction.RIGHT): void {
        if (this.groupBorder == null) return;

        this.resizeDirection = direction;
        this.initialX = event.data.global.x;

        // need to update initData of groupBorder
        this.groupBorder.initStartX = this.lastGroupStartX;
        this.groupBorder.initWidth = this.lastGroupWidth;

        this.pointerMoveHandler = (event: any) => this.onProportionalResize(event);
        this.pointerUpHandler = () => this.onResizeEnd();
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    private onProportionalResize(event: any): void {
        if (this.groupBorder == null) return;
        
        const deltaX: number = event.clientX - this.initialX;
        const initWidth: number = this.groupBorder.initWidth;
        const initStartX: number = this.groupBorder.initStartX;
        
        let newGroupWidth: number = initWidth;
        let newGroupStartX: number = initStartX;
        let isDeltaXValid: boolean;
        
        if (this.resizeDirection === Direction.RIGHT) {
            newGroupWidth += deltaX;
            isDeltaXValid = deltaX < this.lastValidDeltaX || !this.isCollidingRight;
        } else {
            newGroupStartX += deltaX;
            newGroupWidth -= deltaX;
            isDeltaXValid = deltaX > this.lastValidDeltaX || !this.isCollidingLeft;
        }

        // check for minSize
        if (newGroupWidth < 1){
            newGroupWidth = 1;
            newGroupStartX = this.lastGroupStartX;
        }
        
        // TODO this also is true, when colliding, thus not actually overflowing
        // check for left-overflow
        if (newGroupStartX <= config.leftPadding) {
            console.log("isOverflowing");
            const overflow: number = config.leftPadding - newGroupStartX;
            newGroupStartX += overflow;
            newGroupWidth -= overflow;
        }
        
        const scale: number = newGroupWidth / initWidth;
        if (!this.isCollidingOnResize || isDeltaXValid) {
            this.isCollidingOnResize = false;
            store.state.selectedBlocks.forEach((selection: BlockSelection, index: number): void => {
                if (this.isCollidingOnResize) return;
                const block = store.state.blocks[selection.trackId][selection.index];
                const newBlockParameters: {x: number, width: number} = this.calculateNewBlockParameters(block, newGroupStartX, scale);
                const newX: number = newBlockParameters.x;
                const newWidth: number = newBlockParameters.width;
                const newRightX: number = newX + newWidth;
                
                store.state.blocks[block.trackId].forEach((other: BlockDTO): void => {
                    if (!this.isBlockSelected(other)) {
                        const otherRightX: number = other.rect.x + other.rect. width;
                        if (otherRightX >= newX && otherRightX < newRightX) {
                            // collision left
                            this.isCollidingOnResize = true;
                            this.isCollidingLeft = true;
                            
                            // calculate perfect match
                            const diff: number = otherRightX - newX;
                            newGroupStartX += diff;
                            newGroupWidth -= diff;
                            this.generatePerfectCollision(newGroupStartX, newGroupWidth);
                            return;
                        } else {
                            this.isCollidingLeft = false;
                        }
                        
                        if (other.rect.x <= newRightX && other.rect.x > newX) {
                            // collision right
                            this.isCollidingOnResize = true;
                            this.isCollidingRight = true;
                            
                            // calculate perfect match
                            const diff: number = (newX + newWidth) - other.rect.x;
                            newGroupWidth -= diff;
                            this.generatePerfectCollision(newGroupStartX, newGroupWidth);
                            return;
                        } else {
                            this.isCollidingRight = false;
                        }                
                    }
                });
                
                if (!this.isCollidingOnResize) {
                    block.rect.x = newX;
                    block.rect.width = newWidth;
    
                    block.strokedRect.x = newX;
                    block.strokedRect.width = newWidth;
    
                    this.lastValidDeltaX = deltaX;
                }
            });
            this.resizeGroupBorder(newGroupStartX, newGroupWidth);              
        }
    }
    private onResizeEnd(): void {
        this.resizeDirection = null;
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);

        // only set InteractionState if groupBorder is not active
        if (this.groupBorder == null) {
            store.dispatch('setInteractionState', false);
        }

        this.forEachSelectedBlock((block: BlockDTO): void => {
            this.updateHandles(block);
            block.initWidth = block.rect.width / store.state.zoomLevel;
            this.updateBlockInitData(block);
        });
        this.calculateVirtualViewportLength();
        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
    }
    private onChangeAmplitude(event: any, block: BlockDTO, direction: Direction.TOP | Direction.BOTTOM): void {
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

        const prevHeight: number = block.rect.height;
        const newHeight: number = Math.min(Math.max((this.initialBlockHeight + deltaY), config.minBlockHeight), config.maxBlockHeight);
        const heightChange: number = newHeight - prevHeight;
        const changes: BlockChanges = new BlockChanges();
        changes.height = heightChange;
        this.applyChanges(changes);
    }
    private onChangeAmplitudeEnd(): void {
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);
        store.dispatch('setInteractionState', false);

        this.forEachSelectedBlock((block: BlockDTO): void => {
            this.updateHandles(block);
            this.updateBlockInitData(block);
        });
        
        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
        this.currentTacton = null;
    }

    //*************** Helper ***************
    
    private isBlockSelected(block: BlockDTO): boolean {
        return store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
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
    private calculateNewBlockParameters(block: BlockDTO, newGroupStartX: number, scale: number): {x: number, width: number} {
        if (this.groupBorder == null) return {x: NaN, width: NaN};
        const relX: number = (block.initX * store.state.zoomLevel) - this.groupBorder.initStartX + config.leftPadding - store.state.horizontalViewportOffset;
        const newX: number = (newGroupStartX + relX * scale);
        const newWidth: number = (block.initWidth * store.state.zoomLevel) * scale;
        return {x: newX, width: newWidth};
    }
    private generatePerfectCollision(newGroupStartX: number, newGroupWidth: number): void {
        if (this.groupBorder == null) return;
        const scale: number = newGroupWidth / this.groupBorder.initWidth;
        store.state.selectedBlocks.forEach((selection: BlockSelection): void => {
            const block = store.state.blocks[selection.trackId][selection.index];
            const newBlockParameters: {x: number, width: number} = this.calculateNewBlockParameters(block, newGroupStartX, scale);
            const newX: number = newBlockParameters.x;
            const newWidth: number = newBlockParameters.width;

            block.rect.x = newX;
            block.rect.width = newWidth;

            block.strokedRect.x = newX;
            block.strokedRect.width = newWidth;
        });
    }
    private drawGroupBorder(): void {
        this.clearGroupBorder();
        if (store.state.selectedBlocks.length <= 1) return;
        
        // hide indicators
        this.forEachSelectedBlock((block: BlockDTO) => this.updateIndicatorVisibility(block, false));

        let groupStartX: number = Infinity;
        let groupEndX: number = -Infinity;
        let groupWidth: number;
        let groupLowestTrack: number = Infinity;
        let groupHighestTrack: number = 0;
        let maxHeightOfLowestTrack: number = config.minBlockHeight;
        let maxHeightOfHighestTrack: number = config.minBlockHeight;
        let firstBlockOfGroup;
        let lastBlockOfGroup;

        const selectedBlocks: BlockDTO[] = store.state.selectedBlocks.map((selection: BlockSelection) => {
            const block = store.state.blocks[selection.trackId][selection.index];

            // disable handles
            block.leftHandle.interactive = false;
            block.rightHandle.interactive = false;
            block.topHandle.interactive = false;
            block.bottomHandle.interactive = false;

            // collect data
            if (block.rect.x < groupStartX) {
                groupStartX = block.rect.x;
                firstBlockOfGroup = selection;
            }            
            if ((block.rect.x + block.rect. width) > groupEndX) {
                groupEndX = (block.rect.x + block.rect. width);
                lastBlockOfGroup = selection;
            }
            groupLowestTrack = Math.min(groupLowestTrack, block.trackId);
            groupHighestTrack = Math.max(groupHighestTrack, block.trackId);
            return block;
        });

        groupWidth = groupEndX - groupStartX;

        selectedBlocks.forEach((block: BlockDTO): void => {
            if (block.trackId == groupLowestTrack) {
                maxHeightOfLowestTrack = Math.max(maxHeightOfLowestTrack, block.rect.height);
            }

            if (block.trackId == groupHighestTrack) {
                maxHeightOfHighestTrack = Math.max(maxHeightOfHighestTrack, block.rect.height);
            }
        });

        const groupY: number = Math.min(...selectedBlocks.map((b: BlockDTO) => b.rect.y));
        const groupHeight: number = ((groupHighestTrack - groupLowestTrack) * config.trackHeight) + Math.min(maxHeightOfLowestTrack, maxHeightOfHighestTrack) + (Math.abs(maxHeightOfLowestTrack - maxHeightOfHighestTrack) / 2);

        this.lastGroupStartX = groupStartX;
        this.lastGroupWidth = groupWidth;
        this.lastGroupY = groupY;

        const borderContainer = new Pixi.Container();
        const border = new Pixi.Graphics();
        border.rect(groupStartX, groupY, groupWidth, groupHeight);
        border.fill('rgb(0, 0, 0, 0)');
        border.stroke({width: 2, color: config.colors.groupHandleColor});

        const rightHandle = new Pixi.Graphics();
        rightHandle.circle(groupStartX + groupWidth, groupY + groupHeight/2, config.groupHandleRadius);
        rightHandle.fill(config.colors.groupHandleColor);
        rightHandle.interactive = true;
        rightHandle.cursor = 'pointer';

        const leftHandle = new Pixi.Graphics();
        leftHandle.circle(groupStartX, groupY + groupHeight/2, config.groupHandleRadius);
        leftHandle.fill(config.colors.groupHandleColor);
        leftHandle.interactive = true;
        leftHandle.cursor = 'pointer';

        // add eventListeners

        leftHandle.on('pointerdown', (event) =>  this.onProportionalResizeStart(event, Direction.LEFT));
        rightHandle.on('pointerdown', (event) =>  this.onProportionalResizeStart(event, Direction.RIGHT));

        borderContainer.addChild(border);
        borderContainer.addChild(rightHandle);
        borderContainer.addChild(leftHandle);

        this.groupBorder = {
            container: borderContainer,
            border: border,
            rightHandle: rightHandle,
            leftHandle: leftHandle,
            initWidth: groupWidth,
            initStartX: groupStartX,
            initY: groupY,
            initHeight: groupHeight,
            firstBlockOfGroup: firstBlockOfGroup!,
            lastBlockOfGroup: lastBlockOfGroup!
        }

        dynamicContainer.addChild(borderContainer);

        store.dispatch('setInteractionState', true);
    }
    private resizeGroupBorder(newGroupStartX?: number, newGroupWidth?: number): void {
        if (this.groupBorder == null) return;
        if (!newGroupWidth) newGroupWidth = this.lastGroupWidth;
        if (!newGroupStartX) newGroupStartX = this.lastGroupStartX;

        const groupY: number = this.groupBorder.initY;
        const groupHeight: number = this.groupBorder.initHeight;

        this.groupBorder.border.clear();
        this.groupBorder.border.rect(newGroupStartX, groupY, newGroupWidth, groupHeight);
        this.groupBorder.border.fill('rgb(0, 0, 0, 0)');
        this.groupBorder.border.stroke({width: 2, color: 'rgba(255,0,0,0.5)'});

        this.groupBorder.rightHandle.clear();
        this.groupBorder.rightHandle.circle(newGroupStartX + newGroupWidth, groupY + groupHeight/2, config.groupHandleRadius);
        this.groupBorder.rightHandle.fill(config.colors.groupHandleColor);

        this.groupBorder.leftHandle.clear();
        this.groupBorder.leftHandle.circle(newGroupStartX, groupY + groupHeight/2, config.groupHandleRadius);
        this.groupBorder.leftHandle.fill(config.colors.groupHandleColor);

        this.lastGroupStartX = newGroupStartX;
        this.lastGroupWidth = newGroupWidth;
    }
    private updateGroupBorder(): void {
        if (this.groupBorder) {
            const firstSelection: BlockSelection = this.groupBorder.firstBlockOfGroup;
            const lastSelection: BlockSelection = this.groupBorder.lastBlockOfGroup;

            const firstBlock = store.state.blocks[firstSelection.trackId][firstSelection.index];
            const lastBlock = store.state.blocks[lastSelection.trackId][lastSelection.index];

            const newGroupStartX = firstBlock.rect.x;
            const newGroupEndX = lastBlock.rect.x + lastBlock.rect.width;
            const newGroupWidth: number = newGroupEndX - newGroupStartX;
            this.resizeGroupBorder(newGroupStartX, newGroupWidth);
        }
    }
    private clearGroupBorder(): void {
        if (this.groupBorder != null) {
            dynamicContainer.removeChild(this.groupBorder.container);
            this.groupBorder.container.destroy({children: true});
            this.groupBorder = null;

            store.state.selectedBlocks.forEach((selection: BlockSelection) => {
                const block = store.state.blocks[selection.trackId][selection.index];

                // enable handles
                block.leftHandle.interactive = true;
                block.rightHandle.interactive = true;
                block.topHandle.interactive = true;
                block.bottomHandle.interactive = true;
            });

            store.dispatch('setInteractionState', false);

            this.forEachSelectedBlock((block: BlockDTO) => {
                this.updateStroke(block);
                this.updateIndicators(block);
                this.updateIndicatorVisibility(block, true);
            });
        }
    }

    //******* scroll viewport when block is at border-regions *******
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
        if (!this.isScrolling || !this.currentDirection) return;

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

    //******* collision-detection for moving blocks *******
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
    private createBordersForCopies(): void {
        this.selectedTracks = [];
        // calculate border to check
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            this.unselectedBorders[trackId] = [];
            this.selectedBorders[trackId] = [];
            store.state.blocks[trackId].forEach((block: BlockDTO, index: number): void => {
                // block is unselected
                this.unselectedBorders[block.trackId].push(block.rect.x);
                this.unselectedBorders[block.trackId].push(block.rect.x + block.rect.width);
            });
        });

        this.copiedBlocks.forEach((block: CopiedBlockDTO): void => {
            // if block is copied, add to selectedBlocks
            this.selectedBorders[block.trackId].push(block.rect.x);
            this.selectedBorders[block.trackId].push(block.rect.x + block.rect.width);

            const isAdded: boolean = this.selectedTracks.some((track: number): boolean => {
                return track == block.trackId;
            });

            if (!isAdded) this.selectedTracks.push(block.trackId);
        });

        this.calculateStickyOffsets();
    }

    // TODO snapping is wonky sometimes when using multi-selection --> chooses only the last possible snap
    // maybe implement this with input {x, width} to get a valid modification for moving and resizing
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

            for (let trackId: number = 0; trackId < Math.min(this.unselectedBorders.length, this.selectedBorders.length); trackId++) {
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
                            const cursorX: number = this.initialX + offset;
                            let distToStart2: number = Math.abs(cursorX - start1);
                            let distToEnd2: number = Math.abs(cursorX - end1);
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
                            if (Math.abs(start2 - lineX) <= config.moveSnappingRadius) {
                                validOffset = lineX - this.selectedBorders[trackId][i];
                                break;
                            }
                            // right
                            if (Math.abs(end2 - lineX) <= config.moveSnappingRadius) {
                                validOffset = lineX - this.selectedBorders[trackId][i + 1];
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (attemptCount >= maxAttempts) {
            validOffset = this.getValidStickyOffset(offset, trackOffset, horizontalOffsetDifference);
        }

        this.lastValidOffset = validOffset;
        this.lastTrackOffset = trackOffset;
        return validOffset;
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
    private checkPossibleOffsetPerTrack(possibleOffsetPerTrackOffset: number[][]): void {
        this.stickyOffsetsPerTrackOffset.clear();
        this.validTrackOffsets = this.getValidTrackOffsets();
        // iterate over possible trackOffsets e.g. [-1, 0, 1, 2]
        this.validTrackOffsets.forEach((trackOffset: number): void => {
            const validOffsetsPerTrackOffset: number[] = [];
            // iterate over possible offsets e.g. [71, -248, ...]
            for (const possibleOffset of possibleOffsetPerTrackOffset[trackOffset]) {
                let isValid: boolean = true;
                // iterate over selected tracks
                for (const trackAsString of Object.keys(this.selectedBorders)) {
                    const trackId: number = parseInt(trackAsString);
                    const selectedBorders: number[] = this.selectedBorders[trackId];
                    const unselectedBorders: number[] = this.unselectedBorders[trackId + trackOffset];
                    
                    // skip empty tracks
                    if (!selectedBorders || selectedBorders.length === 0) continue;
                    if (!unselectedBorders) continue;

                    // add offset to border
                    // check if any of unselectedBorders is overlapping with adjusted border
                    for (let i = 0; i < selectedBorders.length; i += 2) {
                        const start2: number = selectedBorders[i] + possibleOffset;
                        const end2: number = selectedBorders[i + 1] + possibleOffset;

                        if (start2 < config.leftPadding) {
                            isValid = false;
                            break;
                        }

                        for (let j = 0; j < unselectedBorders.length; j += 2) {
                            const start1: number = unselectedBorders[j];
                            const end1: number = unselectedBorders[j + 1];
                            
                            const variance: number = 0.01
                            if (end2 > start1 && (start2 + variance) < end1) {
                                isValid = false;
                                break;
                            }
                        }

                        if (!isValid) break;
                    }

                    if (!isValid) break;
                }

                if (isValid) {
                    validOffsetsPerTrackOffset.push(possibleOffset);
                }
            }

            this.stickyOffsetsPerTrackOffset.set(trackOffset, validOffsetsPerTrackOffset);
        });
    }
    private calculateStickyOffsets(): void {
        const trackOffsets: number[] = this.getValidTrackOffsets();
        const possibleOffsetPerTrackOffset: number[][] = [];
        for (let trackId = 0; trackId < Math.min(this.unselectedBorders.length, this.selectedBorders.length); trackId++) {
            // loop over selectedBorders
            for (let i = 0; i < this.selectedBorders[trackId].length; i += 2) {
                // loop over unselected border tracks
                trackOffsets.forEach((trackOffset: number) => {
                    const track = trackId + trackOffset;
                    if (possibleOffsetPerTrackOffset[trackOffset] == undefined) {
                        possibleOffsetPerTrackOffset[trackOffset] = [];
                    }
                    // loop over every unselected border block in this track
                    for (let k = 0; k < this.unselectedBorders[track].length; k += 2 ) {
                        let start2: number = this.unselectedBorders[track][k];
                        let end2: number = this.unselectedBorders[track][k + 1];

                        // calculate possible offsets         
                        let offsetToStart: number = end2 - this.selectedBorders[trackId][i];
                        let offsetToEnd: number = start2 - this.selectedBorders[trackId][i + 1];

                        possibleOffsetPerTrackOffset[trackOffset].push(offsetToStart);
                        possibleOffsetPerTrackOffset[trackOffset].push(offsetToEnd);
                    }
                });
            }
        }
        this.checkPossibleOffsetPerTrack(possibleOffsetPerTrackOffset);
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
}