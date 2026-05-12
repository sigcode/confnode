import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ActiveBuild {
  id: number;
  name: string;
  runId: number;
  queuePosition: number;  // 0 = running, 1+ = waiting in queue
  lines: string[];
  status: "queued" | "running" | "success" | "failed";
}

export interface QueueItem {
  runId: number;
  buildId: number;
  name: string;
  status: "queued" | "running";
}

interface BuildState {
  active: ActiveBuild | null;
  panelOpen: boolean;
  queue: QueueItem[];
}

const initialState: BuildState = { active: null, panelOpen: false, queue: [] };

const buildSlice = createSlice({
  name: "build",
  initialState,
  reducers: {
    startBuild(state, action: PayloadAction<{ id: number; name: string; runId: number; queuePosition: number }>) {
      state.active = { ...action.payload, lines: [], status: "queued" };
      state.panelOpen = true;
    },
    addLine(state, action: PayloadAction<string>) {
      state.active?.lines.push(action.payload);
    },
    setQueuePosition(state, action: PayloadAction<number>) {
      if (state.active) state.active.queuePosition = action.payload;
    },
    setBuildRunning(state) {
      if (state.active) { state.active.status = "running"; state.active.queuePosition = 0; }
    },
    finishBuild(state, action: PayloadAction<"success" | "failed">) {
      if (state.active) state.active.status = action.payload;
    },
    openPanel(state) { state.panelOpen = true; },
    closePanel(state) { state.panelOpen = false; },
    clearBuild(state) { state.active = null; state.panelOpen = false; },
    setQueue(state, action: PayloadAction<QueueItem[]>) { state.queue = action.payload; },
  },
});

export const {
  startBuild, addLine, setQueuePosition, setBuildRunning, finishBuild,
  openPanel, closePanel, clearBuild, setQueue,
} = buildSlice.actions;
export default buildSlice.reducer;
