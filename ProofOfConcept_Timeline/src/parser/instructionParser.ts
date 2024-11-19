class Instruction {
    setParameter?: SetParameter;
    wait?: Wait;

    constructor(data: any) {
        if (data.setParameter) this.setParameter = new SetParameter(data.setParameter);
        if (data.wait) this.wait = new Wait(data.wait);
    }
}
class SetParameter {
    channels: number[];
    intensity: number;

    constructor(data: any) {
        this.channels = data.channels;
        this.intensity = data.intensity;
    }
}
class Wait {
    miliseconds: number;

    constructor(data: any) {
        this.miliseconds = data.miliseconds;
    }
}

export interface TactonRectangle {
    channel: number;
    startTime: number;
    endTime: number;
    intensity: number;
}
export class InstructionParser {
    private instructions: Instruction[];
    constructor(json: any) {
        this.instructions = json.instructions.map((instruction: any) => new Instruction(instruction));
    }
    public parseInstructionsToRectangles(): { [key: number]: TactonRectangle[] } {
        const rectangles: TactonRectangle[] = [];
        let currentTime: number = 0;
        const activeChannels: Map<number, { startTime: number; intensity: number }> = new Map<number, { startTime: number; intensity: number }>();

        this.instructions.forEach((instruction) => {
            if (instruction.setParameter) {
                const channels: number[] = instruction.setParameter.channels;
                const intensity: number = instruction.setParameter.intensity;

                channels.forEach((channel: number) => {
                    if (intensity > 0) {
                        // start of tacton
                        activeChannels.set(channel, { startTime: currentTime, intensity });
                    } else if (intensity === 0 && activeChannels.has(channel)) {
                        // end of tacton
                        const channelData: { startTime: number; intensity: number } = activeChannels.get(channel)!;
                        const rectangle: TactonRectangle = {
                            channel: channel,
                            startTime: channelData.startTime,
                            endTime: currentTime,
                            intensity: channelData.intensity,
                        };
                        rectangles.push(rectangle);
                        activeChannels.delete(channel);
                    }
                });
            } else if (instruction.wait) {
                currentTime += instruction.wait.miliseconds;
            }
        });

        const trackData: { [key: number]: TactonRectangle[] } = {};

        rectangles.forEach(tacton => {
            if (!trackData[tacton.channel]) {
                trackData[tacton.channel] = [];
            }
            trackData[tacton.channel].push(tacton);
        });

        return trackData;
    }
}