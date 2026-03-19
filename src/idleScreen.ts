import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { getApi, getCredentials } from "./services/jellyfinApi";

const CYCLE_INTERVAL_MS = 10_000;
const FETCH_COUNT = 30;

let cycleTimer: number | null = null;
let backdropUrls: string[] = [];
let currentIndex = 0;
let activeSlot: "a" | "b" = "a";

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

export async function loadBackdrops(): Promise<void> {
  const api = getApi();
  const creds = getCredentials();
  if (!api || !creds) return;

  try {
    const itemsApi = getItemsApi(api);
    const { data } = await itemsApi.getItems({
      userId: creds.userId,
      sortBy: ["Random"],
      limit: FETCH_COUNT,
      recursive: true,
      includeItemTypes: ["Movie", "Series"],
      imageTypes: ["Backdrop"],
      enableImageTypes: ["Backdrop"],
    });

    const items = data.Items ?? [];
    backdropUrls = items
      .filter((item) => item.Id && item.BackdropImageTags?.length)
      .map(
        (item) =>
          `${creds.serverUrl}/Items/${item.Id}/Images/Backdrop/0?maxWidth=1920&quality=80&tag=${item.BackdropImageTags![0]}`,
      );

    if (backdropUrls.length > 0) {
      currentIndex = 0;
      showBackdrop(backdropUrls[0]);
      startCycling();
    }
  } catch (error) {
    console.error("[IdleScreen] Failed to fetch backdrops:", error);
  }
}

function showBackdrop(url: string): void {
  const next = activeSlot === "a" ? "b" : "a";
  const nextEl = document.getElementById(`backdrop-${next}`);
  if (!nextEl) return;

  const img = new Image();
  img.onload = () => {
    nextEl.style.backgroundImage = `url('${url}')`;
    nextEl.classList.add("active");

    const prevEl = document.getElementById(`backdrop-${activeSlot}`);
    if (prevEl) prevEl.classList.remove("active");

    activeSlot = next;
  };
  img.src = url;
}

export function startCycling(): void {
  if (cycleTimer !== null) clearInterval(cycleTimer);

  cycleTimer = window.setInterval(() => {
    if (backdropUrls.length === 0) return;

    currentIndex = (currentIndex + 1) % backdropUrls.length;
    showBackdrop(backdropUrls[currentIndex]);
  }, CYCLE_INTERVAL_MS);
}

export function stopCycling(): void {
  if (cycleTimer !== null) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
}
