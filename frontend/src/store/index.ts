import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import authReducer from "./authSlice.js";
import apacheReducer from "./apacheSlice.js";
import buildReducer from "./buildSlice.js";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    apache: apacheReducer,
    build: buildReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(sel: (s: RootState) => T) => useSelector(sel);
