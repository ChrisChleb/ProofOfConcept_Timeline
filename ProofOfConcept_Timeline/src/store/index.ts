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
        groups: new Map<number, BlockSelection[]>(),
        lastBlockPositionX: 0,
        selectedBlocks: [] as BlockSelection[],
        initialVirtualViewportWidth: 0,
        currentVirtualViewportWidth: 0,
        isInteracting: false,
        isPressingShift: false,
        blockManager: null as BlockManager | null,
        currentCursorPosition: {x: 0, y: 0},
        isSnappingActive: false,
        isEditable: false
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
            
            // fix groupData            
            state.groups.forEach((group: BlockSelection[]): void => {
               group.forEach((selection: BlockSelection): void => {
                  const block: BlockDTO | undefined = sortedTactons[selection.trackId][selection.index];
                   if (block == undefined || block.rect.uid != selection.uid) {
                       selection.index = sortedTactons[selection.trackId].findIndex((b: BlockDTO): boolean => {
                           return b.rect.uid == selection.uid;
                       });
                   }
               }); 
            });            
            state.blocks = sortedTactons;
        },
        deleteSelectedBlocks(state: any): void {
            state.selectedBlocks.sort((a: BlockSelection, b: BlockSelection): number => {
                if (a.trackId !== b.trackId) {
                    return a.trackId - b.trackId;
                }
                return b.index - a.index; 
            });
            
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
        },
        unselectBlock(state: any, selectionIndex: number): void {
            state.selectedBlocks.splice(selectionIndex, 1);
        },
        clearSelection(state: any): void {
            state.selectedBlocks = [];
            return;
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
        },
        ungroupSelectedBlocks(state: any, groupId: number): void {
            state.groups.delete(groupId);
        },
        addGroup(state: any, groupData: {groupId: number, selection: BlockSelection[]}): void {
            state.groups.set(groupData.groupId, groupData.selection);
        },
        toggleSnappingState(state: any): void {
            state.isSnappingActive = !state.isSnappingActive;
        },
        toggleEditState(state: any, isEditable: boolean): void {
            state.isEditable = isEditable;
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
              Object.keys(state.blocks).forEach((trackIdAsString: string, trackId: number) => {
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
        setInteractionState({ commit }: any, newState: boolean): void {
            commit('setInteractionState', newState);
        },
        selectBlock({ commit }: any, selection: BlockSelection): void {
            // add block to selection
            commit('selectBlock', selection);
        },
        unselectBlock({ commit }: any, selectionIndex: number): void {
            commit('unselectBlock', selectionIndex);
        },
        clearSelection({ commit }: any): void {
          commit('clearSelection');
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
        addGroup({ commit }: any, groupData: {groupId: number, selection: BlockSelection[]}): void {
            commit('addGroup', groupData);
        },
        toggleSnappingState({ commit }: any): void {
            commit('toggleSnappingState');
        },
        toggleEditState({ commit }: any, isEditable: boolean): void {
            commit('toggleEditState', isEditable);
        }
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
        currentCursorPosition: (state: any) => state.currentCursorPosition,
        isSnappingActive: (state: any) => state.isSnappingActive,
        isEditable: (state: any) => state.isEditable
    }
});
export default store;