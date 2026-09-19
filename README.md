This Project focus on how to get game info from Bovada poker. 

Stage 1: Implement a HUD that can:
- Track each of my hand
- Track each of my opponent hand
- Track my bet, other's bet, pot size.

Stage 2: Use the data to compute my curve.

The most challenging part is Stage 1. We need to explore ways to get the info. The URL looks like: https://www.bovada.lv/static/poker-game/?lobby=%2Fpoker-lobby%2Fhome

This is likely a real-time rendered JS App. The website supports opening 4 tables simultaneuously, thus the architecture is likely:

Server -> Network (socket traffic) (maybe?) -> Client JS App -> info Rendered in app -> Displayed to the web page 

Potential ways to extract info contains

1 - intercept network layer for incoming traffic.

Difficulty: Probably hard to intercept; probably encoded. Probably we need to look into memory layer.

2 - monitor DOM changes

This is likely easier. However, there's no guarantee on how DOM is rendered in JS APP. It may not be available.

3 - Screenshot on DOM change and feed to neural network to identify numbers and card.

This is relatively easier. However, it may be expensive when multiple poker tables are on, as picture processing may be slow.

Your task:

Let's discuss the possible ways to implement this together

Update 1:

Even before seeing messages, those headers tell us a lot:

X-Atmosphere-Framework=3.1.5-javascript
This uses the Atmosphere framework — a Java push framework. It adds its own framing layer on top of WebSocket. Messages will likely look like:


|length|{"type":"GAME_STATE","cards":[...]}
or just raw JSON. The X-atmo-protocol=true flag enables the size-prefix framing.

Content-Type=application/json in the URL params strongly suggests the payload is JSON — not binary.

permessage-deflate means messages are compressed at the WebSocket layer, but Chrome DevTools decompresses them automatically before showing you, so you'll see readable text.

Two endpoints:

wss://pkscb.bovada.lv/poker-games/rgs → game events (cards, bets, actions)
wss://pkscb.bovada.lv/ws-gateway/lobby → lobby (table list, seat availability)