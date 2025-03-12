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
export class InstructionParser {
    private instructions: Instruction[];
    constructor(json: any) {
        this.instructions = json.instructions.map((instruction: any) => new Instruction(instruction));
    }
    public parseInstructionsToRectangles(): BlockData[] {
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
}