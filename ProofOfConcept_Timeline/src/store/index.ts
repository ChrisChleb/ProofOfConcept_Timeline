import {createStore} from 'vuex';
import {dynamicContainer} from "@/pixi/pixiApp";
import * as Pixi from "pixi.js";
import config from "@/config";
import type {BlockData} from "@/parser/instructionParser";
import {type BlockDTO, BlockManager} from "@/helper/blockManager";
export class BlockChanges {
    x: number | null = null;
    width: number | null = null;
    height: number | null = null;
    track: number | null = null;
}

export interface BlockSelection {
    trackId: number;
    index: number;
    uid: number;
}

const store = createStore({
    state: {
        zoomLevel: 1,
        initialZoomLevel: 1,
        horizontalViewportOffset: 0,
        verticalViewportOffset: 0,
        gridLines: [] as number[],
        trackCount: 0,
        scrollableHeight: 0,
        visibleHeight: 0,
        sorted: {} as Record<number, boolean>,
        blocks: {} as Record<number, BlockDTO[]>,
        lastBlockPositionX: 0,
        selectedBlocks: [] as BlockSelection[],
        initialVirtualViewportWidth: 0,
        currentVirtualViewportWidth: 0,
        isInteracting: false,
        isPressingShift: false,
        blockManager: null as BlockManager | null,
        currentCursorPosition: {x: 0, y: 0}
    },
    mutations: {
        setBlockManager(state: any, manager: BlockManager): void {
          if (state.blockManager == null) {
              state.blockManager = manager;
          }  
        },
        setZoomLevel(state: any, zoomLevel: number): void {
            state.zoomLevel = zoomLevel;
        },
        setInitialZoomLevel(state: any, newInitialZoomLevel: number): void {
          state.initialZoomLevel = newInitialZoomLevel;  
        },
        setHorizontalViewportOffset(state: any, viewportOffset: number): void {
            state.horizontalViewportOffset = viewportOffset;
        },
        setVerticalViewportOffset(state: any, viewportOffset: number): void {
            state.verticalViewportOffset = viewportOffset;
        },
        setGridLines(state: any, gridLines: []): void {
            state.gridLines = gridLines;
        },
        setTrackCount(state: any, newTrackCount: number): void {
            state.trackCount = newTrackCount;
        },
        setVisibleHeight(state: any, visibleHeight: number): void {
            state.visibleHeight = visibleHeight;
            console.log('visibleHeight', visibleHeight);
        },
        calculateScrollableHeight(state: any): void {
            const trackHeight: number = (state.trackCount + 1) * config.trackHeight;
            state.scrollableHeight = trackHeight > state.visibleHeight ? (trackHeight - state.visibleHeight) + config.componentPadding : 0;
            console.log('scrollableHeight', state.scrollableHeight);  
        },
        initTracks(state: any): void {          
          for (let trackId: number = 0; trackId <= state.trackCount; trackId++) {
              if (!state.blocks[trackId]) {
                  state.blocks[trackId] = [];
              }
          }
        },
        addBlock(state: any, {trackId, block}: {trackId: number, block: BlockDTO}): void {
            if (state.blocks[trackId] == undefined) {
                state.blocks[trackId] = [];
            }
            state.blocks[trackId].push(block);
            state.sorted[trackId] = false;
        },
        updateSelectedBlocks(state: any, changes: BlockChanges): void {
            state.selectedBlocks.forEach((block: BlockSelection) => {
                const dto = store.state.blocks[block.trackId][block.index];
                let isWidthClipped: boolean = false;

                // apply Changes              
                if (changes.height) {
                    const newHeight: number = Math.min(Math.max((dto.rect.height + changes.height), 10), 150);
                    dto.rect.height = newHeight;
                    const trackOffset: number = config.sliderHeight + config.componentPadding + (dto.trackId * config.trackHeight);
                    const newY: number = (config.trackHeight / 2) - (newHeight / 2);
                    dto.rect.y = newY + trackOffset;
                }

                if (changes.track != null) {
                    const trackContainerY: number =  (dto.trackId  * config.trackHeight);
                    const newTrackContainerY: number = ((dto.trackId + changes.track) * config.trackHeight);
                    dto.rect.y = (newTrackContainerY - trackContainerY) + dto.initY;
                }

                if (changes.width != null) {
                    dto.rect.width = Math.max((dto.rect.width + changes.width), config.minTactonWidth);
                    if (dto.rect.width == config.minTactonWidth) {
                        isWidthClipped = true;
                    }
                }

                if (changes.x !) {
                    if (isWidthClipped && changes.width) return;
                    dto.rect.x += changes.x;

                    // mark track as unsorted
                    state.sorted[dto.trackId] = false;
                }

                // update stroke
                dto.strokedRect.x = dto.rect.x;
                dto.strokedRect.width = dto.rect.width;
                dto.strokedRect.y = dto.rect.y;
                dto.strokedRect.height = dto.rect.height;
            });
        },
        sortTactons(state: any): void {
            const sortedTactons: Record<number, BlockDTO[]> = {};
            Object.keys(state.blocks).forEach((channel: string, trackId: number): void => {                
                if (state.sorted[trackId]) {
                    sortedTactons[trackId] = state.blocks[trackId];
                } else {
                    sortedTactons[trackId] = [...state.blocks[trackId]].sort((a: BlockDTO, b: BlockDTO): number => {
                        const rectA: Pixi.Graphics = a.rect;
                        const rectB: Pixi.Graphics = b.rect;
                        if (rectA.x === rectB.x) {
                            return rectB.width - rectA.width;
                        }
                        return rectA.x - b.rect.x;
                    });
                    state.sorted[trackId] = true;
                }
            });
            
            // fix selectionData
            state.selectedBlocks.forEach((selection: BlockSelection): void => {
                const block: BlockDTO | undefined = sortedTactons[selection.trackId][selection.index];
                if (block == undefined || block.rect.uid != selection.uid) {
                    selection.index = sortedTactons[selection.trackId].findIndex((b: BlockDTO): boolean => {
                        return b.rect.uid == selection.uid;
                    });
                }
            });
            
            state.blocks = sortedTactons;
        },
        deleteSelectedBlocks(state: any): void {
            state.selectedBlocks.forEach((blockSelection: BlockSelection) => {
                const block = state.blocks[blockSelection.trackId][blockSelection.index];
                dynamicContainer.removeChild(block.container);
                block.container.children.forEach((child: Pixi.ContainerChild): void => {
                    child.removeAllListeners();
                });
                block.container.removeAllListeners();
                block.container.destroy({children: true});
                
                state.blocks[blockSelection.trackId].splice(blockSelection.index, 1);
                state.sorted[blockSelection.trackId] = false;
            });
            state.selectedBlocks = [];
        },
        deleteBlocksOfTrack(state: any, trackId: number): void {
            if (state.blocks[trackId] == undefined) return;
            state.blocks[trackId].forEach((block: BlockDTO): void => {
                dynamicContainer.removeChild(block.container);
                block.container.children.forEach((child: Pixi.ContainerChild): void => {
                    child.removeAllListeners();
                });
                block.container.removeAllListeners();
                block.container.destroy({children: true});
            });

            delete state.blocks[trackId];
            
            // remove from selection
            for (let i: number = state.selectedBlocks.length - 1; i >= 0; i--) {
                if (state.selectedBlocks[i].trackId == trackId) {
                    state.selectedBlocks.splice(i, 1);
                }
            }
        },
        selectBlock(state: any, block: BlockSelection): void {
            state.selectedBlocks.push(block);
            state.blocks[block.trackId][block.index].strokedRect.visible = true;
        },
        unselectBlock(state: any, block: BlockSelection): void {
          const index: number = state.selectedBlocks.findIndex((selectedBlock: BlockSelection) => selectedBlock.trackId == block.trackId && selectedBlock.index == block.index);
          if (index != -1) {
              state.selectedBlocks.splice(index, 1);
              state.blocks[block.trackId][block.index].strokedRect.visible = false;
          }
        },
        clearSelection(state: any): void {
          state.selectedBlocks.forEach((block: BlockSelection): void => {
              state.blocks[block.trackId][block.index].strokedRect.visible = false;
          });
          state.selectedBlocks = [];
        },
        setInitialVirtualViewportWidth(state: any, newWidth: number): void {
            state.initialVirtualViewportWidth = newWidth;
        },
        setCurrentVirtualViewportWidth(state: any, newWidth: number): void {
            state.currentVirtualViewportWidth = newWidth;
        },
        setInteractionState(state: any, newState: boolean): void {
            state.isInteracting = newState;
        },
        changeBlockTrack(state: any, {sourceTrack, targetTrack, blockIndex}: {sourceTrack: number, targetTrack: number, blockIndex: number}): void {
            if (targetTrack == sourceTrack) {
                console.log("Source- and TargetTrack are identical");
                return;
            }
            
            const prevTrackLength: number = state.blocks[sourceTrack].length - 1;
            const [block] = state.blocks[sourceTrack].splice(blockIndex, 1);
            if (!block) {
                console.error("Block not found: ", sourceTrack, " | ", blockIndex);
                return;
            }
            
            // fix faulty indices if removed block was not last of track
            if (prevTrackLength != blockIndex)  {
                const faultySelection = state.selectedBlocks.filter((block: BlockSelection) => {return block.trackId == sourceTrack && block.index > blockIndex});
                faultySelection.forEach((block: BlockSelection): void => {
                   block.index -= 1; 
                });
            }
                        
            block.initY = block.rect.y;
            
            state.blocks[targetTrack].push(block);
            block.trackId = targetTrack;
            state.sorted[sourceTrack] = false;
            state.sorted[targetTrack] = false;
            
            // update selectionData
            const selectionIndex = state.selectedBlocks.findIndex((selection: BlockSelection): boolean => {return selection.uid == block.rect.uid});
            state.selectedBlocks[selectionIndex].trackId = targetTrack;
        },
        calculateLastBlockPosition(state: any): void {
            const sortedTacton: Record<number, BlockDTO[]> = {};
            Object.keys(state.blocks).forEach((channel: string, trackId: number): void => {
                if (state.sorted[trackId]) {
                    sortedTacton[trackId] = state.blocks[trackId];
                } else {
                    sortedTacton[trackId] = [...state.blocks[trackId]].sort((a: BlockDTO, b: BlockDTO): number => {
                        const rectA: Pixi.Graphics = a.rect;
                        const rectB: Pixi.Graphics = b.rect;
                        if (rectA.x === rectB.x) {
                            return rectB.width - rectA.width;
                        }
                        return rectA.x - b.rect.x;
                    });
                }
            });

            let maxPosition: number = 0;

            Object.values(sortedTacton).forEach((channelData: any): void => {
                if (channelData.length > 0) {
                    const trackLastTacton = channelData[channelData.length - 1];
                    const trackLastPosition = trackLastTacton.rect.x + trackLastTacton.rect.width;

                    if (trackLastPosition > maxPosition) {
                        maxPosition = trackLastPosition;
                    }
                }
            });
            
            state.lastBlockPositionX = maxPosition;
        },
        toggleShiftValue(state: any): void {
            state.isPressingShift = !state.isPressingShift;
        },
        setCurrentCursorPosition(state: any, newPosition: {x: number, y: number}): void {
            state.currentCursorPosition = newPosition;
        }
    },
    actions: {
        setBlockManager({ commit }: any, manager: BlockManager): void {
            commit('setBlockManager', manager);
        },
        updateZoomLevel({ commit }: any, newZoomLevel: number): void {
            commit('setZoomLevel', newZoomLevel);
        },
        updateInitialZoomLevel({ commit }: any, newInitialZoomLevel: number): void {
            commit('setInitialZoomLevel', newInitialZoomLevel);
        },
        updateHorizontalViewportOffset({ commit }: any, newOffset: number): void {
            commit('setHorizontalViewportOffset', newOffset);
        },
        updateVerticalViewportOffset({ commit }: any, newOffset: number): void {
            commit('setVerticalViewportOffset', newOffset);
        },
        updateGridLines({ commit }: any, newGridLines: []): void {
            commit('setGridLines', newGridLines);
        },
        setTrackCount( { commit }: any, newTrackCount: number): void {
            commit('setTrackCount', newTrackCount);
        },
        setVisibleHeight( { commit }: any, newVisibleHeight: number): void {
            commit('setVisibleHeight', newVisibleHeight);  
        },
        calculateScrollableHeight( { commit }: any): void {
            commit('calculateScrollableHeight');
        },
        initTracks({ commit }: any): void {
            commit('initTracks');
        },
        addBlock({ commit }: any, {trackId, block}: {trackId: number, block: BlockData}): void {
            commit('addBlock', {trackId, block});  
        },
        sortTactons({ commit }: any): void {
            commit('sortTactons');
        },
        deleteBlocksOfTrack({ commit }: any, trackId: number): void {
            commit('deleteBlocksOfTrack', trackId);
        },
        deleteAllBlocks({ state, commit }: any): void {
          if (state.blocks) {
              console.log("deleting all blocks");
              Object.keys(state.blocks).forEach((trackIdAsString: string, trackId: number) => {
                  console.log("deleting blocks of track ", trackId);
                  commit('deleteBlocksOfTrack', trackId);
              });
          }  
        },
        deleteSelectedBlocks({ commit }: any): void {
            commit('deleteSelectedBlocks');
        },
        updateInitialVirtualViewportWidth({ commit }: any, newWidth: number): void {
            commit('setInitialVirtualViewportWidth', newWidth);
        },
        updateCurrentVirtualViewportWidth({ commit }: any, newWidth: number): void {
            commit('setCurrentVirtualViewportWidth', newWidth);
        },
        onSelectBlocks({ state, commit }: any, selectedBlocks: BlockSelection[]): void {
            if (!state.isPressingShift) {
                commit('clearSelection');
            }          
            selectedBlocks.forEach((block: BlockSelection): void => {                
                commit('selectBlock', block);
            });
        },
        setInteractionState({ commit }: any, newState: boolean): void {
            commit('setInteractionState', newState);
        },
        selectBlock({ state, commit }: any, blockToSelect: BlockDTO): void {            
            const index: number = state.blocks[blockToSelect.trackId].findIndex((block: BlockDTO): boolean => block.rect.uid === blockToSelect.rect.uid);
            if (index !== -1) {
                const selectionIndex = state.selectedBlocks.findIndex((block: BlockSelection) => block.trackId === blockToSelect.trackId && block.index === index);
                const block: BlockSelection = {trackId: blockToSelect.trackId, index: index, uid: blockToSelect.rect.uid};
                if (selectionIndex == -1) {
                    // block is not selected
                    if (!state.isPressingShift) {
                        // clear selection
                        commit('clearSelection');
                    }
                    // add block to selection
                    commit('selectBlock', block);
                } else {
                    // block already selected
                    if (state.isPressingShift) {
                        // remove block from selection
                        commit('unselectBlock', block);
                    }
                }
            }      
        },
        clearSelection({ commit }: any): void {
          commit('clearSelection');
        },
        applyChangesToSelectedBlocks({ commit }: any, changes: BlockChanges): void {
            commit("updateSelectedBlocks", changes);         
        },
        changeBlockTrack({ state, commit }: any, trackChange: number): void {
            state.selectedBlocks.forEach((block: BlockSelection): void => {
                const targetTrack: number = block.trackId + trackChange;                
                commit("changeBlockTrack", {sourceTrack: block.trackId, targetTrack: targetTrack, blockIndex: block.index});
            });
        },
        getLastBlockPosition({ state, commit }: any): number {
            commit("calculateLastBlockPosition");
            return state.lastBlockPositionX;
        },
        toggleShiftValue({ commit }: any): void {
            commit("toggleShiftValue");
        },
        updateCurrentCursorPosition({ commit }: any, newPosition: {x: number, y: number}): void {
            commit('setCurrentCursorPosition', newPosition);
        },
    },
    getters: {
        blockManager: (state: any) => state.blockManager,
        zoomLevel: (state: any) => state.zoomLevel,
        initialZoomLevel: (state: any) => state.initialZoomLevel,
        horizontalViewportOffset: (state: any) => state.horizontalViewportOffset,
        verticalViewportOffset: (state: any) => state.verticalViewportOffset,
        gridLines: (state: any) => state.gridLines,
        trackCount: (state: any) => state.trackCount,
        scrollableHeight: (state: any) => state.scrollableHeight,
        blocks: (state: any) => state.blocks,
        initialVirtualViewportWidth: (state: any) => state.initialVirtualViewportWidth,
        currentVirtualViewportWidth: (state: any) => state.currentVirtualViewportWidth,
        sorted: (state: any) => state.sorted,
        selectedBlocks: (state: any) => state.selectedBlocks,
        isInteracting: (state: any) => state.isInteracting,
        isPressingShift: (state: any) => state.isPressingShift,
        currentCursorPosition: (state: any) => state.currentCursorPosition
    }
});
export default store;