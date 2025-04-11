const config = {
    // general
    leftPadding: 48,
    componentPadding: 32,
    horizontalScrollSpeed: 25,
    horizontalScrollThreshold: 100,
    verticalScrollSpeed: 0.1,
    verticalScrollThreshold: 100,
    blockHeightScaleFactor: 100,
    // slider
    sliderHeight: 28,
    sliderMinWidth: 5,
    sliderHandleWidth: 32,
    //scrollBar
    scrollBarHeight: 150,
    scrollBarWidth: 15,
    scrollBarPassiveAlpha: 0.5,
    // track
    trackHeight: 200,
    // tactons
    minTactonWidth: 1,
    resizingHandleWidth: 20,
    // grid
    pixelsPerSecond: 100,
    minLineDistance: 100,
    maxLineDistance: 500,
    moveSnappingRadius: 20,
    resizingSnappingRadius: 5,
    //colors
    colors: {
        gridColor: 'rgba(75, 75, 75, 0.2)',
        handleColor: 'rgba(236,102,12,0)',
        tactonColor: '#848484',
        copyColor: 'rgba(236,102,12, 0.3)',
        selectedBlockColor: 'rgba(236,102,12, 0.3)',
        trackLineColor: '#777777',
        sliderHandleColor: 'rgba(236,102,12, 1)',
        boundingBoxBorderColor: 'rgba(236,102,12, 1)',
        boundingBoxColor: 'rgba(236,102,12, 0.1)'
    },
    // playback
    millisecondsPerTick: 30 //quasi bpm
}
export default config;