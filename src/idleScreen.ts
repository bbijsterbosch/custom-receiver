import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { getApi, getCredentials } from "./services/jellyfinApi";

const POSTER_COUNT = 24;
const CYCLE_INTERVAL_MS = 15_000;

let cycleTimer: number | null = null;
let posterUrls: string[] = [];

function getIdleEl(): HTMLElement | null {
  return document.getElementById("idle-screen");
}

export function showIdleScreen(): void {
  const el = getIdleEl();
  if (el) el.classList.add("visible");
}

export function hideIdleScreen(): void {
  const el = getIdleEl();
  if (el) el.classList.remove("visible");
}

export async function loadPosters(): Promise<void> {
  const api = getApi();
  const creds = getCredentials();
  if (!api || !creds) return;

  try {
    const itemsApi = getItemsApi(api);
    const { data } = await itemsApi.getItems({
      userId: creds.userId,
      sortBy: ["Random"],
      limit: POSTER_COUNT * 2,
      recursive: true,
      includeItemTypes: ["Movie", "Series"],
      imageTypes: ["Primary"],
      enableImageTypes: ["Primary"],
    });

    const items = data.Items ?? [];
    posterUrls = items
      .filter((item) => item.Id && item.ImageTags?.Primary)
      .map(
        (item) =>
          `${creds.serverUrl}/Items/${item.Id}/Images/Primary?maxHeight=300&quality=70&tag=${item.ImageTags!.Primary}`
      );

    if (posterUrls.length > 0) {
      renderPosters();
      startCycling();
    }
  } catch (error) {
    console.error("[IdleScreen] Failed to fetch posters:", error);
  }
}

function renderPosters(): void {
  const grid = document.getElementById("poster-grid");
  if (!grid || posterUrls.length === 0) return;

  grid.innerHTML = "";

  const count = Math.min(POSTER_COUNT, posterUrls.length);
  for (let i = 0; i < count; i++) {
    const img = document.createElement("div");
    img.className = "poster-cell";
    img.style.backgroundImage = `url('${posterUrls[i]}')`;
    img.style.animationDelay = `${Math.random() * 5}s`;
    grid.appendChild(img);
  }
}

function startCycling(): void {
  if (cycleTimer !== null) clearInterval(cycleTimer);

  cycleTimer = window.setInterval(() => {
    const grid = document.getElementById("poster-grid");
    if (!grid || posterUrls.length <= POSTER_COUNT) return;

    const cells = grid.querySelectorAll<HTMLElement>(".poster-cell");
    if (cells.length === 0) return;

    const idx = Math.floor(Math.random() * cells.length);
    const newUrl =
      posterUrls[Math.floor(Math.random() * posterUrls.length)];

    const cell = cells[idx];
    cell.style.opacity = "0";
    setTimeout(() => {
      cell.style.backgroundImage = `url('${newUrl}')`;
      cell.style.opacity = "1";
    }, 800);
  }, CYCLE_INTERVAL_MS);
}

export function stopCycling(): void {
  if (cycleTimer !== null) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
}
