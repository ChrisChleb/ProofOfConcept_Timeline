import {createStore} from 'vuex';

const store = createStore({
    state: {
        zoomLevel: 1,
        viewportOffset: 0,
        gridLines: [] as number[]
    },
    mutations: {
        setZoomLevel(state: any, zoomLevel: number): void {
            state.zoomLevel = zoomLevel;
        },
        setViewportOffset(state: any, viewportOffset: number): void {
            state.viewportOffset = viewportOffset;
        },
        setGridLines(state: any, gridLines: []): void {
            state.gridLines = gridLines;
        }
    },
    actions: {
        updateZoomLevel({ commit }: any, newZoomLevel: number): void {
            commit('setZoomLevel', newZoomLevel);
        },
        updateViewportOffset({ commit }: any, newViewportOffset: number): void {
            commit('setViewportOffset', newViewportOffset);
        },
        updateGridLines({ commit }: any, newGridLines: []): void {
            commit('setGridLines', newGridLines);
        }
    },
    getters: {
        zoomLevel: (state: any) => state.zoomLevel,
        viewportOffset: (state: any) => state.viewportOffset,
        gridLines: (state: any) => state.gridLines
    }
});
export default store;