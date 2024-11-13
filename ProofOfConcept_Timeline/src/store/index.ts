import {createStore} from 'vuex';

const store = createStore({
    state: {
        zoomLevel: 1,
        viewportOffset: 0
    },
    mutations: {
        setZoomLevel(state: any, zoomLevel: number): void {
            state.zoomLevel = zoomLevel;
        },
        setViewportOffset(state: any, viewportOffset: number): void {
            state.viewportOffset = viewportOffset;
        }
    },
    actions: {
        updateZoomLevel({ commit }: any, newZoomLevel: number): void {
            commit('setZoomLevel', newZoomLevel);
        },
        updateViewportOffset({ commit }: any, newViewportOffset: number): void {
            commit('setViewportOffset', newViewportOffset);
        }
    },
    getters: {
        zoomLevel: (state: any) => state.zoomLevel,
        viewportOffset: (state: any) => state.viewportOffset
    }
});
export default store;