const config = {
    // general
    componentPadding: 12,
    scrollSpeed: 25,
    scrollThreshold: 100,
    // slider
    sliderHeight: 28,
    sliderMinWidth: 5,
    sliderHandleWidth: 32,
    maxZoom: 20,
    minZoom: 1,
    // track
    trackHeight: 200,
    // tactons
    minTactonWidth: 1,
    resizingHandleWidth: 20,
    // grid
    pixelsPerSecond: 100,
    moveSnappingRadius: 20,
    resizingSnappingRadius: 5,
    colors: {
        gridColor: 'rgba(75, 75, 75, 0.2)',
        handleColor: 'rgba(236,102,12,0)',
        tactonColor: '#848484',
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