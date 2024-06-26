import { getSettingsContainer, getSwitch } from "./components";
import { t } from "./locales";

interface UserSettings {
	autoTheaterMode: boolean;
	catchStream: boolean;
	showRemovedChat: boolean;
	volume: number;
}

export class KickTools {
	private lastUrl = window.location.href;
	private isManuallySeeking = false;
	private observer: MutationObserver;
	private intervals: number[] = [];
	private settings: UserSettings = {
		autoTheaterMode: false,
		catchStream: true,
		showRemovedChat: false,
		volume: 0,
	};

	constructor() {
		// load settings from local storage
		const settings = localStorage.getItem("KickToolsSettings");
		if (settings) this.settings = JSON.parse(settings);

		// add mutation observer to catch url changes and detect settings panel
		this.observer = new MutationObserver(this.onObserve.bind(this));
		this.observer.observe(document.body, { childList: true, subtree: true });
	}

	set<T extends keyof UserSettings>(key: T, value: UserSettings[T]) {
		this.settings[key] = value;
		localStorage.setItem("KickToolsSettings", JSON.stringify(this.settings));
	}

	async mountVideo() {
		// finding required elements in order to manipulate them
		// we need to clone and replace some of them to remove old event listeners
		const isLive = !window.location.href.includes("/video/"); // if the video is not live, just add speed control
		const video = await this.waitForEl<HTMLVideoElement>("video");
		const controlBar = await this.waitForEl(".vjs-control-bar");
		let progress = await this.waitForEl<HTMLDivElement>(".vjs-progress-control");
		if (isLive) {
			const oldProgress = progress;
			progress = oldProgress.cloneNode(true) as HTMLDivElement;
			if (isLive) controlBar.replaceChild(progress, oldProgress);
		}
		const liveControl = await this.waitForEl<HTMLDivElement>(".vjs-live-control");
		const playProgress = await this.waitForEl<HTMLDivElement>(".vjs-play-progress");
		const playProgressTooltip = await this.waitForEl<HTMLDivElement>(".vjs-play-progress .vjs-time-tooltip");
		const loadProgress = await this.waitForEl<HTMLDivElement>(".vjs-load-progress");
		let seekToLive = await this.waitForEl<HTMLDivElement>(".vjs-seek-to-live-control");
		if (isLive) {
			const oldSeekToLive = seekToLive;
			seekToLive = seekToLive.cloneNode(true) as HTMLDivElement;
			controlBar.replaceChild(seekToLive, oldSeekToLive);
		}
		const seekToLiveIcon = await this.waitForEl<HTMLSpanElement>(".vjs-seek-to-live-control .vjs-icon-placeholder");
		seekToLiveIcon.classList.replace("vjs-icon-placeholder", "vjs-stl-icon");
		const seekToLiveText = await this.waitForEl<HTMLSpanElement>(".vjs-seek-to-live-text");
		const theaterButton = await this.waitForEl<HTMLDivElement>(".vjs-control-bar .vjs-control .kick-icon-theater");

		// if everything is found, we can replace or show/hide elements
		if (isLive) {
			progress.style.display = "flex";
			seekToLive.style.display = "inherit";
			seekToLiveIcon.style.marginRight = "5px";
			liveControl.style.display = "none";
		}
		playProgress.style.transition = "width 200ms";
		loadProgress.style.display = "none";
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
        <option style="background-color: black" value="0.25">0.25x</option>
        <option style="background-color: black" value="0.5">0.5x</option>
        <option style="background-color: black" value="0.75">0.75x</option>
        <option style="background-color: black" value="1" selected="selected">1x</option>
				<option style="background-color: black" value="1.1">1.1x</option>
        <option style="background-color: black" value="1.25">1.25x</option>
        <option style="background-color: black" value="1.5">1.5x</option>
        <option style="background-color: black" value="2">2x</option>
      </select>
    `;
		seekToLive.parentNode?.insertBefore(speedControl, seekToLive.nextSibling);
		const speedSelect = speedControl.querySelector("select") as HTMLSelectElement;

		// customize some controls if we are only in live stream
		if (isLive) {
			// update progress bar and seek to live button on timeupdate
			const debouncedProgress = debounced(3000, 3000); // debounce to prevent stuttering
			playProgressTooltip.style.right = "0";
			playProgressTooltip.style.transform = "translateX(50%)";
			video.addEventListener("timeupdate", () => {
				const buffered = video.buffered;
				if (buffered.length) {
					const { atEnd, offset, bufferTime } = this.getVideoProperties(video);
					const progressWidth = atEnd ? 100 : (100 * (bufferTime - offset)) / bufferTime;
					debouncedProgress(() => {
						playProgress.style.width = `${progressWidth}%`;
						playProgressTooltip.innerText = offset < 1 ? t("live") : `-${Math.floor(offset)}`;
						seekToLiveIcon.innerText = atEnd ? "🔴" : "⚫";
						seekToLiveText.innerText = atEnd ? t("LIVE") : t("BEHIND");
					});

					// reset speed to 1x when we reach live
					// we shouldn't outrun live so set safer max lag value.
					const maxLag = video.playbackRate * 2 + 1;
					if (video.playbackRate > 1 && offset <= maxLag / 2) {
						speedSelect.value = "1";
						video.playbackRate = 1;
						this.isManuallySeeking = false;
					}

					// if user selected to catch up with live and if we are behind, make the speed 1.1
					if (offset >= maxLag && this.settings.catchStream && !this.isManuallySeeking) {
						speedSelect.value = "1.1";
						video.playbackRate = 1.1;
						this.isManuallySeeking = false;
					}
				}
			});

			// directly seek to live
			seekToLive.addEventListener("click", (e) => {
				const { endTime } = this.getVideoProperties(video);
				video.currentTime = endTime;
			});

			// update time on seek click
			progress.addEventListener("click", (e) => {
				const { width, left } = progress.getBoundingClientRect();
				const { startTime, bufferTime } = this.getVideoProperties(video);
				const x = e.clientX - left;
				const p = (100 * x) / width;
				const time = (bufferTime * p) / 100;
				video.currentTime = startTime + time;
				this.isManuallySeeking = true;
				playProgress.style.width = `${p}%`;
				playProgressTooltip.innerText = time < 1 ? t("live") : `-${Math.floor(bufferTime - time)}`;
			});
		}

		// save volume level
		video.addEventListener("volumechange", () => this.set("volume", video.volume));
		// restore volume level
		const volume = this.settings.volume;
		if (volume) {
			video.muted = false;
			video.volume = volume;
		}

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
		settingsContainer.appendChild(
			getSwitch(t("Auto speed up if behind live (1.1x)"), this.settings.catchStream, (value) => {
				this.set("catchStream", value);
			}),
		);
		settingsContainer.appendChild(
			getSwitch(t("Auto theater mode"), this.settings.autoTheaterMode, (value) => {
				this.set("autoTheaterMode", value);
			}),
		);
		settingsContainer.appendChild(
			getSwitch(t("Show removed chat entries"), this.settings.showRemovedChat, (value) => {
				this.set("showRemovedChat", value);
			}),
		);
		actionsMenu.appendChild(settingsContainer);
	}

	onObserve(mutations: MutationRecord[]) {
		if (window.location.href !== this.lastUrl) {
			this.lastUrl = window.location.href;
			this.reset();
			this.mountVideo();
		}
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!node || !(node instanceof Element)) continue;
				const actionsMenu = node.querySelector(".chat-actions-menu-list");
				if (!actionsMenu) continue;
				this.mountSettings(actionsMenu as HTMLDivElement);
			}

			if (this.settings.showRemovedChat) {
				for (const node of mutation.removedNodes) {
					if (!node || !(node instanceof HTMLElement)) continue;
					if (!(mutation.target instanceof HTMLElement)) continue;
					// if content of the chat is removed but the chat itself is not
					const deleted = mutation.target.querySelector(".chat-entry-content-deleted");
					// chat entry is removed
					const removedEntry = node.dataset.chatEntry;
					if (removedEntry) {
						// add chat entry back to the chat with same position
						const previous = mutation.previousSibling;
						node.style.opacity = "0.6";
						if (previous) mutation.target.insertBefore(node, previous.nextSibling);
					} else if (deleted) {
						// restore old text and replace "deleted" text with it
						node.style.opacity = "0.6";
						deleted.replaceWith(node);
					}
				}
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
			this.intervals.push(interval);
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

	reset() {
		for (const interval of this.intervals) {
			clearInterval(interval);
		}
	}
}

new KickTools().mountVideo();

// debounce *delay* ms before calling the callback
// if *timeout* is provided, call the callback after *timeout* ms even if the delay is not reached
function debounced(delay: number, timeout?: number) {
	let timeoutId: number;
	let startedAt: number | null = null;
	return (callback: (...args: unknown[]) => void) => {
		if (!startedAt) startedAt = Date.now();
		clearTimeout(timeoutId);
		if (timeout && Date.now() - startedAt > timeout) {
			callback();
			startedAt = null;
			return;
		}
		timeoutId = setTimeout(() => {
			callback();
		}, delay);
	};
}
