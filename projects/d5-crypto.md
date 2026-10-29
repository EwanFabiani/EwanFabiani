---
title: D5 Crypto
description: A React Native library for end-to-end encryption using the Signal Protocol.
links:
  - label: GitHub Repository
    url: https://github.com/Digital-5/SignalProtocolReactLib
  - label: Project Organisation
    url: https://github.com/Digital-5
---

# D5 Crypto

This project was made with some of my college friends.
The goal was to make an end-to-end encrypted messaging app in React Native by implementing Signal's protocol as specified in [their documentation](https://signal.org/docs/).

The part I worked on was the [PQXDH handshake](https://signal.org/docs/specifications/pqxdh/) implementation, including the [XEdDSA](https://signal.org/docs/specifications/xeddsa/) math, using the [noble crypto](https://paulmillr.com/noble/) library. We built a React Native library to be used in the mobile app and started working on the backend, which is still unfinished and untested.
The rest of the unfinished project (backend and frontend) is available in the same GitHub organisation (linked at the top).

The biggest pain point we had was that we couldn't find a Java crypto library for the backend that exposed low-level cryptographic operations.
Noble worked perfectly for TypeScript, but [Bouncy Castle](https://www.bouncycastle.org/) (the biggest Java crypto library) didn't expose its internal functions.
I still remember that around the time we were stopping development, we threw AI tools at the problem and they all hallucinated these low-level functions that either didn't exist at all or were not exposed at our level. Even after we told them that none existed, they continued hallucinating.

That project sparked my interest in cryptographic systems. I started reading about how these systems are built, how people attack them, and how to protect against those attacks. Really cool stuff and if you're bored (or not), go check it out.

We've stopped developing the app, but the library is complete and works.
