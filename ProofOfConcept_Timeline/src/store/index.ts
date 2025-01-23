import {createStore} from 'vuex';
import type {TactonDTO} from "@/components/Track.vue";
import pixiApp from "@/pixi/pixiApp";
import * as Pixi from "pixi.js";

const store = createStore({
    state: {
        zoomLevel: 1,
        sliderOffset: 0,
        viewportOffset: 0,
        gridLines: [] as number[],  
        sorted: {} as Record<number, boolean>,
        tactons: {} as Record<number, TactonDTO[]>,
        selectedBlocks: [] as {trackNum: number, index: number}[], 
        initialVirtualViewportWidth: 0,
        currentVirtualViewportWidth: 0,
        isInteracting: false
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
        addTacton(state: any, {trackId, newTacton}: {trackId: number, newTacton: TactonDTO}): void {
            if (!state.tactons[trackId]) {
                state.tactons[trackId] = [];
                state.sorted[trackId] = false;
            }
            state.tactons[trackId].push(newTacton);
        },
        sortTactons(state: any): void {
            const sortedTactons: Record<number, TactonDTO[]> = {};                        
            Object.keys(state.tactons).forEach((channel: string, trackId: number): void => {                
                if (state.sorted[trackId]) {
                    sortedTactons[trackId] = state.tactons[trackId];
                } else {
                    sortedTactons[trackId] = [...state.tactons[trackId]].sort((a: TactonDTO, b: TactonDTO): number => {
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
            
            state.tactons = sortedTactons;
        },
        deleteTactons(state: any, trackId: number): void {
            if (state.tactons[trackId] == undefined) return;
            state.tactons[trackId].forEach((dto: TactonDTO): void => {
                pixiApp.stage.removeChild(dto.container);
                dto.container.children.forEach((child: Pixi.ContainerChild): void => {
                    child.removeAllListeners();
                });
                dto.container.removeAllListeners();
                dto.container.destroy({children: true});
            });

            delete state.tactons[trackId];
        },
        selectBlock(state: any, {trackNum, index}: {trackNum: number, index: number}): void {
            state.selectedBlocks.push({trackNum, index})
        },
        clearSelection(state: any): void {
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
        addTacton({ commit }: any, {trackId, newTacton}: {trackId: number, newTacton: TactonDTO}): void {
            commit('addTacton', {trackId, newTacton});         
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
        onSelectBlocks({ commit }: any, selectedBlocks: {trackNum: number, index: number}[]): void {
            commit('clearSelection');
            selectedBlocks.forEach((block: {trackNum: number, index: number}): void => {                
                commit('selectBlock', {trackNum: block.trackNum, index: block.index});
            });
        },
        setInteractionState({ commit }: any, newState: boolean): void {
            commit('setInteractionState', newState);
        }
    },
    getters: {
        zoomLevel: (state: any) => state.zoomLevel,
        viewportOffset: (state: any) => state.viewportOffset,
        sliderOffset: (state: any) => state.sliderOffset,
        gridLines: (state: any) => state.gridLines,
        tactons: (state: any) => state.tactons,
        initialVirtualViewportWidth: (state: any) => state.initialVirtualViewportWidth,
        currentVirtualViewportWidth: (state: any) => state.currentVirtualViewportWidth,
        sorted: (state: any) => state.sorted,
        selectedBlocks: (state: any) => state.selectedBlocks,
        isInteracting: (state: any) => state.isInteracting
    }
});
export default store;

// TODO
/*
* change tacton track, when moving between tracks
* */