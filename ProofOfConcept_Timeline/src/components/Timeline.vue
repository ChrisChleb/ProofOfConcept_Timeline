<script lang="ts">
import {defineComponent, h, onMounted, ref} from 'vue'
import * as Pixi from "pixi.js";
import {useStore} from "vuex";
import pixiApp from "@/pixi/pixiApp";
import {InstructionParser, type TactonRectangle, Instruction} from "@/parser/instructionParser";
import Track from "@/components/Track.vue";
import Grid from "@/components/Grid.vue";
import PlaybackIndicator from "@/components/PlaybackIndicator.vue";

import config from "@/config";
import JsonData from '../json/2024-06-20_Team1_session1.json';
import PlaybackVisualization from "@/components/PlaybackVisualization.vue";

export default defineComponent({
  name: "Timeline",
  data() {
    return {
      instructions: [] as Instruction[],
      currentInstructionIndex: 0,
      currentInstruction: ref<Instruction | null>(null),
      tactons: {} as { [trackId: number]: TactonRectangle[] },
      maxTrackNum: 0,
      currentTime: 0,
      totalDuration: 0,
      isPlaying: false,
      playbackTimer: null as Pixi.Ticker | null,
      loadedJson: null as any,
      selectedJson: null as any,
      jsonData: JsonData,
    };
  },
  setup() {
    const store: any = useStore();
    let viewportWidth = pixiApp.canvas.width;
    let sliderMaxWidth = viewportWidth - (2 * config.sliderHandleWidth);    
    
    onMounted(async () => {
      let sliderWidth = sliderMaxWidth;
      let initialSliderWidth = sliderWidth;
      let isResizingLeft = false;
      let isResizingRight = false;
      let isDraggingSlider = false;
      let initialMouseX = 0;      
      let initialSliderX = config.sliderHandleWidth;
      let sliderX = initialSliderX;
      const sliderContainer = new Pixi.Container();   
      
      // slider      
      const sliderRect = new Pixi.Graphics();
      sliderRect.rect((viewportWidth - sliderWidth)/2, 0, sliderWidth, config.sliderHeight);
      sliderRect.fill('rgba(18,21,24,0.46)');
      sliderRect.interactive = true;
      sliderRect.cursor = 'pointer';

      sliderRect.on('pointerdown', (event) => {
        isDraggingSlider = true;
        initialMouseX = event.data.global.x;
        initialSliderX = sliderX;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });
      
      // left handle
      const leftSliderHandle = new Pixi.Graphics();
      leftSliderHandle.rect(0, 0, config.sliderHandleWidth, config.sliderHeight);
      leftSliderHandle.fill(config.colors.sliderHandleColor);
      leftSliderHandle.interactive = true;
      leftSliderHandle.cursor = 'ew-resize';
      
      leftSliderHandle.on('pointerdown', (event) => {
        isResizingLeft = true;
        initialMouseX = event.data.global.x;
        initialSliderWidth = sliderWidth;
        initialSliderX = sliderX;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });
      
      // right handle
      const rightSliderHandle = new Pixi.Graphics();
      rightSliderHandle.rect(sliderRect.width + config.sliderHandleWidth, 0, config.sliderHandleWidth, config.sliderHeight);
      rightSliderHandle.fill(config.colors.sliderHandleColor);
      rightSliderHandle.interactive = true;
      rightSliderHandle.cursor = 'ew-resize';

      rightSliderHandle.on('pointerdown', (event) => {
        isResizingRight = true;
        initialMouseX = event.data.global.x;
        initialSliderWidth = sliderWidth;
        window.addEventListener('pointermove', onScale);
        window.addEventListener('pointerup', onScaleEnd);
      });
      
      sliderContainer.addChild(leftSliderHandle);
      sliderContainer.addChild(sliderRect);
      sliderContainer.addChild(rightSliderHandle);
      pixiApp.stage.addChild(sliderContainer);
      
      window.addEventListener('resize', () => {
        viewportWidth = pixiApp.canvas.width;
        const newSliderMaxWith = viewportWidth - (2 * config.sliderHandleWidth);
        
        if (sliderWidth >= sliderMaxWidth) {
          sliderMaxWidth = newSliderMaxWith;
          sliderWidth = sliderMaxWidth;
        } else {
          const overflowRight = (sliderX + sliderWidth + config.sliderHandleWidth) - viewportWidth;

          if (overflowRight > 0) {
            sliderX -= overflowRight;
          }
          
          if (sliderX < config.sliderHandleWidth) {
            sliderX = config.sliderHandleWidth;
          }
        }

        updateSlider();
        sliderMaxWidth = newSliderMaxWith;        
        store.dispatch('updateZoomLevel', calculateZoom());
        calculateViewport();
        return;
      });      
      function updateSlider() {
        sliderRect.clear();
        sliderRect.rect(sliderX, 0, sliderWidth  , config.sliderHeight);
        sliderRect.fill('rgba(18,21,24,0.46)');

        leftSliderHandle.clear();
        leftSliderHandle.rect(sliderX - config.sliderHandleWidth, 0, config.sliderHandleWidth, config.sliderHeight);
        leftSliderHandle.fill(config.colors.sliderHandleColor);

        rightSliderHandle.clear();
        rightSliderHandle.rect(sliderX + sliderWidth, 0, config.sliderHandleWidth, config.sliderHeight);
        rightSliderHandle.fill(config.colors.sliderHandleColor);
      }
      function onScale(event: any) {
        const deltaX = event.clientX - initialMouseX;
        
        if (isResizingLeft) {
          const newWidth = initialSliderWidth - deltaX;
          const newSliderX = initialSliderX + deltaX;
          if (newWidth >= config.sliderMinWidth && newWidth <= sliderMaxWidth && newSliderX >= config.sliderHandleWidth) {
            sliderX = newSliderX;
            sliderWidth = newWidth;            
          }
        }
        
        if (isResizingRight) {
          const newWidth = initialSliderWidth + deltaX;
          if (newWidth >= config.sliderMinWidth && newWidth <= sliderMaxWidth && (sliderX + newWidth + config.sliderHandleWidth) <= viewportWidth) {
            sliderWidth = newWidth;
          }
        }
        
        const currentZoomLevel = calculateZoom();
        store.dispatch('updateZoomLevel', currentZoomLevel);
        
        // if resized from left also calculate offset
        if (isResizingLeft) calculateViewport();
        
        if (isDraggingSlider) {
          const newSliderX = initialSliderX + deltaX;
          if (newSliderX < config.sliderHandleWidth || (newSliderX + sliderWidth + config.sliderHandleWidth) > window.innerWidth) return;
          sliderX = newSliderX;
          calculateViewport();
        }
        
        updateSlider();       
      }      
      function onScaleEnd() {
        isResizingRight = false;
        isResizingLeft = false;
        isDraggingSlider = false;
        window.removeEventListener('pointermove', onScale);
        window.removeEventListener('pointerup', onScaleEnd);
      }
      function calculateZoom(): number {
        const zoomLevel = config.minZoom + ((sliderMaxWidth - sliderWidth) / (sliderMaxWidth - config.sliderMinWidth)) * (config.maxZoom - config.minZoom);
        return Math.min(Math.max(zoomLevel, config.minZoom), config.maxZoom);
      }
      function calculateViewport() {
        const zoomLevel = store.state.zoomLevel;
        const maxVisibleArea = (viewportWidth - 48) * zoomLevel;
        const visibleArea = maxVisibleArea / zoomLevel;
        const maxOffset = maxVisibleArea - visibleArea;
        const sliderPositionRatio = (sliderX - config.sliderHandleWidth) / (viewportWidth - sliderWidth - (2 * config.sliderHandleWidth));      
        const offsetValue = sliderPositionRatio * maxOffset;        
        const viewportOffset = Math.max(0, Math.min(offsetValue, maxOffset));
        
        if(isNaN(viewportOffset)) {
          store.dispatch('updateViewportOffset', 0);
          return;
        }
        
        store.dispatch('updateViewportOffset', viewportOffset);
      }
    });
  },
  created() {
    this.selectedJson = JsonData[0];
    this.loadFile();
  },
  methods: {
    loadJson() {
      console.log("loading: ", this.loadedJson);
      const parser = new InstructionParser(this.loadedJson);      
      this.tactons = parser.parseInstructionsToRectangles();
      this.maxTrackNum = Object.keys(this.tactons).reduce((a, b) => Math.max(a, parseInt(b)), -Infinity) + 1;
      
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
      
      console.log("totalDuration: ", this.totalDuration)
      console.log("maxTrackNum: ", this.maxTrackNum);
      console.log("Instructions: ", this.instructions);
      console.log("tactons: ", this.tactons);      
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
    }
  },
  components: {
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
    <div id="timeline"></div>
  </div> 
  <Grid :track-count="maxTrackNum"></Grid>
  <div v-for="trackId in Array.from({ length: maxTrackNum }, (_, i) => i)" :key="trackId">
    <Track :track-id="trackId" :tactons="tactons[trackId] || []"/>
  </div>
  <PlaybackIndicator :current-time="currentTime" :total-duration="totalDuration" :track-count="maxTrackNum"></PlaybackIndicator>
  <PlaybackVisualization :current-instruction="currentInstruction"></PlaybackVisualization>
</template>

<style scoped>
   .playbackContainer {
     padding: 12px;
     display: flex;
     justify-content: center;
     align-content: center;
     gap: 12px;
   }
    
   .playbackContainer button {
     width: 124px;
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