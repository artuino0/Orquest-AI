# Orquest AI

[Español](README.md) · **English**

An orchestrator for coding agents, made as a game: your studio is a pixel-art office where each agent CLI (Claude Code, Codex, Antigravity, OpenCode…) is an employee with a name, working in its own office and bringing you its delivery.

You only talk to the **boss**, which is another agent: it proposes the team, assigns tasks with their dependencies and reviews deliveries. You approve the team and every merge. Each animation is a real state: typing means working, a raised hand means it needs you, walking with a paper means it's delivering.

- Website and downloads: https://orquest.dydasites.com/en/
- Full product plan (Spanish): [docs/plan.md](docs/plan.md)
- Detailed status by phase (Spanish): [README.md](README.md)

## What it does

- **One point of contact.** You write to the boss. Whatever it needs from you stays as a pending question with suggested answers until you reply.
- **A board with dependencies.** A task that depends on another one doesn't start until that one is merged.
- **Each employee in its own git worktree**, so nobody steps on anybody else. Nothing reaches your branch without the boss's review and your approval.
- **Permissions per role.** Each role has a manual: what it can edit and which commands it runs without asking. Orquest never bypasses a CLI's permissions.
- **Memory that survives.** When an agent runs out of context it writes a handoff, restarts and picks up from its journal.
- **Records.** How each provider and model has done with you; the boss checks them before proposing a hire.
- **Everything local.** There is no Orquest server: a local SQLite database and the CLI sessions you already have.

The app runs in Spanish or English: it follows your system language and you can switch it with the ES/EN button.

## Supported CLIs

Orquest doesn't ship models; it launches the CLIs you already have installed and signed in. You need at least one, plus `git`.

| CLI | Status |
| --- | --- |
| Claude Code | The most thoroughly tested |
| Codex, Antigravity, OpenCode | Tested in real use |
| Command Code, Kimi, Grok | Integrated, lightly tested |

## Install

Download an installer from [Releases](https://github.com/artuino0/Orquest-AI/releases). This is an early preview: the installers aren't signed yet (Windows and macOS will warn you), and the macOS and Linux builds are produced automatically and haven't been checked by hand.

## Development

Requires Node ≥ 22.5.

```sh
npm install
npm run dev        # opens the app
npm test           # core tests (real node-pty and git, fake CLIs)
npm run typecheck
npm run dist       # builds the installer into dist/
```

The code is written in Spanish (identifiers in English, comments and user-facing text in Spanish). User-facing text goes through the `T` template in `src/core/i18n.ts`; the Spanish text is the key and its English lives in `src/core/lang/en/` and `src/renderer/src/lang/en/`.

## Contributing

Pull Requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) (Spanish). The most useful help right now: trying it on macOS and Linux, and finishing the integration of the remaining CLIs.

## Disclaimer

Orquest AI is not affiliated with Anthropic, OpenAI or any other provider; Claude Code, Codex and the other CLIs belong to their respective owners. The app ships no models and never touches your credentials: it runs the official, unmodified CLIs with the session you are already signed in to.

Use of each CLI and each account is subject to its provider's terms, and is your responsibility. Use only your own accounts, and check those terms if you plan to run many agents at once.

## Credits and license

Apache 2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)). The art builds on the [Pixel Office pack by 2dPig](https://2dpig.itch.io/pixel-office) (CC0).
