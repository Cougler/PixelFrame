"use client";
import { create } from "zustand";

export type DialogRequest = {
  id: string;
  type: "alert" | "confirm" | "prompt";
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (result: unknown) => void;
};

type DialogStore = {
  dialogs: DialogRequest[];
  push: (d: DialogRequest) => void;
  dismiss: (id: string, result: unknown) => void;
};

export const useDialogStore = create<DialogStore>((set, get) => ({
  dialogs: [],
  push: (d) => set({ dialogs: [...get().dialogs, d] }),
  dismiss: (id, result) => {
    const d = get().dialogs.find((x) => x.id === id);
    if (d) d.resolve(result);
    set({ dialogs: get().dialogs.filter((x) => x.id !== id) });
  },
}));

let counter = 0;
const nextId = () => `dlg-${++counter}`;

export function alertDialog(opts: {
  title?: string;
  message: string;
  okLabel?: string;
}): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().push({
      id: nextId(),
      type: "alert",
      title: opts.title,
      message: opts.message,
      okLabel: opts.okLabel,
      resolve: () => resolve(),
    });
  });
}

export function confirmDialog(opts: {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().push({
      id: nextId(),
      type: "confirm",
      title: opts.title,
      message: opts.message,
      okLabel: opts.okLabel,
      cancelLabel: opts.cancelLabel,
      destructive: opts.destructive,
      resolve: (r) => resolve(Boolean(r)),
    });
  });
}

export function promptDialog(opts: {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().push({
      id: nextId(),
      type: "prompt",
      title: opts.title,
      message: opts.message,
      defaultValue: opts.defaultValue,
      placeholder: opts.placeholder,
      okLabel: opts.okLabel,
      cancelLabel: opts.cancelLabel,
      resolve: (r) => resolve(r === null ? null : String(r)),
    });
  });
}
