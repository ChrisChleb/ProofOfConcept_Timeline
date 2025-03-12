<script lang="ts">
import {defineComponent, onBeforeUnmount} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import config from "@/config";
export default defineComponent({
  name: "Track",
  props: {
    trackId: {
      type: Number,
    },
  },
  setup(props: any) {
    const store: any = useStore();
    const trackContainer: Pixi.Container = new Pixi.Container();
    trackContainer.height = config.trackHeight;
    trackContainer.width = pixiApp.canvas.width;
    trackContainer.y = config.sliderHeight + config.componentPadding + props.trackId * config.trackHeight;
    trackContainer.x = config.leftPadding;
    trackContainer.zIndex = -1;

    const trackLine = new Pixi.Graphics();
    trackLine.rect(0, config.trackHeight / 2, pixiApp.canvas.width, 2);
    trackLine.fill(config.colors.trackLineColor);
    trackContainer.addChild(trackLine);

    const trackLabel = new Pixi.Text();
    trackLabel.text = props.trackId;
    trackLabel.style.fontSize = 18;
    trackLabel.x = - (config.leftPadding / 2);
    trackLabel.y = (config.trackHeight / 2) - (trackLabel.height/2);
    trackContainer.addChild(trackLabel);

    dynamicContainer.addChild(trackContainer);
    
    onBeforeUnmount(() => {
      console.log("deleting track: ", props.trackId);
      store.dispatch('deleteBlocks', props.trackId);
      trackContainer.destroy({children: true});
    });
    
    window.addEventListener('resize', () => {
      trackLine.width = pixiApp.canvas.width;
    });
  },
})
</script>

<template>
</template>

<style scoped>

</style>