import store from "@/store";
import {BlockDTO} from "@/helper/blockManager";
import config from "@/config";
import pixiApp from "@/pixi/pixiApp";

export class Instruction {
    setParameter?: SetParameter;
    wait?: Wait;

    constructor(data: any) {
        if (data.setParameter) this.setParameter = new SetParameter(data.setParameter);
        if (data.wait) this.wait = new Wait(data.wait);
    }
}
export class SetParameter {
    channels: number[];
    intensity: number;
    startTime: number;
    constructor(data: any) {
        this.channels = data.channels;
        this.intensity = data.intensity;
        this.startTime = data.startTime;
    }
}
export class Wait {
    miliseconds: number;

    constructor(data: any) {
        this.miliseconds = data.miliseconds;
    }
}

export interface BlockData {
    trackId: number;
    startTime: number;
    endTime: number;
    intensity: number;
}

interface BlockEvent {
    time: number;
    trackId: number;
    intensity: number;
}
export class InstructionParser {
    private instructions: Instruction[] | undefined;
    constructor() {}
    
    public loadJSON(json: any): void {
        this.instructions = json.instructions.map((instruction: any) => new Instruction(instruction));
    }
    public parseInstructionsToBlocks(): BlockData[] {
        if (this.instructions == undefined) {
            console.warn("No JSON loaded");
            return [];
        }
        
        const blocks: BlockData[] = [];
        let currentTime: number = 0;
        const activeChannels: Map<number, { startTime: number; intensity: number }> = new Map<number, { startTime: number; intensity: number }>();

        this.instructions.forEach((instruction: Instruction): void => {
            if (instruction.setParameter) {
                const channels: number[] = instruction.setParameter.channels;
                const intensity: number = instruction.setParameter.intensity;

                channels.forEach((channel: number): void => {
                    if (intensity > 0) {
                        // start of block
                        activeChannels.set(channel, { startTime: currentTime, intensity });
                    } else if (intensity === 0 && activeChannels.has(channel)) {
                        // end of block
                        const channelData: { startTime: number; intensity: number } = activeChannels.get(channel)!;
                        const block: BlockData = {
                            trackId: channel,
                            startTime: channelData.startTime,
                            endTime: currentTime,
                            intensity: channelData.intensity,
                        };
                        blocks.push(block);
                        activeChannels.delete(channel);
                    }
                });
            } else if (instruction.wait) {
                currentTime += instruction.wait.miliseconds;
            }
        });

        return blocks;
    }
    public parseBlocksToInstructions(): Instruction[] {
        // flatten (per track) stored blocks into one sequence
        let sequence: BlockDTO[] = [];
        Object.keys(store.state.blocks).forEach((trackIdAsString: string, trackId: number): void => {
            store.state.blocks[trackId].forEach((block: BlockDTO): void => {
               sequence.push(block); 
            });
        }); 
        
        const timelineWidth: number = pixiApp.canvas.width;
        const totalDuration: number = (timelineWidth / config.pixelsPerSecond) * 1000;
        let currentTime: number = 0;
        const events: BlockEvent[] = [];        
        let instructions: Instruction[] = [];
        
        // transform sequence into events
        sequence.forEach((block: BlockDTO): void => {
            const convertedX: number = ((block.rect.x - config.leftPadding + store.state.horizontalViewportOffset) / store.state.zoomLevel);
            const convertedWidth: number = (block.rect.width / store.state.zoomLevel);
            const startTime: number = (convertedX / timelineWidth) * totalDuration;
            const endTime: number = startTime + ((convertedWidth / timelineWidth) * totalDuration);

            events.push({ time: startTime, trackId: block.trackId, intensity: block.rect.height / config.blockHeightScaleFactor });
            events.push({ time: endTime,trackId: block.trackId, intensity: 0 });
        });       
        
        // sort events
        events.sort((a: BlockEvent, b: BlockEvent) => a.time - b.time);

        // transform events into instructions
        events.forEach((event: BlockEvent): void => {
            // insert wait-instruction if needed
            if (event.time > currentTime) {
                instructions.push({
                    wait: { miliseconds: event.time - currentTime }
                });
                currentTime = event.time;
            }

            // insert set-Parameter instruction
            instructions.push({
                setParameter: {
                    startTime: currentTime,
                    intensity: event.intensity,
                    channels: [event.trackId]
                }
            });
        });
        
        return instructions;
    }
}