import type { MeetingPrepAPI } from "../electron/preload";

declare global {
  interface Window {
    api: MeetingPrepAPI;
  }
}

export {};
