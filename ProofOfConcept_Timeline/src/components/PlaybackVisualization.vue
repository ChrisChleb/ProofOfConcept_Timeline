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
  }
})
</script>

<template>
  <p>{{currentInstruction ? currentInstruction : "No Instruction"}}</p>
</template>

<style scoped>

</style>