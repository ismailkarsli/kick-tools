window.mountingKickTools = false;
const mountControls = async () => {
  if (window.mountingKickTools) return;
  window.mountingKickTools = true;
  const video = await waitFor<HTMLVideoElement>("video");
  const controlBar = await waitFor(".vjs-control-bar");

  // cloning progress bar to disable old event listeners
  const oldProgress = await waitFor<HTMLDivElement>(".vjs-progress-control");
  const progress = oldProgress.cloneNode(true) as HTMLDivElement;
  progress.style.display = "flex";
  controlBar.replaceChild(progress, oldProgress);

  const liveControl = await waitFor<HTMLDivElement>(".vjs-live-control");
  liveControl.style.display = "none";

  const playProgress = await waitFor<HTMLDivElement>(".vjs-play-progress");
  playProgress.style.transition = "width 200ms";
  const loadProgress = await waitFor<HTMLDivElement>(".vjs-load-progress");
  loadProgress.style.display = "none";

  const oldSTL = await waitFor<HTMLDivElement>(".vjs-seek-to-live-control");
  const seekToLive = oldSTL.cloneNode(true) as HTMLDivElement;
  controlBar.replaceChild(seekToLive, oldSTL);
  seekToLive.style.display = "inherit";
  const seekToLiveIcon = await waitFor<HTMLSpanElement>(
    ".vjs-seek-to-live-control .vjs-icon-placeholder"
  );
  seekToLiveIcon.classList.remove("vjs-icon-placeholder");
  seekToLiveIcon.style.marginRight = "5px";
  const seekToLiveText = await waitFor<HTMLSpanElement>(
    ".vjs-seek-to-live-text"
  );

  // add speed control right after seek to live
  const speedControl = document.createElement("div");
  speedControl.style.display = "flex";
  speedControl.style.alignItems = "center";
  speedControl.style.marginLeft = "10px";
  speedControl.style.color = "white";
  speedControl.style.fontSize = "12px";
  speedControl.innerHTML = `
    <span style="margin-right: 5px">Speed:</span>
    <select style="color: white; background: transparent; border: none; padding: 1px;">
      <option value="0.25">0.25x</option>
      <option value="0.5">0.5x</option>
      <option value="0.75">0.75x</option>
      <option value="1">1x</option>
      <option value="1.25">1.25x</option>
      <option value="1.5">1.5x</option>
      <option value="2">2x</option>
    </select>
  `;
  seekToLive.parentNode?.insertBefore(speedControl, seekToLive.nextSibling);
  const speedSelect = speedControl.querySelector("select") as HTMLSelectElement;

  video.addEventListener("timeupdate", () => {
    const buffered = video.buffered;
    if (buffered.length) {
      const { atEnd, offset, bufferTime } = getVideoProperties(video);
      const progressWidth = atEnd
        ? 100
        : (100 * (bufferTime - offset)) / bufferTime;
      playProgress.style.width = `${progressWidth}%`;
      seekToLiveIcon.innerText = atEnd ? "🔴" : "⚫";
      seekToLiveText.innerText = atEnd ? "LIVE" : "BEHIND";
      // reset speed to 1x when video ends
      if (offset <= 1.25) {
        speedSelect.value = "1";
        video.playbackRate = 1;
      }
    }
  });
  progress.addEventListener("click", (e) => {
    const { width, left } = progress.getBoundingClientRect();
    const { startTime, bufferTime } = getVideoProperties(video);
    const x = e.clientX - left;
    const p = (100 * x) / width;
    const time = (bufferTime * p) / 100;
    video.currentTime = startTime + time;
  });
  seekToLive.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { endTime } = getVideoProperties(video);
    video.currentTime = endTime;
  });

  speedSelect.addEventListener("change", () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  window.mountingKickTools = false;
};

mountControls();
window.addEventListener("locationchange", mountControls);

function waitFor<ElType extends Element>(
  selector: string,
  parent: Element = document.body
): Promise<ElType> {
  return new Promise((resolve) => {
    let retries = 0;
    const interval = setInterval(() => {
      const element = parent.querySelector(selector);
      if (element) {
        clearInterval(interval);
        resolve(element as ElType);
      } else {
        retries++;
        if (retries > 100) {
          clearInterval(interval);
          console.error(`Element not found: ${selector}`);
        }
      }
    }, 200);
  });
}

function getVideoProperties(video: HTMLVideoElement) {
  const buffered = video.buffered;
  const currentTime = Math.floor(video.currentTime);
  const startTime = Math.floor(buffered.start(0));
  const endTime = Math.floor(buffered.end(0));
  const bufferTime = endTime - startTime;
  const offset = endTime - currentTime;
  const atEnd = offset <= 3;
  return {
    currentTime,
    startTime,
    endTime,
    bufferTime,
    offset,
    atEnd,
  };
}

// Patch history API to emit events on pushState and replaceState
(() => {
  let oldPushState = history.pushState;
  history.pushState = function pushState() {
    let ret = oldPushState.apply(this, arguments as any);
    window.dispatchEvent(new Event("pushstate"));
    window.dispatchEvent(new Event("locationchange"));
    return ret;
  };

  let oldReplaceState = history.replaceState;
  history.replaceState = function replaceState() {
    let ret = oldReplaceState.apply(this, arguments as any);
    window.dispatchEvent(new Event("replacestate"));
    window.dispatchEvent(new Event("locationchange"));
    return ret;
  };

  window.addEventListener("popstate", () => {
    window.dispatchEvent(new Event("locationchange"));
  });
})();
