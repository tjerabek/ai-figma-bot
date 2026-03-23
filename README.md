```
     ___  ____      ______ _                         ____        _
    / _ \|_  _|    |  ____(_)                       |  _ \      | |
   / /_\ \ | |     | |__   _  __ _ _ __ ___   __ _ | |_) | ___ | |_
   |  _  | | |     |  __| | |/ _` | '_ ` _ \ / _` ||  _ < / _ \| __|
   | | | |_| |_    | |    | | (_| | | | | | | (_| || |_) | (_) | |_
   \_| |_/\___/    |_|    |_|\__, |_| |_| |_|\__,_||____/ \___/ \__|
                              __/ |
                             |___/

   Tag a comment in Figma  -->  AI reads the design  -->  Reply appears
```

# ai-figma-bot

An AI-powered bot that watches your Figma file for comments and replies with context-aware design feedback. Tag a comment with a trigger word, and the bot captures a screenshot of that section, loads your project context, and asks Claude or ChatGPT for a response — posted right back into the Figma thread.

```
  +-----------------+         +------------------+         +----------------+
  |                 |         |                  |         |                |
  |  Figma Comment  | ------> |  ai-figma-bot    | ------> |  Claude /      |
  |  "@Hey review   |         |                  |         |  ChatGPT       |
  |   this layout"  |         |  - screenshot    |         |                |
  |                 |         |  - project ctx   |         |  "The spacing  |
  +-----------------+         |  - prompt        |         |   between..."  |
                              +------------------+         +----------------+
                                      |                            |
                                      v                            |
                              +-----------------+                  |
                              |  Figma Reply    | <----------------+
                              |  "@Hey thinks   |
                              |   The spacing..." |
                              +-----------------+
```

## How it works

1. **Poll** — The bot polls the Figma comments API on an interval (default 30s)
2. **Filter** — Picks up comments starting with your trigger prefix (e.g. `@Hey`)
3. **Screenshot** — Captures the exact region of the design where the comment was placed
4. **Context** — Loads project context from markdown files you provide
5. **Ask AI** — Sends the screenshot + question + context to Claude or ChatGPT
6. **Reply** — Posts the AI's response as a threaded reply in Figma

## Quick start

```bash
# Clone and install
git clone https://github.com/your-username/ai-figma-bot.git
cd ai-figma-bot
npm install

# Configure
cp .env.example .env        # Add your API keys
cp context/_template.md context/project.md  # Add project context

# Run
npm run dev
```

## Configuration

### `.env`

```env
FIGMA_TOKEN=your-figma-personal-access-token
FIGMA_FILE_KEY=your-figma-file-key

# Set the key for your chosen provider
ANTHROPIC_API_KEY=your-key    # if using Claude
OPENAI_API_KEY=your-key       # if using ChatGPT
```

**Getting the values:**
- **FIGMA_TOKEN** — [Figma account settings](https://www.figma.com/developers/api#access-tokens) > Personal access tokens
- **FIGMA_FILE_KEY** — The ID in your Figma file URL: `figma.com/design/THIS_PART/...`
- **ANTHROPIC_API_KEY** — [console.anthropic.com](https://console.anthropic.com) > API Keys
- **OPENAI_API_KEY** — [platform.openai.com](https://platform.openai.com/api-keys) > API Keys

### `config.json`

```jsonc
{
  // Glob patterns for project context files
  "context_files": ["context/*.md"],

  // How often to check for new comments (ms, minimum 5000)
  "polling_interval_ms": 30000,

  // Comments starting with this prefix trigger the bot
  "trigger_prefix": "@Hey",

  // "claude" or "openai"
  "ai_provider": "openai",

  // Model name (e.g. "claude-sonnet-4-20250514", "gpt-4o", "gpt-5.1")
  "ai_model": "gpt-4o",

  // Figma export scale (1-4)
  "screenshot_scale": 2,

  // How the bot replies in Figma ({{prefix}} and {{answer}} placeholders)
  "reply_template": "{{prefix}} thinks {{answer}}",

  // Max retries per comment before giving up
  "max_comment_retries": 3,

  // Max retries for Figma API rate limits
  "max_api_retries": 3,

  // Customise the AI prompt
  "prompt": {
    "system": "You are a design assistant...",
    "user_template": "... {{screenshot_note}} ... {{question}} ... {{project_context}} ..."
  }
}
```

### Prompt template variables

| Variable | Replaced with |
|---|---|
| `{{screenshot_note}}` | "in the attached screenshot" or "(no screenshot available)" |
| `{{question}}` | The user's comment text (trigger prefix stripped) |
| `{{project_context}}` | Concatenated contents of your context files |

## Project context

Drop markdown files into the `context/` folder to give the bot knowledge about your project. A template is included:

```bash
cp context/_template.md context/my-project.md
```

Fill in sections like design system tokens, key flows, constraints, and terminology. The bot reads all `context/*.md` files and includes them with every AI request.

## Project structure

```
ai-figma-bot/
├── src/
│   ├── index.ts            # Entry point
│   ├── config.ts           # Config loading & validation
│   ├── ai/
│   │   ├── claude.ts       # Claude (Anthropic) client
│   │   ├── openai.ts       # ChatGPT (OpenAI) client
│   │   ├── prompt.ts       # Prompt template rendering
│   │   ├── context.ts      # Context file loader
│   │   └── types.ts        # AI provider types
│   ├── bot/
│   │   ├── loop.ts         # Polling loop with graceful shutdown
│   │   └── handler.ts      # Comment processing pipeline
│   ├── figma/
│   │   ├── client.ts       # Figma REST API client
│   │   ├── comments.ts     # Comment fetching & filtering
│   │   ├── screenshots.ts  # Screenshot capture pipeline
│   │   └── types.ts        # Figma API types
│   ├── state/
│   │   └── answered.ts     # Answered state manager (persistent)
│   └── utils/
│       └── logger.ts       # Structured logger
├── context/
│   └── _template.md        # Context file template
├── config.json             # Bot configuration
├── .env                    # API keys (not committed)
└── package.json
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Build and run the bot |
| `npm run build` | Compile TypeScript with esbuild |
| `npm start` | Run the compiled bot |

## Requirements

- Node.js 22+
- A Figma personal access token with file read/write access
- An Anthropic or OpenAI API key

## License

MIT
