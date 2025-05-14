import type {BlockData} from "@/parser/instructionParser";
import type {Graphics, Container} from "pixi.js";
import * as Pixi from "pixi.js";
import config from "@/config";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import store, {BlockChanges, type BlockSelection} from "@/store";
import {inject, onMounted, watch} from "vue";
import type {SnackbarData} from "@/components/Snackbar.vue";
interface SelectionBorderData {
    container: Container;
    border: Graphics;
    leftHandle: Graphics;
    leftIndicator: Graphics;
    rightHandle: Graphics;
    rightIndicator: Graphics;
    initStartX: number;
    lastStartX: number;
    initWidth: number;
    lastWidth: number;
    initY: number;
    lastY: number;
    initHeight: number;
    firstBlockOfGroup: BlockSelection;
    lastBlockOfGroup: BlockSelection;
}
interface GroupBorderData extends SelectionBorderData {
    topHandle: Graphics;
    topIndicator: Graphics;
    bottomHandle: Graphics;
    bottomIndicator: Graphics;
    topBlockOfGroup: BlockSelection;
    bottomBlockOfGroup: BlockSelection;
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
    groupId: number | null = null;
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
    private selectionBorder: SelectionBorderData | null = null;
    private lastUidsCollisionLeft: number[] = [];
    private lastUidsCollisionRight: number[] = [];
    
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
    
    // multi selection
    private isSelecting: boolean = false;
    private isMouseDragging: boolean = false;
    private selectionStart = { x: 0, y: 0 };
    private selectionEnd = { x: 0, y: 0 };
    
    // groups
    private renderedGroupBorders: Map<number, GroupBorderData> = new Map<number, GroupBorderData>();
    
    private showSnackbar = inject('showSnackbar') as (data: SnackbarData) => void;
    
    // updateHooks
    private updated: boolean = false;
    constructor() {
        watch(() => store.state.zoomLevel, this.onZoomLevelChange.bind(this));
        watch(() => store.state.horizontalViewportOffset, this.onHorizontalViewportChange.bind(this));  
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
        watch(() => store.state.isEditable, this.handleEditMode.bind(this));
        
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
            if (!store.state.isEditable) return;
            // detect STRG or Meta
            if (event.code == 'ControlLeft' && !this.isMacOS) {
                // TODO if selection is group, return
                if (!this.strgDown) {
                    this.drawSelectionBorder();
                    this.strgDown = true;
                }
            } else if (event.code == 'MetaLeft') {
                if (!this.strgDown) {
                    this.drawSelectionBorder();
                    this.strgDown = true;
                    if (!this.isMacOS) {
                        this.isMacOS = true;
                    }
                }
            }

            if (this.strgDown && (event.code == 'KeyC')) this.copySelection();
            if (this.strgDown && (event.code == 'KeyV')) this.pasteSelection();
            if (this.strgDown && (event.code == 'KeyG')) {
                event.preventDefault();
                this.groupBlocks();
            }
            if (this.strgDown && (event.code == 'KeyS')) {
                event.preventDefault();
                store.dispatch('toggleSnappingState');
            }
            if (event.code == 'Escape') this.clearCopiedBlocks();
            if (event.code == 'Delete') this.deleteBlock();

            // detect shift
            if (event.key == "Shift" && !store.state.isPressingShift) {
                store.dispatch('toggleShiftValue');
            }
        });
        
        document.addEventListener('keyup', (event: KeyboardEvent): void => {
            if (!store.state.isEditable) return;
            if ((event.code == 'ControlLeft' && !this.isMacOS) || event.code == 'MetaLeft') {
                this.strgDown = false;
                this.clearSelectionBorder();
                this.forEachSelectedBlock((block: BlockDTO): void => {
                    if (block.groupId != null) return;
                    this.updateHandles(block);
                    this.updateIndicators(block);
                    this.updateIndicatorVisibility(block, true);
                    this.updateHandleInteractivity(block, true);
                });
            }

            if (event.key == "Shift" && store.state.isPressingShift) {
                store.dispatch('toggleShiftValue');
            }
        });
        
        // paste on click
        pixiApp.canvas.addEventListener('mousedown', (event: MouseEvent) => {
            if (!store.state.isInteracting) {
                this.pasteSelection();
            }

            if (this.isSelecting) return;
            if (event.button === 0 && !store.state.isInteracting) {
                this.isMouseDragging = true;
                this.selectionStart = { x: event.clientX, y: event.clientY };
                this.selectionEnd = { ...this.selectionStart };
                this.drawSelectionBox();
            }
        });

        pixiApp.canvas.addEventListener('mousemove', (event: MouseEvent) => {
            if (!this.isMouseDragging) return;
            this.selectionEnd = { x: event.clientX, y: event.clientY };
            this.drawSelectionBox();
        });

        pixiApp.canvas.addEventListener('mouseup', (event: MouseEvent) => {
            if (event.button !== 0 || !this.isMouseDragging) return;
            this.isMouseDragging = false;
            this.removeSelectionBox();
            this.selectRectanglesWithin();
        });
        
        // init as not editable
        this.handleEditMode(false);
    }    
    createBlocksFromData(blockData: BlockData[]): void {
        // clear rendered borders
        this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number): void => {
            this.clearGroupBorder(groupId);
        });
        this.clearSelectionBorder();
        
        // clear stored blocks
        store.dispatch('deleteAllBlocks');
        
        // init tracks
        store.dispatch('initTracks');

        // create, render and save block in store
        blockData.forEach((block: BlockData): void => {
            this.createBlock(block);
        });
        
        // detect blocks with dist == 0 and create group        
        const variance: number = 0.05
        // iterate over tracks
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            // iterate over blocks per track
            let before: BlockDTO | null = null;
            let detectedGroups: {groupId: number, selection: BlockSelection[]}[] = [];
            let currentDetectedGroup: {groupId: number, selection: BlockSelection[]} | null = null;
            store.state.blocks[trackId].forEach((block: BlockDTO, index: number): void => {
                if (before == null) {
                    // first block of track
                    before = block;
                } else {
                    const endOfBefore: number = before.rect.x + before.rect.width;
                    if (block.rect.x - endOfBefore <= variance) {
                        // group detected
                        if (currentDetectedGroup == null) {
                            // first of group
                            
                            // create group
                            currentDetectedGroup = {groupId: before.rect.uid, selection: []};
                            
                            // add before and current block
                            currentDetectedGroup.selection.push({trackId: trackId, index: index - 1, uid: before.rect.uid});
                            currentDetectedGroup.selection.push({trackId: trackId, index: index, uid: block.rect.uid});
                            
                            // add groupId to blocks
                            store.state.blocks[trackId][index - 1].groupId = currentDetectedGroup.groupId;
                            store.state.blocks[trackId][index].groupId = currentDetectedGroup.groupId;
                        } else {
                            // add to current group
                            currentDetectedGroup.selection.push({trackId: trackId, index: index, uid: block.rect.uid});
                            
                            // add groupId to block
                            store.state.blocks[trackId][index].groupId = currentDetectedGroup.groupId;
                        }
                    } else {
                        if (currentDetectedGroup != null) {
                            // end of current group - push groupData
                            detectedGroups.push(currentDetectedGroup);
                            currentDetectedGroup = null;
                        }
                    }
                    
                    // last block of track - push detected groups
                    if (store.state.blocks[trackId][index + 1] == undefined) {
                        if (currentDetectedGroup != null) {
                            detectedGroups.push(currentDetectedGroup);
                        }
                    }
                    before = block;
                }
            });
            
            if (detectedGroups.length > 0) {
                detectedGroups.forEach((groupData: {groupId: number, selection: BlockSelection[]}) => {
                    store.dispatch('addGroup', groupData);
                });
            }
        });
        
        // update blocks, handles and strokes
        this.forEachBlock((block: BlockDTO): void => {
            this.updateBlock(block);
            this.updateHandles(block);
            this.updateStroke(block);
            this.updateIndicators(block);
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
        
        this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number): void => {
           this.updateGroup(groupId, true);
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
    private updateHandleInteractivity(block: BlockDTO, isInteractive: boolean): void {
        block.leftHandle.interactive = isInteractive;
        block.rightHandle.interactive = isInteractive;
        block.topHandle.interactive = isInteractive;
        block.bottomHandle.interactive = isInteractive;
    }
    private updateStroke(block: BlockDTO): void {
        block.strokedRect.x = block.rect.x;
        block.strokedRect.width = block.rect.width;
        block.strokedRect.y = block.rect.y;
        block.strokedRect.height = block.rect.height;
    }
    private updateIndicators(block: BlockDTO): void {
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
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            store.state.blocks[trackId].forEach((block: BlockDTO): void => {
                callback(block);
            });
        });
    }
    
    // execites callback-function on every selected block
    private forEachSelectedBlock(callback: (block: BlockDTO) => void): void {
        store.state.selectedBlocks.forEach((selection: BlockSelection): void => {
           callback(store.state.blocks[selection.trackId][selection.index]);
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
        this.updateSelectionBorder();
        this.renderedGroupBorders.forEach((groupBorder: GroupBorderData, groupId: number) => {
            this.updateGroup(groupId, true);
        });
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
            this.updateSelectionBorder();
            this.renderedGroupBorders.forEach((groupBorder: GroupBorderData, groupId: number) => {
                this.updateGroup(groupId, true);    
            });            
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
    
    // TODO maybe split selection and border rendering, as rendering border only relies on what blocks are selected + group detection
    private handleSelection(toSelect: BlockDTO | BlockSelection[]): void {
        if (!store.state.isEditable) {
            this.showSnackbar({
                message: 'This file is currently read-only. Enable edit mode to make changes.',
                color: 'warning',
                icon: 'mdi-lead-pencil',
                timer: 4000
            });
            return;
        }
        
        if (Array.isArray(toSelect)) {
            if (!store.state.isPressingShift) {
                this.forEachSelectedBlock((block: BlockDTO): void => {
                    block.strokedRect.visible = false;
                   this.updateIndicatorVisibility(block, false);
                });
                store.dispatch('clearSelection');
                this.clearGroupBorder();
            }
            
            // detect groups
            const foundGroupIds: number[] = [];
            toSelect.forEach((selection: BlockSelection): void => {
                const block: BlockDTO = store.state.blocks[selection.trackId][selection.index];
                if (block.groupId) {
                    // save groupId
                    if (!foundGroupIds.some((groupId: number): boolean => groupId == block.groupId)) {
                        foundGroupIds.push(block.groupId);
                    }
                } else {
                    // select, if not grouped
                    block.strokedRect.visible = true;
                    this.updateIndicatorVisibility(block, true);
                    store.dispatch('selectBlock', selection);
                }
            });
            
            foundGroupIds.forEach((groupId: number): void => {
                this.createGroupBorder(groupId, store.state.groups.get(groupId));
                store.state.groups.get(groupId).forEach((selection: BlockSelection): void => {
                    const block = store.state.blocks[selection.trackId][selection.index];
                    block.strokedRect.visible = true;
                    store.dispatch('selectBlock', selection);
                });
            });
        } else {
            // check if selected or not
            const index: number = store.state.blocks[toSelect.trackId].findIndex((other: BlockDTO): boolean => other.rect.uid === toSelect.rect.uid);
            if (index !== -1) {
                const selectionIndex: number = store.state.selectedBlocks.findIndex((selection: BlockSelection): boolean => selection.uid === toSelect.rect.uid);
                const selection: BlockSelection = {trackId: toSelect.trackId, index: index, uid: toSelect.rect.uid};
                if (selectionIndex == -1) {
                    // block is not selected
                    if (!store.state.isPressingShift) {
                        // clear selection
                        this.forEachSelectedBlock((block: BlockDTO): void => {
                           block.strokedRect.visible = false;
                           this.updateIndicatorVisibility(block, false);
                        });
                        store.dispatch('clearSelection');
                        this.clearGroupBorder();
                    }

                    // check for group
                    if (toSelect.groupId == null) {
                        // add block to selection
                        store.dispatch('selectBlock', selection);

                        toSelect.strokedRect.visible = true;
                        this.updateIndicatorVisibility(toSelect, true);
                    } else {
                        this.createGroupBorder(toSelect.groupId, store.state.groups.get(toSelect.groupId));                        
                        store.state.groups.get(toSelect.groupId).forEach((selection: BlockSelection): void => {
                            const block = store.state.blocks[selection.trackId][selection.index];
                            block.strokedRect.visible = true;
                            store.dispatch('selectBlock', selection);
                        });
                    }
                } else {
                    // block already selected
                    if (store.state.isPressingShift) {
                        if (toSelect.groupId != null) {
                            // TODO optimize
                            
                            // remove from store
                            store.state.groups.get(toSelect.groupId)!.forEach((selection: BlockSelection): void => {
                                const block = store.state.blocks[selection.trackId][selection.index];
                                const selectionIndex: number = store.state.selectedBlocks.findIndex((other: BlockSelection): boolean => other.uid === selection.uid);
                                store.dispatch('unselectBlock', selectionIndex);
                                block.strokedRect.visible = false;
                            });
                            
                            // remove groupBorder
                            this.clearGroupBorder(toSelect.groupId);
                        } else {
                            // remove block from selection
                            store.dispatch('unselectBlock', selectionIndex);
                            toSelect.strokedRect.visible = false;
                            this.updateIndicatorVisibility(toSelect, false);
                        }
                    }
                }
            }
        }
    }
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

            // unselect copied blocks
            this.forEachSelectedBlock((block: BlockDTO): void => {
                this.updateIndicatorVisibility(block, false);
                block.strokedRect.visible = false;
            });
            
            store.dispatch('clearSelection');
            
            if (this.selectionBorder != null) {
                this.clearSelectionBorder();
            }
            
            this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number) => {
               this.clearGroupBorder(groupId); 
            });
        }
    }
    private pasteSelection(): void {
        if (this.copiedBlocks.length == 0) return;
        const copiedBlockData: BlockData[] = this.createBlockDataFromBlocks(this.copiedBlocks);
        const addedBlockIds: number[] = [];
        
        copiedBlockData.forEach((blockData: BlockData): void => {
            const block: BlockDTO = this.createBlock(blockData);
            addedBlockIds.push(block.rect.uid);
        });
        
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
        // if groupBorder is active, update
        if (this.selectionBorder) {
            // dont update, if there will be less then two blocks (requirement for proportional resizing)
            const isBlockSelected: boolean = store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
            if (store.state.selectedBlocks.length >= 3 || !isBlockSelected) {
                // select / deselect block
                this.handleSelection(block);
                
                if (isBlockSelected) {
                    this.updateHandleInteractivity(block, true);
                }
            }
            this.drawSelectionBorder();
        } else {
            // select block
            this.handleSelection(block);
        }

        // early exit if user is pressing shift --> multi-selection
        if (store.state.isPressingShift) {
            this.isSelecting = true;
            this.pointerUpHandler = () => this.onSelectingEnd();
            window.addEventListener('pointerup', this.pointerUpHandler);
            return;
        }
        
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
        
        if (this.selectionBorder != null) {
            // update selectionBorder
            this.selectionBorder.lastStartX += changes.x;
            this.selectionBorder.initY = this.selectionBorder.lastY + changes.track * config.trackHeight;
            this.resizeSelectionBorder(this.selectionBorder);
            this.isCollidingOnResize = false;
        }
    }
    private onMoveBlockEnd(): void {
        if (this.currentTacton == null) return;
        this.stopAutoScroll();
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);

        let borderData: SelectionBorderData | null = this.selectionBorder;
        
        if (borderData == null) {
            // only set InteractionState if groupBorder (from proportional resizing) is not active
            store.dispatch('setInteractionState', false);
        }        
        if (borderData == null && this.currentTacton.groupId != null) {
            borderData = this.renderedGroupBorders.get(this.currentTacton.groupId)!;
        }
        if (borderData != null) {
            borderData.lastY = borderData.initY;
        }
        
        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
        this.lastVerticalOffset = store.state.verticalViewportOffset;
        
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
    private onSelectingEnd(): void {
        this.isSelecting = false;
        window.removeEventListener('pointerup', this.pointerUpHandler);
    }
    private onAbsoluteResizeStart(event: any, block: BlockDTO, direction: Direction.LEFT | Direction.RIGHT): void {
        this.resizeDirection = direction;
        this.initialX = event.data.global.x;
        this.initialBlockWidth = block.rect.width;
        this.initialBlockX = block.rect.x;
        this.isCollidingOnResize = false;
        
        store.dispatch('setInteractionState', true);
        this.handleSelection(block);

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

        // exit, if user is pressing strg (proportional-resizing is active)
        if (this.strgDown) {
            return;
        }
        
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
    private onProportionalResizeStart(event: any, direction: Direction.LEFT | Direction.RIGHT, groupId?: number): void {
        let borderData: SelectionBorderData | null = this.selectionBorder;
        if (borderData == null && groupId != null) {
            borderData = this.renderedGroupBorders.get(groupId)!;
        }
        if (borderData == null) {
            return;
        }

        // need to update initData of groupBorder
        borderData.initStartX = borderData.lastStartX;
        borderData.initWidth = borderData.lastWidth;

        this.resizeDirection = direction;
        this.initialX = event.data.global.x;        
        
        this.pointerMoveHandler = (event: any) => this.onProportionalResize(event, groupId);
        this.pointerUpHandler = () => this.onResizeEnd();
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
        store.dispatch('setInteractionState', true);
    }
    private onProportionalResize(event: any, groupId?: number): void {
        let borderData: SelectionBorderData | null = this.selectionBorder;
        if (borderData == null && groupId != null) {
            borderData = this.renderedGroupBorders.get(groupId)!;
        }
        if (borderData == null) {
            return;
        }
        
        const deltaX: number = event.clientX - this.initialX;
        const initWidth: number = borderData.initWidth;
        const initStartX: number = borderData.initStartX;
        const collisionsLeft: number = this.lastUidsCollisionLeft.length;
        const collisionsRight: number = this.lastUidsCollisionRight.length;
        
        let newGroupWidth: number = initWidth;
        let newGroupStartX: number = initStartX;
        let isDeltaXValid: boolean;
        
        if (this.resizeDirection === Direction.RIGHT) {
            newGroupWidth += deltaX;
            
            isDeltaXValid = collisionsRight == 0;

            if (collisionsRight == 1) {
                isDeltaXValid = deltaX < this.lastValidDeltaX;
            }

            if (collisionsLeft == 2) {
                isDeltaXValid = deltaX > this.lastValidDeltaX;
            }
            
            if (collisionsLeft == 1 && this.lastUidsCollisionLeft[0] != borderData.firstBlockOfGroup.uid) {
                isDeltaXValid = deltaX > this.lastValidDeltaX;
            }
        } else {
            newGroupStartX += deltaX;
            newGroupWidth -= deltaX;
            
            isDeltaXValid = collisionsLeft == 0;
            
            if (collisionsLeft == 1) {
                isDeltaXValid = deltaX > this.lastValidDeltaX;
            }
            
            if (collisionsRight == 2) {
                isDeltaXValid = deltaX < this.lastValidDeltaX;
            }
            
            if (collisionsRight == 1 && this.lastUidsCollisionRight[0] != borderData.lastBlockOfGroup.uid) {
                isDeltaXValid = deltaX < this.lastValidDeltaX;
            }
        }

        // check for minSize
        if (newGroupWidth < 1){
            newGroupWidth = 1;
            newGroupStartX = borderData.lastStartX;
        }
        
        // check for left-overflow
        if (newGroupStartX <= config.leftPadding) {
            const overflow: number = config.leftPadding - newGroupStartX;
            newGroupStartX += overflow;
            newGroupWidth -= overflow;
        }
        
        const scale: number = newGroupWidth / initWidth;
        const uidsCollisionLeft: number[] = [];
        const uidsCollisionRight: number[] = [];
        
        for (const selection of store.state.selectedBlocks) {
            // calculate new block parameters
            const block = store.state.blocks[selection.trackId][selection.index];
            const newBlockParameters: {x: number, width: number} = this.calculateNewBlockParameters(block, newGroupStartX, scale);
            const newX: number = newBlockParameters.x;
            const newWidth: number = newBlockParameters.width;
            const newRightX: number = newX + newWidth;

            // check for collisions
            for (const other of store.state.blocks[selection.trackId]) {
                if (this.isBlockSelected(other)) continue;

                const otherRightX: number = other.rect.x + other.rect. width;
                if (otherRightX >= newX && otherRightX < newRightX) {
                    // collision left
                    uidsCollisionLeft.push(selection.uid);
                    
                    // calculate diff and new group parameters
                    const diff: number = otherRightX - newX;
                    newGroupStartX += diff;
                    newGroupWidth -= diff;
                }

                if (other.rect.x <= newRightX && other.rect.x > newX) {
                    // collision right
                    uidsCollisionRight.push(selection.uid);
                    
                    // calculate diff and new group parameters
                    const diff: number = (newX + newWidth) - other.rect.x;
                    newGroupWidth -= diff;
                }
            }
        }
        
        if (isDeltaXValid) {
            
            // snapping
            if (this.resizeDirection === Direction.RIGHT) {
                newGroupWidth = this.snapToGrid(newGroupStartX + newGroupWidth) - newGroupStartX;
            } else {
                const snappedGroupStartX = this.snapToGrid(newGroupStartX);
                if (snappedGroupStartX != newGroupStartX) {
                    const diff: number = initStartX - snappedGroupStartX;
                    newGroupWidth = initWidth + diff;
                }
                
                newGroupStartX = snappedGroupStartX;
            }
            
            const scale: number = newGroupWidth / borderData.initWidth;
            
            // update blocks
            this.forEachSelectedBlock((block: BlockDTO): void => {
                const newBlockParameters: {x: number, width: number} = this.calculateNewBlockParameters(block, newGroupStartX, scale);
                const newX: number = newBlockParameters.x;
                const newWidth: number = newBlockParameters.width;

                block.rect.x = newX;
                block.rect.width = newWidth;

                block.strokedRect.x = newX;
                block.strokedRect.width = newWidth;
            });
            
            // update groups
            this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number): void => {
                this.updateGroup(groupId, !this.strgDown);
            });
            
            if (groupId == undefined) {
                this.resizeSelectionBorder(borderData, newGroupStartX, newGroupWidth);
                this.lastValidDeltaX = deltaX;
                this.lastUidsCollisionRight = uidsCollisionRight;
                this.lastUidsCollisionLeft = uidsCollisionLeft; 
            }
        }
    }
    private onResizeEnd(): void {
        this.resizeDirection = null;
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);

        // only set InteractionState if groupBorder is not active
        if (this.selectionBorder == null) {
            store.dispatch('setInteractionState', false);
        }

        // update borderData
        this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number): void => {
            borderData.initStartX = borderData.lastStartX;
            borderData.initWidth = borderData.lastWidth;
        });
        
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
        this.handleSelection(block);

        this.pointerMoveHandler = (event: any) => this.changeAmplitude(event, block, direction);
        this.pointerUpHandler = () => this.onChangeAmplitudeEnd();
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
    }
    private changeAmplitude(event: any, block: BlockDTO, direction: Direction): void {
        // exit, if user is pressing strg (proportional-resizing is active)
        if (this.strgDown) {
            return;
        }
        
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

        // only set InteractionState if groupBorder is not active
        if (this.selectionBorder == null) {
            store.dispatch('setInteractionState', false);
        }

        this.forEachSelectedBlock((block: BlockDTO): void => {
            this.updateHandles(block);
            this.updateBlockInitData(block);
        });
        
        this.pointerMoveHandler = null;
        this.pointerUpHandler = null;
        this.currentTacton = null;
    }
    private groupBlocks(): void {
        if (store.state.selectedBlocks.length <= 1) return;        
        let groupId: number;    
        let hasNewBlocks: boolean = true;
        const foundGroupIds: number[] = [];
        
        if (store.state.groups.size > 0) {
            hasNewBlocks = false;
            
            // get all groupIds of selection
            this.forEachSelectedBlock((block: BlockDTO): void => {
                if (block.groupId) {
                    if (!foundGroupIds.some((groupId: number): boolean => groupId == block.groupId)) {
                        foundGroupIds.push(block.groupId);
                    }
                } else {
                    hasNewBlocks = true;
                }
            });
            
            if (foundGroupIds.length > 1) {                
                hasNewBlocks = true;
            }
        }
        if (!hasNewBlocks) {
            // ungroup
            
            // get groupId
            const groupId: number = foundGroupIds[0];
            
            // activate block-strokes, handles and indicators
            this.forEachSelectedBlock((block: BlockDTO): void => {
               //this.updateIndicatorVisibility(block, true);
               block.groupId = null;
            });
            
            // clear border
            this.clearGroupBorder(groupId);
            
            // remove group from store
            store.state.groups.delete(groupId);
            
            // create selection border
            this.drawSelectionBorder();
            
            return;
        } else {
            // create new group
            
            // remove existing groups from store and clear border
            foundGroupIds.forEach((groupId: number): void => {
                this.clearGroupBorder(groupId);
                store.state.groups.delete(groupId);
            });
            
            groupId = store.state.selectedBlocks[0].uid;
            const blocksOfGroup: BlockSelection[] = [];
            
            store.state.selectedBlocks.forEach((selection: BlockSelection): void => {
               const block = store.state.blocks[selection.trackId][selection.index];
               block.groupId = groupId;
               blocksOfGroup.push(selection);
            });
            
            store.dispatch('addGroup', {groupId: groupId, selection: blocksOfGroup});

            this.clearSelectionBorder();
            this.createGroupBorder(groupId, store.state.selectedBlocks);
        }
    }

    //*************** Helper ***************
    private onGroupResize(event: any, direction: Direction.LEFT | Direction.RIGHT, groupId: number): void {
        // check, if only the group is selected, or other blocks | groups
        const groupData = store.state.groups.get(groupId);
        const borderData: GroupBorderData | undefined = this.renderedGroupBorders.get(groupId);
        
        if (groupData == undefined || borderData == undefined) return;
        
        if (groupData.length == store.state.selectedBlocks.length) {
            this.onProportionalResizeStart(event, direction, groupId)
        } else {
            const blockOfGroup: BlockSelection = borderData.firstBlockOfGroup;
            this.onAbsoluteResizeStart(event, store.state.blocks[blockOfGroup.trackId][blockOfGroup.index], direction);
        }
    }
    private isBlockSelected(block: BlockDTO): boolean {
        return store.state.selectedBlocks.some((selection: BlockSelection): boolean => selection.uid == block.rect.uid);
    }
    
    // TODO maybe boost performance by passing an array of numbers, to check multiple positions in one iteration
    private snapToGrid(positionToCheck: number) {
        if (!store.state.isSnappingActive) return positionToCheck;
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
        let borderData: SelectionBorderData | null = this.selectionBorder;
        
        if (borderData == null && block.groupId != null) {
            borderData = this.renderedGroupBorders.get(block.groupId)!;
        }

        if (borderData == null) {
            return {x: NaN, width: NaN};
        }
            
        const relX: number = (block.initX * store.state.zoomLevel) - borderData.initStartX + config.leftPadding - store.state.horizontalViewportOffset;
        const newX: number = (newGroupStartX + relX * scale);
        const newWidth: number = (block.initWidth * store.state.zoomLevel) * scale;
        return {x: newX, width: newWidth};
    }
    private drawSelectionBorder(): void {
        this.clearSelectionBorder();
        if (store.state.selectedBlocks.length <= 1) return;
        
        if (this.renderedGroupBorders.size == 1) {
            // there is only one group active, check if only members of this group are selected
            const iterator: MapIterator<number> = this.renderedGroupBorders.keys();
            const groupId: number | undefined = iterator.next().value;            
            if (store.state.groups.get(groupId).length == store.state.selectedBlocks.length) return;
        }
        
        // hide indicators
        this.forEachSelectedBlock((block: BlockDTO) => this.updateIndicatorVisibility(block, false));
        this.renderedGroupBorders.forEach((borderData: GroupBorderData): void => {
            borderData.rightHandle.visible = false;
            borderData.rightIndicator.visible = false;
            borderData.leftHandle.visible = false;
            borderData.leftIndicator.visible = false;
            borderData.topHandle!.visible = false;
            borderData.topIndicator!.visible = false;
            borderData.bottomHandle!.visible = false;
            borderData.bottomIndicator!.visible = false;
        });

        let groupStartX: number = Infinity;
        let groupEndX: number = -Infinity;
        let groupWidth: number;
        let groupLowestTrack: number = Infinity;
        let groupHighestTrack: number = 0;
        let maxHeightOfLowestTrack: number = config.minBlockHeight;
        let maxHeightOfHighestTrack: number = config.minBlockHeight;
        let firstBlockOfGroup: BlockSelection;
        let lastBlockOfGroup: BlockSelection;
        let topBlockOfGroup: BlockSelection;
        
        store.state.selectedBlocks.forEach((selection: BlockSelection): void => {
            const block = store.state.blocks[selection.trackId][selection.index];

            // disable handles
            this.updateHandleInteractivity(block, false);

            // collect data
            if (block.rect.x < groupStartX) {
                groupStartX = block.rect.x;
                firstBlockOfGroup = selection;
            }            
            if ((block.rect.x + block.rect. width) > groupEndX) {
                groupEndX = (block.rect.x + block.rect. width);
                lastBlockOfGroup = selection;
            }
            if (groupLowestTrack >= block.trackId) {
                groupLowestTrack = block.trackId;
                if (maxHeightOfLowestTrack < block.rect.height) {
                    maxHeightOfLowestTrack = block.rect.height;
                }
            }
            
            if (groupHighestTrack <= block.trackId) {
                groupHighestTrack = block.trackId;
                if (maxHeightOfHighestTrack < block.rect.height) {
                    maxHeightOfHighestTrack = block.rect.height;
                }
            }
            
            //
            if (block.trackId < groupLowestTrack) {
                groupLowestTrack = block.trackId;
                maxHeightOfLowestTrack = block.rect.height;
                topBlockOfGroup = selection;
            } else if (block.trackId === groupLowestTrack) {
                maxHeightOfLowestTrack = Math.max(maxHeightOfLowestTrack, block.rect.height);
                topBlockOfGroup = selection;
            }

            if (block.trackId > groupHighestTrack) {
                groupHighestTrack = block.trackId;
                maxHeightOfHighestTrack = block.rect.height;
            } else if (block.trackId === groupHighestTrack) {
                maxHeightOfHighestTrack = Math.max(maxHeightOfHighestTrack, block.rect.height);
            }
        });
        
        groupWidth = groupEndX - groupStartX;
        const groupY: number = store.state.blocks[topBlockOfGroup!.trackId][topBlockOfGroup!.index].rect.y;
        const groupHeight: number = ((groupHighestTrack - groupLowestTrack) * config.trackHeight) + Math.min(maxHeightOfLowestTrack, maxHeightOfHighestTrack) + (Math.abs(maxHeightOfLowestTrack - maxHeightOfHighestTrack) / 2);

        const borderContainer: Container = new Pixi.Container();
        const border: Graphics = new Pixi.Graphics();
        border.rect(groupStartX, groupY, groupWidth, groupHeight);
        border.fill('rgb(0, 0, 0, 0)');
        border.stroke({width: 2, color: config.colors.groupHandleColor});

        const rightHandle: Graphics = new Pixi.Graphics();
        rightHandle.rect(groupStartX + groupWidth - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
        rightHandle.fill(config.colors.handleColor);
        rightHandle.interactive = true;
        rightHandle.cursor = 'ew-resize';
        
        const rightIndicator: Graphics = new Pixi.Graphics();
        rightIndicator.circle(groupStartX + groupWidth, groupY + groupHeight/2, config.groupHandleRadius);
        rightIndicator.fill(config.colors.groupHandleColor);

        const leftHandle: Graphics = new Pixi.Graphics();
        leftHandle.rect(groupStartX - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
        leftHandle.fill(config.colors.handleColor);
        leftHandle.interactive = true;
        leftHandle.cursor = 'ew-resize';

        const leftIndicator: Graphics = new Pixi.Graphics();
        leftIndicator.circle(groupStartX, groupY + groupHeight/2, config.groupHandleRadius);
        leftIndicator.fill(config.colors.groupHandleColor);

        // add eventListeners

        leftHandle.on('pointerdown', (event) =>  this.onProportionalResizeStart(event, Direction.LEFT));
        rightHandle.on('pointerdown', (event) =>  this.onProportionalResizeStart(event, Direction.RIGHT));

        borderContainer.addChild(border);
        borderContainer.addChild(rightHandle);
        borderContainer.addChild(rightIndicator);
        borderContainer.addChild(leftHandle);
        borderContainer.addChild(leftIndicator);

        this.selectionBorder = {
            container: borderContainer,
            border: border,
            rightHandle: rightHandle,
            rightIndicator: rightIndicator,
            leftHandle: leftHandle,
            leftIndicator: leftIndicator,
            initWidth: groupWidth,
            lastWidth: groupWidth,
            initStartX: groupStartX,
            lastStartX: groupStartX,
            initY: groupY,
            lastY: groupY,
            initHeight: groupHeight,
            firstBlockOfGroup: firstBlockOfGroup!,
            lastBlockOfGroup: lastBlockOfGroup!,
        }

        dynamicContainer.addChild(borderContainer);

        store.dispatch('setInteractionState', true);
    }
    private resizeSelectionBorder(borderData: SelectionBorderData, newGroupStartX?: number, newGroupWidth?: number): void {
        if (!newGroupWidth) newGroupWidth = borderData.lastWidth;
        if (!newGroupStartX) newGroupStartX = borderData.lastStartX;

        const groupY: number = borderData.initY;
        const groupHeight: number = borderData.initHeight;

        borderData.border.clear();
        borderData.border.rect(newGroupStartX, groupY, newGroupWidth, groupHeight);
        borderData.border.fill('rgb(0, 0, 0, 0)');
        borderData.border.stroke({width: 2, color: config.colors.groupHandleColor});

        borderData.rightHandle.clear();
        borderData.rightHandle.rect(newGroupStartX + newGroupWidth - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
        borderData.rightHandle.fill(config.colors.handleColor);

        borderData.rightIndicator.clear();
        borderData.rightIndicator.circle(newGroupStartX + newGroupWidth, groupY + groupHeight/2, config.groupHandleRadius);
        borderData.rightIndicator.fill(config.colors.groupHandleColor);

        borderData.leftHandle.clear();
        borderData.leftHandle.rect(newGroupStartX - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
        borderData.leftHandle.fill(config.colors.handleColor);

        borderData.leftIndicator.clear();
        borderData.leftIndicator.circle(newGroupStartX, groupY + groupHeight/2, config.groupHandleRadius);
        borderData.leftIndicator.fill(config.colors.groupHandleColor);

        borderData.lastStartX = newGroupStartX;
        borderData.lastWidth = newGroupWidth;
    }
    private updateSelectionBorder(): void {
        if (this.selectionBorder) {
            const firstSelection: BlockSelection = this.selectionBorder.firstBlockOfGroup;
            const lastSelection: BlockSelection = this.selectionBorder.lastBlockOfGroup;

            const firstBlock = store.state.blocks[firstSelection.trackId][firstSelection.index];
            const lastBlock = store.state.blocks[lastSelection.trackId][lastSelection.index];

            const newGroupStartX = firstBlock.rect.x;
            const newGroupEndX = lastBlock.rect.x + lastBlock.rect.width;
            const newGroupWidth: number = newGroupEndX - newGroupStartX;
            this.resizeSelectionBorder(this.selectionBorder, newGroupStartX, newGroupWidth);
        }
    }
    private clearSelectionBorder(): void{
        if (this.selectionBorder != null) {
            dynamicContainer.removeChild(this.selectionBorder.container);
            this.selectionBorder.container.destroy({children: true});
            this.selectionBorder = null;
            this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number): void => {
                this.updateGroup(groupId, true);
                borderData.rightHandle.visible = true;
                borderData.rightIndicator.visible = true;
                borderData.leftHandle.visible = true;
                borderData.leftIndicator.visible = true;
                borderData.topHandle!.visible = true;
                borderData.topIndicator!.visible = true;
                borderData.bottomHandle!.visible = true;
                borderData.bottomIndicator!.visible = true;
            });

            store.dispatch('setInteractionState', false);
        }
    }
    private createGroupBorder(groupId: number, groupSelection: BlockSelection[]): void {
        let groupStartX: number = Infinity;
        let groupEndX: number = -Infinity;
        let groupWidth: number;
        let groupLowestTrack: number = Infinity;
        let groupHighestTrack: number = 0;
        let maxHeightOfLowestTrack: number = config.minBlockHeight;
        let maxHeightOfHighestTrack: number = config.minBlockHeight;
        let firstBlockOfGroup: BlockSelection;
        let lastBlockOfGroup: BlockSelection;
        let topBlockOfGroup: BlockSelection;
        let bottomBlockOfGroup: BlockSelection;
        
        groupSelection.forEach((selection: BlockSelection): void => {
            const block = store.state.blocks[selection.trackId][selection.index];

            // disable handles
            this.updateHandleInteractivity(block, false);

            // collect data
            if (block.rect.x < groupStartX) {
                groupStartX = block.rect.x;
                firstBlockOfGroup = selection;
            }
            if ((block.rect.x + block.rect. width) > groupEndX) {
                groupEndX = (block.rect.x + block.rect. width);
                lastBlockOfGroup = selection;
            }
            
            if (block.trackId < groupLowestTrack) {
                groupLowestTrack = block.trackId;
                maxHeightOfLowestTrack = block.rect.height;
                topBlockOfGroup = selection;
            } else if (block.trackId === groupLowestTrack) {
                maxHeightOfLowestTrack = Math.max(maxHeightOfLowestTrack, block.rect.height);
                topBlockOfGroup = selection;
            }
            
            if (block.trackId > groupHighestTrack) {
                groupHighestTrack = block.trackId;
                maxHeightOfHighestTrack = block.rect.height;
                bottomBlockOfGroup = selection;
            } else if (block.trackId === groupHighestTrack) {
                maxHeightOfHighestTrack = Math.max(maxHeightOfHighestTrack, block.rect.height);
                bottomBlockOfGroup = selection;
            }
        });

        groupWidth = groupEndX - groupStartX;   
        const groupY: number = store.state.blocks[topBlockOfGroup!.trackId][topBlockOfGroup!.index].rect.y;
        const groupHeight: number = ((groupHighestTrack - groupLowestTrack) * config.trackHeight) + Math.min(maxHeightOfLowestTrack, maxHeightOfHighestTrack) + (Math.abs(maxHeightOfLowestTrack - maxHeightOfHighestTrack) / 2);

        const borderContainer: Container = new Pixi.Container();
        const border: Graphics = new Pixi.Graphics();
        border.rect(groupStartX, groupY, groupWidth, groupHeight);
        border.fill('rgb(0, 0, 0, 0)');
        border.stroke({width: 2, color: config.colors.groupHandleColor});

        const rightHandle: Graphics = new Pixi.Graphics();
        rightHandle.rect(groupStartX + groupWidth - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
        rightHandle.fill(config.colors.handleColor);
        rightHandle.interactive = true;
        rightHandle.cursor = 'ew-resize';

        const rightIndicator: Graphics = new Pixi.Graphics();
        rightIndicator.circle(groupStartX + groupWidth, groupY + groupHeight/2, config.groupHandleRadius);
        rightIndicator.fill(config.colors.groupHandleColor);

        const leftHandle: Graphics = new Pixi.Graphics();
        leftHandle.rect(groupStartX - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
        leftHandle.fill(config.colors.handleColor);
        leftHandle.interactive = true;
        leftHandle.cursor = 'ew-resize';

        const leftIndicator: Graphics = new Pixi.Graphics();
        leftIndicator.circle(groupStartX, groupY + groupHeight/2, config.groupHandleRadius);
        leftIndicator.fill(config.colors.groupHandleColor);

        const topHandle: Graphics = new Pixi.Graphics();
        topHandle.rect(groupStartX, groupY - (config.resizingHandleWidth / 2), groupWidth, config.resizingHandleWidth);
        topHandle.fill(config.colors.handleColor);
        topHandle.interactive = true;
        topHandle.cursor = 'ns-resize';

        const topIndicator: Graphics = new Pixi.Graphics();
        topIndicator.circle(groupStartX + (groupWidth / 2), groupY, config.groupHandleRadius);
        topIndicator.fill(config.colors.groupHandleColor);

        const bottomHandle: Graphics = new Pixi.Graphics();
        bottomHandle.rect(groupStartX, groupY + groupHeight - (config.resizingHandleWidth / 2), groupWidth, config.resizingHandleWidth);
        bottomHandle.fill(config.colors.handleColor);
        bottomHandle.interactive = true;
        bottomHandle.cursor = 'ns-resize';

        const bottomIndicator: Graphics = new Pixi.Graphics();
        bottomIndicator.circle(groupStartX + (groupWidth / 2), groupY + groupHeight, config.groupHandleRadius);
        bottomIndicator.fill(config.colors.groupHandleColor);
        
        // add eventListeners
        leftHandle.on('pointerdown', (event) =>  this.onGroupResize(event, Direction.LEFT, groupId));
        rightHandle.on('pointerdown', (event) =>  this.onGroupResize(event, Direction.RIGHT, groupId));
        const block = store.state.blocks[firstBlockOfGroup!.trackId][firstBlockOfGroup!.index];
        topHandle.on('pointerdown', (event) => this.onChangeAmplitude(event, block, Direction.TOP));
        bottomHandle.on('pointerdown', (event) => this.onChangeAmplitude(event, block, Direction.BOTTOM));

        borderContainer.addChild(border);
        borderContainer.addChild(rightHandle);
        borderContainer.addChild(rightIndicator);
        borderContainer.addChild(leftHandle);
        borderContainer.addChild(leftIndicator);
        borderContainer.addChild(topHandle);
        borderContainer.addChild(topIndicator);
        borderContainer.addChild(bottomHandle);
        borderContainer.addChild(bottomIndicator);

        const groupBorder: GroupBorderData = {
            container: borderContainer,
            border: border,
            rightHandle: rightHandle,
            rightIndicator: rightIndicator,
            leftHandle: leftHandle,
            leftIndicator: leftIndicator,
            topHandle: topHandle,
            topIndicator: topIndicator,
            bottomHandle: bottomHandle,
            bottomIndicator: bottomIndicator,
            initWidth: groupWidth,
            lastWidth: groupWidth,
            lastStartX: groupStartX,
            initStartX: groupStartX,
            initY: groupY,
            lastY: groupY,
            initHeight: groupHeight,
            firstBlockOfGroup: firstBlockOfGroup!,
            lastBlockOfGroup: lastBlockOfGroup!,
            topBlockOfGroup: topBlockOfGroup!,
            bottomBlockOfGroup: bottomBlockOfGroup!
        }
        
        this.renderedGroupBorders.set(groupId, groupBorder);

        dynamicContainer.addChild(borderContainer);
    }
    private clearGroupBorder(groupId?: number): void {
        if (groupId != undefined) {
            const borderData: GroupBorderData = this.renderedGroupBorders.get(groupId)!;
            dynamicContainer.removeChild(borderData.container);
            borderData.container.destroy({children: true});
            this.renderedGroupBorders.delete(groupId);
        } else {
            // clear all
            this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number): void => {
                dynamicContainer.removeChild(borderData.container);
                borderData.container.destroy({children: true});
                
                // enable handles
                store.state.groups.get(groupId).forEach((selection: BlockSelection) => {
                    const block = store.state.blocks[selection.trackId][selection.index];
                    block.leftHandle.interactive = true;
                    block.rightHandle.interactive = true;
                    block.topHandle.interactive = true;
                    block.bottomHandle.interactive = true;
                });

                this.renderedGroupBorders.delete(groupId);
            });
        }
    }
    private updateGroup(groupId: number, updateHandles: boolean = false): void {
        const borderData: GroupBorderData = this.renderedGroupBorders.get(groupId)!;

        const firstBlock: BlockDTO = store.state.blocks[borderData.firstBlockOfGroup.trackId][borderData.firstBlockOfGroup.index];
        const lastBlock: BlockDTO = store.state.blocks[borderData.lastBlockOfGroup.trackId][borderData.lastBlockOfGroup.index];
        const topBlock: BlockDTO = store.state.blocks[borderData.topBlockOfGroup.trackId][borderData.topBlockOfGroup.index];
        const bottomBlock: BlockDTO = store.state.blocks[borderData.bottomBlockOfGroup.trackId][borderData.bottomBlockOfGroup.index];
        const groupStartX: number = firstBlock.rect.x;
        const groupEndX: number = lastBlock.rect.x + lastBlock.rect.width;
        const groupWidth: number = groupEndX - groupStartX;
        const groupY: number = topBlock.rect.y
        const groupHighestTrack: number = bottomBlock.trackId;
        const groupLowestTrack: number = topBlock.trackId;
        const maxHeightOfHighestTrack: number = bottomBlock.rect.height;
        const maxHeightOfLowestTrack: number = topBlock.rect.height;
        const groupHeight: number = ((groupHighestTrack - groupLowestTrack) * config.trackHeight) + Math.min(maxHeightOfLowestTrack, maxHeightOfHighestTrack) + (Math.abs(maxHeightOfLowestTrack - maxHeightOfHighestTrack) / 2);
        
        borderData.border.clear();
        borderData.border.rect(groupStartX, groupY, groupWidth, groupHeight);
        borderData.border.fill('rgb(0, 0, 0, 0)');
        borderData.border.stroke({width: 2, color: config.colors.groupHandleColor});
        
        if (updateHandles) {
            borderData.rightHandle.clear();
            borderData.rightHandle.rect(groupStartX + groupWidth - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
            borderData.rightHandle.fill(config.colors.handleColor);

            borderData.rightIndicator.clear();
            borderData.rightIndicator.circle(groupStartX + groupWidth, groupY + groupHeight/2, config.groupHandleRadius);
            borderData.rightIndicator.fill(config.colors.groupHandleColor);

            borderData.leftHandle.clear();
            borderData.leftHandle.rect(groupStartX - (config.resizingHandleWidth / 2), groupY, config.resizingHandleWidth, groupHeight);
            borderData.leftHandle.fill(config.colors.handleColor);

            borderData.leftIndicator.clear();
            borderData.leftIndicator.circle(groupStartX, groupY + groupHeight/2, config.groupHandleRadius);
            borderData.leftIndicator.fill(config.colors.groupHandleColor);

            borderData.topHandle!.clear();
            borderData.topHandle!.rect(groupStartX, groupY - (config.resizingHandleWidth / 2), groupWidth, config.resizingHandleWidth);
            borderData.topHandle!.fill(config.colors.handleColor);

            borderData.topIndicator!.clear();
            borderData.topIndicator!.circle(groupStartX + (groupWidth / 2), groupY, config.groupHandleRadius);
            borderData.topIndicator!.fill(config.colors.groupHandleColor);

            borderData.bottomHandle!.clear();
            borderData.bottomHandle!.rect(groupStartX, groupY + groupHeight - (config.resizingHandleWidth / 2), groupWidth, config.resizingHandleWidth);
            borderData.bottomHandle!.fill(config.colors.handleColor);

            borderData.bottomIndicator!.clear();
            borderData.bottomIndicator!.circle(groupStartX + (groupWidth / 2), groupY + groupHeight, config.groupHandleRadius);
            borderData.bottomIndicator!.fill(config.colors.groupHandleColor);
        }
        
        borderData.lastStartX = groupStartX;
        borderData.lastWidth = groupWidth;
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
        //if (this.isScrolling) return this.lastValidOffset;

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
                    if (!isSticking && store.state.isSnappingActive) {
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

    //******* multi-selection *******
    private drawSelectionBox(): void {
        const selectionBox = document.getElementById('selection-box') || this.createSelectionBox();
        const { x, y, width, height } = this.getBoundingBox();
        selectionBox.style.left = `${x}px`;
        selectionBox.style.top = `${y}px`;
        selectionBox.style.width = `${width}px`;
        selectionBox.style.height = `${height}px`;
    }
    private createSelectionBox(): HTMLElement {
        const box = document.createElement('div');
        box.id = 'selection-box';
        box.style.position = 'absolute';
        box.style.border = '1px solid';
        box.style.borderColor = config.colors.boundingBoxBorderColor;
        box.style.background = config.colors.boundingBoxColor;
        box.style.pointerEvents = 'none';
        box.style.userSelect = 'none';
        document.body.appendChild(box);
        return box;
    }
    private removeSelectionBox(): void {
        const box = document.getElementById('selection-box');
        if (box) box.remove();
    }
    private selectRectanglesWithin(): void {
        const selectedBlocks: BlockSelection[] = [];
        let { x, y, width, height } = this.getBoundingBox();

        // need to adjust coordinates, to be in canvas
        y -= this.canvasOffset
        // adjust for scrolling
        y -= dynamicContainer.y;

        // calculate tracks to check --> only check tracks that could contain selection
        const startTrack = Math.floor(y / config.trackHeight);
        const endTrack = Math.floor((y+height)/config.trackHeight);
        for (let trackId = startTrack; trackId <= endTrack; trackId++) {
            const blocks = store.state.blocks[trackId];
            if (!blocks) continue;
            blocks.forEach((block: BlockDTO, index: number) => {
                if ((block.rect.x + block.rect.width) >= x && block.rect.x <= (x + width) && block.rect.y <= (y + height) && block.rect.y + block.rect.height >= y) {
                    const selection: BlockSelection = {trackId: trackId, index: index, uid: block.rect.uid};
                    selectedBlocks.push(selection);
                }
            });
        }
        this.handleSelection(selectedBlocks);
    }
    private getBoundingBox() {
        const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const width = Math.abs(this.selectionStart.x - this.selectionEnd.x);
        const height = Math.abs(this.selectionStart.y - this.selectionEnd.y);
        return { x, y, width, height };
    }

    //******* edit-mode *******
    private handleEditMode(isEditable: boolean): void {
        if (!store.state.isEditable) {
            // disable handles, if selected, remove selection
            this.forEachBlock((block: BlockDTO): void => {
                this.updateHandleInteractivity(block, false);
                if (this.isBlockSelected(block)) {
                    this.updateIndicatorVisibility(block, false);
                    block.strokedRect.visible = false;
                }
                block.rect.interactive = false;
            });

            this.renderedGroupBorders.forEach((borderData: GroupBorderData, groupId: number): void => {
                this.clearGroupBorder(groupId);
            });
            this.clearSelectionBorder();
            store.dispatch('clearSelection');
            this.strgDown = false;
        } else {
            // enable handles
            this.forEachBlock((block: BlockDTO): void => {
                this.updateHandleInteractivity(block, true);
                block.rect.interactive = true;
            });
        }
    }
}