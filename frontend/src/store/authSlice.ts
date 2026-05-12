import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/client.js";

interface AuthState {
  user: { id: number; username: string } | null;
  loading: boolean;
}

const initialState: AuthState = { user: null, loading: true };

export const fetchMe = createAsyncThunk("auth/me", async () => {
  const res = await api.get("/auth/me");
  return res.data;
});

export const login = createAsyncThunk(
  "auth/login",
  async (creds: { username: string; password: string }) => {
    const res = await api.post("/auth/login", creds);
    return res.data;
  }
);

export const logout = createAsyncThunk("auth/logout", async () => {
  await api.post("/auth/logout");
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchMe.fulfilled, (s, a) => { s.user = a.payload; s.loading = false; });
    b.addCase(fetchMe.rejected, (s) => { s.user = null; s.loading = false; });
    b.addCase(login.fulfilled, (s, a) => { s.user = a.payload; });
    b.addCase(logout.fulfilled, (s) => { s.user = null; });
  },
});

export default authSlice.reducer;
