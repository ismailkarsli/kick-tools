import { t } from "./locales";

export const getSwitch = (label: string, defaultValue: boolean, callback: (value: boolean) => void) => {
	const settingsItems = document.querySelectorAll(".chat-actions-item");
	const switchItem = Array.from(settingsItems)
		.find((item) => item.querySelector(".base-toggle"))
		?.cloneNode(true) as HTMLDivElement;
	if (!switchItem) throw new Error("Switch item not found");
	const switchText = switchItem.firstElementChild;
	const switchInput = switchItem.querySelector(".base-toggle");
	if (!switchText || !switchInput) throw new Error("Switch text or input not found");
	// change text, value and add event listener
	switchText.textContent = label;
	if (defaultValue) switchInput.classList.add("toggled-on");
	else switchInput.classList.remove("toggled-on");
	switchInput.addEventListener("click", () => {
		const value = switchInput.classList.toggle("toggled-on");
		callback(value);
	});
	return switchItem;
};

export const getSettingsContainer = (actionsMenu: HTMLDivElement) => {
	// find settings title (first child of actionsMenu)
	const settingsTitle = actionsMenu.firstElementChild?.cloneNode(true) as HTMLDivElement;
	if (!settingsTitle) throw new Error("Settings title not found");

	const settings = document.createElement("div");
	settings.classList.add("chat-actions-menu-list");
	settings.style.position = "absolute";
	settings.style.top = "0";
	settings.style.left = "0";
	settings.style.width = "100%";
	settings.style.height = "100%";
	settings.style.padding = "10px";
	settings.style.backgroundColor = "#171c1e";

	// add title and manipulate it
	const settingsTitleText = settingsTitle.querySelector("div div");
	if (settingsTitleText) settingsTitleText.textContent = t("Kick Tools Settings");
	const settingsCloseButton = settingsTitle.querySelector("button");
	if (settingsCloseButton) {
		settingsCloseButton.addEventListener("click", () => {
			settings.remove();
		});
	}
	settings.appendChild(settingsTitle);

	return settings;
};
