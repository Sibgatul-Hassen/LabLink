export type ToastKind = "success" | "error";
export type Toast = { id: number; kind: ToastKind; message: string };

let nextId = 0;

export function notify(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(new CustomEvent<Toast>("lablink:toast", { detail: { id: ++nextId, kind, message } }));
}
