import { initialize } from './app-controller';
import './platform-client';

document.getElementById('start-app-button').addEventListener('click', () => initialize());
