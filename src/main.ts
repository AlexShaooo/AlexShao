import './theme'; // Initialize theme before anything else
import { toggleMode } from './theme';
import { Network } from './network';
import { createScene } from './renderer/scene';

const network = new Network();

const { animate } = createScene(network);
animate();

// Wire theme toggle button
document.getElementById('theme-toggle')!.addEventListener('click', toggleMode);
