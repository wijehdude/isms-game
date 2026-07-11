import { EventBus } from "../core/events";
import { deserializeState, listSaves, loadBrowserSave, saveToBrowser, serializeState, type SaveSlot } from "../core/save";
import { formatClock, formatDate, formatDuration } from "../core/time";
import {
  activeIncidents,
  approveAllReady,
  decommissionAt,
  formatMoney,
  hireStaff,
  placeOrder,
  procureDevice,
  validatePlacement,
} from "../game/actions";
import { DEVICE_MODELS, UPGRADES, configuredStats, getModel, getUpgrade, upgradesFor } from "../game/catalog";
import { createGame } from "../game/createGame";
import { getScenario, SCENARIOS } from "../game/scenarios";
import type { ActionResult, Device, GameState, Incident, ProcurementOrder, StaffRole } from "../game/types";
import { IsoRenderer, type RenderOverlay } from "../render/renderer";
import { projectedMonthlyCosts, weeklyFundingAmount } from "../sim/economy";
import { isHardenedPerimeter } from "../sim/rating";
import { objectiveValue, advanceSimulation } from "../sim/simulation";

type Screen = "title" | "scenarios" | "saves" | "game";
type Panel = "capability" | "pipeline" | "operations" | "staff" | "finance" | "rating" | "objectives" | "settings" | "device" | null;

const SIM_STEP_SECONDS = 0.1;
const GAME_MINUTES_PER_STEP = 3.2;
const WALKTHROUGH_STORAGE_KEY = "sentinel-base.walkthrough.hidden.v1";

const WALKTHROUGH_STEPS = [
  {
    kicker: "Welcome to Sentinel Base",
    title: "The simulation is paused while you get your bearings.",
    copy: "Your job is to build a dependable detection-to-response capability without exhausting the people or the budget. You can replay this tour from Save & settings at any time.",
    cue: "The top bar tracks time, weather, funds, staffing, operational assets and the base rating.",
  },
  {
    kicker: "1 · Design",
    title: "Configure capability in useful batches.",
    copy: "Open Capability, choose a sensor or mobile platform, add compatible modules and set a quantity from 1 to 99. Sentinel Base shows per-unit and batch lifecycle cost before you commit.",
    cue: "Start with complementary coverage instead of buying one expensive device for every problem.",
  },
  {
    kicker: "2 · Deliver",
    title: "The assurance pipeline runs on autopilot.",
    copy: "Supplier delivery, ICD integration, factory acceptance and site acceptance advance automatically when prerequisites and funds are available. Approve all ready can clear every immediately actionable gate in one command.",
    cue: "You still choose where a tested asset is deployed; placement and orientation determine whether it is useful.",
  },
  {
    kicker: "3 · Observe",
    title: "C2 validates and responds autonomously.",
    copy: "The Operations window is a live read-only record. Operators classify alarms and dispatch troopers, robots or drones without requiring button presses from you.",
    cue: "Your leverage is architectural: coverage, alarm quality, staffing and mobile support shape the outcomes.",
  },
  {
    kicker: "4 · Improve",
    title: "Security, people and cost all count.",
    copy: "Use Finance, People and Capability rating to find the next constraint. Weekly funding reacts to proven performance, while avoidable losses and nuisance alarms erode confidence.",
    cue: "Resume at 1×, 2× or 4× when you are ready. Space pauses whenever you need to think.",
  },
] as const;

export class SentinelBaseApp {
  private readonly renderer: IsoRenderer;
  private readonly bus = new EventBus();
  private state: GameState | null = null;
  private readonly previewState = createGame("sandbox", 331_909);
  private screen: Screen = "title";
  private panel: Panel = null;
  private selectedModelId = "camera-edge";
  private selectedUpgradeIds = new Set<string>(["va-intrusion"]);
  private procurementQuantity = 1;
  private placementOrderId: string | null = null;
  private placementRotation = 0;
  private bulldozing = false;
  private showCoverage = false;
  private selectedDeviceId: string | null = null;
  private hoverTile: { x: number; y: number } | null = null;
  private pointer = { x: 0, y: 0, down: false, moved: false, startX: 0, startY: 0 };
  private readonly keys = new Set<string>();
  private lastFrame = performance.now();
  private accumulator = 0;
  private lastHudUpdate = 0;
  private panelFingerprint = "";
  private lastOutcomeStatus: GameState["scenarioStatus"] | null = null;
  private toastCounter = 0;
  private walkthroughStep: number | null = null;
  private walkthroughPreviousSpeed: 1 | 2 | 4 = 1;
  private walkthroughWasPaused = false;
  private walkthroughDontShow = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly importInput: HTMLInputElement,
  ) {
    this.renderer = new IsoRenderer(canvas);
    this.bus.on("notification", ({ message, tone }) => this.toast(message, tone));
    this.bindEvents();
    const requestedScenario = new URLSearchParams(window.location.search).get("scenario");
    if (requestedScenario && SCENARIOS.some((scenario) => scenario.id === requestedScenario)) {
      this.state = createGame(requestedScenario);
      this.applySentinelBranding(this.state);
      this.screen = "game";
      const requestedPanel = new URLSearchParams(window.location.search).get("panel") as Panel;
      const availablePanels: Panel[] = ["capability", "pipeline", "operations", "staff", "finance", "rating", "objectives", "settings", "device"];
      if (availablePanels.includes(requestedPanel)) this.panel = requestedPanel;
    }
    this.renderScreen();
    if (this.screen === "game") this.startWalkthrough(false);
    requestAnimationFrame((time) => this.loop(time));
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => this.renderer.resize());
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));
    this.root.addEventListener("input", (event) => this.handleInput(event));
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.cancelTool();
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.renderer.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()));
    this.importInput.addEventListener("change", () => this.importSave());
  }

  private loop(time: number): void {
    const elapsed = Math.min(0.25, Math.max(0, (time - this.lastFrame) / 1_000));
    this.lastFrame = time;
    this.moveCamera(elapsed);

    if (this.state && this.screen === "game" && this.state.speed > 0 && this.state.scenarioStatus === "active") {
      this.accumulator += elapsed;
      let majorChange = false;
      while (this.accumulator >= SIM_STEP_SECONDS) {
        const update = advanceSimulation(this.state, GAME_MINUTES_PER_STEP * this.state.speed);
        this.accumulator -= SIM_STEP_SECONDS;
        majorChange ||= update.majorChange;
        if (update.autosaveDue) {
          if (this.safeBrowserSave("autosave")) this.bus.emit("notification", { title: "Autosaved", message: "Monthly autosave complete.", tone: "info" });
        }
        if (update.scenarioEnded) this.safeBrowserSave("autosave");
      }
      if (majorChange) this.refreshPanelIfChanged();
    }

    const renderState = this.state && this.screen === "game" ? this.state : this.previewState;
    this.renderer.render(renderState, this.screen === "game" ? this.currentOverlay() : undefined);
    if (time - this.lastHudUpdate > 220) {
      this.updateHud();
      this.lastHudUpdate = time;
    }
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  private renderScreen(): void {
    if (this.screen === "title") this.renderTitle();
    else if (this.screen === "scenarios") this.renderScenarios();
    else if (this.screen === "saves") this.renderSaves();
    else this.renderGameShell();
  }

  private renderTitle(): void {
    const saves = listSaves();
    this.root.innerHTML = `
      <main class="landing-shell">
        <section class="title-card" aria-labelledby="game-title">
          <div class="brand-lockup">
            <div class="brand-mark" aria-hidden="true"><span></span><i></i></div>
            <div><p class="overline">An autonomous base-security simulation</p><p class="edition">Security capability · autonomous C2 · command</p></div>
          </div>
          <div class="title-content">
            <p class="command-tag"><span></span> SENTINEL NETWORK // 06:00</p>
            <h1 id="game-title"><small>Sentinel</small> Base</h1>
            <p class="lead">Design the sensors. Deliver assured capability. Look after the people. Then watch your base see a threat, understand it and respond.</p>
            <div class="title-actions">
              <button class="button button-primary button-large" data-action="new-game"><span aria-hidden="true">◆</span> New operation</button>
              <button class="button button-light button-large" data-action="start-sandbox"><span aria-hidden="true">∞</span> Sandbox</button>
              <button class="button button-quiet button-large" data-action="continue" ${saves.length === 0 ? "disabled" : ""}><span aria-hidden="true">↻</span> Continue</button>
            </div>
          </div>
          <div class="title-footer">
            <div><strong>100 × 100</strong><span>living isometric base</span></div>
            <div><strong>Full lifecycle</strong><span>procure → integrate → test</span></div>
            <div><strong>One base</strong><span>people · risk · money · time</span></div>
          </div>
        </section>
        <aside class="brief-card">
          <div class="brief-card-top"><span class="status-dot"></span><span>Morning brief</span><b>06:00</b></div>
          <div class="brief-map" aria-hidden="true"><div class="radar-ring ring-a"></div><div class="radar-ring ring-b"></div><div class="radar-sweep"></div><span class="ping p1"></span><span class="ping p2"></span><span class="brief-fence"></span></div>
          <div class="brief-copy"><p>“Capability is not what we bought. It is what works on a wet night, with a tired team and a real alarm.”</p><span>— Commander’s intent</span></div>
          <div class="brief-stats"><div><span>Legacy coverage</span><strong>18%</strong></div><div><span>Open risks</span><strong>4</strong></div><div><span>Weather</span><strong>Clear</strong></div></div>
        </aside>
      </main>
      <div class="corner-build">SENTINEL BASE · ISMS SIMULATION</div>`;
  }

  private renderScenarios(): void {
    this.root.innerHTML = `
      <main class="menu-shell">
        <header class="menu-header"><button class="icon-button" data-action="back-title" aria-label="Back">←</button><div><p class="overline">New operation</p><h1>Select a command brief</h1></div></header>
        <section class="scenario-grid" aria-label="Scenarios">
          ${SCENARIOS.filter((scenario) => scenario.id !== "sandbox").map((scenario, index) => `
            <article class="scenario-card ${index === 0 ? "featured" : ""}">
              <div class="scenario-art scenario-art-${index + 1}"><span class="scenario-number">0${index + 1}</span><span class="difficulty">${scenario.difficulty}</span><div class="iso-mini" aria-hidden="true"><i></i><b></b><em></em></div></div>
              <div class="scenario-copy"><p class="overline">${escapeHtml(scenario.subtitle)}</p><h2>${escapeHtml(scenario.name)}</h2><p>${escapeHtml(scenario.description)}</p><div class="objective-box"><span>Commander objective</span><strong>${escapeHtml(scenario.objectiveText)}</strong></div><button class="button button-primary" data-action="scenario-start" data-id="${scenario.id}">Accept command →</button></div>
            </article>`).join("")}
        </section>
        <section class="sandbox-strip"><div><span class="sandbox-icon">∞</span><div><p class="overline">No deadline · all systems available</p><h2>Open Command sandbox</h2><p>Build indefinitely, tune your architecture and chase the highest capability score.</p></div></div><button class="button button-light" data-action="start-sandbox">Enter sandbox →</button></section>
      </main>`;
  }

  private renderSaves(): void {
    const saves = listSaves().flatMap((slot) => {
      try {
        return [{ slot, saved: deserializeState(slot.state), scenario: getScenario(slot.scenarioId) }];
      } catch {
        return [];
      }
    });
    this.root.innerHTML = `
      <main class="menu-shell save-menu">
        <header class="menu-header"><button class="icon-button" data-action="back-title" aria-label="Back">←</button><div><p class="overline">Continue command</p><h1>Saved operations</h1></div></header>
        <section class="save-grid">
          ${saves.length ? saves.map(({ slot, saved, scenario }) => {
            const baseName = slot.campName === "Camp Overwatch" ? "Sentinel Base" : slot.campName;
            return `<article class="save-card"><div class="save-icon">${slot.id === "autosave" ? "A" : "M"}</div><div><span>${slot.id === "autosave" ? "Monthly autosave" : "Manual save"}</span><h2>${escapeHtml(baseName)}</h2><p>${escapeHtml(scenario.name)} · ${formatDate(saved.totalMinutes)} · Rating ${saved.rating.campRating}</p><small>${new Date(slot.savedAt).toLocaleString()}</small></div><button class="button button-primary" data-action="load-slot" data-id="${slot.id}">Load</button></article>`;
          }).join("") : `<div class="empty-state"><span>◇</span><h2>No saved operations</h2><p>Monthly autosaves and manual saves will appear here.</p></div>`}
        </section>
      </main>`;
  }

  private renderGameShell(): void {
    if (!this.state) return;
    this.lastOutcomeStatus = null;
    this.root.innerHTML = `
      <div class="game-ui">
        <header class="topbar">
          <button class="camp-identity" data-action="open-settings"><span class="camp-badge">SB</span><span><strong id="hud-camp">${escapeHtml(this.state.campName)}</strong><small id="hud-date"></small></span></button>
          <div class="top-divider"></div>
          <button class="weather-block" data-action="open-objectives"><span id="hud-weather-icon" class="weather-icon">☀</span><span><strong id="hud-clock"></strong><small id="hud-weather"></small></span></button>
          <div class="top-metrics">
            <button class="top-metric" data-action="open-finance"><span>Available funds</span><strong id="hud-cash"></strong><small id="hud-burn"></small></button>
            <button class="top-metric" data-action="open-staff"><span>On duty</span><strong id="hud-staff"></strong><small>troopers · operators</small></button>
            <button class="top-metric" data-action="open-pipeline"><span>Operational assets</span><strong id="hud-assets"></strong><small id="hud-faults"></small></button>
            <button class="top-metric rating-metric" data-action="open-rating"><span>Security capability</span><strong><b id="hud-rating"></b><em>/100</em></strong><small id="hud-tier"></small></button>
          </div>
          <div class="speed-controls" aria-label="Simulation speed">
            <button data-action="speed" data-speed="0" title="Pause (Space)" aria-label="Pause">Ⅱ</button>
            <button data-action="speed" data-speed="1">1×</button><button data-action="speed" data-speed="2">2×</button><button data-action="speed" data-speed="4">4×</button>
          </div>
          <button class="icon-button settings-button" data-action="open-settings" title="Save and settings" aria-label="Save and settings">⚙</button>
        </header>

        <aside class="objective-dock">
          <div class="dock-heading"><div><p class="overline">Commander intent</p><strong id="objective-title"></strong></div><button data-action="open-objectives" aria-label="Open all objectives">↗</button></div>
          <p id="objective-copy" class="objective-copy"></p>
          <div id="objective-progress" class="objective-progress"></div>
          <div class="tutorial-mini"><div><span>Operational checklist</span><b id="tutorial-count"></b></div><div id="tutorial-items"></div></div>
        </aside>

        <button class="alarm-beacon" data-action="open-operations" aria-label="Open autonomous C2 activity"><span class="alarm-pulse"></span><b id="alarm-count">0</b><span><strong>Autonomous C2</strong><small id="alarm-summary">No active alarms</small></span></button>

        <nav class="map-controls" aria-label="Map view controls">
          <button data-action="zoom-out" title="Zoom out (−)" aria-label="Zoom out">−</button>
          <button data-action="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button>
          <button class="fit-control" data-action="fit-perimeter" title="Fit base perimeter (Home)"><span>◇</span> Fit perimeter</button>
        </nav>

        <div class="message-ticker" aria-live="polite"><span id="ticker-tone" class="ticker-marker"></span><strong id="ticker-title"></strong><span id="ticker-text"></span></div>

        <footer class="toolbar" aria-label="Build and management tools">
          ${toolButton("capability", "＋", "Capability", "Configure and procure sensors")}
          ${toolButton("pipeline", "⇄", "Delivery", "Integration, testing and deployment")}
          ${toolButton("operations", "⌁", "Operations", "Observe autonomous C2 activity")}
          <div class="toolbar-divider"></div>
          ${toolButton("staff", "♟", "People", "Staff, shifts and happiness")}
          ${toolButton("finance", "$", "Finance", "Funding, O&S and ledger")}
          ${toolButton("rating", "◇", "Capability", "Security rating breakdown")}
          <div class="toolbar-divider"></div>
          <button class="tool-button" data-action="toggle-coverage" title="Toggle device coverage (F)"><span class="tool-icon">◎</span><small>Coverage</small></button>
          <button class="tool-button danger-tool" data-action="bulldoze" title="Decommission an asset"><span class="tool-icon">⌫</span><small>Remove</small></button>
        </footer>

        <div id="placement-ribbon" class="placement-ribbon" hidden></div>
        <section id="panel-host" class="window-host" aria-live="polite"></section>
        <div id="toast-stack" class="toast-stack" aria-live="polite"></div>
        <div id="scenario-outcome"></div>
        <div id="walkthrough-host"></div>
      </div>`;
    this.updateHud();
    this.renderPanel();
    this.renderWalkthrough();
  }

  private updateHud(): void {
    if (!this.state || this.screen !== "game") return;
    const state = this.state;
    const scenario = getScenario(state.scenarioId);
    const time = new Date();
    void time;
    setText("hud-camp", state.campName);
    setText("hud-date", formatDate(state.totalMinutes));
    setText("hud-clock", formatClock(state.totalMinutes));
    setText("hud-weather", `${titleCase(state.weather.kind)} · ${state.weather.temperature}°C`);
    setText("hud-weather-icon", weatherIcon(state.weather.kind));
    setText("hud-cash", formatMoney(state.economy.cash));
    const monthly = projectedMonthlyCosts(state);
    setText("hud-burn", `${formatMoney(monthly.total)}/mo forecast`);
    const hour = Math.floor((state.totalMinutes % 1_440) / 60);
    const shift = hour < 8 ? 0 : hour < 16 ? 1 : 2;
    const onTroopers = state.staff.filter((member) => member.role === "trooper" && member.shift === shift).length;
    const onOperators = state.staff.filter((member) => member.role === "operator" && member.shift === shift).length;
    setText("hud-staff", `${onTroopers} · ${onOperators}`);
    const operational = state.devices.filter((device) => device.status === "operational").length;
    const faults = state.devices.filter((device) => device.status === "fault").length;
    setText("hud-assets", `${operational} / ${state.devices.length}`);
    setText("hud-faults", faults ? `${faults} fault${faults === 1 ? "" : "s"}` : "all reporting");
    setText("hud-rating", String(state.rating.campRating));
    setText("hud-tier", `${state.rating.capabilityLevel} · ${state.rating.capabilityPoints.toLocaleString()} pts`);
    document.querySelectorAll<HTMLButtonElement>("[data-action='speed']").forEach((button) => button.classList.toggle("active", Number(button.dataset.speed) === state.speed));

    setText("objective-title", scenario.name);
    setText("objective-copy", scenario.objectiveText);
    const objectiveContainer = document.getElementById("objective-progress");
    if (objectiveContainer) {
      objectiveContainer.innerHTML = scenario.objectives.length ? scenario.objectives.slice(0, 3).map((objective) => {
        const value = objectiveValue(state, objective.metric);
        const percentage = Math.min(100, Math.max(0, (value / objective.target) * 100));
        return `<div class="mini-progress"><span><b>${escapeHtml(objective.label)}</b><em>${objective.metric === "cash" ? formatMoney(value) : Math.round(value)} / ${objective.metric === "cash" ? formatMoney(objective.target) : objective.target}</em></span><progress max="100" value="${percentage}">${percentage}%</progress></div>`;
      }).join("") : `<div class="sandbox-objective"><span>∞</span><p>Build freely. Funding scales with capability.</p></div>`;
    }

    const tutorial = tutorialEntries(state);
    const done = tutorial.filter((entry) => entry.done).length;
    setText("tutorial-count", `${done}/${tutorial.length}`);
    const tutorialItems = document.getElementById("tutorial-items");
    if (tutorialItems) {
      const visibleTutorial = [...tutorial.filter((entry) => !entry.done), ...tutorial.filter((entry) => entry.done)].slice(0, 4);
      tutorialItems.innerHTML = visibleTutorial.map((entry) => `<div class="tutorial-line ${entry.done ? "done" : ""}"><span>${entry.done ? "✓" : "○"}</span>${escapeHtml(entry.label)}</div>`).join("");
    }

    const active = activeIncidents(state);
    setText("alarm-count", String(active.length));
    setText("alarm-summary", active.length ? `${active.filter((incident) => incident.status === "verified" || incident.status === "responding").length} confirmed · oldest ${Math.max(0, Math.round((state.totalMinutes - (active[0]?.createdAt ?? state.totalMinutes)) / 60))}h` : "No active alarms");
    document.querySelector(".alarm-beacon")?.classList.toggle("has-alarms", active.length > 0);
    const latest = state.messages[0];
    setText("ticker-title", latest?.title ?? "Command network nominal");
    setText("ticker-text", latest?.text ?? "No new messages.");
    const marker = document.getElementById("ticker-tone");
    if (marker) marker.className = `ticker-marker ${latest?.tone ?? "info"}`;

    this.updatePlacementRibbon();
    this.renderOutcome();
  }

  private renderPanel(): void {
    const host = document.getElementById("panel-host");
    if (!host || !this.state || !this.panel) {
      if (host) host.innerHTML = "";
      return;
    }
    const previousBody = host.querySelector<HTMLElement>(".window-body");
    const previousScrollTop = previousBody?.scrollTop ?? 0;
    const activeElement = document.activeElement instanceof HTMLElement && host.contains(document.activeElement)
      ? document.activeElement as HTMLElement
      : null;
    const focusId = activeElement?.id ?? "";
    const focusKey = activeElement?.dataset.focusKey ?? "";
    const selection = activeElement instanceof HTMLInputElement
      ? { start: activeElement.selectionStart, end: activeElement.selectionEnd }
      : null;
    host.innerHTML = `<div class="game-window" role="dialog" aria-modal="false" aria-label="${panelTitle(this.panel)}"><header class="window-header"><div><span class="window-kicker">${panelKicker(this.panel)}</span><h2>${panelTitle(this.panel)}</h2></div><button class="window-close" data-action="close-panel" aria-label="Close">×</button></header><div class="window-body">${this.panelContent()}</div></div>`;
    const nextBody = host.querySelector<HTMLElement>(".window-body");
    if (nextBody) nextBody.scrollTop = previousScrollTop;
    const nextFocus = (focusId ? document.getElementById(focusId) : null)
      ?? (focusKey ? [...host.querySelectorAll<HTMLElement>("[data-focus-key]")].find((element) => element.dataset.focusKey === focusKey) ?? null : null);
    if (nextFocus) {
      nextFocus.focus({ preventScroll: true });
      if (selection && nextFocus instanceof HTMLInputElement && selection.start !== null && selection.end !== null) {
        nextFocus.setSelectionRange(selection.start, selection.end);
      }
      if (nextBody) nextBody.scrollTop = previousScrollTop;
    }
    this.panelFingerprint = this.getPanelFingerprint();
  }

  private panelContent(): string {
    if (!this.state) return "";
    if (this.panel === "capability") return this.capabilityPanel();
    if (this.panel === "pipeline") return this.pipelinePanel();
    if (this.panel === "operations") return this.operationsPanel();
    if (this.panel === "staff") return this.staffPanel();
    if (this.panel === "finance") return this.financePanel();
    if (this.panel === "rating") return this.ratingPanel();
    if (this.panel === "objectives") return this.objectivesPanel();
    if (this.panel === "settings") return this.settingsPanel();
    if (this.panel === "device") return this.devicePanel();
    return "";
  }

  private capabilityPanel(): string {
    if (!this.state) return "";
    const model = getModel(this.selectedModelId);
    const selected = [...this.selectedUpgradeIds].filter((id) => getUpgrade(id).kinds.includes(model.kind));
    const stats = configuredStats(model.id, selected);
    const quantity = Math.max(1, Math.min(99, Math.round(this.procurementQuantity)));
    const batchPurchase = stats.purchaseCost * quantity;
    const batchProgramme = stats.totalProgrammeCost * quantity;
    const cashAfter = this.state.economy.cash - batchPurchase;
    return `
      <div class="window-intro"><span class="intro-icon">＋</span><div><strong>Capability builder</strong><p>Configure once, procure 1–99 identical assets, and see the complete batch commitment before approval.</p></div></div>
      <div class="catalog-tabs">${DEVICE_MODELS.map((item) => `<button class="catalog-tab ${item.id === model.id ? "active" : ""}" data-action="select-model" data-id="${item.id}"><span>${deviceGlyph(item.kind)}</span><small>${escapeHtml(item.shortName)}</small><b>${formatMoney(item.cost)}</b></button>`).join("")}</div>
      <section class="config-hero"><div><span class="kind-chip">${titleCase(model.kind)}</span><h3>${escapeHtml(model.name)}</h3><p>${escapeHtml(model.description)}</p></div><div class="config-price"><span>Batch acquisition</span><strong>${formatMoney(batchPurchase)}</strong><small>${formatMoney(stats.purchaseCost)} each · ${formatMoney(batchProgramme)} through acceptance</small></div></section>
      <section class="quantity-card"><div><label for="procurement-quantity">Procurement quantity</label><small>One certified configuration, repeated across the batch.</small></div><div class="quantity-control"><button data-action="quantity-down" aria-label="Decrease quantity">−</button><input id="procurement-quantity" data-focus-key="procurement-quantity" data-quantity type="number" inputmode="numeric" min="1" max="99" step="1" value="${quantity}" aria-label="Procurement quantity"><button data-action="quantity-up" aria-label="Increase quantity">+</button></div></section>
      <section class="config-section"><div class="section-title"><h3>Configuration add-ons</h3><span>${selected.length} selected · applied to all ${quantity}</span></div><div class="upgrade-grid">${upgradesFor(model.kind).map((upgrade) => `<label class="upgrade-option ${this.selectedUpgradeIds.has(upgrade.id) ? "selected" : ""}"><input type="checkbox" data-focus-key="upgrade-${upgrade.id}" data-upgrade="${upgrade.id}" ${this.selectedUpgradeIds.has(upgrade.id) ? "checked" : ""}><span><b>${escapeHtml(upgrade.name)}</b><small>${escapeHtml(upgrade.description)}</small></span><strong>+${formatMoney(upgrade.cost)} ea</strong></label>`).join("") || `<p class="muted-copy">This capability has no optional modules.</p>`}</div></section>
      <section class="performance-card"><div class="section-title"><h3>Forecast performance</h3><span>before placement effects</span></div><div class="performance-grid">${metricBar("Range", `${Math.round(stats.range)} tiles`, Math.min(100, stats.range * 5))}${metricBar("Detection", `${Math.round(stats.accuracy * 100)}%`, stats.accuracy * 100)}${metricBar("Availability", `${(stats.availability * 100).toFixed(1)}%`, stats.availability * 100)}${metricBar("False alarm", `${(stats.falseAlarmRate * 100).toFixed(1)}%`, Math.max(5, 100 - stats.falseAlarmRate * 2_500), true)}</div></section>
      <div class="cost-breakdown"><div><span>Hardware & options</span><b>${formatMoney(batchPurchase)}</b></div><div><span>ICD / integration</span><b>${formatMoney(model.integrationCost * quantity)}</b></div><div><span>Factory test + SAT</span><b>${formatMoney((model.testCost + model.commissionCost) * quantity)}</b></div><div><span>Lead time</span><b>${model.leadHours}h</b></div><div><span>Forecast O&S</span><b>${formatMoney(stats.monthlyOps * quantity)}/mo</b></div><div><span>Whole programme</span><b>${formatMoney(batchProgramme)}</b></div></div>
      <div class="commit-bar ${cashAfter < 0 ? "insufficient" : ""}"><div><span>Available after batch order</span><strong>${formatMoney(cashAfter)}</strong><small>${quantity} × ${escapeHtml(model.shortName)}</small></div><button class="button button-primary" data-action="procure" ${cashAfter < 0 ? "disabled" : ""}>Approve ${quantity} asset${quantity === 1 ? "" : "s"} · ${formatMoney(batchPurchase)}</button></div>`;
  }

  private pipelinePanel(): string {
    if (!this.state) return "";
    const orders = this.state.orders;
    const installed = this.state.devices.filter((device) => device.status !== "operational");
    const readyApprovals = orders.filter((order) => order.stage === "integration-review" || order.stage === "factory-test").length
      + installed.filter((device) => device.status === "awaiting-sat").length;
    return `
      <div class="autopilot-banner"><span class="autopilot-orbit" aria-hidden="true">◎</span><div><strong>Delivery autopilot is active</strong><p>Supplier delivery, ICD integration, factory acceptance and site acceptance advance automatically when prerequisites and funds permit.</p></div><span class="autopilot-live">LIVE</span></div>
      <div class="summary-row"><div><span>Active projects</span><strong>${orders.length}</strong></div><div><span>Ready approvals</span><strong>${readyApprovals}</strong></div><div><span>Operational</span><strong>${this.state.devices.filter((device) => device.status === "operational").length}</strong></div></div>
      ${readyApprovals > 0 ? `<div class="bulk-approval"><div><strong>${readyApprovals} gate${readyApprovals === 1 ? "" : "s"} can move now</strong><small>Autopilot will handle these on its next pass; approve immediately if schedule matters.</small></div><button class="button button-primary button-small" data-action="approve-all-ready">Approve all ready</button></div>` : ""}
      <section class="pipeline-section"><div class="section-title"><h3>Delivery portfolio</h3><span>Procure → assure automatically → deploy</span></div>
      ${orders.length ? `<div class="pipeline-list">${orders.map((order) => this.orderCard(order)).join("")}</div>` : emptyBlock("No active purchase orders", "Configure a sensor or mobile asset in the Capability builder.", "open-capability", "Configure capability")}</section>
      <section class="pipeline-section"><div class="section-title"><h3>Site acceptance & repair</h3><span>Autonomous work queue</span></div>
      ${installed.length ? `<div class="pipeline-list">${installed.map((device) => this.installedCard(device)).join("")}</div>` : `<p class="quiet-row">No installed assets are waiting for acceptance or repair.</p>`}</section>
      <section class="pipeline-section"><div class="section-title"><h3>Operational registry</h3><span>${this.state.devices.filter((device) => device.status === "operational").length} online</span></div><div class="registry-list">${this.state.devices.filter((device) => device.status === "operational").map((device) => `<button data-action="inspect-device" data-id="${device.id}"><span class="device-dot ${device.status}"></span><span><b>${escapeHtml(device.name)}</b><small>Sector ${Math.round(device.x)}.${Math.round(device.y)} · ${(device.health * 100).toFixed(0)}% condition</small></span><em>›</em></button>`).join("")}</div></section>`;
  }

  private orderCard(order: ProcurementOrder): string {
    if (!this.state) return "";
    const model = getModel(order.modelId);
    const stages = ["procurement", "integration-review", "integrating", "factory-test", "testing", "ready"];
    const stageIndex = stages.indexOf(order.stage);
    const action = order.stage === "ready"
      ? `<button class="button button-primary button-small" data-action="order-deploy" data-id="${order.id}">Deploy on map →</button>`
      : order.stage === "integration-review" || order.stage === "factory-test"
        ? `<span class="eta-pill ready">Autopilot ready</span>`
        : `<span class="eta-pill">${formatDuration(order.readyAt - this.state.totalMinutes)} remaining</span>`;
    return `<article class="pipeline-card"><header><div class="device-glyph">${deviceGlyph(model.kind)}</div><div><span>${stageLabel(order.stage)}</span><h4>${escapeHtml(model.name)}</h4><small>${order.upgradeIds.length ? order.upgradeIds.map((id) => getUpgrade(id).name).join(" · ") : "Standard configuration"}</small></div></header><div class="stage-track">${stages.slice(0, 6).map((stage, index) => `<i class="${index < stageIndex ? "done" : index === stageIndex ? "current" : ""}" title="${stageLabel(stage)}"></i>`).join("")}</div><footer><span>Programme ${formatMoney(order.quotedCost)}</span>${action}</footer></article>`;
  }

  private installedCard(device: Device): string {
    if (!this.state) return "";
    const model = getModel(device.modelId);
    const action = device.status === "awaiting-sat"
      ? `<span class="eta-pill ready">SAT autopilot ready</span>`
      : `<span class="eta-pill">${device.status === "fault" ? "Engineer repair" : "SAT in progress"} · ${formatDuration(device.readyAt - this.state.totalMinutes)}</span>`;
    return `<article class="site-card"><div class="device-glyph">${deviceGlyph(model.kind)}</div><div><span>${titleCase(device.status.replace("-", " "))}</span><h4>${escapeHtml(device.name)}</h4><small>Sector ${Math.round(device.x)}.${Math.round(device.y)}</small></div>${action}</article>`;
  }

  private operationsPanel(): string {
    if (!this.state) return "";
    const active = activeIncidents(this.state).sort((a, b) => a.createdAt - b.createdAt);
    const history = this.state.incidents.filter((incident) => !active.includes(incident)).slice(-12).reverse();
    return `
      <div class="console-status autonomous"><span class="console-light"></span><div><strong>Autonomous C2 is online</strong><small>${active.length ? `${active.length} alarm${active.length === 1 ? "" : "s"} moving through validation and response` : "All queues are clear"}</small></div><span>${this.state.rating.operatorHappiness}% operator happiness</span></div>
      <div class="read-only-note"><span aria-hidden="true">◉</span><div><strong>Observe, then improve the system</strong><p>Operators validate evidence and dispatch available responders automatically. This console is read-only; change coverage, alarm quality or staffing to change future outcomes.</p></div></div>
      <section class="incident-section"><div class="section-title"><h3>Live activity</h3><span>Ground truth appears only after autonomous validation</span></div>
      ${active.length ? `<div class="incident-list">${active.map((incident) => this.incidentCard(incident)).join("")}</div>` : `<div class="all-clear"><span>✓</span><h3>No active alarms</h3><p>Operators are monitoring integrated feeds and manual legacy cameras.</p></div>`}</section>
      <section class="incident-section"><div class="section-title"><h3>Recent outcomes</h3><span>After-action record</span></div><div class="history-list">${history.length ? history.map((incident) => `<button data-action="focus-incident" data-id="${incident.id}"><span class="history-state ${incident.status}">${incident.status === "resolved" || incident.status === "dismissed" ? "✓" : "!"}</span><span><b>${incidentName(incident.type)}</b><small>${escapeHtml(incident.resolution ?? "Closed without narrative.")}</small></span><time>${formatDate(incident.createdAt)}</time></button>`).join("") : `<p class="quiet-row">No completed incidents yet.</p>`}</div></section>`;
  }

  private incidentCard(incident: Incident): string {
    if (!this.state) return "";
    const sources = incident.sourceDeviceIds.map((id) => this.state?.devices.find((device) => device.id === id)?.name).filter(Boolean).join(", ");
    const action = incident.status === "new"
      ? `<span class="eta-pill ready">Validation queued</span>`
      : incident.status === "verified"
        ? `<span class="eta-pill priority-pill">Dispatch queued</span>`
        : `<span class="eta-pill">${stageLabel(incident.status)} · ${formatDuration(incident.readyAt - this.state.totalMinutes)}</span>`;
    const remaining = Math.max(0, incident.deadlineAt - this.state.totalMinutes);
    return `<article class="incident-card ${incident.status === "verified" ? "priority" : ""}"><header><span class="incident-icon">${incidentIcon(incident.type)}</span><div><span>${stageLabel(incident.status)} · ${Math.round(incident.confidence * 100)}% confidence</span><h4>${incidentName(incident.type)}</h4><small>Sector ${Math.round(incident.x)}.${Math.round(incident.y)} · source: ${escapeHtml(sources || "operator observation")}</small></div><button class="focus-button" data-action="focus-incident" data-id="${incident.id}" title="Focus map">⌖</button></header><div class="confidence-line"><i style="width:${incident.confidence * 100}%"></i></div><footer><span>${formatDuration(remaining)} response window</span>${action}</footer></article>`;
  }

  private staffPanel(): string {
    if (!this.state) return "";
    const roles: StaffRole[] = ["trooper", "operator", "engineer"];
    return `
      <div class="people-hero"><div class="people-score"><strong>${this.state.rating.peopleWellbeing}</strong><span>Workforce<br>wellbeing</span></div><div><h3>People make capability real.</h3><p>Balanced shifts, useful alarms and reliable equipment raise performance. Repeated unnecessary dispatches do not.</p></div></div>
      <div class="role-cards">${roles.map((role) => {
        const people = this.state?.staff.filter((member) => member.role === role) ?? [];
        const average = people.length ? people.reduce((sum, member) => sum + member.happiness, 0) / people.length : 0;
        const salary = role === "trooper" ? 18_000 : role === "operator" ? 22_000 : 25_000;
        return `<article><span class="role-glyph ${role}">${role === "trooper" ? "♟" : role === "operator" ? "⌁" : "⌘"}</span><div><span>${titleCase(role)}s</span><strong>${people.length}</strong><small>${Math.round(average)}% happy · ${formatMoney(salary)}/mo each</small></div><button class="button button-light button-small" data-action="hire" data-role="${role}">Hire · ${role === "engineer" ? "$12k" : "$8k"}</button></article>`;
      }).join("")}</div>
      <section class="staff-roster"><div class="section-title"><h3>Shift roster</h3><span>00–08 · 08–16 · 16–00</span></div><table><thead><tr><th>Person</th><th>Shift</th><th>Task</th><th>Happiness</th><th>Fatigue</th></tr></thead><tbody>${this.state.staff.map((member) => `<tr><td><span class="person-dot ${member.role}"></span><b>${escapeHtml(member.name)}</b><small>${titleCase(member.role)}</small></td><td>${member.shift === 0 ? "00–08" : member.shift === 1 ? "08–16" : "16–00"}</td><td>${titleCase(member.status)}</td><td>${inlineMeter(member.happiness, happinessTone(member.happiness))}</td><td>${inlineMeter(member.fatigue, member.fatigue > 70 ? "bad" : "neutral")}</td></tr>`).join("")}</tbody></table></section>`;
  }

  private financePanel(): string {
    if (!this.state) return "";
    const economy = this.state.economy;
    const costs = projectedMonthlyCosts(this.state);
    const weeklyFunding = weeklyFundingAmount(this.state);
    const entries = [...economy.ledger].reverse().slice(0, 30);
    return `
      <div class="finance-hero"><div><span>Available command funds</span><strong>${formatMoney(economy.cash)}</strong><small>${formatMoney(costs.total)} forecast monthly O&S</small></div><div class="finance-spark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="finance-cards"><div><span>Next weekly injection</span><strong>${formatMoney(weeklyFunding)}</strong><small>Minimum $2m · uncapped upside</small></div><div><span>Lifetime funding</span><strong>${formatMoney(economy.lifetimeFunding)}</strong><small>Initial + weekly allocations</small></div><div><span>Lifecycle spend</span><strong>${formatMoney(economy.lifetimeSpend)}</strong><small>All ledgered cash outflows</small></div><div><span>Verified savings</span><strong>${formatMoney(economy.realisedSavings)}</strong><small>Against conventional baseline</small></div><div><span>Losses avoided</span><strong>${formatMoney(economy.avoidedLosses)}</strong><small>Intercepted threat value</small></div></div>
      <section class="forecast-card"><div class="section-title"><h3>Recurring cost forecast</h3><span>Weekly command funding responds to security health</span></div><div><span>Next weekly injection</span><b>${formatMoney(weeklyFunding)}</b></div><div><span>Payroll</span><b>${formatMoney(costs.payroll)}</b></div><div><span>Device O&S</span><b>${formatMoney(costs.operations)}</b></div><div class="forecast-total"><span>Total monthly burn</span><b>${formatMoney(costs.total)}</b></div></section>
      <section class="ledger"><div class="section-title"><h3>Traceable ledger</h3><span>${economy.ledger.length} entries · balance reconciled</span></div><table><thead><tr><th>Date</th><th>Transaction</th><th>Category</th><th>Amount</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${formatDate(entry.minute)}</td><td>${escapeHtml(entry.description)}</td><td><span class="ledger-chip">${entry.category}</span></td><td class="${entry.amount >= 0 ? "positive" : "negative"}">${entry.amount >= 0 ? "+" : ""}${formatMoney(entry.amount)}</td></tr>`).join("")}</tbody></table></section>`;
  }

  private ratingPanel(): string {
    if (!this.state) return "";
    const rating = this.state.rating;
    const hardened = isHardenedPerimeter(this.state);
    const components = [
      ["Operational security", rating.securityEffectiveness, 30, "Coverage, alarm quality, interdiction and uptime"],
      ["Response readiness", rating.responseReadiness, 23, "Available responders, fatigue and autonomous decision speed"],
      ["People & wellbeing", rating.peopleWellbeing, 14, "Trooper and operator happiness after workload and fatigue"],
      ["Cost effectiveness", rating.costEffectiveness, 13, "Delivered security, avoided losses and verified savings"],
      ["Asset uptime", rating.uptime, 10, "Commissioned assets that remain online"],
      ["Fused detection", rating.detectionFusion, 10, "Complementary sensor evidence at likely ingress sectors"],
    ] as const;
    return `
      <div class="rating-hero"><div class="rating-ring" style="--score:${rating.securityHealth * 3.6}deg"><div><strong>${rating.securityHealth}</strong><span>/100</span></div></div><div><p class="overline">Security Health</p><h3>${rating.capabilityLevel}</h3><p>${ratingNarrative(rating.securityHealth)}</p><span class="points-chip">${hardened ? "Assured perimeter active" : `${rating.capabilityPoints.toLocaleString()} lifetime points`}</span></div></div>
      <section class="score-formula"><div class="section-title"><h3>Security Health composition</h3><span>Weighted evidence minus cognitive workload</span></div>${components.map(([label, value, weight, copy]) => `<div class="score-row"><div><span><b>${label}</b><em>${weight}% weight</em></span><p>${copy}</p></div><strong>${Math.round(value)}</strong><progress max="100" value="${value}">${value}</progress></div>`).join("")}<div class="score-row"><div><span><b>Cognitive workload</b><em>-8% drag</em></span><p>Manual feeds, nuisance alarms and active queues reduce operator decision quality.</p></div><strong>${Math.round(rating.cognitiveLoad)}</strong><progress class="inverted" max="100" value="${rating.cognitiveLoad}">${rating.cognitiveLoad}</progress></div></section>
      <div class="rating-grid"><div><span>Threat-weighted coverage</span><strong>${rating.coverage}%</strong><small>${rating.coverage < 35 ? "Critical blind sectors remain" : "Coverage is contributing credibly"}</small></div><div><span>Fused detection</span><strong>${rating.detectionFusion}%</strong><small>Evidence quality at ingress sectors</small></div><div><span>Response readiness</span><strong>${rating.responseReadiness}%</strong><small>Available people and mobile systems</small></div><div><span>C2 workload</span><strong>${rating.cognitiveLoad}%</strong><small>Lower is better</small></div><div><span>Trooper happiness</span><strong>${rating.trooperHappiness}%</strong><small>Response confidence and workload</small></div><div><span>Operator happiness</span><strong>${rating.operatorHappiness}%</strong><small>Alarm quality and console workload</small></div></div>
      <div class="formula-note"><strong>How to harden the perimeter</strong><p>Pair coverage with fused evidence, protect operator attention, and keep responders ready. No troopers or operators caps Security Health at 39; weak fused detection caps it at 49. At 85 Health with high coverage, fusion, readiness and uptime, Sentinel Base enters an assured-perimeter state: intruders are always detected and intercepted.</p></div>`;
  }

  private objectivesPanel(): string {
    if (!this.state) return "";
    const scenario = getScenario(this.state.scenarioId);
    const tutorial = tutorialEntries(this.state);
    return `
      <div class="objective-hero"><span class="command-seal">SB</span><div><p class="overline">${scenario.difficulty} command brief</p><h3>${escapeHtml(scenario.name)}</h3><p>${escapeHtml(scenario.description)}</p></div></div>
      <section class="objective-list"><div class="section-title"><h3>Primary objectives</h3><span>${scenario.deadlineDays ? `Deadline · Day ${scenario.deadlineDays}` : "Endless operation"}</span></div>${scenario.objectives.length ? scenario.objectives.map((objective) => {
        const value = objectiveValue(this.state!, objective.metric);
        const met = value >= objective.target;
        return `<div class="objective-row ${met ? "done" : ""}"><span>${met ? "✓" : "○"}</span><div><b>${escapeHtml(objective.label)}</b><small>${objective.metric === "cash" ? formatMoney(value) : Math.round(value)} / ${objective.metric === "cash" ? formatMoney(objective.target) : objective.target}</small><progress max="${objective.target}" value="${Math.min(value, objective.target)}"></progress></div></div>`;
      }).join("") : `<div class="sandbox-mission"><span>∞</span><div><b>No final deadline</b><p>Build the strongest, happiest and most cost-effective security capability you can.</p></div></div>`}</section>
      <section class="checklist-full"><div class="section-title"><h3>First capability checklist</h3><span>${tutorial.filter((entry) => entry.done).length}/${tutorial.length} complete</span></div>${tutorial.map((entry, index) => `<div class="check-row ${entry.done ? "done" : ""}"><span>${entry.done ? "✓" : index + 1}</span><div><b>${escapeHtml(entry.label)}</b><small>${escapeHtml(entry.help)}</small></div></div>`).join("")}</section>
      <div class="controls-card"><h3>Controls</h3><div><span>Pan</span><b>WASD / arrows / drag</b></div><div><span>Zoom</span><b>+ / − / wheel</b></div><div><span>Time</span><b>Space · 1 · 2 · 4</b></div><div><span>Cancel</span><b>Esc / right-click</b></div><div><span>Coverage</span><b>F</b></div></div>`;
  }

  private settingsPanel(): string {
    if (!this.state) return "";
    return `
      <div class="settings-block"><label for="camp-name">Base name</label><div class="input-row"><input id="camp-name" maxlength="32" value="${escapeHtml(this.state.campName)}"><button class="button button-light button-small" data-action="rename-camp">Apply</button></div></div>
      <div class="settings-block walkthrough-setting"><div><h3>Guided walkthrough</h3><p>Replay the five-step Sentinel Base orientation. The simulation pauses while it is open and resumes at your previous speed when you finish.</p></div><button class="button button-light" data-action="walkthrough-replay">Replay walkthrough</button></div>
      <div class="settings-block"><h3>Save and recovery</h3><p>Full state is stored locally. Monthly closes create an automatic recovery point.</p><div class="settings-actions"><button class="button button-primary" data-action="save-manual">Save now</button><button class="button button-light" data-action="export-save">Export JSON</button><button class="button button-light" data-action="import-save">Import JSON</button></div></div>
      <div class="settings-block"><h3>Simulation</h3><div class="setting-row"><span>Fixed logic rate</span><b>10 ticks / second</b></div><div class="setting-row"><span>One game day</span><b>45 seconds at 1×</b></div><div class="setting-row"><span>Current seed</span><b>${this.state.seed}</b></div></div>
      <div class="settings-block danger-zone"><h3>Leave command</h3><p>Save first if you want to return to this operation.</p><button class="button button-danger" data-action="quit-title">Quit to title</button></div>`;
  }

  private devicePanel(): string {
    if (!this.state) return "";
    const device = this.state.devices.find((candidate) => candidate.id === this.selectedDeviceId);
    if (!device) return `<p class="quiet-row">Select a device on the map or in the registry.</p>`;
    const model = getModel(device.modelId);
    const stats = configuredStats(device.modelId, device.upgradeIds);
    return `
      <div class="device-inspector"><div class="large-device-glyph">${deviceGlyph(model.kind)}</div><div><span class="status-chip ${device.status}">${titleCase(device.status)}</span><h3>${escapeHtml(device.name)}</h3><p>${escapeHtml(model.description)}</p></div></div>
      <div class="inspector-stats"><div><span>Sector</span><b>${Math.round(device.x)}.${Math.round(device.y)}</b></div><div><span>Condition</span><b>${Math.round(device.health * 100)}%</b></div><div><span>Coverage range</span><b>${Math.round(stats.range)} tiles</b></div><div><span>Availability</span><b>${(stats.availability * 100).toFixed(1)}%</b></div><div><span>Detections</span><b>${device.detections}</b></div><div><span>False alarms</span><b>${device.falseAlarms}</b></div></div>
      <section class="settings-block"><h3>Certified configuration</h3><div class="module-list">${device.upgradeIds.length ? device.upgradeIds.map((id) => `<span>${escapeHtml(getUpgrade(id).name)}</span>`).join("") : `<p class="muted-copy">Standard configuration; no optional modules.</p>`}</div></section>
      <div class="formula-note"><strong>Operational effect</strong><p>${device.status === "operational" ? "This asset contributes to detection coverage, uptime and the base capability score." : "This asset contributes only after its site acceptance test and commissioning are complete."}</p></div>
      <div class="inspector-actions"><button class="button button-light" data-action="focus-device" data-id="${device.id}">Focus on map</button><button class="button button-danger" data-action="arm-remove">Decommission tool</button></div>`;
  }

  private handleClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    const action = target.dataset.action ?? "";
    const id = target.dataset.id ?? "";
    if (action === "new-game") { this.screen = "scenarios"; this.renderScreen(); return; }
    if (action === "back-title") { this.screen = "title"; this.renderScreen(); return; }
    if (action === "continue") { this.screen = "saves"; this.renderScreen(); return; }
    if (action === "start-sandbox") { this.startGame("sandbox"); return; }
    if (action === "scenario-start") { this.startGame(id); return; }
    if (action === "load-slot") { this.loadSlot(id as SaveSlot["id"]); return; }
    if (!this.state) return;

    const panelMap: Record<string, Panel> = {
      "open-capability": "capability", capability: "capability", pipeline: "pipeline", "open-pipeline": "pipeline",
      operations: "operations", "open-operations": "operations", staff: "staff", "open-staff": "staff",
      finance: "finance", "open-finance": "finance", rating: "rating", "open-rating": "rating",
      "open-objectives": "objectives", "open-settings": "settings",
    };
    if (action in panelMap) { this.openPanel(panelMap[action] ?? null); return; }
    if (action === "close-panel") { this.panel = null; this.renderPanel(); return; }
    if (action === "cancel-tool") { this.cancelTool(); return; }
    if (action === "speed") { this.setSpeed(Number(target.dataset.speed)); return; }
    if (action === "zoom-out") { this.renderer.zoomBy(0.9); return; }
    if (action === "zoom-in") { this.renderer.zoomBy(1.1); return; }
    if (action === "fit-perimeter") { this.renderer.fitPerimeter(this.state.world); return; }
    if (action === "select-model") {
      this.selectedModelId = id;
      this.selectedUpgradeIds = new Set();
      if (id.includes("camera")) this.selectedUpgradeIds.add("va-intrusion");
      this.renderPanel(); return;
    }
    if (action === "quantity-down" || action === "quantity-up") {
      this.procurementQuantity = Math.max(1, Math.min(99, this.procurementQuantity + (action === "quantity-up" ? 1 : -1)));
      this.renderPanel(); return;
    }
    if (action === "procure") { this.feedback(procureDevice(this.state, this.selectedModelId, [...this.selectedUpgradeIds], this.procurementQuantity)); this.renderPanel(); return; }
    if (action === "approve-all-ready") { this.feedback(approveAllReady(this.state)); this.renderPanel(); return; }
    if (action === "order-deploy") { this.placementOrderId = id; this.placementRotation = 0; this.bulldozing = false; this.panel = null; this.renderPanel(); this.updatePlacementRibbon(); return; }
    if (action === "hire") { this.feedback(hireStaff(this.state, (target.dataset.role ?? "trooper") as StaffRole)); this.renderPanel(); return; }
    if (action === "focus-incident") { this.focusIncident(id); return; }
    if (action === "inspect-device") { this.selectedDeviceId = id; this.openPanel("device"); return; }
    if (action === "focus-device") { const device = this.state.devices.find((candidate) => candidate.id === id); if (device) this.renderer.focusOn(device.x, device.y); return; }
    if (action === "toggle-coverage") { this.showCoverage = !this.showCoverage; target.classList.toggle("active", this.showCoverage); return; }
    if (action === "bulldoze" || action === "arm-remove") { this.bulldozing = true; this.placementOrderId = null; this.panel = null; this.renderPanel(); this.updatePlacementRibbon(); return; }
    if (action === "save-manual") { if (this.safeBrowserSave("manual")) this.toast("Manual save complete.", "good"); return; }
    if (action === "export-save") { this.exportSave(); return; }
    if (action === "import-save") { this.importInput.click(); return; }
    if (action === "rename-camp") { const input = document.getElementById("camp-name") as HTMLInputElement | null; if (input?.value.trim()) { this.state.campName = input.value.trim(); this.toast("Base name updated.", "good"); this.updateHud(); } return; }
    if (action === "walkthrough-replay") { this.startWalkthrough(true); return; }
    if (action === "walkthrough-next") { this.moveWalkthrough(1); return; }
    if (action === "walkthrough-back") { this.moveWalkthrough(-1); return; }
    if (action === "walkthrough-skip" || action === "walkthrough-finish") { this.dismissWalkthrough(); return; }
    if (action === "quit-title") { this.state = null; this.screen = "title"; this.panel = null; this.renderScreen(); return; }
    if (action === "scenario-continue") { this.state.scenarioId = "sandbox"; this.state.scenarioStatus = "active"; this.state.speed = 1; this.updateHud(); return; }
    if (action === "scenario-retry") { this.startGame(this.state.scenarioId); return; }
  }

  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.dataset.walkthroughPreference !== undefined) {
      this.walkthroughDontShow = target.checked;
      return;
    }
    if (target.dataset.quantity !== undefined) {
      this.updateProcurementQuantity(target.value);
      return;
    }
    const upgradeId = target.dataset.upgrade;
    if (!upgradeId) return;
    if (target.checked) this.selectedUpgradeIds.add(upgradeId);
    else this.selectedUpgradeIds.delete(upgradeId);
    this.renderPanel();
  }

  private handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.dataset.quantity === undefined) return;
    const parsed = Number(target.value);
    if (target.value !== "" && Number.isFinite(parsed)) {
      this.procurementQuantity = Math.max(1, Math.min(99, Math.round(parsed)));
      this.renderPanel();
    }
  }

  private updateProcurementQuantity(value: string): void {
    const parsed = Number(value);
    this.procurementQuantity = Number.isFinite(parsed) ? Math.max(1, Math.min(99, Math.round(parsed))) : 1;
    this.renderPanel();
  }

  private startGame(scenarioId: string): void {
    this.state = createGame(scenarioId);
    this.applySentinelBranding(this.state);
    this.screen = "game";
    this.panel = null;
    this.cancelTool();
    this.renderer.focusOn(50, 51);
    this.renderScreen();
    if (!this.startWalkthrough(false)) this.toast("Sentinel Base online. The simulation is running.", "info");
  }

  private loadSlot(id: SaveSlot["id"]): void {
    const previousState = this.state;
    const previousScreen = this.screen;
    const previousPanel = this.panel;
    try {
      const loaded = loadBrowserSave(id);
      getScenario(loaded.scenarioId);
      this.applySentinelBranding(loaded);
      this.state = loaded;
      this.screen = "game";
      this.panel = null;
      this.renderer.focusOn(50, 51);
      this.renderScreen();
      if (!this.startWalkthrough(false)) this.toast("Saved Sentinel Base operation restored.", "good");
    } catch (error) {
      this.state = previousState;
      this.screen = previousScreen;
      this.panel = previousPanel;
      this.renderScreen();
      this.toast(error instanceof Error ? error.message : "Could not load that save.", "danger");
    }
  }

  private openPanel(panel: Panel): void {
    if (this.panel === panel) return;
    this.panel = panel;
    this.renderPanel();
  }

  private applySentinelBranding(state: GameState): void {
    if (state.campName === "Camp Overwatch") state.campName = "Sentinel Base";
  }

  private shouldShowWalkthrough(): boolean {
    try {
      return localStorage.getItem(WALKTHROUGH_STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  }

  private startWalkthrough(force: boolean): boolean {
    if (!this.state || (!force && !this.shouldShowWalkthrough())) return false;
    const current = this.state.speed;
    this.walkthroughWasPaused = current === 0;
    this.walkthroughPreviousSpeed = current === 1 || current === 2 || current === 4 ? current : this.state.previousSpeed;
    this.state.speed = 0;
    this.walkthroughStep = 0;
    this.walkthroughDontShow = false;
    this.renderWalkthrough();
    this.updateHud();
    return true;
  }

  private moveWalkthrough(delta: number): void {
    if (this.walkthroughStep === null) return;
    const next = Math.max(0, Math.min(WALKTHROUGH_STEPS.length - 1, this.walkthroughStep + delta));
    this.walkthroughStep = next;
    this.renderWalkthrough();
  }

  private dismissWalkthrough(): void {
    if (!this.state || this.walkthroughStep === null) return;
    if (this.walkthroughDontShow) {
      try {
        localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "1");
      } catch {
        // The walkthrough remains replayable even when storage is unavailable.
      }
    }
    const remainsPaused = this.walkthroughWasPaused;
    this.walkthroughStep = null;
    this.state.speed = remainsPaused ? 0 : this.walkthroughPreviousSpeed;
    this.state.previousSpeed = this.walkthroughPreviousSpeed;
    this.renderWalkthrough();
    this.updateHud();
    this.toast(remainsPaused ? "Walkthrough closed. Sentinel Base remains paused." : "Walkthrough closed. Sentinel Base is running.", "info");
  }

  private renderWalkthrough(): void {
    const host = document.getElementById("walkthrough-host");
    if (!host) return;
    const stepIndex = this.walkthroughStep;
    if (stepIndex === null) {
      host.innerHTML = "";
      return;
    }
    const step = WALKTHROUGH_STEPS[stepIndex];
    if (!step) return;
    const last = stepIndex === WALKTHROUGH_STEPS.length - 1;
    host.innerHTML = `
      <div class="walkthrough-backdrop">
        <section class="walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
          <header><div><span class="window-kicker">${escapeHtml(step.kicker)}</span><strong>Paused orientation</strong></div><button data-action="walkthrough-skip" aria-label="Skip walkthrough">Skip</button></header>
          <div class="walkthrough-progress" aria-label="Step ${stepIndex + 1} of ${WALKTHROUGH_STEPS.length}">${WALKTHROUGH_STEPS.map((_, index) => `<i class="${index === stepIndex ? "current" : index < stepIndex ? "done" : ""}"></i>`).join("")}</div>
          <div class="walkthrough-copy"><span class="walkthrough-number">0${stepIndex + 1}</span><div><h2 id="walkthrough-title">${escapeHtml(step.title)}</h2><p>${escapeHtml(step.copy)}</p><aside><span>Field note</span>${escapeHtml(step.cue)}</aside></div></div>
          <footer><label><input type="checkbox" data-walkthrough-preference ${this.walkthroughDontShow ? "checked" : ""}> Don’t show automatically again</label><div>${stepIndex > 0 ? `<button class="button button-light" data-action="walkthrough-back">Back</button>` : ""}<button class="button button-primary" data-action="${last ? "walkthrough-finish" : "walkthrough-next"}">${last ? "Start operating" : "Next"}</button></div></footer>
        </section>
      </div>`;
    host.querySelector<HTMLButtonElement>(".button-primary")?.focus({ preventScroll: true });
  }

  private setSpeed(value: number): void {
    if (!this.state) return;
    if (value === 0) {
      const current = this.state.speed;
      if (current === 1 || current === 2 || current === 4) this.state.previousSpeed = current;
      this.state.speed = 0;
    } else if (value === 1 || value === 2 || value === 4) {
      this.state.speed = value;
      this.state.previousSpeed = value;
    }
    this.updateHud();
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.screen !== "game") return;
    this.pointer = { x: event.clientX, y: event.clientY, down: true, moved: false, startX: event.clientX, startY: event.clientY };
    this.canvas.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    this.hoverTile = this.renderer.screenToTile(event.clientX, event.clientY);
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    if (!this.pointer.down) return;
    const dx = event.clientX - this.pointer.startX;
    const dy = event.clientY - this.pointer.startY;
    if (Math.hypot(dx, dy) > 4) this.pointer.moved = true;
    if (this.pointer.moved) {
      this.renderer.pan(event.movementX, event.movementY);
      this.pointer.startX = event.clientX;
      this.pointer.startY = event.clientY;
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.pointer.down || event.button !== 0) return;
    this.pointer.down = false;
    if (this.pointer.moved || !this.state || this.screen !== "game" || !this.hoverTile) return;
    if (this.placementOrderId) {
      const result = placeOrder(this.state, this.placementOrderId, this.hoverTile.x, this.hoverTile.y, this.placementFacing(this.hoverTile));
      this.feedback(result);
      if (result.ok) {
        this.placementOrderId = null;
        this.openPanel("pipeline");
      }
      return;
    }
    if (this.bulldozing) {
      this.feedback(decommissionAt(this.state, this.hoverTile.x, this.hoverTile.y));
      return;
    }
    const device = this.renderer.deviceAt(this.state, event.clientX, event.clientY);
    if (device) {
      this.selectedDeviceId = device.id;
      this.openPanel("device");
    } else {
      this.selectedDeviceId = null;
      if (this.panel === "device") { this.panel = null; this.renderPanel(); }
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.matches("input, textarea, select")) return;
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) this.keys.add(key);
    if (this.screen !== "game" || !this.state) return;
    if (this.walkthroughStep !== null) {
      if (key === "escape") this.dismissWalkthrough();
      if (event.code === "Space") event.preventDefault();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.setSpeed(this.state.speed === 0 ? this.state.previousSpeed : 0);
    } else if (key === "1" || key === "2" || key === "4") this.setSpeed(Number(key));
    else if (key === "+" || key === "=") this.renderer.zoomBy(1.1);
    else if (key === "-" || key === "_") this.renderer.zoomBy(0.9);
    else if (key === "f") this.showCoverage = !this.showCoverage;
    else if (key === "home") { event.preventDefault(); this.renderer.fitPerimeter(this.state.world); }
    else if ((key === "q" || key === "e") && this.placementOrderId) {
      this.placementRotation = (this.placementRotation + (key === "q" ? 3 : 1)) % 4;
      this.updatePlacementRibbon();
    }
    else if (key === "escape") {
      if (this.placementOrderId || this.bulldozing) this.cancelTool();
      else { this.panel = null; this.renderPanel(); }
    } else if (key === "tab") {
      const first = activeIncidents(this.state)[0];
      if (first) { event.preventDefault(); this.renderer.focusOn(first.x, first.y); this.openPanel("operations"); }
    } else if (key === "z" && event.ctrlKey) {
      event.preventDefault();
      this.toast("No uncommitted builder action to undo.", "info");
    }
  }

  private moveCamera(elapsed: number): void {
    if (this.screen !== "game") return;
    const speed = 360 * elapsed;
    if (this.keys.has("a") || this.keys.has("arrowleft")) this.renderer.pan(speed, 0);
    if (this.keys.has("d") || this.keys.has("arrowright")) this.renderer.pan(-speed, 0);
    if (this.keys.has("w") || this.keys.has("arrowup")) this.renderer.pan(0, speed);
    if (this.keys.has("s") || this.keys.has("arrowdown")) this.renderer.pan(0, -speed);
    if (!this.pointer.down && !this.panel) {
      const edge = 8;
      if (this.pointer.x > 0 && this.pointer.x < edge) this.renderer.pan(speed * 0.65, 0);
      if (this.pointer.x > window.innerWidth - edge) this.renderer.pan(-speed * 0.65, 0);
      if (this.pointer.y > 64 && this.pointer.y < 72) this.renderer.pan(0, speed * 0.65);
      if (this.pointer.y > window.innerHeight - edge) this.renderer.pan(0, -speed * 0.65);
    }
  }

  private currentOverlay(): RenderOverlay {
    let placement: RenderOverlay["placement"] = null;
    if (this.state && this.placementOrderId) {
      const order = this.state.orders.find((candidate) => candidate.id === this.placementOrderId);
      if (order) {
        const result = this.hoverTile ? validatePlacement(this.state, order.id, this.hoverTile.x, this.hoverTile.y) : { ok: false as const, reason: "Move over the map." };
        placement = { modelId: order.modelId, upgradeIds: order.upgradeIds, valid: result.ok, facing: this.placementFacing(this.hoverTile) };
      }
    }
    return { hoverTile: this.hoverTile, placement, selectedDeviceId: this.selectedDeviceId, showCoverage: this.showCoverage, bulldozing: this.bulldozing };
  }

  private updatePlacementRibbon(): void {
    const ribbon = document.getElementById("placement-ribbon");
    if (!ribbon || !this.state) return;
    if (!this.placementOrderId && !this.bulldozing) { ribbon.hidden = true; return; }
    ribbon.hidden = false;
    if (this.bulldozing) {
      ribbon.className = "placement-ribbon danger";
      ribbon.innerHTML = `<span class="placement-symbol">⌫</span><div><strong>Decommission tool</strong><small>Click a device to recover 20% of condition-adjusted acquisition cost.</small></div><button data-action="cancel-tool">Cancel · Esc</button>`;
      return;
    }
    const order = this.state.orders.find((candidate) => candidate.id === this.placementOrderId);
    if (!order) { this.placementOrderId = null; ribbon.hidden = true; return; }
    const model = getModel(order.modelId);
    const validation = this.hoverTile ? validatePlacement(this.state, order.id, this.hoverTile.x, this.hoverTile.y) : { ok: false as const, reason: "Move over an owned tile." };
    ribbon.className = `placement-ribbon ${validation.ok ? "valid" : "invalid"}`;
    const orientation = model.kind === "camera" && !order.upgradeIds.includes("panoramic") ? ` · facing ${facingLabel(this.placementFacing(this.hoverTile))} · Q/E rotate` : "";
    ribbon.innerHTML = `<span class="placement-symbol">${deviceGlyph(model.kind)}</span><div><strong>Deploy ${escapeHtml(model.shortName)}</strong><small>${validation.ok ? `Valid sector ${this.hoverTile?.x}.${this.hoverTile?.y} · SAT still required${orientation}` : escapeHtml(validation.reason)}</small></div><button data-action="cancel-tool">Cancel · Esc</button>`;
  }

  private cancelTool(): void {
    this.placementOrderId = null;
    this.placementRotation = 0;
    this.bulldozing = false;
    this.updatePlacementRibbon();
  }

  private placementFacing(tile: { x: number; y: number } | null): number {
    if (!tile) return this.placementRotation * Math.PI / 2;
    return Math.atan2(tile.y + 0.5 - 50, tile.x + 0.5 - 50) + this.placementRotation * Math.PI / 2;
  }

  private focusIncident(id: string): void {
    const incident = this.state?.incidents.find((candidate) => candidate.id === id);
    if (!incident) return;
    this.renderer.focusOn(incident.x, incident.y);
    this.openPanel("operations");
  }

  private feedback(result: ActionResult): void {
    this.toast(result.ok ? result.message : result.reason, result.ok ? "good" : "danger");
    this.updateHud();
  }

  private toast(message: string, tone: "info" | "good" | "warning" | "danger"): void {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const id = `toast-${++this.toastCounter}`;
    const item = document.createElement("div");
    item.id = id;
    item.className = `toast ${tone}`;
    item.innerHTML = `<span>${tone === "good" ? "✓" : tone === "danger" ? "!" : tone === "warning" ? "△" : "i"}</span><p>${escapeHtml(message)}</p>`;
    stack.append(item);
    window.setTimeout(() => item.classList.add("leaving"), 3_500);
    window.setTimeout(() => document.getElementById(id)?.remove(), 3_900);
  }

  private refreshPanelIfChanged(): void {
    if (!this.panel) return;
    const next = this.getPanelFingerprint();
    if (next !== this.panelFingerprint) this.renderPanel();
  }

  private getPanelFingerprint(): string {
    if (!this.state) return "";
    const state = this.state;
    if (this.panel === "capability") return JSON.stringify([this.panel, state.economy.cash]);
    if (this.panel === "pipeline") return JSON.stringify([this.panel, state.economy.cash,
      state.orders.map((order) => [order.id, order.stage, Math.ceil((order.readyAt - state.totalMinutes) / 240)]),
      state.devices.map((device) => [device.id, device.status, Math.ceil((device.readyAt - state.totalMinutes) / 240)])]);
    if (this.panel === "operations") return JSON.stringify([this.panel,
      state.incidents.map((incident) => [incident.id, incident.status, Math.ceil((incident.readyAt - state.totalMinutes) / 120), Math.ceil((incident.deadlineAt - state.totalMinutes) / 120)])]);
    if (this.panel === "staff") return JSON.stringify([this.panel, state.staff.map((member) => [member.id, Math.round(member.happiness), Math.round(member.fatigue), member.status])]);
    if (this.panel === "finance") return JSON.stringify([this.panel, state.economy.cash, state.economy.ledger.length]);
    if (this.panel === "rating") return JSON.stringify([this.panel, state.rating]);
    if (this.panel === "objectives") return JSON.stringify([this.panel, state.scenarioStatus, state.rating, state.tutorial]);
    if (this.panel === "settings") return JSON.stringify([this.panel, state.campName]);
    if (this.panel === "device") {
      const device = state.devices.find((candidate) => candidate.id === this.selectedDeviceId);
      return JSON.stringify([this.panel, this.selectedDeviceId, device?.status, device?.health, device?.detections, device?.falseAlarms]);
    }
    return String(this.panel);
  }

  private renderOutcome(): void {
    const host = document.getElementById("scenario-outcome");
    if (!host || !this.state || this.state.scenarioStatus === "active") {
      if (host && this.lastOutcomeStatus !== null) host.innerHTML = "";
      this.lastOutcomeStatus = null;
      return;
    }
    if (this.lastOutcomeStatus === this.state.scenarioStatus) return;
    this.lastOutcomeStatus = this.state.scenarioStatus;
    const won = this.state.scenarioStatus === "won";
    host.innerHTML = `<div class="outcome-backdrop"><section class="outcome-card"><span class="outcome-seal ${won ? "won" : "lost"}">${won ? "✓" : "!"}</span><p class="overline">${won ? "Command endorsement" : "Deadline review"}</p><h2>${won ? "Capability proven" : "Objectives remain open"}</h2><p>${won ? `Sentinel Base security reached ${this.state.rating.campRating}. The workforce and operating model have command confidence.` : "The deadline passed before every primary objective was achieved. Your base can continue without a medal."}</p><div class="outcome-stats"><div><span>Rating</span><b>${this.state.rating.campRating}</b></div><div><span>Caught</span><b>${this.state.rating.caught}</b></div><div><span>Points</span><b>${this.state.rating.capabilityPoints.toLocaleString()}</b></div></div><div class="title-actions"><button class="button button-primary" data-action="scenario-continue">Continue base</button><button class="button button-light" data-action="scenario-retry">Retry scenario</button></div></section></div>`;
  }

  private exportSave(): void {
    if (!this.state) return;
    const blob = new Blob([serializeState(this.state)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${this.state.campName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "sentinel-base"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.toast("Save exported as JSON.", "good");
  }

  private safeBrowserSave(id: SaveSlot["id"]): boolean {
    if (!this.state) return false;
    try {
      saveToBrowser(this.state, id);
      return true;
    } catch {
      this.toast("Local save failed. Export a JSON backup and check browser storage permissions.", "danger");
      return false;
    }
  }

  private importSave(): void {
    const file = this.importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const previousState = this.state;
      const previousScreen = this.screen;
      const previousPanel = this.panel;
      try {
        const imported = deserializeState(String(reader.result));
        getScenario(imported.scenarioId);
        this.state = imported;
        this.screen = "game";
        this.panel = null;
        this.renderer.focusOn(50, 51);
        this.renderScreen();
        this.toast("Imported operation restored.", "good");
      } catch (error) {
        this.state = previousState;
        this.screen = previousScreen;
        this.panel = previousPanel;
        this.renderScreen();
        this.toast(error instanceof Error ? error.message : "Import failed.", "danger");
      }
      this.importInput.value = "";
    });
    reader.readAsText(file);
  }
}

function toolButton(action: string, icon: string, label: string, title: string): string {
  return `<button class="tool-button" data-action="${action}" title="${title}"><span class="tool-icon">${icon}</span><small>${label}</small></button>`;
}

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", "\"": "&quot;" })[character] ?? character);
}

function titleCase(value: string): string {
  return value.split(/[- ]/).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
}

function weatherIcon(kind: string): string {
  if (kind === "clear") return "☀";
  if (kind === "overcast") return "◒";
  if (kind === "rain") return "☂";
  if (kind === "storm") return "ϟ";
  return "≋";
}

function deviceGlyph(kind: string): string {
  if (kind === "camera") return "◉";
  if (kind === "lidar") return "⌁";
  if (kind === "robot") return "♞";
  if (kind === "drone") return "✣";
  return "☀";
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    procurement: "Vendor lead time", "integration-review": "ICD approval queued", integrating: "C2 integration",
    "factory-test": "Factory test queued", testing: "Acceptance testing", ready: "Ready to deploy", new: "Awaiting validation",
    verifying: "C2 validating", verified: "Dispatch queued", responding: "Response en route", resolved: "Resolved",
    dismissed: "Benign", missed: "Missed",
  };
  return labels[stage] ?? titleCase(stage);
}

function panelTitle(panel: Exclude<Panel, null>): string {
  const titles: Record<Exclude<Panel, null>, string> = {
    capability: "Capability builder", pipeline: "Autonomous delivery", operations: "Autonomous C2", staff: "People & shifts",
    finance: "Finance & ledger", rating: "Base security capability", objectives: "Command objectives", settings: "Save & settings", device: "Device inspector",
  };
  return titles[panel];
}

function panelKicker(panel: Exclude<Panel, null>): string {
  const kickers: Record<Exclude<Panel, null>, string> = {
    capability: "Design", pipeline: "Assure", operations: "Observe", staff: "Support", finance: "Steward",
    rating: "Measure", objectives: "Deliver", settings: "Command", device: "Inspect",
  };
  return kickers[panel];
}

function metricBar(label: string, value: string, percentage: number, inverted = false): string {
  return `<div><span><b>${label}</b><em>${value}</em></span><progress class="${inverted ? "inverted" : ""}" max="100" value="${Math.min(100, Math.max(0, percentage))}"></progress></div>`;
}

function inlineMeter(value: number, tone: string): string {
  return `<span class="inline-meter ${tone}"><i style="width:${Math.min(100, Math.max(0, value))}%"></i><b>${Math.round(value)}%</b></span>`;
}

function happinessTone(value: number): string {
  return value >= 68 ? "good" : value < 42 ? "bad" : "neutral";
}

function emptyBlock(title: string, copy: string, action: string, button: string): string {
  return `<div class="empty-panel"><span>◇</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p><button class="button button-light button-small" data-action="${action}">${escapeHtml(button)}</button></div>`;
}

function incidentName(type: Incident["type"]): string {
  const names: Record<Incident["type"], string> = {
    intrusion: "Potential perimeter intrusion", loitering: "Loitering observation", "suspicious-object": "Suspicious object",
    tamper: "Sensor tamper", "system-fault": "System health fault", "false-alarm": "Unclassified motion",
  };
  return names[type];
}

function incidentIcon(type: Incident["type"]): string {
  if (type === "intrusion") return "!";
  if (type === "system-fault") return "⚙";
  if (type === "suspicious-object") return "?";
  return "⌁";
}

function facingLabel(angle: number): string {
  const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
  const index = Math.round(normalized / (Math.PI / 2)) % 4;
  return ["east", "south", "west", "north"][index] ?? "sector";
}

function tutorialEntries(state: GameState) {
  return [
    { done: state.tutorial.procured, label: "Procure a configured device", help: "Open Capability, select useful add-ons and approve the displayed hardware cost." },
    { done: state.tutorial.integrated, label: "Let autopilot integrate its ICD", help: "After delivery, the assurance workflow maps identity, time, location, alarms and health into C2." },
    { done: state.tutorial.tested, label: "Complete autonomous factory acceptance", help: "The pipeline proves configured interfaces and analytics before installation." },
    { done: state.tutorial.deployed, label: "Deploy it on an owned tile", help: "Use the green placement ghost and watch the projected coverage." },
    { done: state.tutorial.commissioned, label: "Let site acceptance complete", help: "Autopilot commissions the installed asset end to end before it counts." },
    { done: state.tutorial.hired, label: "Hire one team member", help: "Add a trooper, operator or engineer; the emptiest shift is chosen." },
    { done: state.tutorial.dismissed, label: "Observe C2 dismiss a benign alarm", help: "Autonomous validation prevents an unnecessary field dispatch." },
    { done: state.tutorial.resolvedAlarm, label: "Observe a genuine incident resolve", help: "C2 validates the observation and dispatches an available response unit." },
  ];
}

function ratingNarrative(score: number): string {
  if (score >= 80) return "Layered sensors, assured delivery and a confident workforce are producing resilient security.";
  if (score >= 65) return "The base is assured, but continued testing and cost discipline can deepen resilience.";
  if (score >= 45) return "Core systems are integrated. Blind sectors or operating pressure still constrain confidence.";
  if (score >= 25) return "Basic coverage exists, but command cannot yet rely on a complete detection-to-response chain.";
  return "The base is fragile. Deliver tested coverage and staff every critical response role.";
}
