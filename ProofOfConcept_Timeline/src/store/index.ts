import {createStore} from 'vuex';
import {BlockDTO} from "@/components/Track.vue";
import pixiApp from "@/pixi/pixiApp";
import * as Pixi from "pixi.js";
import config from "@/config";
import type {TactonRectangle} from "@/parser/instructionParser";


export class BlockChanges {
    x: number | null = null;
    width: number | null = null;
    height: number | null = null;
    track: number | null = null;
}

export interface BlockSelection {
    trackId: number;
    index: number;
    //uid: number;
}

interface UpdateValidationData {
    maxTrackId: number;
    minTrackId: number;
}

const store = createStore({
    state: {
        zoomLevel: 1,
        sliderOffset: 0,
        viewportOffset: 0,
        gridLines: [] as number[],
        trackCount: 0,
        sorted: {} as Record<number, boolean>,
        blocks: {} as Record<number, BlockDTO[]>,
        lastBlockPositionX: 0,
        selectedBlocks: [] as BlockSelection[],
        updateValidationData: {} as UpdateValidationData,
        initialVirtualViewportWidth: 0,
        currentVirtualViewportWidth: 0,
        isInteracting: false,
        isPressingShift: false
    },
    mutations: {
        setZoomLevel(state: any, zoomLevel: number): void {
            state.zoomLevel = zoomLevel;
        },
        setViewportOffset(state: any, viewportOffset: number): void {
            state.viewportOffset = viewportOffset;
        },
        setSliderOffset(state: any, newSliderOffset: number): void {
          state.sliderOffset = newSliderOffset;  
        },
        setGridLines(state: any, gridLines: []): void {
            state.gridLines = gridLines;
        },
        setTrackCount(state: any, newTrackCount: number): void {
            state.trackCount = newTrackCount;
        },
        addBlock(state: any, {trackId, block}: {trackId: number, block: BlockDTO}): void {
            if (!state.blocks[trackId]) {
                state.blocks[trackId] = [];
                state.sorted[trackId] = false;
            }
            state.blocks[trackId].push(block);
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
            
            state.blocks = sortedTactons;
        },
        deleteTactons(state: any, trackId: number): void {
            if (state.blocks[trackId] == undefined) return;
            state.blocks[trackId].forEach((dto: BlockDTO): void => {
                pixiApp.stage.removeChild(dto.container);
                dto.container.children.forEach((child: Pixi.ContainerChild): void => {
                    child.removeAllListeners();
                });
                dto.container.removeAllListeners();
                dto.container.destroy({children: true});
            });

            delete state.blocks[trackId];
        },
        selectBlock(state: any, block: BlockSelection): void {
            state.selectedBlocks.push(block);
            state.blocks[block.trackId][block.index].strokedRect.visible = true;
            
            // store data for validation
            const { minTrackId, maxTrackId } = state.selectedBlocks.reduce((acc, block: BlockSelection) => {
                acc.minTrackId = Math.min(acc.minTrackId, block.trackId);
                acc.maxTrackId = Math.max(acc.maxTrackId, block.trackId);
                return acc;
            }, { minTrackId: Infinity, maxTrackId: -Infinity });
            
            state.updateValidationData.minTrackId = minTrackId;
            state.updateValidationData.maxTrackId = maxTrackId;
        },
        unselectBlock(state: any, block: BlockSelection): void {
          const index: number = state.selectedBlocks.findIndex((selectedBlock: BlockSelection) => selectedBlock.trackId == block.trackId && selectedBlock.index == block.index);
          if (index != -1) {
              state.selectedBlocks.splice(index, 1);
              state.blocks[block.trackId][block.index].strokedRect.visible = false;

              // store data for validation
              const { minTrackId, maxTrackId } = state.selectedBlocks.reduce((acc, block: BlockSelection) => {
                  acc.minTrackId = Math.min(acc.minTrackId, block.trackId);
                  acc.maxTrackId = Math.max(acc.maxTrackId, block.trackId);
                  return acc;
              }, { minTrackId: Infinity, maxTrackId: -Infinity });

              state.updateValidationData.minTrackId = minTrackId;
              state.updateValidationData.maxTrackId = maxTrackId;
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
        updateSelectedBlocks(state: any, changes: BlockChanges): void {
            state.selectedBlocks.forEach((block: BlockSelection) => {
                const dto = store.state.blocks[block.trackId][block.index];
                let isWidthClipped: boolean = false;

                // apply Changes              
                if (changes.height) {
                    const newHeight: number = Math.min(Math.max((dto.rect.height + changes.height), 10), 150);
                    dto.rect.height = newHeight;
                    const trackOffset: number = ((dto.initTrackId - dto.trackId) * config.trackHeight);
                    const newY: number = (config.trackHeight / 2) - (newHeight / 2);
                    dto.rect.y = newY - trackOffset;

                    // this could happen only once after resizing
                    dto.initY = dto.rect.y;
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
                    dto.initWidth = dto.rect.width / state.zoomLevel;
                }

                if (changes.x !) {
                    if (isWidthClipped && changes.width) return;
                    dto.rect.x += changes.x;
                    dto.initX = (dto.rect.x + state.viewportOffset + state.sliderOffset) / state.zoomLevel;
                    
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
        updateSelectedBlockHandles(state: any): void {
            state.selectedBlocks.forEach((block: BlockSelection): void => {
                const dto = state.blocks[block.trackId][block.index];
                
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
            });
        },
        changeBlockTrack(state: any, {sourceTrack, targetTrack, blockIndex}: {sourceTrack: number, targetTrack: number, blockIndex: number}): void {          
            if (targetTrack == sourceTrack) {
                console.log("Source- and TargetTrack are identical");
                return;
            }
            
            if (!state.blocks[targetTrack]) {
                console.log("targetTrack is undefined");
                if (targetTrack <= state.trackCount) {
                    state.blocks[targetTrack] = [];
                }
            }
            
            const prevTrackLength: number = state.blocks[sourceTrack].length - 1;
            const [block] = state.blocks[sourceTrack].splice(blockIndex, 1);
            if (!block) {
                console.error("Block not found: ", sourceTrack, " | ", blockIndex);
                return;
            }

            // problem: newIndex might be wrong, if later a block is removed from that trackId
            // 1. Solution, always start with first block in move-direction
            // 2. Solution, update if spliced block is not the last of track --> this is implemented, but maybe 1. Solution would have better performance?
            
            // fix faulty indices if removed block was not last of track
            if (prevTrackLength != blockIndex)  {
                const faultySelection = state.selectedBlocks.filter((block: BlockSelection) => {return block.trackId == sourceTrack && block.index > blockIndex});
                faultySelection.forEach((block: BlockSelection): void => {
                   block.index -= 1; 
                });
            }
                        
            block.initY = block.rect.y;
            
            const newIndex: number = state.blocks[targetTrack].push(block);
            block.trackId = targetTrack;
            state.sorted[sourceTrack] = false;
            state.sorted[targetTrack] = false;
                        
            const selectionIndex = state.selectedBlocks.findIndex((block: BlockSelection) => {return block.trackId == sourceTrack && block.index == blockIndex});
            state.selectedBlocks[selectionIndex].trackId = targetTrack;
            state.selectedBlocks[selectionIndex].index = newIndex - 1;
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
                    state.sorted[trackId] = true;
                }
            });

            let maxPosition: number = 0;

            Object.values(sortedTacton).forEach((channelData: any) => {
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
        }
    },
    actions: {
        updateZoomLevel({ commit }: any, newZoomLevel: number): void {
            commit('setZoomLevel', newZoomLevel);
        },
        updateViewportOffset({ commit }: any, newViewportOffset: number): void {
            commit('setViewportOffset', newViewportOffset);
        },
        updateSliderOffset({ commit }: any, newSliderOffset: number): void {
          commit('setSliderOffset', newSliderOffset);  
        },
        updateGridLines({ commit }: any, newGridLines: []): void {
            commit('setGridLines', newGridLines);
        },
        setTrackCount( { commit }: any, newTrackCount: number): void {
          commit('setTrackCount', newTrackCount);  
        },
        addBlock({ commit }: any, {trackId, block}: {trackId: number, block: TactonRectangle}): void {
            commit('addBlock', {trackId, block});  
        },
        sortTactons({ commit }: any): void {
            commit('sortTactons');
        },
        deleteTactons({ commit }: any, trackId: number): void {
            commit('deleteTactons', trackId);
        },
        updateInitialVirtualViewportWidth({ commit }: any, newWidth: number): void {
            commit('setInitialVirtualViewportWidth', newWidth);
        },
        updateCurrentVirtualViewportWidth({ commit }: any, newWidth: number): void {
            commit('setCurrentVirtualViewportWidth', newWidth);
        },
        onSelectBlocks({ commit }: any, selectedBlocks: BlockSelection[]): void {            
            commit('clearSelection');
            selectedBlocks.forEach((block: BlockSelection): void => {                
                commit('selectBlock', block);
            });
        },
        setInteractionState({ commit }: any, newState: boolean): void {
            commit('setInteractionState', newState);
        },
        selectBlock({ state, commit }: any, {uid, trackId}: {uid: number, trackId: number}): void {            
            const index: number = state.blocks[trackId].findIndex((block: BlockDTO): boolean => block.rect.uid === uid);
            if (index !== -1) {
                const selectionIndex = state.selectedBlocks.findIndex((block: BlockSelection) => block.trackId === trackId && block.index === index);
                const block: BlockSelection = {trackId: trackId, index: index};
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
        applyChangesToSelectedBlocks({ state, commit }: any, changes: BlockChanges): void {
            // validation
            if (changes.track) {              
                const minTrackId = state.updateValidationData.minTrackId;
                const maxTrackId = state.updateValidationData.maxTrackId;
                if (minTrackId + changes.track < 0) {
                    changes.track = changes.track - (minTrackId + changes.track);
                }
                if (maxTrackId + changes.track > state.trackCount) {
                    changes.track = changes.track + (state.trackCount - (maxTrackId + changes.track));
                }
            }            
            commit("updateSelectedBlocks", changes);         
        },
        updateSelectedBlockHandles({ commit }: any): void {
            commit("updateSelectedBlockHandles");
        },
        changeBlockTrack({ state, commit }: any, trackChange: number): void {
            // validation
            const minTrackId = state.updateValidationData.minTrackId;
            const maxTrackId = state.updateValidationData.maxTrackId;
            if (minTrackId + trackChange < 0) {
                trackChange = trackChange - (minTrackId + trackChange);
            }            
            if (maxTrackId + trackChange > state.trackCount) {
                trackChange = trackChange + (state.trackCount - (maxTrackId + trackChange));
            }
            
            // store data for validation
            state.updateValidationData.minTrackId = minTrackId + trackChange;
            state.updateValidationData.maxTrackId = maxTrackId + trackChange;
            
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
        }
    },
    getters: {
        zoomLevel: (state: any) => state.zoomLevel,
        viewportOffset: (state: any) => state.viewportOffset,
        sliderOffset: (state: any) => state.sliderOffset,
        gridLines: (state: any) => state.gridLines,
        trackCount: (state: any) => state.trackCount,
        blocks: (state: any) => state.blocks,
        initialVirtualViewportWidth: (state: any) => state.initialVirtualViewportWidth,
        currentVirtualViewportWidth: (state: any) => state.currentVirtualViewportWidth,
        sorted: (state: any) => state.sorted,
        selectedBlocks: (state: any) => state.selectedBlocks,
        isInteracting: (state: any) => state.isInteracting,
        isPressingShift: (state: any) => state.isPressingShift
    }
});
export default store;