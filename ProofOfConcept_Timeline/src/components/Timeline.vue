<script lang="ts">
import {defineComponent, ref} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import pixiApp, {dynamicContainer} from "@/pixi/pixiApp";
import {InstructionParser, type BlockData, Instruction} from "@/parser/instructionParser";
import Track from "@/components/Track.vue";
import Grid from "@/components/Grid.vue";
import PlaybackIndicator from "@/components/PlaybackIndicator.vue";

import config from "@/config";
import JsonData from '../json/2024-06-20_Team1_session1.json';
import PlaybackVisualization from "@/components/PlaybackVisualization.vue";
import Slider from "@/components/Slider.vue";
import store, {type BlockSelection} from "@/store";
import ScrollBar from "@/components/ScrollBar.vue";
import {type BlockDTO, BlockManager} from "@/helper/blockManager";
import PositionIndicator from "@/components/PositionIndicator.vue";

const storageKey = "storedSequences";
export default defineComponent({
  name: "Timeline",
  data() {
    return {
      instructions: [] as Instruction[],
      currentInstructionIndex: 0,
      currentInstruction: ref<Instruction | null>(null),
      blocks: [] as BlockData[],
      currentTime: 0,
      totalDuration: 0,
      trackCount: 0,
      isPlaying: false,
      playbackTimer: null as Pixi.Ticker | null,
      loadedJson: null as any,
      selectedJson: null as any,
      jsonData: JsonData,
      store: useStore(),
      dialog: ref(false),
      instructionParser: new InstructionParser(),
      lastHorizontalViewportOffset: 0
    };
  },
  created() {    
    // load storedSequences from localstorage
    const storedSequencesStr = localStorage.getItem(storageKey);
    if (storedSequencesStr != null) {
      this.jsonData = JsonData.concat(JSON.parse(storedSequencesStr));
    }

    this.selectedJson = this.jsonData[0];
    this.loadFile();

    document.addEventListener('keypress', (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        if (!this.isPlaying) {
          this.startPlayback();
        } else {
          this.stopPlayback();
        }
      }
    });
  },
  mounted() {
    const visibleHeight = window.innerHeight - pixiApp.canvas.getBoundingClientRect().top - config.sliderHeight - config.componentPadding;
    store.dispatch('setVisibleHeight', visibleHeight);
    store.dispatch('calculateScrollableHeight');
  },
  methods: {
    loadJson() {
      console.debug("loading: ", this.loadedJson);
      this.instructionParser.loadJSON(this.loadedJson);
      this.blocks = this.instructionParser.parseInstructionsToBlocks();
      this.trackCount = Math.max(...this.blocks.map((block: BlockData) => block.trackId));
      store.dispatch('setTrackCount',  this.trackCount);
      
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
      
      if (store.state.blockManager == null) {
        store.state.blockManager = new BlockManager();
        store.state.blockManager.createBlocksFromData(this.blocks);
      } else {
        store.state.blockManager.createBlocksFromData(this.blocks);
      }
      
      console.debug("totalDuration: ", this.totalDuration, " ms");
      console.debug("trackCount: ", this.trackCount);
      console.debug("blocks: ", this.blocks);
    },
    exportJson() {
      const instructions: Instruction[] = this.instructionParser.parseBlocksToInstructions();
            
      let storedSequences = [];
      const storedSequencesStr = localStorage.getItem(storageKey);
      
      if (storedSequencesStr != null) {
        storedSequences = JSON.parse(storedSequencesStr);
      }
      
      storedSequences.push({instructions: instructions, metadata: {name: "sequence_" + (storedSequences.length + 1)}});
      localStorage.setItem(storageKey, JSON.stringify(storedSequences));
      
      // refresh list
      this.jsonData = JsonData.concat(storedSequences);      
    },
    calculateInitialZoom() {
      const viewportWidth = pixiApp.canvas.width - config.leftPadding;
      const durationInSeconds = this.totalDuration/1000;
      const durationInPixels = (durationInSeconds * config.pixelsPerSecond) + config.pixelsPerSecond;
      const zoom = viewportWidth / durationInPixels;

      console.debug("viewportWidth", viewportWidth);
      console.debug("totalDuration:", durationInSeconds.toFixed(2),"s");
      console.debug("durationInPixels", durationInPixels);
      console.debug("zoom: ", zoom);
      
      this.store.dispatch('updateHorizontalViewportOffset', 0);
      this.store.dispatch('updateInitialVirtualViewportWidth', durationInPixels);
      this.store.dispatch('updateCurrentVirtualViewportWidth', durationInPixels);
      this.store.dispatch('updateZoomLevel', zoom);
      this.store.dispatch('updateInitialZoomLevel', zoom);
    },
    updateLoadedInstructions() {      
      let accumulatedTime = 0;
      this.instructions = this.instructionParser.parseBlocksToInstructions().map((instruction: any) => {
        if (instruction.wait) {
          accumulatedTime += instruction.wait.miliseconds;
        }
        if (instruction.setParameter) {
          instruction.setParameter.startTime = accumulatedTime;
        }
        return new Instruction(instruction);
      });

      this.totalDuration = accumulatedTime;
    },
    startPlayback() {
      if (this.isPlaying) return;
      store.dispatch('clearSelection');
      this.updateLoadedInstructions();
      this.isPlaying = true;
      this.currentTime = 0;
      this.currentInstructionIndex = 0;
      this.lastHorizontalViewportOffset = store.state.horizontalViewportOffset;
      store.dispatch('updateHorizontalViewportOffset', 0);
      this.playbackTimer = pixiApp.ticker.add(this.updatePlayback)
    },
    stopPlayback() {
      if (!this.isPlaying) return;

      this.isPlaying = false;
      pixiApp.ticker.remove(this.updatePlayback);
      this.currentTime = 0;
      this.currentInstructionIndex = 0;
      this.currentInstruction = null;
      store.dispatch('updateHorizontalViewportOffset', this.lastHorizontalViewportOffset);
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
        this.currentTime = 0;
        this.currentInstructionIndex = 0;
        store.dispatch('updateHorizontalViewportOffset', 0);
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
      store.dispatch('setTrackCount', this.trackCount);
      store.dispatch('calculateScrollableHeight');
      // init tracks
      store.dispatch('initTracks');
      // TODO for future, calculate new trackLength
    }
  },
  components: {
    PositionIndicator,
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
    <v-btn v-show="!isPlaying" @click="startPlayback">Play</v-btn>
    <v-btn v-show="isPlaying" @click="stopPlayback">Stop</v-btn>
    <v-btn :disabled="selectedJson == loadedJson" @click="loadFile">Load File</v-btn>
    <select id="fileSelect" v-model="selectedJson">      
        <option v-for="(file, index) in jsonData" :key="index" :value="file">{{file.metadata.name}}</option>      
    </select>
    <v-btn @click="changeTrackCount(1)">Add Track</v-btn>
    <v-btn @click="changeTrackCount(-1)">Remove Track</v-btn>
    <v-btn @click="dialog = true">Open Visualization</v-btn>
    <v-btn @click="exportJson">Save Sequence</v-btn>
  </div>
  <Slider :is-playback-active="isPlaying"></Slider>
  <ScrollBar></ScrollBar>
  <Grid></Grid>
  <div v-for="trackId in Array.from({ length: trackCount + 1 }, (_, i) => i)" :key="trackId">
    <Track :track-id="trackId"></Track>
  </div>
  <PositionIndicator :is-playback-active="isPlaying"></PositionIndicator>
  <PlaybackIndicator :current-time="currentTime" :total-duration="totalDuration" :is-playback-active="isPlaying"></PlaybackIndicator>
  
  <!--Visualization Dialog-->
  <v-dialog max-width="auto" height="70%" v-model="dialog">
    <template v-slot:default="{ isActive }">
      <v-card title="Visualization">
        <v-card-text>
          <PlaybackVisualization :current-instruction="currentInstruction" :current-time="currentTime" :total-duration="totalDuration"></PlaybackVisualization>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
              text="Close"
              @click="isActive.value = false"
          ></v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
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