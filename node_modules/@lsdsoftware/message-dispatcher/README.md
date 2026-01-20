# message-dispatcher
Dispatch received messages to handlers.  This utility assumes messages are one of three types: request, response, or notification; and follow this format:

```typescript
interface Request {
  to: string
  type: "request"
  id: "string"
  method: string
  args: Record<string, unknown>
}

interface Notification {
  to: string
  type: "notification"
  method: string
  args: Record<string, unknown>
}

interface Response {
  type: "response"
  id: string
  error: unknown
  result: unknown
}
```


## Usage
Call `dispatch` to dispatch a received message.  Requests and notifications are dispatched to handlers that you provide at construction.  Responses are dispatched to response listeners.  To listen for a response, call `waitForResponse` with the request ID.

A _myAddress_ parameter provided at construction is used to filter messages.  Only requests and notifications sent `to` myAddress will be processed.

```typescript
import { makeMessageDispatcher } from "@lsdsoftware/message-dispatcher"

const dispatcher = makeMessageDispatcher("myAddress", {
  method1(args, sender) {
    //do something
    return result
  },
  async method2(args, sender) {
    //do something
    return result
  }
})

//example: process messages received from iframe
window.addEventListener("message", event => {
  const sender = {window: event.source, origin: event.origin}
  const sendResponse = response => sender.window.postMessage(response, sender.origin)
  dispatcher.dispatch(event.data, sender, sendResponse)
})

//send request to iframe
const id = String(Math.random())
const request = {to: "someAddress", type: "request", id: id, method: "someMethod", args: {...}}
iframeWindow.postMessage(request, "*")
dispatcher.waitForResponse(id)
  .then(result => console.log(result))
  .catch(console.error)
```
