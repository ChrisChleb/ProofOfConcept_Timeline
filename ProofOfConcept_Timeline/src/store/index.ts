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
        initialVirtualViewportWidth: 0,
        currentVirtualViewportWidth: 0,
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
        setInitialVirtualViewportWidth(state: any, newWidth: number): void {
            state.initialVirtualViewportWidth = newWidth;
        },
        setCurrentVirtualViewportWidth(state: any, newWidth: number): void {
            state.currentVirtualViewportWidth = newWidth;
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
    },
    getters: {
        zoomLevel: (state: any) => state.zoomLevel,
        viewportOffset: (state: any) => state.viewportOffset,
        sliderOffset: (state: any) => state.sliderOffset,
        gridLines: (state: any) => state.gridLines,
        tactons: (state: any) => state.tactons,
        initialVirtualViewportWidth: (state: any) => state.initialVirtualViewportWidth,
        currentVirtualViewportWidth: (state: any) => state.currentVirtualViewportWidth,
        sorted: (state: any) => state.sorted
    }
});
export default store;