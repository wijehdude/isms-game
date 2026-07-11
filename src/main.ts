import "./styles.css";
import { CampOverwatchApp } from "./ui/app";

const root = document.getElementById("app");
const canvas = document.getElementById("game-canvas");
const importInput = document.getElementById("save-import");

if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement) || !(importInput instanceof HTMLInputElement)) {
  throw new Error("Camp Overwatch could not initialize its application shell.");
}

new CampOverwatchApp(root, canvas, importInput);
