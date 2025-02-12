import * as PIXI from 'pixi.js';

const pixiApp: PIXI.Application = new PIXI.Application();

// Init app
await pixiApp.init({
    background: '#ffffff',
    height: window.innerHeight,
    width: window.innerWidth,
});

export const staticContainer: PIXI.Container = new PIXI.Container();
export const dynamicContainer: PIXI.Container = new PIXI.Container();
pixiApp.stage.addChild(staticContainer);
pixiApp.stage.addChild(dynamicContainer);

document.body.appendChild(pixiApp.canvas);

window.addEventListener('resize', (): void => {
    pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
});
export default pixiApp;
