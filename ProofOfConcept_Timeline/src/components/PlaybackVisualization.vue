<script lang="ts">
import {defineComponent} from 'vue'
import {Instruction} from "@/parser/instructionParser";

export default defineComponent({
  name: "PlaybackVisualization",
  props: {
    currentInstruction: {
      type: Instruction,
      default: null,
    },
    currentTime: {
      type: Number,
      required: true
    },
    totalDuration: {
      type: Number,
      required: true
    }
  }
})
</script>

<template>
  <!--currentTime and totalDuration are in ms-->
  <p>Time: {{(currentTime/1000).toFixed(2)}} / {{(totalDuration/1000).toFixed(2)}} sec</p>
  <p>Current Instruction: {{currentInstruction ? currentInstruction : "No Instruction"}}</p>
</template>

<style scoped>
  p {
    user-select: none;
  }
</style>