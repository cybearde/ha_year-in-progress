const CARD_VERSION = "1.1.0";

const DEFAULTS = {
  mode: "bar",
  title: "YEAR PROGRESS",
  show_title: true,
  show_percentage: true,
  decimal_places: 1,
  show_day_count: false,
  show_remaining: false,
  bar_height: 8,
  dot_size: 8,
  dot_gap: 5,
  week_starts_monday: true,
  padding: 20,
  border_radius: 12,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

function yearData(now = new Date()) {
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const dayMs = 86400000;
  const days = Math.round((end - start) / dayMs);
  const day = Math.floor((new Date(year, now.getMonth(), now.getDate()) - start) / dayMs) + 1;
  const progress = clamp(((now - start) / (end - start)) * 100, 0, 100);
  return { year, start, days, day, remaining: days - day, progress };
}

class YearProgressCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("year-progress-card-editor");
  }

  static getStubConfig() {
    return { type: "custom:year-progress-card", mode: "bar" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const mode = config.mode || DEFAULTS.mode;
    if (!["bar", "days", "weeks"].includes(mode)) {
      throw new Error("mode must be bar, days, or weeks");
    }
    this.config = {
      ...DEFAULTS,
      ...config,
      mode,
      decimal_places: Math.round(clamp(config.decimal_places ?? DEFAULTS.decimal_places, 0, 8)),
    };
    this.render();
    this.scheduleRefresh();
  }

  set hass(value) {
    this._hass = value;
  }

  getCardSize() {
    return this.config?.mode === "days" ? 5 : this.config?.mode === "weeks" ? 3 : 2;
  }

  disconnectedCallback() {
    clearTimeout(this._refreshTimer);
  }

  scheduleRefresh() {
    clearTimeout(this._refreshTimer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const updatesProgress = this.config.show_percentage || this.config.mode === "bar";
    const yearMs = new Date(now.getFullYear() + 1, 0, 1) - new Date(now.getFullYear(), 0, 1);
    const displayStepMs = yearMs / (100 * (10 ** this.config.decimal_places));
    const refreshMs = updatesProgress
      ? Math.min(nextMidnight - now, Math.max(1000, displayStepMs))
      : nextMidnight - now;
    this._refreshTimer = setTimeout(() => {
      this.render();
      this.scheduleRefresh();
    }, refreshMs);
  }

  renderDots(data) {
    const config = this.config;
    let count;
    let current;
    if (config.mode === "days") {
      count = data.days;
      current = data.day - 1;
    } else {
      const jan1Day = data.start.getDay();
      const offset = config.week_starts_monday ? (jan1Day + 6) % 7 : jan1Day;
      count = Math.ceil((data.days + offset) / 7);
      current = Math.floor((data.day - 1 + offset) / 7);
    }
    return `<div class="dots" role="img" aria-label="${data.progress.toFixed(config.decimal_places)} percent of ${data.year} elapsed">${Array.from(
      { length: count },
      (_, index) => `<span class="dot ${index < current ? "past" : index === current ? "current" : "future"}"></span>`,
    ).join("")}</div>`;
  }

  render() {
    if (!this.config) return;
    const config = this.config;
    const data = yearData();
    const title = String(config.title || DEFAULTS.title).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const visual = config.mode === "bar"
      ? `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${data.progress.toFixed(config.decimal_places)}"><span style="width:${data.progress}%"></span></div>`
      : this.renderDots(data);
    const hasFooter = config.show_day_count || config.show_remaining;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          padding: ${clamp(config.padding, 0, 48)}px;
          border-radius: ${clamp(config.border_radius, 0, 40)}px;
          color: var(--primary-text-color);
          background: var(--ha-card-background, var(--card-background-color));
          box-sizing: border-box;
        }
        .header, .footer { display:flex; align-items:baseline; justify-content:space-between; gap:16px; }
        .header { margin-bottom: 14px; }
        .title, .percentage, .footer { font-variant-numeric: tabular-nums; letter-spacing:.08em; }
        .title { font-size: 14px; font-weight: 600; }
        .percentage { font-size: 14px; font-weight: 600; margin-left:auto; }
        .bar { height:${clamp(config.bar_height, 2, 40)}px; overflow:hidden; border-radius:999px; background:var(--divider-color); }
        .bar span { display:block; height:100%; border-radius:inherit; background:var(--primary-color); }
        .dots { display:grid; grid-template-columns:repeat(auto-fill, ${clamp(config.dot_size, 3, 24)}px); gap:${clamp(config.dot_gap, 0, 20)}px; justify-content:space-between; }
        .dot { width:${clamp(config.dot_size, 3, 24)}px; height:${clamp(config.dot_size, 3, 24)}px; border-radius:50%; box-sizing:border-box; }
        .dot.past { background:var(--primary-color); }
        .dot.current { border:2px solid var(--primary-color); background:transparent; }
        .dot.future { background:var(--divider-color); opacity:.65; }
        .footer { margin-top:14px; color:var(--secondary-text-color); font-size:11px; text-transform:uppercase; }
      </style>
      <ha-card>
        ${(config.show_title || config.show_percentage) ? `<div class="header">${config.show_title ? `<div class="title">${title}</div>` : ""}${config.show_percentage ? `<div class="percentage">${data.progress.toFixed(config.decimal_places)}%</div>` : ""}</div>` : ""}
        ${visual}
        ${hasFooter ? `<div class="footer">${config.show_day_count ? `<span>Day ${data.day} / ${data.days}</span>` : ""}${config.show_remaining ? `<span>${data.remaining} days left</span>` : ""}</div>` : ""}
      </ha-card>`;
  }
}

class YearProgressCardEditor extends HTMLElement {
  set hass(value) {
    this._hass = value;
  }

  setConfig(config) {
    this.config = { ...DEFAULTS, ...config };
    this.render();
  }

  update(key, value) {
    const config = { ...this.config, [key]: value };
    this.config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
    this.render();
  }

  field(label, key, type = "text", min, max) {
    const value = this.config[key];
    if (type === "switch") {
      return `<label class="switch"><span>${label}</span><ha-switch data-key="${key}" ${value ? "checked" : ""}></ha-switch></label>`;
    }
    if (type === "range") {
      return `<label><span>${label}: ${value}</span><input data-key="${key}" type="range" min="${min}" max="${max}" value="${value}"></label>`;
    }
    return `<label><span>${label}</span><ha-textfield data-key="${key}" value="${String(value).replaceAll('"', "&quot;")}"></ha-textfield></label>`;
  }

  render() {
    if (!this.config) return;
    const mode = this.config.mode;
    this.innerHTML = `
      <style>
        .editor { display:grid; gap:16px; padding:8px 0; }
        label { display:grid; gap:8px; color:var(--primary-text-color); }
        .switch { grid-template-columns:1fr auto; align-items:center; }
        ha-textfield, select, input[type=range] { width:100%; box-sizing:border-box; }
        select { min-height:48px; padding:0 12px; border:1px solid var(--divider-color); border-radius:4px; background:var(--card-background-color); color:var(--primary-text-color); }
        details { border-top:1px solid var(--divider-color); padding-top:14px; }
        details > div { display:grid; gap:16px; padding-top:16px; }
      </style>
      <div class="editor">
        <label><span>Display mode</span><select data-key="mode"><option value="bar" ${mode === "bar" ? "selected" : ""}>Continuous bar</option><option value="days" ${mode === "days" ? "selected" : ""}>Daily dots</option><option value="weeks" ${mode === "weeks" ? "selected" : ""}>Weekly dots</option></select></label>
        ${this.field("Show title", "show_title", "switch")}
        ${this.config.show_title ? this.field("Title", "title") : ""}
        ${this.field("Show percentage", "show_percentage", "switch")}
                ${this.config.show_percentage ? this.field(this.config.decimal_places === 8 ? "Decimal places (Insane mode)" : "Decimal places", "decimal_places", "range", 0, 8) : ""}
                ${this.config.show_percentage && this.config.decimal_places >= 6 ? `<small>High precision refreshes once per second.</small>` : ""}
                ${this.field("Show day count", "show_day_count", "switch")}
        ${this.field("Show days remaining", "show_remaining", "switch")}
        ${mode === "bar" ? this.field("Bar height", "bar_height", "range", 2, 40) : ""}
        ${mode !== "bar" ? this.field("Dot size", "dot_size", "range", 3, 24) + this.field("Dot spacing", "dot_gap", "range", 0, 20) : ""}
        ${mode === "weeks" ? this.field("Week starts Monday", "week_starts_monday", "switch") : ""}
        <details><summary>Layout</summary><div>${this.field("Card padding", "padding", "range", 0, 48)}${this.field("Corner radius", "border_radius", "range", 0, 40)}</div></details>
      </div>`;
    this.querySelectorAll("[data-key]").forEach((element) => {
      const key = element.dataset.key;
      const eventName = element.tagName === "HA-SWITCH" ? "change" : element.type === "range" ? "input" : "change";
      element.addEventListener(eventName, () => {
        const value = element.tagName === "HA-SWITCH" ? element.checked : element.type === "range" ? Number(element.value) : element.value;
        this.update(key, value);
      });
    });
  }
}

if (!customElements.get("year-progress-card")) customElements.define("year-progress-card", YearProgressCard);
if (!customElements.get("year-progress-card-editor")) customElements.define("year-progress-card-editor", YearProgressCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "year-progress-card",
  name: "Year Progress Card",
  description: "A minimalist year progress card with a bar, daily dots, or weekly dots.",
  preview: true,
  documentationURL: "https://github.com/cybearde/ha_year-in-progress",
});

console.info(`%c YEAR-PROGRESS-CARD %c v${CARD_VERSION} `, "color:white;background:#111;font-weight:700", "color:#111;background:#ddd");
