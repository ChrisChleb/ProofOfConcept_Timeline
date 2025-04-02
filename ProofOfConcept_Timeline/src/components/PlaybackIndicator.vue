<script lang="ts">
import {defineComponent, watch} from 'vue'
import * as Pixi from "pixi.js";

import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import config from "@/config";
import {useStore} from "vuex";
export default defineComponent({
  name: "PlaybackIndicator",
  props: {
    currentTime: {
      type: Number,
      required: true
    },
    totalDuration: {
      type: Number,
      required: true
    },
    isPlaybackActive: {
      type: Boolean,
      required: true
    }
  },
  setup(props: any) {    
    const store = useStore();
    const playbackIndicator = new Pixi.Graphics();
    dynamicContainer.addChild(playbackIndicator);
    let isSliderFollowing = false;
    renderIndicator();
    
    watch(() => store.state.lastBlockPositionX, () => {
      const isLastBlockOutOfViewport = store.state.lastBlockPositionX > pixiApp.canvas.width;
      // new refers to the playback-viewport, where horizontalViewportOffset is set to 0
      const isLastBlockOutOfNewViewport = (store.state.lastBlockPositionX + store.state.horizontalViewportOffset) > pixiApp.canvas.width;
      isSliderFollowing =  isLastBlockOutOfViewport || (store.state.horizontalViewportOffset != 0 && isLastBlockOutOfNewViewport);
    });
    
    watch(() => store.state.trackCount, () => {
      renderIndicator();
    });
    
    // move playbackIndicator while playback is active
    watch(() => props.currentTime, (currentTime: number) => {
      if (props.isPlaybackActive) {
        const x = ((currentTime / 1000) * (config.pixelsPerSecond * store.state.zoomLevel));
        const isIndicatorAtViewportCenter = (x + config.leftPadding) >= (pixiApp.canvas.width/2);
        if (isIndicatorAtViewportCenter && isSliderFollowing) {
          store.dispatch('updateHorizontalViewportOffset', (x + config.leftPadding) - (pixiApp.canvas.width/2));
          playbackIndicator.x = x - store.state.horizontalViewportOffset;
        } else {
          playbackIndicator.x = x;
        }
      }
    });
    
    // update playbackIndicator when playback is not active and offset is changed
    watch(() => store.state.horizontalViewportOffset, () => {
      if (!props.isPlaybackActive) {
        playbackIndicator.x = -store.state.horizontalViewportOffset;
      }
    });
    
    // reset playbackIndicator when playback is toggled
    watch(() => props.isPlaybackActive, () => {
      if (!props.isPlaybackActive) {
        playbackIndicator.x = -store.state.horizontalViewportOffset;
      }
    });
    function renderIndicator() {
      playbackIndicator.clear();      
      playbackIndicator.moveTo(config.leftPadding, config.sliderHeight + config.componentPadding);
      playbackIndicator.lineTo(config.leftPadding, config.trackHeight * (store.state.trackCount + 1) + config.sliderHeight + config.componentPadding);
      playbackIndicator.stroke({width: 4, color: 'rgba(13,148,1,0.5)'})
      playbackIndicator._zIndex = 1;
    }
    
    return {
      renderIndicator
    }
  },
  watch: {
    trackCount: 'renderIndicator'
  }
})
</script>

<template>
  
</template>

<style scoped>

</style>