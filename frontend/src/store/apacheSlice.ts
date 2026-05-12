import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import api from "../api/client.js";

export interface ApacheChange {
  name: string;
  action: string;
  timestamp: number;
}

interface ApacheState {
  changes: ApacheChange[];
  configTestOutput: string | null;
  configTestStatus: "idle" | "running" | "ok" | "error";
}

const initialState: ApacheState = {
  changes: [],
  configTestOutput: null,
  configTestStatus: "idle",
};

export const runConfigTest = createAsyncThunk("apache/configTest", async () => {
  const res = await api.post("/apache/configtest");
  return res.data as { ok: boolean; output: string };
});

export const reloadApache = createAsyncThunk("apache/reload", async () => {
  const res = await api.post("/apache/reload");
  return res.data as { ok: boolean };
});

const apacheSlice = createSlice({
  name: "apache",
  initialState,
  reducers: {
    addChange(state, action: PayloadAction<Omit<ApacheChange, "timestamp">>) {
      state.changes.push({ ...action.payload, timestamp: Date.now() });
      state.configTestStatus = "idle";
      state.configTestOutput = null;
    },
    clearPending(state) {
      state.changes = [];
      state.configTestOutput = null;
      state.configTestStatus = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runConfigTest.pending, (state) => {
        state.configTestStatus = "running";
        state.configTestOutput = null;
      })
      .addCase(runConfigTest.fulfilled, (state, action) => {
        state.configTestOutput = action.payload.output;
        state.configTestStatus = action.payload.ok ? "ok" : "error";
      })
      .addCase(runConfigTest.rejected, (state) => {
        state.configTestStatus = "error";
        state.configTestOutput = "Request failed";
      })
      .addCase(reloadApache.fulfilled, (state) => {
        state.changes = [];
        state.configTestOutput = null;
        state.configTestStatus = "idle";
      });
  },
});

export const { addChange, clearPending } = apacheSlice.actions;
export default apacheSlice.reducer;
