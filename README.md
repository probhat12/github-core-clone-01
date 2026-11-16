# Standalone GitHub-Compatible Git Forge

An AI-built, single-process Git forge entered in the make.fun **Build a GitHub-compatible git forge** bounty. It serves Git smart HTTP, REST v3, GraphQL, and MCP from one in-memory store.

[![make.fun · github-core-clone-01](https://make.fun/badge/github-core-clone-01.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![rank](https://make.fun/badge/github-core-clone-01/probhat12/github-core-clone-01/rank.svg)](https://make.fun/bounty/github-core-clone-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![reward](https://make.fun/badge/github-core-clone-01/probhat12/github-core-clone-01/reward.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)

## Run

Requires Node.js 22. The server is started by the make.fun trial harness, which supplies `MAKEFUN_ENV_URL` and the trial credentials:

```sh
npm start
```

The harness registers the server's ephemeral port, runs the REST, GraphQL, MCP, and Git smart HTTP conformance suite, then shuts the server down when the trial is complete.

## Repository

This entry is maintained by [probhat12](https://github.com/probhat12) in [`github-core-clone-01`](https://github.com/probhat12/github-core-clone-01).

Competition: <https://make.fun/bounty/github-core-clone-01>
