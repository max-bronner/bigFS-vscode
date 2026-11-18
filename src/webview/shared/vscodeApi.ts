export interface VsCodeApi<Message> {
  postMessage(message: Message): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare const acquireVsCodeApi: () => VsCodeApi<unknown>;

let handle: VsCodeApi<unknown> | undefined;

export const getVsCodeApi = <Message>(): VsCodeApi<Message> => {
  handle ??= acquireVsCodeApi();
  return handle as VsCodeApi<Message>;
};
