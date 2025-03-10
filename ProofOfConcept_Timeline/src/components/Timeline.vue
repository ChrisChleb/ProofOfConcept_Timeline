<script lang="ts">
import {defineComponent, ref, watch} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import {InstructionParser, type TactonRectangle, Instruction} from "@/parser/instructionParser";
import Track, {type BlockDTO} from "@/components/Track.vue";
import Grid from "@/components/Grid.vue";
import PlaybackIndicator from "@/components/PlaybackIndicator.vue";

import config from "@/config";
import JsonData from '../json/2024-06-20_Team1_session1.json';
import PlaybackVisualization from "@/components/PlaybackVisualization.vue";
import Slider from "@/components/Slider.vue";
import store, {type BlockSelection} from "@/store";
import ScrollBar from "@/components/ScrollBar.vue";

export default defineComponent({
  name: "Timeline",
  data() {
    return {
      instructions: [] as Instruction[],
      currentInstructionIndex: 0,
      currentInstruction: ref<Instruction | null>(null),
      blocks: {} as { [trackId: number]: TactonRectangle[] },
      currentTime: 0,
      totalDuration: 0,
      trackCount: 0,
      isPlaying: false,
      playbackTimer: null as Pixi.Ticker | null,
      loadedJson: null as any,
      selectedJson: null as any,
      jsonData: JsonData,
      store: useStore(),
    };
  },
  created() {
    this.selectedJson = JsonData[0];
    this.loadFile();
    const store = useStore();
    
    let isDragging = false;
    let selectionStart = { x: 0, y: 0 };
    let selectionEnd = { x: 0, y: 0 };
    const selectedBlocks: BlockSelection[] = [];
    
    document.addEventListener('keydown', (event: KeyboardEvent) => {      
      if (event.shiftKey && !store.state.isPressingShift) {
        store.dispatch('toggleShiftValue');
      }
    });
    
    document.addEventListener('keyup', (event: KeyboardEvent) => {    
      if (event.key == "Shift" && store.state.isPressingShift) {
        store.dispatch('toggleShiftValue');
      }
    });
    
    // multiselection by dragging
    pixiApp.canvas.addEventListener('mousedown', (event: MouseEvent) => {
      if (event.button === 0 && !store.state.isInteracting) {
        isDragging = true;
        selectionStart = { x: event.clientX, y: event.clientY };
        selectionEnd = { ...selectionStart };
        drawSelectionBox();
      }
    });
    
    pixiApp.canvas.addEventListener('mousemove', (event: MouseEvent) => {
      if (!isDragging) return;
      selectionEnd = { x: event.clientX, y: event.clientY };
      drawSelectionBox();
    });

    pixiApp.canvas.addEventListener('mouseup', (event: MouseEvent) => {
      if (event.button !== 0 || !isDragging) return;
      isDragging = false;
      removeSelectionBox();
      selectRectanglesWithin();
    });
    function drawSelectionBox(): void {
      const selectionBox = document.getElementById('selection-box') || createSelectionBox();
      const { x, y, width, height } = getBoundingBox();
      selectionBox.style.left = `${x}px`;
      selectionBox.style.top = `${y}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;
    }
    function createSelectionBox(): HTMLElement {
      const box = document.createElement('div');
      box.id = 'selection-box';
      box.style.position = 'absolute';
      box.style.border = '1px solid';
      box.style.borderColor = config.colors.boundingBoxBorderColor;
      box.style.background = config.colors.boundingBoxColor;
      box.style.pointerEvents = 'none';
      box.style.userSelect = 'none';
      document.body.appendChild(box);
      return box;
    }
    function removeSelectionBox(): void {
      const box = document.getElementById('selection-box');
      if (box) box.remove();
    }    
    function selectRectanglesWithin(): void {
      selectedBlocks.length = 0;
      let { x, y, width, height } = getBoundingBox();
      
      // need to adjust coordinates, to be in canvas
      y -= pixiApp.canvas.getBoundingClientRect().top;
      // adjust for scrolling
      y -= dynamicContainer.y;
      
      // calculate tracks to check --> only check tracks that could contain selection
      const startTrack = Math.floor(y / config.trackHeight);
      const endTrack = Math.floor((y+height)/config.trackHeight);
      for (let trackId = startTrack; trackId <= endTrack; trackId++) {
        const blocks = store.state.blocks[trackId];
        if (!blocks) continue;        
        blocks.forEach((block: BlockDTO, index: number) => {
          if ((block.rect.x + block.rect.width) >= x && block.rect.x <= (x + width) && block.rect.y <= (y + height) && block.rect.y + block.rect.height >= y) {
            const selection: BlockSelection = {trackId: trackId, index: index, uid: block.rect.uid};
            selectedBlocks.push(selection);
          }
        });
      }
      store.dispatch('onSelectBlocks', selectedBlocks);
    }
    function getBoundingBox() {
      const x = Math.min(selectionStart.x, selectionEnd.x);
      const y = Math.min(selectionStart.y, selectionEnd.y);
      const width = Math.abs(selectionStart.x - selectionEnd.x);
      const height = Math.abs(selectionStart.y - selectionEnd.y);
      return { x, y, width, height };
    }
  },
  mounted() {
    const visibleHeight = window.innerHeight - pixiApp.canvas.getBoundingClientRect().top - config.sliderHeight - config.componentPadding;
    store.dispatch('setVisibleHeight', visibleHeight);
    store.dispatch('calculateScrollableHeight');
  },
  methods: {
    loadJson() {
      console.debug("loading: ", this.loadedJson);
      const parser = new InstructionParser(this.loadedJson);      
      this.blocks = parser.parseInstructionsToRectangles();
      this.trackCount = Object.keys(this.blocks).reduce((a, b) => Math.max(a, parseInt(b)), -Infinity) + 1;
      store.dispatch('setTrackCount', this.trackCount - 1);
      
      let accumulatedTime = 0;
      this.instructions = this.loadedJson.instructions.map((instruction: any) => {
        if (instruction.wait) {
          accumulatedTime += instruction.wait.miliseconds;
        }
        if (instruction.setParameter) {
          instruction.setParameter.startTime = accumulatedTime;
        }
        return new Instruction(instruction);
      });
      
      this.totalDuration = accumulatedTime;
      this.calculateInitialZoom();
      
      console.debug("totalDuration: ", this.totalDuration, " ms");
      console.debug("trackCount: ", this.trackCount);
      console.debug("Instructions: ", this.instructions);
      console.debug("tactons: ", this.blocks);
    },
    calculateInitialZoom() {
      const viewportWidth = pixiApp.canvas.width - config.leftPadding;
      const padding = config.pixelsPerSecond;
      const durationInSeconds = this.totalDuration/1000;
      const durationInPixels = (durationInSeconds * config.pixelsPerSecond) + padding;
      const zoom = viewportWidth / (durationInPixels);

      console.debug("viewportWidth", viewportWidth);
      console.debug("totalDuration:", durationInSeconds.toFixed(2),"s");
      console.debug("durationInPixels", durationInPixels);
      console.debug("zoom: ", zoom);
      
      this.store.dispatch('updateInitialVirtualViewportWidth', durationInPixels);
      this.store.dispatch('updateCurrentVirtualViewportWidth', durationInPixels);
      this.store.dispatch('updateZoomLevel', zoom);
    },
    startPlayback() {
      if (this.isPlaying) return;
      
      this.isPlaying = true;
      this.currentTime = 0;
      this.currentInstructionIndex = 0;
      this.playbackTimer = pixiApp.ticker.add(this.updatePlayback)
    },
    stopPlayback() {
      if (!this.isPlaying) return;

      this.isPlaying = false;
      pixiApp.ticker.remove(this.updatePlayback);
      this.currentTime = 0;
      this.currentInstructionIndex = 0;
      this.currentInstruction = null;
    },
    updatePlayback(ticker: any) {
      if (!this.isPlaying) return;
      this.currentTime += ticker.deltaTime * config.millisecondsPerTick;
      
      const instruction = this.instructions[this.currentInstructionIndex];

      if (instruction && instruction.wait && this.currentTime >= instruction.wait.miliseconds) {
        this.currentInstructionIndex++;
      }

      if (instruction && instruction.setParameter && this.currentTime >= instruction.setParameter.startTime) {
        this.currentInstruction = instruction;
        this.currentInstructionIndex++;
      }

      if (this.currentTime >= this.totalDuration) {
        this.stopPlayback();
      }
    },
    loadFile() {
      if (this.loadedJson == this.selectedJson) return;
      this.loadedJson = this.selectedJson;
      
      console.clear();     
      this.loadJson();
    },
    changeTrackCount(changeBy: number) {
      this.trackCount += changeBy;
      store.dispatch('setTrackCount', this.trackCount - 1);
      store.dispatch('calculateScrollableHeight');
      // TODO for future, calculate new trackLength
    }
  },
  components: {
    ScrollBar,
    Slider,
    PlaybackVisualization,
    PlaybackIndicator,
    Grid,
    Track
  }
})
</script>

<template>
  <div class="playbackContainer">
    <button :disabled="isPlaying" @click="startPlayback">Play</button>
    <button @click="stopPlayback">Stop</button>
    <button :disabled="selectedJson == loadedJson" @click="loadFile">Load File</button>
    <select id="fileSelect" v-model="selectedJson">      
        <option v-for="(file, index) in jsonData" :key="index" :value="file">{{file.metadata.name}}</option>      
    </select>
    <button @click="changeTrackCount(1)">Add Track</button>
    <button @click="changeTrackCount(-1)">Remove Track</button>
  </div>
  <PlaybackVisualization :current-instruction="currentInstruction"></PlaybackVisualization>
  <Slider></Slider>
  <ScrollBar></ScrollBar>
  <Grid :track-count="trackCount"></Grid>
  <div v-for="trackId in Array.from({ length: trackCount }, (_, i) => i)" :key="trackId">
    <Track :track-id="trackId" :blocks="blocks[trackId] || []"/>
  </div>
  <PlaybackIndicator :current-time="currentTime" :total-duration="totalDuration" :track-count="trackCount"></PlaybackIndicator>
  
</template>

<style scoped>
   .playbackContainer {
     padding: 12px;
     display: flex;
     justify-content: center;
     align-content: center;
     gap: 12px;
     user-select: none;
   }
    
   .playbackContainer button {
     min-width: 128px;
     height: 32px;
     font-weight: 600;
     font-size: 16px;
     letter-spacing: 0.1rem;
     color: white;
     background-color: #EC660C;
     border-radius: 6px;
     border-style: none;
     cursor: pointer;
     text-transform: uppercase;
   }

   .playbackContainer button:hover {
     color: #EC660C;
     background-color: rgba(236, 102, 12, 0.12);
     border-style: solid;
     border-color: #EC660C;
   }
   
   .playbackContainer button:active {
     color: #EC660C;
     background-color: white;
     border-style: solid;
     border-color: #EC660C;
   }

   .playbackContainer button:disabled {
     color: white;
     background-color: rgba(75, 75, 75, 0.49);
   }

   .playbackContainer button:disabled:hover {
     border-style: none;
     cursor: default;
   }
   
   .playbackContainer select {
     width: 164px;
     font-weight: 600;
     font-size: 16px;
     letter-spacing: 0.1rem;
     border-radius: 6px;
     border-style: none;
     color: white;
     background-color: #EC660C;
     text-transform: uppercase;
     padding-left: 8px;
   }

   .playbackContainer select option {
     width: 148px;
     font-weight: 600;
     font-size: 16px;
     letter-spacing: 0.1rem;
     border-radius: 6px;
     border-style: none;
     color: #EC660C;
     background-color: white;
   }

   .playbackContainer select option:checked {
     color: white;
     background: #EC660C;
   }
</style>