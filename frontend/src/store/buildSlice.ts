import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ActiveBuild {
  id: number;
  name: string;
  lines: string[];
  status: "running" | "success" | "failed";
}

interface BuildState {
  active: ActiveBuild | null;
  panelOpen: boolean;
}

const initialState: BuildState = { active: null, panelOpen: false };

const buildSlice = createSlice({
  name: "build",
  initialState,
  reducers: {
    startBuild(state, action: PayloadAction<{ id: number; name: string }>) {
      state.active = { ...action.payload, lines: [], status: "running" };
      state.panelOpen = true;
    },
    addLine(state, action: PayloadAction<string>) {
      state.active?.lines.push(action.payload);
    },
    finishBuild(state, action: PayloadAction<"success" | "failed">) {
      if (state.active) state.active.status = action.payload;
    },
    openPanel(state) { state.panelOpen = true; },
    closePanel(state) { state.panelOpen = false; },
    clearBuild(state) { state.active = null; state.panelOpen = false; },
  },
});

export const { startBuild, addLine, finishBuild, openPanel, closePanel, clearBuild } = buildSlice.actions;
export default buildSlice.reducer;
