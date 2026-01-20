export type Message = Request | Notification | Response;
interface Request {
    to: string;
    type: "request";
    id: "string";
    method: string;
    args: Record<string, unknown>;
}
interface Notification {
    to: string;
    type: "notification";
    method: string;
    args: Record<string, unknown>;
}
interface Response {
    type: "response";
    id: string;
    error: unknown;
    result: unknown;
}
interface Handler<Sender> {
    (args: Record<string, unknown>, sender: Sender): unknown;
}
export declare function makeDispatcher<Sender>(myAddress: string, handlers: Record<string, Handler<Sender>>): {
    waitForResponse<T>(requestId: string): Promise<T>;
    dispatch(message: Message, sender: Sender, sendResponse: (res: Response) => void): boolean | void;
    updateHandlers(newHandlers: typeof handlers): void;
};
export {};
