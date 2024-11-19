import * as PIXI from 'pixi.js';

const pixiApp: PIXI.Application = new PIXI.Application();

// Init app
await pixiApp.init({
    background: '#ffffff',
    height: window.innerHeight,
    width: window.innerWidth,
});

document.body.appendChild(pixiApp.canvas);

window.addEventListener('resize', (): void => {
    pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
});
export default pixiApp;