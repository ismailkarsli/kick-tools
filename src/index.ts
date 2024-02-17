import { getSettingsContainer, getSwitch } from "./components";
import { t } from "./locales";

interface UserSettings {
	autoTheaterMode: boolean;
	catchStream: boolean;
	volume: number;
}

export class KickTools {
	private lastUrl = window.location.href;
	private isManuallySeeking = false;
	private observer: MutationObserver;
	protected settings: UserSettings = {
		autoTheaterMode: false,
		catchStream: true,
		volume: 0,
	};

	set<T extends keyof UserSettings>(key: T, value: UserSettings[T]) {
		this.settings[key] = value;
		localStorage.setItem("kickToolsSettings", JSON.stringify(this.settings));
	}

	constructor() {
		// load settings from local storage
		const settings = localStorage.getItem("kickToolsSettings");
		if (settings) this.settings = JSON.parse(settings);

		// add mutation observer to catch url changes and detect settings panel
		this.observer = new MutationObserver(this.onObserve.bind(this));
		this.observer.observe(document.body, { childList: true, subtree: true });
	}
	async mountVideo() {
		// finding required elements in order to manipulate them
		// we need to clone and replace some of them to remove old event listeners
		const video = await this.waitForEl<HTMLVideoElement>("video");
		const controlBar = await this.waitForEl(".vjs-control-bar");
		const oldProgress = await this.waitForEl<HTMLDivElement>(".vjs-progress-control");
		const progress = oldProgress.cloneNode(true) as HTMLDivElement;
		controlBar.replaceChild(progress, oldProgress);
		const liveControl = await this.waitForEl<HTMLDivElement>(".vjs-live-control");
		const playProgress = await this.waitForEl<HTMLDivElement>(".vjs-play-progress");
		const loadProgress = await this.waitForEl<HTMLDivElement>(".vjs-load-progress");
		const oldSTL = await this.waitForEl<HTMLDivElement>(".vjs-seek-to-live-control");
		const seekToLive = oldSTL.cloneNode(true) as HTMLDivElement;
		controlBar.replaceChild(seekToLive, oldSTL);
		const seekToLiveIcon = await this.waitForEl<HTMLSpanElement>(".vjs-seek-to-live-control .vjs-icon-placeholder");
		seekToLiveIcon.classList.remove("vjs-icon-placeholder");
		const seekToLiveText = await this.waitForEl<HTMLSpanElement>(".vjs-seek-to-live-text");
		const theaterButton = await this.waitForEl<HTMLDivElement>(".vjs-control-bar .vjs-control .kick-icon-theater");

		// show/hide elements
		progress.style.display = "flex";
		liveControl.style.display = "none";
		playProgress.style.transition = "width 200ms";
		loadProgress.style.display = "none";
		seekToLive.style.display = "inherit";
		seekToLiveIcon.style.marginRight = "5px";
		if (theaterButton && this.settings.autoTheaterMode) theaterButton.click();

		// add speed control right after seek to live
		const speedControl = document.createElement("div");
		speedControl.style.display = "flex";
		speedControl.style.alignItems = "center";
		speedControl.style.marginLeft = "10px";
		speedControl.style.color = "white";
		speedControl.style.fontSize = "12px";
		speedControl.innerHTML = `
      <span style="margin-right: 4px">${t("Speed")}:</span>
      <select style="color: white; background: transparent; border: none; padding: 1px;">
        <option value="0.25">0.25x</option>
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option value="1" selected="selected">1x</option>
				<option value="1.1">1.1x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2x</option>
				<option value="3">3x</option>
      </select>
    `;
		seekToLive.parentNode?.insertBefore(speedControl, seekToLive.nextSibling);
		const speedSelect = speedControl.querySelector("select") as HTMLSelectElement;

		// update progress bar and seek to live button on timeupdate
		video.addEventListener("timeupdate", () => {
			const buffered = video.buffered;
			if (buffered.length) {
				const { atEnd, offset, bufferTime } = this.getVideoProperties(video);
				const progressWidth = atEnd ? 100 : (100 * (bufferTime - offset)) / bufferTime;
				playProgress.style.width = `${progressWidth}%`;
				seekToLiveIcon.innerText = atEnd ? "🔴" : "⚫";
				seekToLiveText.innerText = atEnd ? t("LIVE") : t("BEHIND");
				// reset speed to 1x when we reach live
				if (offset <= 1.25) {
					speedSelect.value = "1";
					video.playbackRate = 1;
					this.isManuallySeeking = false;
					// if user selected to catch up with live and if we are behind, make the speed 1.1
				} else if (offset >= 3 && this.settings.catchStream && !this.isManuallySeeking) {
					speedSelect.value = "1.1";
					video.playbackRate = 1.1;
					this.isManuallySeeking = false;
				}
			}
		});

		// save volume level to local storage
		video.addEventListener("volumechange", () => this.set("volume", video.volume));
		// restore volume level from local storage
		const volume = this.settings.volume;
		if (volume) {
			video.muted = false;
			video.volume = volume;
		}

		// update time on seek click
		progress.addEventListener("click", (e) => {
			const { width, left } = progress.getBoundingClientRect();
			const { startTime, bufferTime } = this.getVideoProperties(video);
			const x = e.clientX - left;
			const p = (100 * x) / width;
			const time = (bufferTime * p) / 100;
			video.currentTime = startTime + time;
			this.isManuallySeeking = true;
		});
		// directly seek to live
		seekToLive.addEventListener("click", (e) => {
			const { endTime } = this.getVideoProperties(video);
			video.currentTime = endTime;
		});
		// update speed on select change
		speedSelect.addEventListener("change", () => {
			video.playbackRate = parseFloat(speedSelect.value);
			this.isManuallySeeking = true;
		});
	}

	mountSettings(actionsMenu: HTMLDivElement) {
		// clone first item to append new item
		const firstItem = actionsMenu.querySelector(".chat-actions-item");
		if (!firstItem) return;
		const newItem = firstItem.cloneNode(true) as HTMLDivElement;
		actionsMenu.appendChild(newItem);
		const text = newItem.childNodes?.[0] || newItem.querySelector("div");
		const icon = newItem.querySelector(".base-icon");
		if (!(text && icon)) return;
		text.textContent = t("Kick Tools Settings");
		icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="currentColor" height="1em" width="1em"><path d="M125 8h70l10 48.1c13.8 5.2 26.5 12.7 37.5 22L285.6 64 320 123.4l-33.9 30.3c1.3 7.3 1.9 14.7 1.9 22.3s-.7 15.1-1.9 22.3L320 228.6 285.6 288l-43.1-14.2c-11.1 9.3-23.7 16.8-37.5 22L195 344H125l-10-48.1c-13.8-5.2-26.5-12.7-37.5-22L34.4 288 0 228.6l33.9-30.3C32.7 191.1 32 183.6 32 176s.7-15.1 1.9-22.3L0 123.4 34.4 64 77.5 78.2c11.1-9.3 23.7-16.8 37.5-22L125 8zm83 168c0-26.5-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48s48-21.5 48-48zM632 386.4l-47.8 9.8c-4.9 13.4-12 25.8-20.9 36.7l15 44.8L517.7 512l-30.9-34c-7.4 1.3-15 2-22.7 2s-15.4-.7-22.7-2l-30.9 34-60.6-34.4 15-44.8c-8.9-10.9-16-23.3-20.9-36.7L296 386.4V317.6l47.8-9.8c4.9-13.4 12-25.8 20.9-36.7l-15-44.8L410.3 192l30.9 34c7.4-1.3 15-2 22.7-2s15.4 .7 22.7 2l30.9-34 60.6 34.4-15 44.8c8.9 10.9 16 23.3 20.9 36.7l47.8 9.8v68.7zM464 400c26.5 0 48-21.5 48-48s-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48z"></path></svg>`;
		newItem.addEventListener("click", () => {
			this.openSettings();
		});
	}

	// open Kick Tools specific settings panel on chat-actions-content
	async openSettings() {
		const actionsMenu = await this.waitForEl<HTMLDivElement>(".chat-actions-popup");
		if (!actionsMenu) return this.log("Actions menu not found");
		const settingsContainer = getSettingsContainer(actionsMenu);
		const catchStreamSwitch = getSwitch(
			t("Auto speed up if behind live (1.1x)"),
			this.settings.catchStream,
			(value) => {
				this.set("catchStream", value);
			},
		);
		const autoTheaterModeSwitch = getSwitch(t("Auto theater mode"), this.settings.autoTheaterMode, (value) => {
			this.set("autoTheaterMode", value);
		});
		settingsContainer.appendChild(catchStreamSwitch);
		settingsContainer.appendChild(autoTheaterModeSwitch);
		actionsMenu.appendChild(settingsContainer);
	}

	onObserve(mutations: MutationRecord[]) {
		if (window.location.href !== this.lastUrl) {
			this.lastUrl = window.location.href;
			this.mountVideo();
		}
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!node || !(node instanceof HTMLDivElement)) continue;
				const actionsMenu = node.querySelector(".chat-actions-menu-list");
				if (!actionsMenu) continue;
				this.mountSettings(actionsMenu as HTMLDivElement);
			}
		}
	}

	log(...args: unknown[]) {
		console.log("%c[KickTools]", "color: #53fc18;", ...args);
	}
	waitForEl<ElType extends Element>(selector: string, parent: Element = document.body): Promise<ElType> {
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
	getVideoProperties(video: HTMLVideoElement) {
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
}

(async () => {
	if (globalThis.kickTools) return;
	globalThis.kickTools = new KickTools();
	globalThis.kickTools.mountVideo();
})();
