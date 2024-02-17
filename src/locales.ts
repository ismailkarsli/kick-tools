export const en = {
	LIVE: "LIVE",
	BEHIND: "BEHIND",
	Speed: "Speed",
	"Kick Tools Settings": "Kick Tools Settings",
	"Auto theater mode": "Auto theater mode",
	"Auto speed up if behind live (1.1x)": "Auto speed up if behind live (1.1x)",
};

export const tr: { [key in keyof typeof en]: string } = {
	LIVE: "CANLI",
	BEHIND: "GERİDE",
	Speed: "Hız",
	"Kick Tools Settings": "Kick Tools Ayarları",
	"Auto theater mode": "Otomatik tiyatro modu",
	"Auto speed up if behind live (1.1x)": "Canlıdan gerideyse oto hızlandır (1.1x)",
};

const locale = navigator.language.split("-")[0];
export const t = (key: keyof typeof en) => {
	if (locale === "tr") return tr[key];
	return en[key];
};