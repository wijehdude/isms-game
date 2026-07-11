import "./styles.css";
import { SentinelBaseApp } from "./ui/app";

const root = document.getElementById("app");
const canvas = document.getElementById("game-canvas");
const importInput = document.getElementById("save-import");

if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement) || !(importInput instanceof HTMLInputElement)) {
  throw new Error("Sentinel Base could not initialize its application shell.");
}

new SentinelBaseApp(root, canvas, importInput);
