<script lang="ts">
import {defineComponent, watch} from 'vue'
import * as Pixi from "pixi.js";

import pixiApp from "@/pixi/pixiApp";
import config from "@/config";
import {useStore} from "vuex";
export default defineComponent({
  name: "PlaybackIndicator",
  props: {
    trackCount: {
      type: Number,
      required: false
    },
    currentTime: {
      type: Number,
      required: true
    },
    totalDuration: {
      type: Number,
      required: true
    }
  },
  setup(props: any) {    
    const store = useStore();
    const playbackIndicator = new Pixi.Graphics();
    
    renderIndicator();
    watch(
        [() => props.currentTime, () => store.state.viewportOffset, () => store.state.sliderOffset],
        ([time, viewportOffset, sliderOffset]) => {
          const x = ((time / 1000) * (config.pixelsPerSecond * store.state.zoomLevel));
          playbackIndicator.x = x - viewportOffset - sliderOffset;
        }
    );    
    function renderIndicator() {
      playbackIndicator.clear();      
      playbackIndicator.moveTo(config.leftPadding, config.sliderHeight + config.componentPadding);
      playbackIndicator.lineTo(config.leftPadding, config.trackHeight * props.trackCount + config.sliderHeight + config.componentPadding);
      playbackIndicator.stroke({width: 4, color: 'rgba(13,148,1,0.5)'})
      playbackIndicator._zIndex = 1;
      pixiApp.stage.addChild(playbackIndicator);
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