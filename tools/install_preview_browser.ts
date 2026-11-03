import { installLocalPreviewBrowser } from '../src/authoring/local_browser.ts';

await installLocalPreviewBrowser();
console.log('Installed the pinned Chrome version for Lantern previews.');
