/* linux-tv-launcher UI.
   One screen: a painting (or a photo), the time, the weather, what's playing and your apps, driven
   with the arrow keys, Enter and Back like a TV remote. Edit apps adds, changes and removes them. */
'use strict';

const W = 1920;
const H = 1080;
const app = document.getElementById('app');
const views = { screensaver: document.getElementById('screensaver') };
const $ = (sel) => document.querySelector(sel);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const BACK_KEYS = ['Escape', 'Backspace', 'BrowserBack', 'GoBack'];

const S = {
  apps: [],
  homeArt: 'paintings',
  paintingSeconds: 72,
};
let weatherNow = null;

/* ---------------------------------------------------------------- tiny DOM helpers */

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') Object.assign(n.style, v);
    else if (k === 'vars') for (const [name, value] of Object.entries(v)) n.style.setProperty(name, value);
    else if (k === 'activate') n._activate = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid);
  return n;
}
/* Icons: Phosphor (phosphoricons.com, MIT, © 2023 Phosphor Icons). Fill for play/pause and the
   like, bold for the rest. */
const PH = {
"r-wind": "<path d=\"M184,184a32,32,0,0,1-32,32c-13.7,0-26.95-8.93-31.5-21.22a8,8,0,0,1,15-5.56C137.74,195.27,145,200,152,200a16,16,0,0,0,0-32H40a8,8,0,0,1,0-16H152A32,32,0,0,1,184,184Zm-64-80a32,32,0,0,0,0-64c-13.7,0-26.95,8.93-31.5,21.22a8,8,0,0,0,15,5.56C105.74,60.73,113,56,120,56a16,16,0,0,1,0,32H24a8,8,0,0,0,0,16Zm88-32c-13.7,0-26.95,8.93-31.5,21.22a8,8,0,0,0,15,5.56C193.74,92.73,201,88,208,88a16,16,0,0,1,0,32H32a8,8,0,0,0,0,16H208a32,32,0,0,0,0-64Z\"/>",
"r-drop": "<path d=\"M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75ZM128,216a72.08,72.08,0,0,1-72-72c0-57.23,55.47-105,72-118,16.53,13,72,60.75,72,118A72.08,72.08,0,0,1,128,216Zm55.89-62.66a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z\"/>",
"r-music-notes": "<path d=\"M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V110.25l112-28v51.83A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216ZM88,93.75V62.25l112-28v31.5ZM180,184a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z\"/>",
"r-caret-left": "<path d=\"M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z\"/>",
"r-caret-right": "<path d=\"M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z\"/>",
"r-push-pin": "<path d=\"M235.32,81.37,174.63,20.69a16,16,0,0,0-22.63,0L98.37,74.49c-10.66-3.34-35-7.37-60.4,13.14a16,16,0,0,0-1.29,23.78L85,159.71,42.34,202.34a8,8,0,0,0,11.32,11.32L96.29,171l48.29,48.29A16,16,0,0,0,155.9,224c.38,0,.75,0,1.13,0a15.93,15.93,0,0,0,11.64-6.33c19.64-26.1,17.75-47.32,13.19-60L235.33,104A16,16,0,0,0,235.32,81.37ZM224,92.69h0l-57.27,57.46a8,8,0,0,0-1.49,9.22c9.46,18.93-1.8,38.59-9.34,48.62L48,100.08c12.08-9.74,23.64-12.31,32.48-12.31A40.13,40.13,0,0,1,96.81,91a8,8,0,0,0,9.25-1.51L163.32,32,224,92.68Z\"/>",
"f-skip-back": "<path d=\"M208,47.88V208.12a16,16,0,0,1-24.43,13.43L64,146.77V216a8,8,0,0,1-16,0V40a8,8,0,0,1,16,0v69.23L183.57,34.45A15.95,15.95,0,0,1,208,47.88Z\"/>",
"f-skip-forward": "<path d=\"M208,40V216a8,8,0,0,1-16,0V146.77L72.43,221.55A15.95,15.95,0,0,1,48,208.12V47.88A15.95,15.95,0,0,1,72.43,34.45L192,109.23V40a8,8,0,0,1,16,0Z\"/>",
"f-play": "<path d=\"M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z\"/>",
"f-pause": "<path d=\"M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z\"/>",
"r-gear-six": "<path d=\"M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z\"/>",
"r-sun-horizon": "<path d=\"M240,152H199.55a73.54,73.54,0,0,0,.45-8,72,72,0,0,0-144,0,73.54,73.54,0,0,0,.45,8H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM72,144a56,56,0,1,1,111.41,8H72.59A56.13,56.13,0,0,1,72,144Zm144,56a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16H208A8,8,0,0,1,216,200ZM72.84,43.58a8,8,0,0,1,14.32-7.16l8,16a8,8,0,0,1-14.32,7.16Zm-56,48.84a8,8,0,0,1,10.74-3.57l16,8a8,8,0,0,1-7.16,14.31l-16-8A8,8,0,0,1,16.84,92.42Zm192,15.16a8,8,0,0,1,3.58-10.73l16-8a8,8,0,1,1,7.16,14.31l-16,8a8,8,0,0,1-10.74-3.58Zm-48-55.16,8-16a8,8,0,0,1,14.32,7.16l-8,16a8,8,0,1,1-14.32-7.16Z\"/>",
"r-thermometer-simple": "<path d=\"M136,153V88a8,8,0,0,0-16,0v65a32,32,0,1,0,16,0Zm-8,47a16,16,0,1,1,16-16A16,16,0,0,1,128,200Zm40-66V48a40,40,0,0,0-80,0v86a64,64,0,1,0,80,0Zm-40,98a48,48,0,0,1-27.42-87.4A8,8,0,0,0,104,138V48a24,24,0,0,1,48,0v90a8,8,0,0,0,3.42,6.56A48,48,0,0,1,128,232Z\"/>",
"r-map-pin": "<path d=\"M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z\"/>",
"r-calendar-blank": "<path d=\"M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z\"/>",
"r-sun": "<path d=\"M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z\"/>",
"r-moon-stars": "<path d=\"M240,96a8,8,0,0,1-8,8H216v16a8,8,0,0,1-16,0V104H184a8,8,0,0,1,0-16h16V72a8,8,0,0,1,16,0V88h16A8,8,0,0,1,240,96ZM144,56h8v8a8,8,0,0,0,16,0V56h8a8,8,0,0,0,0-16h-8V32a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16Zm72.77,97a8,8,0,0,1,1.43,8A96,96,0,1,1,95.07,37.8a8,8,0,0,1,10.6,9.06A88.07,88.07,0,0,0,209.14,150.33,8,8,0,0,1,216.77,153Zm-19.39,14.88c-1.79.09-3.59.14-5.38.14A104.11,104.11,0,0,1,88,64c0-1.79,0-3.59.14-5.38A80,80,0,1,0,197.38,167.86Z\"/>",
"r-cloud": "<path d=\"M160,40A88.09,88.09,0,0,0,81.29,88.67,64,64,0,1,0,72,216h88a88,88,0,0,0,0-176Zm0,160H72a48,48,0,0,1,0-96c1.1,0,2.2,0,3.29.11A88,88,0,0,0,72,128a8,8,0,0,0,16,0,72,72,0,1,1,72,72Z\"/>",
"r-cloud-sun": "<path d=\"M164,72a76.2,76.2,0,0,0-20.26,2.73,55.63,55.63,0,0,0-9.41-11.54l9.51-13.57a8,8,0,1,0-13.11-9.18L121.22,54A55.9,55.9,0,0,0,96,48c-.58,0-1.16,0-1.74,0L91.37,31.71a8,8,0,1,0-15.75,2.77L78.5,50.82A56.1,56.1,0,0,0,55.23,65.67L41.61,56.14a8,8,0,1,0-9.17,13.11L46,78.77A55.55,55.55,0,0,0,40,104c0,.57,0,1.15,0,1.72L23.71,108.6a8,8,0,0,0,1.38,15.88,8.24,8.24,0,0,0,1.39-.12l16.32-2.88a55.74,55.74,0,0,0,5.86,12.42A52,52,0,0,0,84,224h80a76,76,0,0,0,0-152ZM56,104a40,40,0,0,1,72.54-23.24,76.26,76.26,0,0,0-35.62,40,52.14,52.14,0,0,0-31,4.17A40,40,0,0,1,56,104ZM164,208H84a36,36,0,1,1,4.78-71.69c-.37,2.37-.63,4.79-.77,7.23a8,8,0,0,0,16,.92,58.91,58.91,0,0,1,1.88-11.81c0-.16.09-.32.12-.48A60.06,60.06,0,1,1,164,208Z\"/>",
"r-cloud-rain": "<path d=\"M158.66,196.44l-32,48a8,8,0,1,1-13.32-8.88l32-48a8,8,0,0,1,13.32,8.88ZM232,92a76.08,76.08,0,0,1-76,76H132.28l-29.62,44.44a8,8,0,1,1-13.32-8.88L113.05,168H76A52,52,0,0,1,76,64a53.26,53.26,0,0,1,8.92.76A76.08,76.08,0,0,1,232,92Zm-16,0A60.06,60.06,0,0,0,96,88.46a8,8,0,0,1-16-.92q.21-3.66.77-7.23A38.11,38.11,0,0,0,76,80a36,36,0,0,0,0,72h80A60.07,60.07,0,0,0,216,92Z\"/>",
"r-cloud-snow": "<path d=\"M88,196a12,12,0,1,1-12-12A12,12,0,0,1,88,196Zm28,4a12,12,0,1,0,12,12A12,12,0,0,0,116,200Zm48-16a12,12,0,1,0,12,12A12,12,0,0,0,164,184ZM68,224a12,12,0,1,0,12,12A12,12,0,0,0,68,224Zm88,0a12,12,0,1,0,12,12A12,12,0,0,0,156,224ZM232,92a76.08,76.08,0,0,1-76,76H76A52,52,0,0,1,76,64a53.26,53.26,0,0,1,8.92.76A76.08,76.08,0,0,1,232,92Zm-16,0A60.06,60.06,0,0,0,96,88.46a8,8,0,0,1-16-.92q.21-3.66.77-7.23A38.11,38.11,0,0,0,76,80a36,36,0,0,0,0,72h80A60.07,60.07,0,0,0,216,92Z\"/>",
"r-cloud-lightning": "<path d=\"M156,16A76.2,76.2,0,0,0,84.92,64.76,53.26,53.26,0,0,0,76,64a52,52,0,0,0,0,104h37.87L97.14,195.88A8,8,0,0,0,104,208h25.87l-16.73,27.88a8,8,0,0,0,13.72,8.24l24-40A8,8,0,0,0,144,192H118.13l14.4-24H156a76,76,0,0,0,0-152Zm0,136H76a36,36,0,0,1,0-72,38.11,38.11,0,0,1,4.78.31q-.56,3.57-.77,7.23a8,8,0,0,0,16,.92A60.06,60.06,0,1,1,156,152Z\"/>",
"r-cloud-fog": "<path d=\"M120,208H72a8,8,0,0,1,0-16h48a8,8,0,0,1,0,16Zm64-16H160a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Zm-24,32H104a8,8,0,0,0,0,16h56a8,8,0,0,0,0-16Zm72-124a76.08,76.08,0,0,1-76,76H76A52,52,0,0,1,76,72a53.26,53.26,0,0,1,8.92.76A76.08,76.08,0,0,1,232,100Zm-16,0A60.06,60.06,0,0,0,96,96.46a8,8,0,0,1-16-.92q.21-3.66.77-7.23A38.11,38.11,0,0,0,76,88a36,36,0,0,0,0,72h80A60.07,60.07,0,0,0,216,100Z\"/>",
"play": "<path d=\"M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z\"/>",
"warning-circle": "<path d=\"M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm-12-80V80a12,12,0,0,1,24,0v52a12,12,0,0,1-24,0Zm28,40a16,16,0,1,1-16-16A16,16,0,0,1,144,172Z\"/>",
"sun": "<path d=\"M116,36V20a12,12,0,0,1,24,0V36a12,12,0,0,1-24,0Zm80,92a68,68,0,1,1-68-68A68.07,68.07,0,0,1,196,128Zm-24,0a44,44,0,1,0-44,44A44.05,44.05,0,0,0,172,128ZM51.51,68.49a12,12,0,1,0,17-17l-12-12a12,12,0,0,0-17,17Zm0,119-12,12a12,12,0,0,0,17,17l12-12a12,12,0,1,0-17-17ZM196,72a12,12,0,0,0,8.49-3.51l12-12a12,12,0,0,0-17-17l-12,12A12,12,0,0,0,196,72Zm8.49,115.51a12,12,0,0,0-17,17l12,12a12,12,0,0,0,17-17ZM48,128a12,12,0,0,0-12-12H20a12,12,0,0,0,0,24H36A12,12,0,0,0,48,128Zm80,80a12,12,0,0,0-12,12v16a12,12,0,0,0,24,0V220A12,12,0,0,0,128,208Zm108-92H220a12,12,0,0,0,0,24h16a12,12,0,0,0,0-24Z\"/>",
"moon-stars": "<path d=\"M244,96a12,12,0,0,1-12,12H220v12a12,12,0,0,1-24,0V108H184a12,12,0,0,1,0-24h12V72a12,12,0,0,1,24,0V84h12A12,12,0,0,1,244,96ZM144,60h4v4a12,12,0,0,0,24,0V60h4a12,12,0,0,0,0-24h-4V32a12,12,0,0,0-24,0v4h-4a12,12,0,0,0,0,24Zm75.81,90.38A12,12,0,0,1,222,162.3,100,100,0,1,1,93.7,34a12,12,0,0,1,15.89,13.6A85.12,85.12,0,0,0,108,64a84.09,84.09,0,0,0,84,84,85.22,85.22,0,0,0,16.37-1.59A12,12,0,0,1,219.81,150.38ZM190,172A108.13,108.13,0,0,1,84,66,76,76,0,1,0,190,172Z\"/>",
"cloud": "<path d=\"M160,36A92.09,92.09,0,0,0,79,84.36,68,68,0,1,0,72,220h88a92,92,0,0,0,0-184Zm0,160H72a44,44,0,0,1-1.82-88A91.86,91.86,0,0,0,68,128a12,12,0,0,0,24,0,68,68,0,1,1,68,68Z\"/>",
"cloud-sun": "<path d=\"M164,68a80.39,80.39,0,0,0-18.46,2.15,59.87,59.87,0,0,0-6-7.42l7.57-10.82a12,12,0,0,0-19.66-13.77L119.87,49A59.85,59.85,0,0,0,97.61,44l-2.3-13a12,12,0,0,0-23.63,4.17l2.3,13A60,60,0,0,0,54.77,60.47L43.91,52.86A12,12,0,0,0,30.14,72.52L41,80.11A59.45,59.45,0,0,0,36,102.36l-13,2.3a12,12,0,0,0,2.07,23.82,12.59,12.59,0,0,0,2.1-.18l13-2.3a59.29,59.29,0,0,0,3.44,7.25A56,56,0,0,0,84,228h80a80,80,0,0,0,0-160ZM96,68a36,36,0,0,1,26.45,11.61,80.37,80.37,0,0,0-32.06,36.75A56.5,56.5,0,0,0,84,116a55.84,55.84,0,0,0-20.33,3.83A36,36,0,0,1,96,68Zm68,136H84a32,32,0,0,1,0-64h.28c-.11,1.1-.2,2.2-.26,3.3a12,12,0,0,0,24,1.4,55.78,55.78,0,0,1,1.74-11l.15-.55A56.06,56.06,0,1,1,164,204Z\"/>",
"cloud-rain": "<path d=\"M156,12A80.22,80.22,0,0,0,82.39,60.36,56.76,56.76,0,0,0,76,60a56,56,0,0,0,0,112h29.58L86,201.34a12,12,0,1,0,20,13.32L134.42,172H156a80,80,0,0,0,0-160Zm0,136H76a32,32,0,0,1,0-64h.28c-.11,1.1-.2,2.2-.26,3.3a12,12,0,1,0,24,1.39A56.06,56.06,0,1,1,156,148Zm.65,58.66-26.67,40a12,12,0,1,1-20-13.32l26.66-40a12,12,0,1,1,20,13.32Z\"/>",
"cloud-snow": "<path d=\"M184,208a16,16,0,1,1-16-16A16,16,0,0,1,184,208Zm-64-16a16,16,0,1,0,16,16A16,16,0,0,0,120,192Zm-48,0a16,16,0,1,0,16,16A16,16,0,0,0,72,192ZM236,92a80.09,80.09,0,0,1-80,80H76A56,56,0,0,1,76,60a56.76,56.76,0,0,1,6.39.36A80.08,80.08,0,0,1,236,92Zm-24,0a56.06,56.06,0,0,0-112-3.31,12,12,0,1,1-24-1.38c.06-1.11.15-2.21.26-3.31H76a32,32,0,0,0,0,64h80A56.06,56.06,0,0,0,212,92Z\"/>",
"cloud-lightning": "<path d=\"M156,12A80.22,80.22,0,0,0,82.39,60.36,56.76,56.76,0,0,0,76,60a56,56,0,0,0,0,112h30.81l-13.1,21.82A12,12,0,0,0,104,212h18.81l-13.1,21.82a12,12,0,1,0,20.58,12.35l24-40A12,12,0,0,0,144,188H125.19l9.6-16H156a80,80,0,0,0,0-160Zm0,136H76a32,32,0,0,1,0-64h.28c-.11,1.1-.2,2.2-.26,3.3a12,12,0,1,0,24,1.39A56.06,56.06,0,1,1,156,148Z\"/>",
"cloud-fog": "<path d=\"M120,208H72a12,12,0,0,1,0-24h48a12,12,0,0,1,0,24Zm64-24H160a12,12,0,0,0,0,24h24a12,12,0,0,0,0-24Zm-24,36H104a12,12,0,0,0,0,24h56a12,12,0,0,0,0-24ZM232,96a76.08,76.08,0,0,1-76,76H76A52,52,0,1,1,85,68.78,76,76,0,0,1,232,96Zm-24,0a52,52,0,0,0-104,0,12,12,0,0,1-24,0c0-1.24,0-2.48.09-3.71A29.28,29.28,0,0,0,76,92a28,28,0,0,0,0,56h80A52.06,52.06,0,0,0,208,96Z\"/>"
};
function ph(name, size = 28) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 256 256');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'currentColor');
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('ph');
  s.innerHTML = PH[name] || '';
  return s;
}
/* Every logo shown white, like Disney+. Lettering that sits inside a solid shape (Marvel's red
   box, Warner Bros.' shield) is cut out of a white shape so it stays readable; everything else
   (text, symbols, outlines) turns into a white version of itself. Done once per logo. */
function whiteLogo(img, stripBg = false) {
  const w = Math.min(700, img.naturalWidth);
  const h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  const N = w * h;
  // App icons often sit on a solid square (white, red, green...): when the corners share a
  // colour, everything of that colour joined to the edge is background and goes.
  if (stripBg) {
    const corners = [0, w - 1, (h - 1) * w, N - 1].filter((i) => d[i * 4 + 3] > 200).map((i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    const near = (q, r) => Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) < 48;
    const bg = corners.find((q) => corners.filter((r) => near(q, r)).length >= 3);
    if (bg) {
      const seen = new Uint8Array(N);
      const st = new Int32Array(N);
      let sp = 0;
      const push = (i) => {
        if (seen[i]) return;
        const k = i * 4;
        if (d[k + 3] > 30 && !near([d[k], d[k + 1], d[k + 2]], bg)) return;
        seen[i] = 1;
        st[sp++] = i;
      };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (sp) {
        const i = st[--sp];
        d[i * 4 + 3] = 0;
        const x = i % w;
        if (x > 0) push(i - 1);
        if (x < w - 1) push(i + 1);
        if (i >= w) push(i - w);
        if (i < N - w) push(i + w);
      }
    }
  }
  const opaque = (i) => d[i * 4 + 3] > 140;
  const bins = new Map();
  for (let i = 0; i < N; i++) {
    if (!opaque(i)) continue;
    const k = i * 4;
    const key = (d[k] >> 4) << 8 | (d[k + 1] >> 4) << 4 | (d[k + 2] >> 4);
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  // inShape[i]: the pixel belongs to a solid shape (its colour, or something it encloses).
  const inShape = new Uint8Array(N);
  const shapeCol = [];
  const stack = new Int32Array(N);
  const stack0 = new Int32Array(N);
  // The transparent area around the logo, and how much of each colour touches it: a box or a
  // shield touches the outside all along its edge; lettering inside it doesn't.
  const ext = new Uint8Array(N);
  {
    let sp = 0;
    const push = (i) => { if (!ext[i] && d[i * 4 + 3] < 60) { ext[i] = 1; stack0[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const i = stack0[--sp];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < N - w) push(i + w);
    }
  }
  const contact = new Map();
  for (let i = 0; i < N; i++) {
    if (!opaque(i)) continue;
    const x = i % w;
    if ((x > 0 && ext[i - 1]) || (x < w - 1 && ext[i + 1]) || (i >= w && ext[i - w]) || (i < N - w && ext[i + w])) {
      const k = i * 4;
      const key = (d[k] >> 4) << 8 | (d[k + 1] >> 4) << 4 | (d[k + 2] >> 4);
      contact.set(key, (contact.get(key) || 0) + 1);
    }
  }
  const candidates = [...bins].filter(([, n]) => n >= 0.05 * N).sort((a, b) => (contact.get(b[0]) || 0) - (contact.get(a[0]) || 0)).slice(0, 3);
  for (const [key, count] of candidates) {
    if (count < 0.05 * N) continue;
    const col = [((key >> 8) & 15) * 16 + 8, ((key >> 4) & 15) * 16 + 8, (key & 15) * 16 + 8];
    // Skip a colour that sits inside a shape already found (the lettering itself).
    let inside = 0, all = 0;
    for (let i = 0; i < N; i += 3) {
      const k = i * 4;
      if (!opaque(i) || Math.hypot(d[k] - col[0], d[k + 1] - col[1], d[k + 2] - col[2]) >= 60) continue;
      all++;
      if (inShape[i]) inside++;
    }
    if (all && inside > 0.5 * all) continue;
    const isCol = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const k = i * 4;
      if (opaque(i) && Math.hypot(d[k] - col[0], d[k + 1] - col[1], d[k + 2] - col[2]) < 60) isCol[i] = 1;
    }
    // Everything not this colour that can be reached from the edge of the picture is outside;
    // what can't be reached is enclosed by it (letters inside a box or shield).
    const outside = new Uint8Array(N);
    let sp = 0;
    const push = (i) => { if (!isCol[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < N - w) push(i + w);
    }
    let enclosedInk = 0;
    const inkBins = new Map();
    for (let i = 0; i < N; i++) {
      if (isCol[i] || outside[i] || !opaque(i)) continue;
      enclosedInk++;
      const k = i * 4;
      const kk = (d[k] >> 4) << 8 | (d[k + 1] >> 4) << 4 | (d[k + 2] >> 4);
      inkBins.set(kk, (inkBins.get(kk) || 0) + 1);
    }
    if (enclosedInk < 0.03 * count) continue;  // nothing drawn inside it: just a coloured symbol
    // The lettering's colour: the most common colour inside the shape that isn't the shape's.
    const ink = [...inkBins].sort((a, b) => b[1] - a[1])[0][0];
    const inkCol = [((ink >> 8) & 15) * 16 + 8, ((ink >> 4) & 15) * 16 + 8, (ink & 15) * 16 + 8];
    const idx = shapeCol.push([col, inkCol]);
    for (let i = 0; i < N; i++) if (!outside[i] && !inShape[i]) inShape[i] = idx;
  }
  for (let i = 0; i < N; i++) {
    const k = i * 4;
    let a = d[k + 3];
    if (inShape[i]) {
      // How far this pixel is from the shape's colour towards the lettering's: shape stays,
      // lettering is cut out, and edges in between get a soft edge (textured fills too).
      const [col, inkCol] = shapeCol[inShape[i] - 1];
      const v = [inkCol[0] - col[0], inkCol[1] - col[1], inkCol[2] - col[2]];
      const len2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] || 1;
      const t = ((d[k] - col[0]) * v[0] + (d[k + 1] - col[1]) * v[1] + (d[k + 2] - col[2]) * v[2]) / len2;
      a = a < 60 ? 0 : Math.round(255 * clamp(1.6 - t * 2.2, 0, 1));
    }
    d[k] = d[k + 1] = d[k + 2] = 255;
    d[k + 3] = a;
  }
  g.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

/* Weather codes -> Phosphor icon names. */
const PH_FOR = {
  'w-sun': 'sun', 'w-moon': 'moon-stars', 'w-cloud': 'cloud', 'w-partly': 'cloud-sun',
  'w-rain': 'cloud-rain', 'w-snow': 'cloud-snow', 'w-storm': 'cloud-lightning', 'w-fog': 'cloud-fog',
};

/* ---------------------------------------------------------------- server */

async function api(path, body) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TV-Launcher': '1' }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

/* ---------------------------------------------------------------- toast */

let toastTimer = null;
function toast(title, sub = '', kind = '') {
  const t = $('#toast');
  t.className = 'toast show' + (kind ? ' ' + kind : '');
  t.querySelector('.toast-icon').replaceChildren(ph(kind ? 'warning-circle' : 'play', 26));
  t.querySelector('.toast-title').textContent = title;
  t.querySelector('.toast-sub').textContent = sub;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), kind ? 4500 : 3000);
}

/* ---------------------------------------------------------------- weather */

const clockText = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

function weatherIcon(w) {
  const c = w.code;
  if (c === 0) return w.day ? 'w-sun' : 'w-moon';
  if (c <= 2) return w.day ? 'w-partly' : 'w-moon';
  if (c === 3) return 'w-cloud';
  if (c === 45 || c === 48) return 'w-fog';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'w-snow';
  if (c >= 95) return 'w-storm';
  return 'w-rain';
}

const WEATHER_WORDS = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle',
  55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow',
  77: 'Snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };

async function loadWeather() {
  try {
    weatherNow = await api('/api/weather');
    renderScreensaverClock();
  } catch (e) {
    console.warn('weather:', e.message);
  }
}

/* ---------------------------------------------------------------- the home screen
   A painting fills the right; on the left it washes out into a glaze of its own colours, and the
   time, date, weather and your apps are set on it like a printed page. After sunset the page turns
   to ink: dark paper, cream type, a dimmed painting. */

const SS = { photos: [], i: 0, timer: null };
const CREAM = [238, 232, 221];
const NIGHT_PAPER = [22, 18, 15];

function inkRng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function inkNight() {
  const w = weatherNow, now = new Date().toTimeString().slice(0, 5);
  if (w?.sunrise && w?.sunset) return now < w.sunrise || now >= w.sunset;
  const h = new Date().getHours();
  return h < 7 || h >= 19;
}

/* The gallery home page. The painting fills the screen and dissolves on the left (and along the
   bottom) into a glazed, blurred copy of itself; on that glaze sit, top to bottom: the city and
   the place; a big clock, today's weather, the next hours and the details; what's
   playing (when something is), the painting's wall label; and the apps in one row. Rows for the
   remote, top to bottom: music, painting, apps. */
const SS_ROWS = ['music', 'painting', 'dock'];

async function startScreensaver() {
  SS.items = ssItems();
  SS.rowPos = {};
  SS.sel = SS.items.findIndex((x) => x.row === 'dock');
  SS.night = inkNight();
  SS.keep = false;
  const v = views.screensaver;
  v.classList.add('ink', 'gal');
  v.classList.toggle('night', SS.night);
  const rowEls = (row) => SS.items.filter((x) => x.row === row).map(ssRow);
  const dockCount = SS.items.filter((x) => x.row === 'dock').length;
  v.replaceChildren(
    el('div', { class: 'ink-layers', id: 'inkLayers' }),
    el('div', { class: 'ink-grain', vars: { '--grain': `url(${inkGrain()})` } }),
    el('header', { class: 'hp-top' }, el('div', { class: 'hp-place', id: 'gPlace' })),
    el('section', { class: 'hp-clock', 'aria-label': 'Today' },
      el('div', { class: 'hp-greet', id: 'gGreet' }),
      el('div', { class: 'hp-time', id: 'gTime' }),
      el('div', { class: 'hp-facts' },
        el('span', { class: 'hp-date', id: 'gDate' }),
        el('span', { class: 'hp-rule' }),
        el('span', { class: 'hp-now', id: 'gNow' })),
      el('div', { class: 'hp-hours', id: 'gHours', role: 'list', 'aria-label': 'The next hours' }),
      el('div', { class: 'hp-details', id: 'gDetails' })),
    el('aside', { class: 'hp-music', id: 'gMusic', 'aria-label': 'Now playing' },
      el('div', { class: 'hp-cover', id: 'gCover' }),
      el('div', { class: 'hp-mbody' },
        el('span', { class: 'hp-mkick' }, el('span', { class: 'hp-eq' }, el('i'), el('i'), el('i')), el('span', { id: 'gMState' })),
        el('span', { class: 'hp-song', id: 'gSong' }),
        el('span', { class: 'hp-artist', id: 'gArtist' }),
        el('div', { class: 'hp-prog' }, el('span', { class: 'hp-mt', id: 'gPos' }), el('span', { class: 'hp-track' }, el('span', { id: 'gFill' })), el('span', { class: 'hp-mt', id: 'gLen' })),
        el('div', { class: 'hp-mctl' }, rowEls('music'), el('span', { class: 'hp-src', id: 'gSrc' })))),
    el('div', { class: 'hp-musicline', id: 'gMusicLine' }),
    el('aside', { class: 'hp-label', 'aria-label': 'The painting' },
      el('div', { class: 'hp-kick', id: 'gKick' }),
      el('div', { class: 'hp-cap', id: 'ssCredit' }),
      el('div', { class: 'hp-actions' }, rowEls('painting'))),
    el('section', { class: 'hp-dock', 'aria-label': 'Apps' },
      el('div', { class: 'hp-dockhead' }, el('span', { class: 'hp-dockkick', text: 'Apps' }), el('span', { class: 'hp-focus', id: 'gFocus' })),
      el('div', { class: 'hp-tiles', id: 'gTiles', vars: { '--n': dockCount } }, rowEls('dock'))),
    el('div', { class: 'hp-hint', text: 'Press any button for your apps' }));
  ssWake();
  paintSsMenu();
  renderScreensaverClock();
  renderMusic();
  clearInterval(SS.musicTimer);
  SS.musicTimer = setInterval(() => { pollMusic(); tickMusic(); }, 1000);
  pollMusic();
  await inkLoadArt();
  SS.fails = 0;
  SS.skips = 0;
  nextPhoto();
  restartPaintingTimer();
}

function restartPaintingTimer() {
  clearInterval(SS.timer);
  if (!SS.keep) SS.timer = setInterval(nextPhoto, Math.max(20, Number(S.paintingSeconds) || 72) * 1000);
}

function prevPhoto() {
  if (!SS.photos.length) return;
  SS.i = (SS.i - 2 + SS.photos.length * 2) % SS.photos.length;
  nextPhoto();
  restartPaintingTimer();
}

/* This hour's paintings (the server draws a new set of 50 every hour). */
async function inkLoadArt() {
  SS.hour = new Date().getHours();
  try {
    const photos = S.homeArt === 'photos';
    const res = await api(photos ? '/api/screensaver' : '/api/paintings');
    const list = (Array.isArray(res) ? res : res.paintings || res.photos) || [];
    SS.notice = res.notice || '';
    if (JSON.stringify(list.map((p) => p.url)) !== JSON.stringify(SS.photos.map((p) => p.url))) {
      SS.photos = list;
      SS.i = 0;
    }
  } catch (e) {
    SS.notice = 'Paintings failed: ' + e.message;
    console.warn('home art:', e.message);
  }
}

async function nextPhoto() {
  if (SS.hour !== new Date().getHours()) await inkLoadArt();
  if (!SS.photos.length) {
    inkShow(null, null);
    $('#ssCredit').replaceChildren(el('div', { class: 'ink-psrc', text: SS.notice || 'No paintings yet' }));
    return;
  }
  const k = SS.i++ % SS.photos.length;
  const ph = SS.photos[k];
  const img = new Image();
  if (/^https?:/.test(ph.url)) img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    SS.fails = 0;
    // a museum photograph that shows the frame: skip it, and have the server leave it out for good
    const paint = ph.source !== 'Unsplash';
    if (paint && hasFrame(img)) {
      console.info('painting has a frame, skipping:', ph.id, ph.title);
      if (ph.id) api('/api/painting/reject', { id: ph.id, reason: 'frame' }).catch(() => {});
      SS.photos.splice(k, 1);
      SS.i = k;
      if (++SS.skips < 12) setTimeout(nextPhoto, 50);
      return;
    }
    SS.skips = 0;
    inkShow(img, ph, k);
    // fetch the next one now, so it's ready when its turn comes
    const nx = SS.photos[SS.i % SS.photos.length];
    if (nx && nx !== ph) new Image().src = nx.url;
  };
  img.onerror = () => { if (++SS.fails < 6) setTimeout(nextPhoto, 600); };
  img.src = ph.source === 'Unsplash' ? sizedPhoto(ph.url) : ph.url;
}

/* Does this photograph show the painting's frame? A frame's inner edge is a sharp, straight step
   in brightness or colour running the whole length of a side, at the same depth on opposite
   sides (photographs are taken square on). Look along each side for the strongest such step in
   its outer fifth, and call it a frame when left and right (and top or bottom) both have one,
   clearly above the painting's own texture, at matching depths. */
function hasFrame(img) {
  try {
    const w = 160, h = Math.max(40, Math.round(160 * img.naturalHeight / img.naturalWidth));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const px = (i, j) => { const o = (j * w + i) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    // mean colour of column i (rows from 15% to 85%, so corners don't count) or of row j
    const col = (i) => { const m = [0, 0, 0]; let n = 0; for (let j = Math.round(h * .15); j < h * .85; j++) { const p = px(i, j); m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; n++; } return m.map((v) => v / n); };
    const row = (j) => { const m = [0, 0, 0]; let n = 0; for (let i = Math.round(w * .15); i < w * .85; i++) { const p = px(i, j); m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; n++; } return m.map((v) => v / n); };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // the strongest step going inward from one side, where it is, and how it compares with the texture inside
    const side = (len, line, flip) => {
      const at = (k) => line(flip ? len - 1 - k : k);
      const lines = Array.from({ length: Math.round(len * .5) }, (_, k) => at(k));
      const steps = lines.slice(2).map((m, k) => dist(m, lines[k]));   // across two lines, so soft edges count too
      const outer = steps.slice(0, Math.round(len * .2));
      const inner = steps.slice(Math.round(len * .25)).sort((a, b) => a - b);
      const texture = inner[Math.floor(inner.length / 2)] || 1;
      let best = 0, pos = 0;
      outer.forEach((v, k) => { if (k >= 1 && v > best) { best = v; pos = k + 1; } });
      return { strong: best > Math.max(28, texture * 5), pos: pos / len };
    };
    const L = side(w, col, false), R = side(w, col, true), T = side(h, row, false), B = side(h, row, true);
    const lr = L.strong && R.strong && Math.abs(L.pos - R.pos) < .035;
    const tb = (T.strong || B.strong);
    return lr && tb;
  } catch { return false; }
}

/* Put a painting up (or redo the current one when day turns to night). */
function inkShow(img, ph, k = 0) {
  const box = $('#inkLayers');
  if (!box) return;
  SS.cur = { img, ph, k };
  const layer = inkLayer(img, k, ph);
  // the type gets a faint halo in this painting's glaze colour
  views.screensaver.style.setProperty('--glaze', layer.style.getPropertyValue('--lp'));
  const old = [...box.children];
  box.append(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('in')));
  setTimeout(() => old.forEach((n) => n.remove()), 2800);
  if (ph) inkCaption(ph, k);
}

function inkCaption(art, k) {
  const ok = (v) => (v && !/^(null|none|undefined)$/i.test(String(v).trim()) ? String(v).trim() : '');
  const paint = art.source !== 'Unsplash';
  const title = ok(art.title) || (paint ? 'Untitled' : '');
  // like the label beside a painting in a gallery
  $('#ssCredit').replaceChildren(...(paint ? [
    el('div', { class: 'hp-ptitle', text: title.length > 70 ? title.slice(0, 68) + '…' : title }),
    el('div', { class: 'hp-pline' }, el('b', { text: ok(art.artist) || 'Unknown artist' }),
      [ok(art.date), ok(art.technique).split(';').pop().trim()].filter(Boolean).map((x) => el('span', { text: '  ·  ' + x }))),
    el('div', { class: 'hp-pabout', text: ok(art.about) }),
    el('div', { class: 'hp-pmuseum', text: ok(art.museum) || ok(art.source) || '' }),
  ] : [
    title ? el('div', { class: 'hp-ptitle', text: title }) : null,
    el('div', { class: 'hp-pline' }, el('b', { text: ok(art.author) ? '© ' + ok(art.author) : '' }), el('span', { text: ok(art.place) })),
    el('div', { class: 'hp-pmuseum', text: art.source || '' }),
  ]).filter(Boolean));
  SS.k = k;
  paintKick();
}

function paintKick() {
  const kick = $('#gKick');
  if (kick) kick.textContent = SS.keep ? 'Kept on the wall' : `On the wall now · ${(SS.k ?? 0) + 1} of ${SS.photos.length || 1} this hour`;
}

/* One painting on the page, in three parts:
   1. underneath everything, the painting itself, shrunk to a few pixels and spread over the whole
      screen (so it is heavily blurred), under a glaze of the wall colour mixed with the painting's
      own left-hand colours: the panel on the left carries the painting's palette, faintly;
   2. the painting, sharp, dissolving into that toward the left through an uneven, noisy edge,
      the way paint thins out at the margin of a canvas;
   3. a little extra glaze at the top right, behind the tabs. */
function inkLayer(img, k, ph) {
  const night = SS.night;
  const r = img ? img.naturalWidth / img.naturalHeight : 16 / 9;
  const wide = r * H >= W * .98;
  // tall paintings are shown at least half the screen wide (cropping a little top and bottom)
  const artW = wide ? W : Math.max(Math.round(H * r), Math.round(W * .52));
  const artH = wide ? Math.max(H, Math.round(W / r)) : Math.max(H, Math.round(artW / r));
  const left = W - artW;
  const glaze = inkGlaze(img, night);
  const layer = el('div', { class: 'layer ink-layer', vars: { '--lp': `rgb(${glaze})`, '--lpa': `rgba(${glaze},.9)` } });
  if (img) {
    const soft = document.createElement('canvas');
    soft.width = 192; soft.height = 108;
    soft.className = 'ink-soft';
    const c = soft.getContext('2d');
    // cover the small canvas the way the painting covers its own box
    const sr = Math.max(192 / img.naturalWidth, 108 / img.naturalHeight);
    c.filter = 'blur(2px)';
    c.drawImage(img, (192 - img.naturalWidth * sr) / 2 + (wide ? 0 : 192 * left / W / 2), (108 - img.naturalHeight * sr) / 2, img.naturalWidth * sr, img.naturalHeight * sr);
    c.filter = 'none';
    // the glaze: strong on the left, easing off toward the painting (which covers the right anyway)
    const g = c.createLinearGradient(0, 0, 192, 0);
    g.addColorStop(0, `rgba(${glaze},${night ? .88 : .86})`); g.addColorStop(.45, `rgba(${glaze},${night ? .8 : .76})`); g.addColorStop(1, `rgba(${glaze},.4)`);
    c.fillStyle = g; c.fillRect(0, 0, 192, 108);
    // and a little more along the bottom, where the hints sit and paintings are often darkest
    const b = c.createLinearGradient(0, 60, 0, 108);
    b.addColorStop(0, `rgba(${glaze},0)`); b.addColorStop(1, `rgba(${glaze},.55)`);
    c.fillStyle = b; c.fillRect(0, 60, 110, 48);
    const pic = img.cloneNode();
    pic.className = 'ink-img';
    const art = el('div', {
      class: 'ink-art' + (wide ? ' wide' : ''),
      style: { left: left + 'px', width: artW + 'px', height: artH + 'px', top: Math.round((H - artH) / 2) + 'px',
        filter: night ? 'brightness(.5) contrast(1.06) saturate(.7) sepia(.12)' : 'saturate(.97)' },
    }, pic);
    const edge = wide ? .4 : Math.max(.42, left / W + .07);
    layer.append(soft, el('div', { class: 'ink-sharp', vars: { '--mask': `url(${inkMask(edge, k + 1)})` } }, art),
      el('div', { class: 'ink-bottom', vars: { '--bmask': `url(${inkMask(edge, k + 1, true)})` } }), el('div', { class: 'ink-scrim' }));
  }
  return layer;
}

/* The glaze colour: the wall colour (warm gesso by day, umber at night) with a little of the
   painting's left-hand colours mixed in, so the panel belongs to each painting. */
function inkGlaze(img, night) {
  const base = night ? NIGHT_PAPER : CREAM;
  if (!img) return base;
  try {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, img.naturalWidth * .45, img.naturalHeight, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data, avg = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; }
    const n = d.length / 4;
    return base.map((v, ch) => Math.round(v + (avg[ch] / n - v) * (night ? .16 : .14)));
  } catch { return base; }
}

/* The sharp painting's mask: clear on the left, solid on the right, and between them an uneven
   edge (soft noise at two scales) so the painting thins out like paint, not like a gradient. */
function inkMask(edge, seed, bottom = false) {
  const w = 384, h = 216, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h), rnd = inkRng(seed * 97 + 5);
  const grid = (n) => Array.from({ length: n * n }, () => rnd());
  const g1 = grid(9), g2 = grid(23), g3 = grid(61);
  const noise = (g, n, u, v) => {
    const fx = u * (n - 1), fy = v * (n - 1), ix = Math.min(n - 2, Math.floor(fx)), iy = Math.min(n - 2, Math.floor(fy));
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * n + ix], b = g[iy * n + ix + 1], c2 = g[(iy + 1) * n + ix], d = g[(iy + 1) * n + ix + 1];
    return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
  };
  const smooth = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = i / w, v = j / h;
      const wob = (noise(g1, 9, u, v) - .5) * .16 + (noise(g2, 23, u, v) - .5) * .06 + (noise(g3, 61, u, v) - .5) * .025;
      // the top and bottom edges of the panel lean a little further in, like a vignette
      const lean = Math.pow(Math.abs(v - .5) * 2, 3) * .05;
      // bottom: where the glaze comes up from the bottom edge, behind the apps (alpha = glaze)
      const a = bottom ? smooth(.6, .86, v - wob * .8) : smooth(edge - .1 + lean, edge + .16 + lean, u + wob);
      img.data[(j * w + i) * 4 + 3] = Math.round(a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL();
}

/* Paper grain: one small tile of noise, repeated over everything. */
function inkGrain() {
  if (SS.grain) return SS.grain;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d'), d = x.createImageData(256, 256), r = inkRng(42);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 200 + r() * 55;
    d.data[i] = v; d.data[i + 1] = v * .985; d.data[i + 2] = v * .95; d.data[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(110,90,60,${.08 + r() * .1})`; x.lineWidth = .6;
    const a = r() * 256, b = r() * 256;
    x.beginPath(); x.moveTo(a, b); x.bezierCurveTo(a + r() * 30, b + (r() - .5) * 20, a + r() * 50, b + (r() - .5) * 20, a + 30 + r() * 40, b + (r() - .5) * 14); x.stroke();
  }
  return (SS.grain = c.toDataURL());
}

/* Everything the remote can reach: the player's buttons (only while something plays),
   Next/Previous/Keep for the painting, then your apps and Edit apps. The apps come last, so the
   dock can be rebuilt after an edit without renumbering the rest. */
function ssItems() {
  return [
    { row: 'music', label: 'Previous song', icon: 'f-skip-back', go: () => musicCtl('previous') },
    { row: 'music', label: 'Play or pause', icon: 'f-pause', play: true, go: () => musicCtl('playpause') },
    { row: 'music', label: 'Next song', icon: 'f-skip-forward', go: () => musicCtl('next') },
    { row: 'painting', label: 'Next', icon: 'r-caret-right', go: () => { nextPhoto(); restartPaintingTimer(); } },
    { row: 'painting', label: 'Previous', icon: 'r-caret-left', go: prevPhoto },
    { row: 'painting', label: 'Keep this one', icon: 'r-push-pin', keep: true, go: () => { SS.keep = !SS.keep; restartPaintingTimer(); paintKick(); paintSsMenu(); } },
    ...S.apps.map((a) => ({ row: 'dock', label: a.name, app: a, desc: a.about || '', go: () => launchApp(a) })),
    { row: 'dock', label: 'Edit apps', icon: 'r-gear-six', desc: 'Add, change or remove apps', go: () => openEditor() },
  ];
}

/* After the apps change: new dock tiles, the selection kept on the same place in the row. */
function refreshDock() {
  const tiles = $('#gTiles');
  if (!tiles) return;
  const dockAt = (list) => list.findIndex((x) => x.row === 'dock');
  const pos = SS.sel - dockAt(SS.items);
  SS.items = ssItems();
  const dock = SS.items.filter((x) => x.row === 'dock');
  tiles.style.setProperty('--n', dock.length);
  tiles.replaceChildren(...dock.map(ssRow));
  if (pos >= 0) SS.sel = dockAt(SS.items) + Math.min(pos, dock.length - 1);
  delete SS.rowPos.dockSel;
  paintSsMenu();
}

function launchApp(a) {
  toast(a.name, 'Opening…');
  api('/api/launch', { id: a.id }).catch((e) => toast('Couldn’t open ' + a.name, e instanceof TypeError ? 'The launcher server isn’t running: python3 server.py' : e.message, 'error'));
}

/* An app's logo as a one-colour mark (white; the page tints it ink by day), made from its icon.
   No icon: the first letter of its name. */
const appMarks = {};
const iconUrl = (a) => `/api/icon/app/${encodeURIComponent(a.id)}?v=${a.icon_v || ''}`;
function ssMark(a) {
  const box = el('span', { class: 'ink-mark' });
  const put = (src) => box.replaceChildren(el('img', { src, alt: '' }));
  const key = a.id + ':' + a.icon_v;
  if (appMarks[key]) { put(appMarks[key]); return box; }
  box.append(el('span', { class: 'ink-mark-letter', text: (a.name || '?')[0] }));
  const img = new Image();
  img.onload = () => {
    try { appMarks[key] = whiteLogo(img, true); put(appMarks[key]); } catch (e) { console.warn('app mark:', e.message); }
  };
  img.src = iconUrl(a);
  return box;
}

function ssRow(item) {
  const i = SS.items.indexOf(item);
  let node;
  if (item.row === 'dock') {
    node = el('button', { class: 'ssi hp-tile', 'data-i': i, 'aria-label': item.label },
      item.app ? ssMark(item.app) : el('span', { class: 'ink-mark' }, ph(item.icon, 40)),
      el('span', { class: 'hp-tname', text: item.label.replace(/^YouTube Music$/, 'YT Music') }));
  } else if (item.row === 'music') {
    node = el('button', { class: 'ssi hp-mbtn' + (item.play ? ' play' : ''), 'data-i': i, 'aria-label': item.label }, ph(item.icon, item.play ? 26 : 24));
  } else {
    node = el('button', { class: 'ssi hp-act', 'data-i': i }, ph(item.icon, 18), el('span', { text: item.label }));
  }
  node.addEventListener('click', (e) => { e.stopPropagation(); SS.sel = i; paintSsMenu(); item.go(); });
  node.addEventListener('mousemove', () => { if (SS.sel !== i) { SS.sel = i; paintSsMenu(); } });
  return node;
}

function paintSsMenu() {
  const v = views.screensaver;
  if (!$('#gFocus')) return;
  const cur = SS.items[SS.sel] || {};
  v.querySelectorAll('.ssi').forEach((n) => n.classList.toggle('on', Number(n.dataset.i) === SS.sel));
  SS_ROWS.forEach((r) => v.classList.toggle('row-' + r, cur.row === r));
  const dockSel = SS.items[cur.row === 'dock' ? SS.sel : SS.rowPos.dockSel ?? SS.items.findIndex((x) => x.row === 'dock')] || {};
  $('#gFocus').textContent = dockSel.label ? `${dockSel.label}${dockSel.desc ? ' — ' + dockSel.desc.toLowerCase() : ''}` : '';
  const keep = v.querySelector('.hp-act[data-i="' + SS.items.findIndex((x) => x.keep) + '"] span');
  if (keep) keep.textContent = SS.keep ? 'Resume' : 'Keep this one';
}

/* After 5 minutes without a key press the apps fade away, leaving the painting, the time and
   what's playing; the next key only brings them back. */
const SS_QUIET_MS = 5 * 60000;
function ssWake() {
  clearTimeout(SS.quietTimer);
  views.screensaver.classList.remove('quiet');
  SS.quietTimer = setTimeout(() => views.screensaver.classList.add('quiet'), SS_QUIET_MS);
}

/* Left/Right along a row; Up/Down between rows (the player's row only while something plays);
   OK presses; Back returns to the apps, and from the apps leaves only the painting and the time. */
function ssKey(k) {
  if (views.screensaver.classList.contains('quiet') && !BACK_KEYS.includes(k)) return ssWake();
  ssWake();
  const cur = SS.items[SS.sel] || SS.items[0];
  const inRow = (r) => SS.items.map((x, i) => [x, i]).filter(([x]) => x.row === r).map(([, i]) => i);
  const rows = SS_ROWS.filter((r) => inRow(r).length && (r !== 'music' || SS.music));
  const here = inRow(cur.row), pos = here.indexOf(SS.sel);
  const go = (r) => {
    SS.rowPos[cur.row] = pos;
    if (cur.row === 'dock') SS.rowPos.dockSel = SS.sel;
    const list = inRow(r);
    SS.sel = list[Math.min(SS.rowPos[r] ?? (r === 'music' ? 1 : 0), list.length - 1)];
  };
  const ri = rows.indexOf(cur.row);
  if (k === 'ArrowLeft') SS.sel = here[Math.max(0, pos - 1)];
  else if (k === 'ArrowRight') SS.sel = here[Math.min(here.length - 1, pos + 1)];
  else if (k === 'ArrowUp') { if (ri > 0) go(rows[ri - 1]); else return; }
  else if (k === 'ArrowDown') { if (ri < rows.length - 1) go(rows[ri + 1]); else return; }
  else if (k === 'Enter' || k === ' ') return SS.items[SS.sel]?.go();
  else if (BACK_KEYS.includes(k)) {
    if (cur.row !== 'dock') { go('dock'); paintSsMenu(); return; }
    clearTimeout(SS.quietTimer);
    views.screensaver.classList.add('quiet');
    return;
  } else return;
  paintSsMenu();
}

/* ---------------------------------------------------------------- what's playing
   The server reads it from the computer's media players (MPRIS). A card while something plays or is
   paused; one line on the quiet screen; nothing when nothing plays. */
async function pollMusic() {
  if (SS.musicBusy) return;
  if (SS.musicAt && Date.now() - SS.musicAt < 3000) return;
  SS.musicBusy = true;
  try {
    const r = await api('/api/nowplaying');
    setMusic(r.playing);
  } catch { /* no player, or an older server: no card */ }
  SS.musicBusy = false;
  SS.musicAt = Date.now();
}

function setMusic(m) {
  const had = !!SS.music;
  SS.music = m ? { ...m, seen: Date.now() } : null;
  renderMusic();
  // if the selection was on the player's buttons and the music stopped, go back to the apps
  if (had && !SS.music && SS.items[SS.sel]?.row === 'music') { SS.sel = SS.rowPos.dockSel ?? SS.items.findIndex((x) => x.row === 'dock'); paintSsMenu(); }
}

async function musicCtl(action) {
  try {
    const r = await api('/api/nowplaying', { action });
    setMusic(r.playing);
  } catch (e) { toast('Player', e.message); }
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function renderMusic() {
  const v = views.screensaver, m = SS.music;
  if (!$('#gMusic')) return;
  v.classList.toggle('has-music', !!m);
  if (!m) { $('#gMusicLine').replaceChildren(); return; }
  const playing = m.state === 'playing';
  v.classList.toggle('music-paused', !playing);
  $('#gMState').textContent = playing ? 'Now playing' : 'Paused';
  $('#gSong').textContent = m.title;
  $('#gArtist').textContent = [m.artist, m.album].filter(Boolean).join('  ·  ');
  $('#gSrc').textContent = m.source || '';
  const cover = $('#gCover');
  if (m.art && cover.dataset.src !== m.art) {
    cover.dataset.src = m.art;
    const img = el('img', { src: m.art, alt: '' });
    img.onerror = () => cover.replaceChildren(ph('r-music-notes', 44));
    cover.replaceChildren(img);
  } else if (!m.art) { cover.dataset.src = ''; cover.replaceChildren(ph('r-music-notes', 44)); }
  const playBtn = v.querySelector('.hp-mbtn.play');
  if (playBtn) playBtn.replaceChildren(ph(playing ? 'f-pause' : 'f-play', 26));
  $('#gMusicLine').replaceChildren(ph('r-music-notes', 20), el('span', { class: 'hp-mlsong', text: m.title }), el('span', { text: m.artist || '' }));
  tickMusic();
}

function tickMusic() {
  const m = SS.music;
  if (!m || !$('#gPos')) return;
  const pos = Math.min(m.length || Infinity, m.position + (m.state === 'playing' ? (Date.now() - m.seen) / 1000 : 0));
  $('#gPos').textContent = mmss(pos);
  $('#gLen').textContent = m.length ? mmss(m.length) : '';
  $('#gFill').style.width = m.length ? `${Math.min(100, pos / m.length * 100)}%` : '0%';
}

/* Ask Unsplash (imgix) for about the size it is shown at, with room for the zoom. A much bigger
   image shrunk on the GPU shimmers and steps while it moves. */
function sizedPhoto(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('w', String(Math.ceil(Math.max(screen.width, innerWidth) * (devicePixelRatio || 1) * 1.15)));
    return u.href;
  } catch { return url; }
}

function weatherPh(code, day) {
  const name = PH_FOR[weatherIcon({ code, day })] || 'cloud';
  return PH['r-' + name] ? 'r-' + name : 'r-cloud';
}

function renderScreensaverClock() {
  if (!$('#gTime')) return;
  const now = new Date(), w = weatherNow, u = w?.unit || '°';
  const h = now.getHours();
  const [hh, mm] = clockText().split(':');
  $('#gTime').replaceChildren(el('span', { text: hh }), el('span', { class: 'hp-colon', text: ':' }), el('span', { text: mm }));
  $('#gGreet').textContent = h < 5 || h >= 22 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#gPlace').replaceChildren(ph('r-map-pin', 20), w?.place || 'Home');
  $('#gDate').replaceChildren(ph('r-calendar-blank', 20), now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));
  $('#gNow').replaceChildren(...(w ? [
    ph(weatherPh(w.code, w.day), 38),
    el('span', { class: 'hp-nowtemp', text: `${w.temp}${u}` }),
    el('span', { class: 'hp-nowtxt' }, el('span', { class: 'hp-nowword', text: WEATHER_WORDS[w.code] || '' }), el('span', { class: 'hp-nowsub', text: `H ${w.hi}°  ·  L ${w.lo}°` })),
  ] : []));
  // the next hours, with the sunset (or sunrise) in its place among them
  $('#gHours').replaceChildren(...(w?.hours || []).map((x) => el('div', { class: 'hp-hour' + (x.event ? ' sun' : ''), role: 'listitem' },
    el('span', { class: 'hp-hlabel', text: x.time }),
    ph(x.event ? 'r-sun-horizon' : weatherPh(x.code, x.day), 30),
    el('span', { class: 'hp-htemp', text: x.event ? (x.event === 'sunset' ? 'Set' : 'Rise') : `${x.temp}°` }),
    el('span', { class: 'hp-hrain' }, x.rain != null && !x.event ? [ph('r-drop', 13), `${x.rain}%`] : []))));
  const nowHM = now.toTimeString().slice(0, 5);
  const sunUp = w?.sunset && nowHM < w.sunset && nowHM >= (w.sunrise || '00:00');
  const t = w?.tomorrow;
  $('#gDetails').replaceChildren(...(w ? [
    w.feels != null && ['r-thermometer-simple', `Feels like ${w.feels}°`],
    w.wind != null && ['r-wind', `${w.wind} ${w.wind_unit || 'km/h'}${w.wind_dir ? ' ' + w.wind_dir : ''}`],
    w.humidity != null && ['r-drop', `Humidity ${w.humidity}%`],
    (w.sunset || w.sunrise) && ['r-sun-horizon', sunUp ? `Sunset ${w.sunset}` : `Sunrise ${w.sunrise}`],
    t && [weatherPh(t.code, true), `Tomorrow ${(WEATHER_WORDS[t.code] || '').toLowerCase()}, ${t.hi}° / ${t.lo}°`],
  ].filter(Boolean).map(([ic, txt]) => el('span', { class: 'hp-detail' }, ph(ic, 20), txt)) : []));
  // Day turns to night (or back): redo the page in the other colours.
  const night = inkNight();
  if (night !== SS.night) {
    SS.night = night;
    views.screensaver.classList.toggle('night', night);
    if (SS.cur) inkShow(SS.cur.img, SS.cur.ph, SS.cur.k);
  }
}

/* ---------------------------------------------------------------- editing your apps
   A panel over the home screen: your apps in order (move, edit, remove), and a form for one app:
   its name, a line about it, the website or command it opens, and its icon (an image you choose,
   an image address or icon-theme name, or found by itself). Every change is saved straight away.
   Up/Down (and Left/Right on buttons) move between controls, OK presses, Back goes back. */
const ED = { open: false, form: null };
const edBox = document.getElementById('editor');

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
const shellQuote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);
const stored = ({ icon_v, uploaded, ...a }) => a;   // what the server keeps (the rest it works out)

function newId(name) {
  const base = slug(name) || 'app';
  let id = base, n = 2;
  while (S.apps.some((a) => a.id === id)) id = `${base}-${n++}`;
  return id;
}

/* The app's icon in its own colours (src: another image; '' for none); its first letter while there's none. */
function appIconEl(a, src) {
  const box = el('span', { class: 'ed-icon' }, el('span', { text: (a?.name || '?')[0] }));
  const url = src ?? (a?.id ? iconUrl(a) : '');
  if (url) {
    const img = el('img', { src: url, alt: '' });
    img.onload = () => box.replaceChildren(img);
  }
  return box;
}

function edButton(label, go, cls = '', extra = {}) {
  const b = el('button', { type: 'button', class: 'ed-btn ' + cls, ...extra }, label);
  b.addEventListener('click', (e) => { e.preventDefault(); go(b); });
  return b;
}

function openEditor() {
  ED.open = true;
  edBox.hidden = false;
  views.screensaver.classList.add('editing');
  renderEditorList();
}

function closeEditor() {
  ED.open = false;
  ED.form = null;
  edBox.hidden = true;
  edBox.replaceChildren();
  views.screensaver.classList.remove('editing');
  ssWake();
}

async function saveApps(apps) {
  const r = await api('/api/apps', { apps: apps.map(stored) });
  S.apps = r.apps;
  refreshDock();
}

function renderEditorList(focusId, focusWhat = 'edit') {
  ED.form = null;
  const move = async (i, d) => {
    const apps = [...S.apps];
    [apps[i], apps[i + d]] = [apps[i + d], apps[i]];
    try { await saveApps(apps); renderEditorList(apps[i + d].id, d < 0 ? 'up' : 'down'); } catch (e) { toast('Couldn’t move it', e.message, 'error'); }
  };
  const remove = async (a, btn) => {
    // the first press asks, the second removes
    if (!btn.classList.contains('armed')) { btn.classList.add('armed'); btn.textContent = 'Press again to remove'; return; }
    const i = S.apps.indexOf(a);
    try {
      await saveApps(S.apps.filter((x) => x !== a));
      renderEditorList(S.apps[Math.min(i, S.apps.length - 1)]?.id);
    } catch (e) { toast('Couldn’t remove it', e.message, 'error'); }
  };
  const rows = S.apps.map((a, i) => el('li', { class: 'ed-row', 'data-id': a.id },
    appIconEl(a),
    el('div', { class: 'ed-what' }, el('b', { text: a.name }), el('span', { text: a.url || (a.cmd || []).map(shellQuote).join(' ') })),
    el('div', { class: 'ed-btns' },
      edButton('Up', () => move(i, -1), 'ed-up', { disabled: i === 0, 'aria-label': `Move ${a.name} up` }),
      edButton('Down', () => move(i, 1), 'ed-down', { disabled: i === S.apps.length - 1, 'aria-label': `Move ${a.name} down` }),
      edButton('Edit', () => renderEditorForm(a), 'ed-edit', { 'aria-label': `Edit ${a.name}` }),
      edButton('Remove', (b) => remove(a, b), 'ed-remove', { 'aria-label': `Remove ${a.name}` }))));
  edBox.replaceChildren(el('div', { class: 'ed-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'edTitle' },
    el('header', { class: 'ed-head' },
      el('h2', { id: 'edTitle', text: 'Your apps' }),
      el('p', { text: 'They sit along the bottom of the home screen, in this order.' })),
    rows.length ? el('ol', { class: 'ed-list' }, rows) : el('p', { class: 'ed-empty', text: 'No apps yet. Add one below.' }),
    el('footer', { class: 'ed-foot' },
      edButton('Add an app', () => renderEditorForm(null), 'primary ed-add'),
      edButton('Done', closeEditor, 'ed-done'))));
  const row = focusId && edBox.querySelector(`.ed-row[data-id="${CSS.escape(focusId)}"]`);
  const target = row && [row.querySelector('.ed-' + focusWhat), row.querySelector('.ed-edit')].find((b) => b && !b.disabled);
  (target || edBox.querySelector('.ed-add')).focus();
}

function renderEditorForm(a) {
  const f = ED.form = { app: a, file: null, dropUpload: false };
  const isCmd = !!a?.cmd;
  const field = (label, input, hint) => el('label', { class: 'ed-field' }, el('span', { class: 'ed-label', text: label }), input,
    hint ? el('span', { class: 'ed-hint', text: hint }) : null);
  const name = el('input', { name: 'name', required: true, maxlength: 40, autocomplete: 'off', value: a?.name || '' });
  const about = el('input', { name: 'about', maxlength: 60, autocomplete: 'off', value: a?.about || '', placeholder: 'e.g. Films & series' });
  const kindWeb = el('input', { type: 'radio', name: 'kind', value: 'url', checked: !isCmd });
  const kindCmd = el('input', { type: 'radio', name: 'kind', value: 'cmd', checked: isCmd });
  const url = el('input', { name: 'url', type: 'url', autocomplete: 'off', value: a?.url || '', placeholder: 'https://…' });
  const cmd = el('input', { name: 'cmd', autocomplete: 'off', value: (a?.cmd || []).map(shellQuote).join(' '), placeholder: 'e.g. flatpak run com.spotify.Client' });
  const urlField = field('Website', url, 'Opens in Firefox.');
  const cmdField = field('Command', cmd, 'Runs as you, without a shell.');
  const iconText = el('input', { name: 'icon', autocomplete: 'off', value: a?.icon || '', placeholder: 'Image address, file path or icon name' });
  const file = el('input', { type: 'file', class: 'ed-file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon' });
  const preview = el('span', { class: 'ed-preview' });
  const dropBtn = edButton('Remove the chosen image', () => { f.file = null; f.dropUpload = true; file.value = ''; paintIcon(); });
  const error = el('p', { class: 'ed-error', role: 'alert' });

  const syncKind = () => { urlField.hidden = !kindWeb.checked; cmdField.hidden = kindWeb.checked; };
  function paintIcon() {
    // the image chosen here; else the server's icon, unless the uploaded one is being removed
    const src = f.file ? URL.createObjectURL(f.file) : a && !(a.uploaded && f.dropUpload) ? undefined : '';
    preview.replaceChildren(appIconEl({ ...a, name: name.value || a?.name }, src));
    dropBtn.hidden = !(f.file || (a?.uploaded && !f.dropUpload));
  }
  kindWeb.addEventListener('change', syncKind);
  kindCmd.addEventListener('change', syncKind);
  file.addEventListener('change', () => {
    const chosen = file.files[0];
    if (chosen && chosen.size > 2e6) { error.textContent = 'That image is over 2 MB.'; file.value = ''; return; }
    f.file = chosen || null;
    f.dropUpload = false;
    error.textContent = '';
    paintIcon();
  });

  const form = el('form', { class: 'ed-panel ed-form', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'edTitle', novalidate: true },
    el('header', { class: 'ed-head' }, el('h2', { id: 'edTitle', text: a ? `Edit ${a.name}` : 'Add an app' })),
    el('div', { class: 'ed-grid' },
      el('div', { class: 'ed-col' },
        field('Name', name),
        field('About it', about, 'Shown next to the name when it’s selected.'),
        el('fieldset', { class: 'ed-kind' }, el('legend', { class: 'ed-label', text: 'Opens' }),
          el('label', {}, kindWeb, ' A website'), el('label', {}, kindCmd, ' A program')),
        urlField, cmdField),
      el('div', { class: 'ed-col' },
        el('div', { class: 'ed-label', text: 'Icon' }),
        el('div', { class: 'ed-iconrow' }, preview,
          el('div', { class: 'ed-iconbtns' },
            el('label', { class: 'ed-btn ed-filebtn', tabindex: '0', role: 'button' }, 'Choose an image…', file),
            dropBtn)),
        field('Or', iconText, 'Leave both empty and the site’s (or program’s) own icon is used. On the home screen it’s shown white.'))),
    error,
    el('footer', { class: 'ed-foot' },
      el('button', { type: 'submit', class: 'ed-btn primary' }, a ? 'Save' : 'Add'),
      edButton('Cancel', () => renderEditorList(a?.id))));
  // the file picker opens from the keyboard too
  form.querySelector('.ed-filebtn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const entry = { id: a?.id || newId(name.value), name: name.value.trim(), about: about.value.trim(), icon: iconText.value.trim() };
    if (kindWeb.checked) entry.url = url.value.trim(); else entry.cmd = cmd.value.trim();
    if (!entry.name) { error.textContent = 'Give it a name.'; name.focus(); return; }
    if (kindWeb.checked && !/^https?:\/\/./.test(entry.url)) { error.textContent = 'The website must start with https:// (or http://).'; url.focus(); return; }
    if (!kindWeb.checked && !entry.cmd) { error.textContent = 'Type the command that starts it.'; cmd.focus(); return; }
    const apps = a ? S.apps.map((x) => (x === a ? entry : x)) : [...S.apps, entry];
    try {
      await saveApps(apps);
      if (f.file) S.apps = (await api('/api/apps/icon', { id: entry.id, data: await base64Of(f.file) })).apps;
      else if (f.dropUpload) S.apps = (await api('/api/apps/icon', { id: entry.id, data: null })).apps;
      refreshDock();
      renderEditorList(entry.id);
    } catch (err) {
      error.textContent = err instanceof TypeError ? 'The launcher server isn’t running.' : err.message;
    }
  });
  name.addEventListener('input', () => { if (!a) paintIcon(); });

  edBox.replaceChildren(form);
  syncKind();
  paintIcon();
  name.focus();
}

const base64Of = (file) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',', 2)[1]);
  r.onerror = () => fail(r.error);
  r.readAsDataURL(file);
});

/* The remote in the editor: Up/Down move through everything; Left/Right too, except inside a text
   box; OK presses (the browser does that); Back leaves the form, then the editor. */
function editorKey(e) {
  const k = e.key, at = document.activeElement;
  const typing = at?.tagName === 'INPUT' && !['radio', 'file', 'checkbox'].includes(at.type);
  if (k === 'Escape' || k === 'BrowserBack' || k === 'GoBack' || (k === 'Backspace' && !typing)) {
    if (ED.form) renderEditorList(ED.form.app?.id); else closeEditor();
    return true;
  }
  const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: typing ? 0 : -1, ArrowRight: typing ? 0 : 1 }[k];
  if (!step) return false;
  const all = [...edBox.querySelectorAll('button, input:not([type=file]), [tabindex="0"]')]
    .filter((n) => !n.disabled && !n.closest('[hidden]') && n.offsetParent !== null);
  // a pair of radio buttons is one stop; Left/Right on them picks one, as usual
  const stops = all.filter((n) => n.type !== 'radio' || n.checked);
  if (at?.type === 'radio' && (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
  const i = stops.indexOf(at);
  const next = stops[i < 0 ? 0 : Math.max(0, Math.min(stops.length - 1, i + step))];
  next?.focus();
  return true;
}


/* ---------------------------------------------------------------- start */

document.addEventListener('keydown', (e) => {
  const k = e.key;
  document.body.classList.add('kbd');
  if (ED.open) { if (editorKey(e)) e.preventDefault(); return; }
  if (!k.startsWith('Arrow') && k !== 'Enter' && k !== ' ' && !BACK_KEYS.includes(k)) return;
  e.preventDefault();
  if (!e.repeat || k.startsWith('Arrow')) ssKey(k);
});
document.addEventListener('mousemove', () => document.body.classList.remove('kbd'));
app.addEventListener('contextmenu', (e) => e.preventDefault());

function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  const x = (innerWidth - W * scale) / 2;
  const y = (innerHeight - H * scale) / 2;
  app.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

async function load() {
  try {
    const d = await api('/api/home');
    S.apps = d.apps || [];
    S.homeArt = d.home_art || 'paintings';
    S.paintingSeconds = d.painting_seconds || 72;
  } catch (e) {
    toast('The launcher server isn’t running', 'Start it with: python3 server.py', 'error');
  }
  await Promise.race([loadWeather(), new Promise((ok) => setTimeout(ok, 2500))]);
  startScreensaver();
}

fit();
addEventListener('resize', fit);
setInterval(loadWeather, 15 * 60000);
setInterval(renderScreensaverClock, 15000);
load();
